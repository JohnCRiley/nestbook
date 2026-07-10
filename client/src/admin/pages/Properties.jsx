import { useEffect, useState, useCallback, useRef } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';
import usePageSize from '../../hooks/usePageSize.js';

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

  const toggleDemo = useCallback(async (id, currentIsDemo) => {
    await apiFetch(`/api/admin/properties/${id}/demo`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_demo: currentIsDemo ? 0 : 1 }),
    });
    fetchProperties();
  }, [fetchProperties]);

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
                      onClick={() => toggleDemo(p.id, p.is_demo)}
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
