import { useCallback, useEffect, useRef, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';
import { UN_SUB_TYPES } from '../../utils/unSubTypes.js';

const MODE_OPTIONS = [
  { value: 'rooms',          label: 'Individual Rooms',  desc: 'Guests book one or more individual rooms (B&Bs, guesthouses, small hotels).' },
  { value: 'whole_property', label: 'Whole Property',    desc: 'Guests book the entire property for their stay (gîtes, cottages, lodges, villas).' },
  { value: 'units',          label: 'Self-Catering',     desc: 'Guests book a self-contained unit (aparthotels, glamping, serviced apartments).' },
];

function currentModeLabel(property) {
  if (!property) return '—';
  if (property.rental_type === 'rooms') {
    return `Individual Rooms — ${property.ir_room_mode === 'categories' ? 'Room Categories' : 'Named Rooms'}`;
  }
  if (property.rental_type === 'whole_property') return 'Whole Property';
  if (property.rental_type === 'units') {
    const sub = UN_SUB_TYPES.find(s => s.value === property.un_sub_type);
    return `Self-Catering — ${sub ? sub.label : 'no sub-type set'}`;
  }
  return property.rental_type;
}

export default function RentalModeSwitch() {
  const [search,   setSearch]   = useState('');
  const [results,  setResults]  = useState([]);
  const [selected, setSelected] = useState(null); // property row from search
  const [status,   setStatus]   = useState(null); // rental-mode-status response
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [targetMode,    setTargetMode]    = useState('');
  const [targetSubType, setTargetSubType] = useState('');
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [confirmInput,  setConfirmInput]  = useState('');
  const [switching,     setSwitching]     = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // Debounced property search
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!search.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => {
      apiFetch(`/api/admin/properties?search=${encodeURIComponent(search.trim())}`)
        .then(r => r.json())
        .then(data => setResults(Array.isArray(data) ? data.slice(0, 10) : (data.properties ?? []).slice(0, 10)))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const loadStatus = useCallback((propertyId) => {
    setLoadingStatus(true);
    apiFetch(`/api/admin/properties/${propertyId}/rental-mode-status`)
      .then(r => r.json())
      .then(data => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoadingStatus(false));
  }, []);

  const selectProperty = useCallback((property) => {
    setSelected(property);
    setSearch('');
    setResults([]);
    setTargetMode('');
    setTargetSubType('');
    loadStatus(property.id);
  }, [loadStatus]);

  const openConfirm = useCallback(() => {
    setConfirmInput('');
    setConfirmOpen(true);
  }, []);

  const doSwitch = useCallback(async () => {
    if (!selected || !status) return;
    setSwitching(true);
    try {
      const res = await apiFetch(`/api/admin/properties/${selected.id}/rental-mode-switch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          rental_type: targetMode,
          un_sub_type: targetMode === 'units' ? targetSubType : undefined,
          confirm_name: confirmInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Switch failed.');
      setConfirmOpen(false);
      showToast(`${selected.name} switched to ${MODE_OPTIONS.find(m => m.value === targetMode)?.label}.`);
      setTargetMode('');
      setTargetSubType('');
      loadStatus(selected.id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSwitching(false);
    }
  }, [selected, status, targetMode, targetSubType, confirmInput, loadStatus, showToast]);

  const property = status?.property;
  const isSameMode = property && targetMode === property.rental_type &&
    (targetMode !== 'units' || targetSubType === property.un_sub_type);
  const canPickTarget = targetMode && (targetMode !== 'units' || targetSubType) && !isSameMode;

  return (
    <>
      <div className="page-header">
        <h1>Rental Mode Switch</h1>
        <div className="page-date">Safely change a property's rental type — Individual Rooms, Whole Property, or Self-Catering</div>
      </div>

      <div className="admin-card" style={{ padding: '16px 20px', marginBottom: 16, borderLeft: '4px solid #0ea5e9', background: '#f0f9ff' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0c4a6e', marginBottom: 8 }}>How this works</div>
        <ol style={{ margin: 0, paddingLeft: 18, color: '#0c4a6e', fontSize: '0.82rem', lineHeight: 1.8 }}>
          <li>Search for the property below by name or owner email.</li>
          <li>Check the stats shown — rooms/units, upcoming bookings, deposits, calendar syncs.</li>
          <li>If there are no upcoming bookings, you can switch the mode straight away.</li>
          <li>If there are upcoming bookings, you'll need to ask the owner to cancel or complete them first — the switch will stay blocked until then.</li>
          <li>Choose the new mode (and sub-type, if switching to Self-Catering), then confirm by typing the property name exactly as shown.</li>
        </ol>
      </div>

      <div className="admin-card" style={{ padding: 20, marginBottom: 20 }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>
          Find a property
        </label>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <input
            type="text"
            placeholder="Search by property name or country…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem', width: '100%' }}
          />
          {results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(15,23,42,0.12)', overflow: 'hidden',
            }}>
              {results.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectProperty(p)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                    border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>{p.name}</div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{p.owner_email ?? '—'} · {p.country ?? '—'}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && loadingStatus && (
        <div className="admin-card" style={{ padding: 20, color: '#94a3b8' }}>Loading…</div>
      )}

      {selected && !loadingStatus && property && (
        <>
          {/* Scenario 7: the selected property must be unmistakable before anything destructive is offered */}
          <div className="admin-card" style={{ padding: '18px 20px', marginBottom: 16, borderLeft: '4px solid #0ea5e9' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{property.name}</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 2 }}>
              {[property.address, property.city, property.country].filter(Boolean).join(', ') || 'No address on file'}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: 8 }}>
              Current mode: <strong>{currentModeLabel(property)}</strong>
            </div>
          </div>

          <div className="admin-card" style={{ marginBottom: 16 }}>
            <div className="admin-card-header"><h2>Before you switch</h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, background: '#f1f5f9' }}>
              <StatTile label="Rooms / units"          value={status.roomsCount} />
              <StatTile label="Upcoming / active bookings" value={status.activeBookings} warn={status.activeBookings > 0} />
              <StatTile label="Unresolved deposits / payments" value={status.unresolvedDeposits} warn={status.unresolvedDeposits > 0} />
              <StatTile label="Active iCal feeds"      value={status.activeIcalFeeds} />
            </div>
          </div>

          <div className="admin-card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="admin-card-header" style={{ padding: 0, border: 'none', marginBottom: 14 }}><h2>Switch to</h2></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MODE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px',
                    border: `1.5px solid ${targetMode === opt.value ? '#0ea5e9' : '#e2e8f0'}`,
                    borderRadius: 8, cursor: 'pointer',
                    background: targetMode === opt.value ? '#f0f9ff' : '#fff',
                  }}
                >
                  <input
                    type="radio"
                    name="target-mode"
                    checked={targetMode === opt.value}
                    onChange={() => { setTargetMode(opt.value); setTargetSubType(''); }}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>{opt.label}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}

              {targetMode === 'units' && (
                <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>Choose the Self-Catering sub-type (required):</div>
                  {UN_SUB_TYPES.map(sub => (
                    <label
                      key={sub.value}
                      style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px',
                        border: `1.5px solid ${targetSubType === sub.value ? '#0ea5e9' : '#e2e8f0'}`,
                        borderRadius: 8, cursor: 'pointer',
                        background: targetSubType === sub.value ? '#f0f9ff' : '#fff',
                      }}
                    >
                      <input
                        type="radio"
                        name="target-sub-type"
                        checked={targetSubType === sub.value}
                        onChange={() => setTargetSubType(sub.value)}
                        style={{ marginTop: 3 }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>{sub.label}</div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b' }}>{sub.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {isSameMode && (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>This is already the property's current mode.</div>
              )}
            </div>
          </div>

          <ActionPanel
            status={status}
            canPickTarget={canPickTarget}
            targetMode={targetMode}
            onAction={openConfirm}
          />
        </>
      )}

      {confirmOpen && (
        <ConfirmSwitchModal
          property={property}
          scenario={status.scenario}
          status={status}
          targetLabel={MODE_OPTIONS.find(m => m.value === targetMode)?.label}
          targetSubLabel={targetMode === 'units' ? UN_SUB_TYPES.find(s => s.value === targetSubType)?.label : null}
          confirmInput={confirmInput}
          onInput={setConfirmInput}
          onConfirm={doSwitch}
          onCancel={() => setConfirmOpen(false)}
          busy={switching}
        />
      )}

      {toast && <div className={`sa-toast sa-toast-${toast.type}`}>{toast.msg}</div>}
    </>
  );
}

function StatTile({ label, value, warn }) {
  return (
    <div style={{ background: '#fff', padding: '14px 16px' }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: warn ? '#b91c1c' : '#0f172a' }}>{value}</div>
      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ActionPanel({ status, canPickTarget, targetMode, onAction }) {
  if (status.scenario === 'blocked') {
    return (
      <div className="admin-card" style={{ padding: 20, borderLeft: '4px solid #dc2626', background: '#fef2f2' }}>
        <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Switch blocked</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: '#7f1d1d', fontSize: '0.85rem', lineHeight: 1.7 }}>
          {status.blockReasons.map((reason, i) => <li key={i}>{reason}</li>)}
        </ul>
        <div style={{ fontSize: '0.82rem', color: '#7f1d1d', marginTop: 10 }}>
          Resolve these in the property's booking calendar first — cancel or complete the bookings, and refund or settle any outstanding payments. Once resolved, this panel will let the switch through.
        </div>
      </div>
    );
  }

  const isArchive = status.scenario === 'archive';
  return (
    <div className="admin-card" style={{ padding: 20 }}>
      <div style={{ fontSize: '0.85rem', color: '#334155', marginBottom: 14 }}>
        {isArchive
          ? "This property has past booking history but nothing upcoming. Past bookings and guest records will be kept for your records. Current rooms/units will be removed so the property can be set up fresh in the new mode."
          : "No real bookings exist for this property. Rooms/units will be cleared and the property switched to the new mode immediately."}
      </div>
      <button
        onClick={onAction}
        disabled={!canPickTarget}
        style={{
          padding: '10px 18px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '0.875rem',
          fontFamily: 'inherit', cursor: canPickTarget ? 'pointer' : 'not-allowed',
          background: canPickTarget ? (isArchive ? '#d97706' : '#0ea5e9') : '#cbd5e1',
          color: '#fff',
        }}
      >
        {isArchive ? 'Archive & Switch' : 'Reset & Switch'}
      </button>
      {!canPickTarget && targetMode === '' && (
        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 8 }}>Choose a target mode above to continue.</div>
      )}
    </div>
  );
}

function ConfirmSwitchModal({ property, scenario, status, targetLabel, targetSubLabel, confirmInput, onInput, onConfirm, onCancel, busy }) {
  const nameMatch = confirmInput.trim() === property.name.trim();

  useEffect(() => {
    const handle = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onCancel]);

  const isArchive = scenario === 'archive';

  return (
    <div className="cm-backdrop" onClick={onCancel}>
      <div className="cm-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cm-header" style={{ background: isArchive ? '#92400e' : '#0369a1', color: '#fff' }}>
          <span className="cm-icon" aria-hidden="true">{isArchive ? '🗄' : '♻'}</span>
          <span className="cm-title">{isArchive ? 'Archive & Switch' : 'Reset & Switch'}</span>
        </div>
        <div className="cm-body">
          <p className="cm-message">
            You're about to switch <strong>{property.name}</strong> to <strong>{targetLabel}{targetSubLabel ? ` — ${targetSubLabel}` : ''}</strong>.
          </p>
          <p className="cm-message">
            {isArchive
              ? `${status.pastRealBookings} past booking(s) and their guest records will be kept untouched. `
              : ''}
            All {status.roomsCount} current room(s)/unit(s), and any external calendar sync feeds, will be permanently removed. This cannot be undone.
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
            <button className="cm-btn-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              className="cm-btn-confirm"
              style={{ background: nameMatch && !busy ? (isArchive ? '#b45309' : '#0369a1') : '#9ca3af' }}
              onClick={nameMatch && !busy ? onConfirm : undefined}
              disabled={!nameMatch || busy}
            >
              {busy ? 'Switching…' : (isArchive ? 'Archive & Switch' : 'Reset & Switch')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
