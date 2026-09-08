import { useEffect, useState, useCallback, useRef } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';
import usePageSize from '../../hooks/usePageSize.js';
import ConfirmModal from '../../components/ConfirmModal.jsx';

const TYPE_LABELS = {
  bnb: 'B&B', gite: 'Gîte', guesthouse: 'Guest House', hotel: 'Hotel', other: 'Other',
};

// page-header + search + padding
const RESERVED = 140;

export default function Properties() {
  const pageSize = usePageSize(48, RESERVED);
  const [rows,       setRows]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [search,     setSearch]     = useState('');

  // Demo reset state
  const [resetTarget,  setResetTarget]  = useState(null); // property object | null
  const [confirmInput, setConfirmInput] = useState('');
  const [resetting,    setResetting]    = useState(false);
  const [toast,        setToast]        = useState(null);

  // Demo-toggle confirmation — only the ON direction (real → demo) needs
  // confirming: it silently stops real guest enquiries from reaching the
  // owner and unlocks the "Reset data" wipe button for this property.
  // Switching demo back OFF is the corrective/safe direction and fires
  // immediately, same as before.
  const [demoTarget, setDemoTarget] = useState(null); // property object | null
  const [demoBusy,   setDemoBusy]   = useState(false);

  // Channex integration (Phase 2) — internal debug trigger, Super Admin only.
  const [channexBusyId, setChannexBusyId] = useState(null); // property id | null

  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const prevPageSizeRef = useRef(pageSize);
  useEffect(() => {
    if (prevPageSizeRef.current !== pageSize) {
      prevPageSizeRef.current = pageSize;
      setPage(1);
    }
  }, [pageSize]);

  // Debounced search
  const debounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchProperties = useCallback(() => {
    const params = new URLSearchParams({ page, limit: pageSize });
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    apiFetch(`/api/admin/properties?${params}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRows(data); setTotal(data.length); setTotalPages(1);
        } else {
          setRows(data.properties ?? []); setTotal(data.total ?? 0); setTotalPages(data.totalPages ?? 1);
        }
      })
      .catch(() => {});
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  const setDemoFlag = useCallback(async (id, isDemo) => {
    try {
      const res = await apiFetch(`/api/admin/properties/${id}/demo`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_demo: isDemo ? 1 : 0 }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Update failed');
      fetchProperties();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [fetchProperties, showToast]);

  // Turning demo ON needs confirmation (see state comment above); turning it
  // OFF is the safe/corrective direction and fires immediately as before.
  const toggleDemo = useCallback((property) => {
    if (property.is_demo) {
      setDemoFlag(property.id, false);
    } else {
      setDemoTarget(property);
    }
  }, [setDemoFlag]);

  const cancelDemoConfirm = useCallback(() => setDemoTarget(null), []);

  const confirmSetDemo = useCallback(async () => {
    if (!demoTarget) return;
    setDemoBusy(true);
    await setDemoFlag(demoTarget.id, true);
    setDemoBusy(false);
    setDemoTarget(null);
  }, [demoTarget, setDemoFlag]);

  // Channex: real API call — creates a property in Channex staging on click.
  // No confirmation modal (internal debug tool); the "already connected" guard
  // lives server-side and its error is surfaced via the toast.
  const createInChannex = useCallback(async (property) => {
    setChannexBusyId(property.id);
    try {
      const res  = await apiFetch(`/api/admin/properties/${property.id}/channex-create`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Channex create failed');
      showToast(`Created in Channex — ${data.channex_property_id}`);
      fetchProperties();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setChannexBusyId(null);
    }
  }, [fetchProperties, showToast]);

  // Channex: real API call — pushes room types + rate plans + 500 days of ARI
  // to Channex staging. Only offered once a property is connected. The
  // "already pushed" guard lives server-side; its error shows via the toast.
  const pushChannexInventory = useCallback(async (property) => {
    setChannexBusyId(property.id);
    try {
      const res  = await apiFetch(`/api/admin/properties/${property.id}/channex-push`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Channex inventory push failed');
      const rt = data.roomTypes?.length ?? 0;
      showToast(`Pushed to Channex — ${rt} room type${rt === 1 ? '' : 's'}, ${data.window?.days ?? 500} days ARI`);
      fetchProperties();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setChannexBusyId(null);
    }
  }, [fetchProperties, showToast]);

  // Channel Manager: the way back out (Phase 2, slice 8). Clears the
  // NestBook-side link only (channex_property_id + channex_room_mappings rows) —
  // the Channex property and its room types / rate plans are left intact for the
  // owner to remove in their own Channex account, and existing bookings are
  // untouched. window.confirm rather than a full modal: internal SA debug tool,
  // and a disconnected property can just be reconnected.
  const disconnectChannex = useCallback(async (property) => {
    const n = property.channex_mapping_count || 0;
    if (!window.confirm(
      `Disconnect "${property.name}" from Channex?\n\n` +
      `Clears the NestBook-side link (channex_property_id + ${n} room-type mapping${n === 1 ? '' : 's'}). ` +
      `The Channex property and its room types / rate plans are LEFT INTACT — remove them from your Channex account if you want them gone. ` +
      `Existing bookings are unaffected.`
    )) return;
    setChannexBusyId(property.id);
    try {
      const res  = await apiFetch(`/api/admin/properties/${property.id}/channex-disconnect`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Channex disconnect failed');
      const d = data.cleared?.mappings_deleted ?? 0;
      showToast(`Disconnected from Channex — ${d} mapping${d === 1 ? '' : 's'} cleared, Channex side left intact`);
      fetchProperties();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setChannexBusyId(null);
    }
  }, [fetchProperties, showToast]);

  const openResetModal = useCallback((property) => {
    setResetTarget(property);
    setConfirmInput('');
  }, []);

  const cancelReset = useCallback(() => {
    setResetTarget(null);
    setConfirmInput('');
  }, []);

  const confirmReset = useCallback(async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const res  = await apiFetch(`/api/admin/properties/${resetTarget.id}/reset-demo-data`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Reset failed');
      setResetTarget(null);
      setConfirmInput('');
      showToast(`Demo data reset — ${data.deletedBookings} booking(s) deleted, 5 repeat guests ready`);
      fetchProperties();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setResetting(false);
    }
  }, [resetTarget, fetchProperties, showToast]);

  return (
    <>
      <div className="page-header">
        <h1>Properties</h1>
        <div className="page-date">{total} properties on the platform</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name or country…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
                   fontSize: '0.875rem', width: 280 }}
        />
      </div>

      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Country</th>
              <th>Owner</th>
              <th>Plan</th>
              <th>Rooms</th>
              <th>Bookings</th>
              <th>Created</th>
              <th>Demo</th>
              <th>Channex</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td className="admin-muted">{TYPE_LABELS[p.type] ?? p.type}</td>
                <td>{p.country}</td>
                <td className="admin-muted">{p.owner_email ?? '—'}</td>
                <td><PlanBadge plan={p.plan} /></td>
                <td>{p.rooms_count}</td>
                <td>{p.bookings_count}</td>
                <td className="admin-muted">{fmtDate(p.created_at)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => toggleDemo(p)}
                      style={{
                        background: p.is_demo ? '#fef3c7' : 'var(--card-bg)',
                        border: `1px solid ${p.is_demo ? '#f59e0b' : 'var(--border)'}`,
                        color: p.is_demo ? '#92400e' : 'var(--text-secondary)',
                        padding: '3px 10px', borderRadius: 4, fontSize: '0.75rem',
                        fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {p.is_demo ? '⚠ Demo' : 'Set demo'}
                    </button>
                    {p.is_demo ? (
                      <button
                        onClick={() => openResetModal(p)}
                        style={{
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          color: '#991b1b',
                          padding: '3px 10px', borderRadius: 4, fontSize: '0.75rem',
                          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Reset data
                      </button>
                    ) : null}
                  </div>
                </td>
                <td>
                  {p.channex_property_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span
                        title={p.channex_property_id}
                        style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}
                      >
                        ✓ {String(p.channex_property_id).slice(0, 8)}…
                      </span>
                      {p.channex_mapping_count > 0 ? (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          · {p.channex_mapping_count} room type{p.channex_mapping_count === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <button
                          onClick={() => pushChannexInventory(p)}
                          disabled={channexBusyId === p.id}
                          style={{
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            padding: '3px 10px', borderRadius: 4, fontSize: '0.75rem',
                            fontWeight: 600, cursor: channexBusyId === p.id ? 'default' : 'pointer',
                            fontFamily: 'inherit', opacity: channexBusyId === p.id ? 0.6 : 1,
                          }}
                        >
                          {channexBusyId === p.id ? 'Pushing…' : 'Push Inventory'}
                        </button>
                      )}
                      <button
                        onClick={() => disconnectChannex(p)}
                        disabled={channexBusyId === p.id}
                        title="Clear the NestBook-side Channex link (leaves the Channex property intact)"
                        style={{
                          background: 'var(--card-bg)',
                          border: '1px solid #c0392b',
                          color: '#c0392b',
                          padding: '3px 10px', borderRadius: 4, fontSize: '0.75rem',
                          fontWeight: 600, cursor: channexBusyId === p.id ? 'default' : 'pointer',
                          fontFamily: 'inherit', opacity: channexBusyId === p.id ? 0.6 : 1,
                        }}
                      >
                        {channexBusyId === p.id ? '…' : 'Disconnect'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => createInChannex(p)}
                      disabled={channexBusyId === p.id}
                      style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                        padding: '3px 10px', borderRadius: 4, fontSize: '0.75rem',
                        fontWeight: 600, cursor: channexBusyId === p.id ? 'default' : 'pointer',
                        fontFamily: 'inherit', opacity: channexBusyId === p.id ? 0.6 : 1,
                      }}
                    >
                      {channexBusyId === p.id ? 'Creating…' : 'Create in Channex'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 0 && totalPages > 1 && (
        <div className="pagination" style={{ marginTop: 16 }}>
          <span className="pagination-info">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="pagination-controls">
            <button className="pagination-btn" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
              Previous
            </button>
            <span className="pagination-page">Page {page} of {totalPages || 1}</span>
            <button className="pagination-btn" onClick={() => setPage(p => p + 1)} disabled={page >= (totalPages || 1)}>
              Next
            </button>
          </div>
        </div>
      )}

      {demoTarget && (
        <ConfirmModal
          isOpen
          variant="warning"
          title="Set as demo property?"
          confirmLabel={demoBusy ? 'Setting…' : 'Set as demo'}
          onConfirm={confirmSetDemo}
          onCancel={cancelDemoConfirm}
          busy={demoBusy}
          message={
            <>
              <strong>{demoTarget.name}</strong> is a live property — this is not a cosmetic label.
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
                <li>Real guest enquiries will silently stop reaching the owner — the guest sees a success message, but nothing is sent.</li>
                <li>Check-in/check-out date validation is bypassed for this property.</li>
                <li>The "Reset data" button becomes available for this property — a separate, permanent wipe of its bookings.</li>
              </ul>
              {(demoTarget.rooms_count > 0 || demoTarget.bookings_count > 0) && (
                <span style={{ display: 'block', marginTop: 8 }}>
                  This property currently has {demoTarget.rooms_count} room(s)/unit(s) and {demoTarget.bookings_count} booking(s).
                </span>
              )}
            </>
          }
        />
      )}

      {resetTarget && (
        <ResetDemoModal
          property={resetTarget}
          confirmInput={confirmInput}
          onInput={setConfirmInput}
          onConfirm={confirmReset}
          onCancel={cancelReset}
          busy={resetting}
        />
      )}

      {toast && (
        <div className={`sa-toast sa-toast-${toast.type}`}>{toast.msg}</div>
      )}
    </>
  );
}

function ResetDemoModal({ property, confirmInput, onInput, onConfirm, onCancel, busy }) {
  const nameMatch = confirmInput.trim() === property.name.trim();

  useEffect(() => {
    const handle = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onCancel]);

  return (
    <div className="cm-backdrop" onClick={onCancel}>
      <div className="cm-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cm-header" style={{ background: '#991b1b', color: '#fff' }}>
          <span className="cm-icon" aria-hidden="true">🗑</span>
          <span className="cm-title">Reset Demo Data</span>
        </div>
        <div className="cm-body">
          <p className="cm-message">
            This will permanently delete all bookings and guests for{' '}
            <strong>{property.name}</strong>, and cannot be undone.{' '}
            Rooms, photos, and settings are untouched.
          </p>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '12px 0 6px' }}>
            Type the property name to confirm:
          </p>
          <input
            type="text"
            value={confirmInput}
            onChange={e => onInput(e.target.value)}
            placeholder={property.name}
            autoFocus
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 6,
              border: '1.5px solid #e2e8f0', fontSize: '0.875rem',
              marginBottom: 16, fontFamily: 'inherit',
            }}
          />
          <div className="cm-actions">
            <button className="cm-btn-cancel" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              className="cm-btn-confirm"
              style={{ background: nameMatch && !busy ? '#dc2626' : '#9ca3af' }}
              onClick={nameMatch && !busy ? onConfirm : undefined}
              disabled={!nameMatch || busy}
            >
              {busy ? 'Resetting…' : 'Reset Demo Data'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanBadge({ plan }) {
  return (
    <span className={`sidebar-plan-badge sidebar-plan-badge-${plan ?? 'free'}`}>
      {plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Free'}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
