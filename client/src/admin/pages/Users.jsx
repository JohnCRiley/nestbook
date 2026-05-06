import { useEffect, useState, useCallback, useRef } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';
import ConfirmModal from '../../components/ConfirmModal.jsx';
import usePageSize from '../../hooks/usePageSize.js';

// page-header + search + filter bar + padding
const RESERVED = 200;

// ── Filter option lists ───────────────────────────────────────────────────────

const PLAN_OPTIONS = [
  { value: 'all',   label: 'All plans' },
  { value: 'free',  label: 'Free' },
  { value: 'pro',   label: 'Pro' },
  { value: 'multi', label: 'Multi' },
];
const ROLE_OPTIONS = [
  { value: 'all',           label: 'All roles' },
  { value: 'owner',         label: 'Owner' },
  { value: 'reception',     label: 'Receptionist' },
  { value: 'charges_staff', label: 'Staff' },
];
const STATUS_OPTIONS = [
  { value: 'all',       label: 'All statuses' },
  { value: 'active',    label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'cancelled', label: 'Cancelled' },
];
const DATE_OPTIONS = [
  { value: 'all',    label: 'All time' },
  { value: 'week',   label: 'This week' },
  { value: 'month',  label: 'This month' },
  { value: 'year',   label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];
const PROPERTY_OPTIONS = [
  { value: 'all',        label: 'All types' },
  { value: 'bnb',        label: 'B&B' },
  { value: 'gite',       label: 'Gîte' },
  { value: 'guesthouse', label: 'Guest House' },
  { value: 'hotel',      label: 'Hotel' },
  { value: 'other',      label: 'Other' },
];

const EMPTY_FILTERS = {
  plan:        'all',
  role:        'all',
  status:      'all',
  datePreset:  'all',
  from:        '',
  to:          '',
  propertyType: 'all',
};

function getDateRange(preset, customFrom, customTo) {
  if (preset === 'custom') return { from: customFrom, to: customTo };
  if (preset === 'all') return { from: '', to: '' };
  const today = new Date().toISOString().slice(0, 10);
  if (preset === 'week') {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (preset === 'month') return { from: today.slice(0, 7) + '-01', to: today };
  if (preset === 'year') return { from: today.slice(0, 4) + '-01-01', to: today };
  return { from: '', to: '' };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Users() {
  const pageSize = usePageSize(52, RESERVED);
  const [rows,          setRows]          = useState([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [totalPages,    setTotalPages]    = useState(0);
  const [search,        setSearch]        = useState('');
  const [filters,       setFilters]       = useState(EMPTY_FILTERS);
  const [busy,          setBusy]          = useState({});
  const [refundTarget,  setRefundTarget]  = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [toast,         setToast]         = useState(null);
  const [pendingConfirm,setPendingConfirm]= useState(null);
  const [expandedCard,  setExpandedCard]  = useState(null);

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

  const fetchUsers = useCallback(() => {
    const params = new URLSearchParams({ page, limit: pageSize });
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (filters.plan !== 'all') params.set('plan', filters.plan);
    if (filters.role !== 'all') params.set('role', filters.role);
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.propertyType !== 'all') params.set('propertyType', filters.propertyType);
    const { from, to } = getDateRange(filters.datePreset, filters.from, filters.to);
    if (from) params.set('from', from);
    if (to)   params.set('to',   to);
    apiFetch(`/api/admin/users?${params}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRows(data); setTotal(data.length); setTotalPages(1);
        } else {
          setRows(data.users ?? []); setTotal(data.total ?? 0); setTotalPages(data.totalPages ?? 1);
        }
      })
      .catch(() => {});
  }, [page, pageSize, debouncedSearch, filters]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Filter helpers ─────────────────────────────────────────────────────────

  function handleFilterChange(field, value) {
    setFilters(f => ({ ...f, [field]: value }));
    setPage(1);
  }

  function clearAllFilters() {
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function removePill(key) {
    if (key === 'search') { setSearch(''); return; }
    if (key === 'datePreset') {
      setFilters(f => ({ ...f, datePreset: 'all', from: '', to: '' }));
      setPage(1);
      return;
    }
    handleFilterChange(key, 'all');
  }

  // Active filter pills
  const activePills = [
    ...(debouncedSearch.trim()
      ? [{ key: 'search', label: `"${debouncedSearch.trim().slice(0, 24)}"` }]
      : []),
    ...(filters.plan !== 'all'
      ? [{ key: 'plan', label: `Plan: ${PLAN_OPTIONS.find(o => o.value === filters.plan)?.label}` }]
      : []),
    ...(filters.role !== 'all'
      ? [{ key: 'role', label: `Role: ${ROLE_OPTIONS.find(o => o.value === filters.role)?.label}` }]
      : []),
    ...(filters.status !== 'all'
      ? [{ key: 'status', label: `Status: ${STATUS_OPTIONS.find(o => o.value === filters.status)?.label}` }]
      : []),
    ...(filters.datePreset !== 'all'
      ? [{ key: 'datePreset', label: `Registered: ${DATE_OPTIONS.find(o => o.value === filters.datePreset)?.label}` }]
      : []),
    ...(filters.propertyType !== 'all'
      ? [{ key: 'propertyType', label: `Type: ${PROPERTY_OPTIONS.find(o => o.value === filters.propertyType)?.label}` }]
      : []),
  ];

  const fromIdx = (page - 1) * pageSize + 1;
  const toIdx   = Math.min(page * pageSize, total);
  const countLabel = total === 0
    ? (activePills.length > 0 ? 'No users match filters' : '0 users registered')
    : activePills.length > 0 || totalPages > 1
      ? `Showing ${fromIdx}–${toIdx} of ${total} users`
      : `${total} users registered`;

  // ── Action helpers ─────────────────────────────────────────────────────────

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function setBusyKey(id, action, val) {
    setBusy(b => ({ ...b, [`${id}_${action}`]: val }));
  }

  async function setPlan(userId, plan) {
    setBusyKey(userId, 'plan', true);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/set-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        setRows(r => r.map(u => u.id === userId ? { ...u, plan } : u));
        showToast('Plan updated. Ask the user to refresh to see changes.');
      } else {
        const d = await res.json();
        showToast(d.error || 'Failed to update plan.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    setBusyKey(userId, 'plan', false);
  }

  async function compAccount(userId, name) {
    setBusyKey(userId, 'comp', true);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/comp`, { method: 'POST' });
      if (res.ok) {
        setRows(r => r.map(u => u.id === userId
          ? { ...u, plan: 'pro', sub_notes: 'Complimentary', stripe_subscription_id: null, cancel_at_period_end: 0 }
          : u
        ));
        showToast('Plan updated. Ask the user to refresh to see changes.');
      } else {
        const d = await res.json();
        showToast(d.error || 'Failed to comp account.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    setBusyKey(userId, 'comp', false);
  }

  async function cancelSub(userId, name) {
    setBusyKey(userId, 'cancel', true);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/cancel-subscription`, { method: 'POST' });
      if (res.ok) {
        setRows(r => r.map(u => u.id === userId ? { ...u, cancel_at_period_end: 1 } : u));
        showToast(`${name}'s subscription will cancel at period end.`);
      } else {
        const d = await res.json();
        showToast(d.error || 'Failed to cancel subscription.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    setBusyKey(userId, 'cancel', false);
  }

  async function verifyEmail(userId, name) {
    setBusyKey(userId, 'verify', true);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/verify-email`, { method: 'POST' });
      if (res.ok) {
        setRows(r => r.map(u => u.id === userId ? { ...u, email_verified: 1 } : u));
        showToast(`${name}'s email has been verified.`);
      } else {
        const d = await res.json();
        showToast(d.error || 'Failed to verify email.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    setBusyKey(userId, 'verify', false);
  }

  async function toggleSuspend(userId, name, isSuspended) {
    const action = isSuspended ? 'unsuspend' : 'suspend';
    setBusyKey(userId, 'suspend', true);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/${action}`, { method: 'POST' });
      if (res.ok) {
        setRows(r => r.map(u => u.id === userId ? { ...u, suspended: isSuspended ? 0 : 1 } : u));
        showToast(`${name} has been ${isSuspended ? 'unsuspended' : 'suspended'}.`);
      } else {
        const d = await res.json();
        showToast(d.error || `Failed to ${action} account.`, 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    setBusyKey(userId, 'suspend', false);
  }

  function handleDeleteSuccess(userId, name) {
    setRows(r => r.filter(u => u.id !== userId));
    setDeleteTarget(null);
    showToast(`${name}'s account and all data have been permanently deleted.`);
    fetchUsers();
  }

  function ActionButtons({ u }) {
    return (
      <div className="sa-actions">
        <button
          className="sa-btn sa-btn-comp"
          disabled={!!busy[`${u.id}_comp`]}
          onClick={() => setPendingConfirm({
            title: 'Comp account',
            message: `Set ${u.name}'s account to Pro (Complimentary) and cancel any Stripe subscription?`,
            variant: 'warning',
            action: () => compAccount(u.id, u.name),
          })}
          title="Set to Pro complimentary (cancels Stripe sub)"
        >
          {busy[`${u.id}_comp`] ? '…' : 'Comp'}
        </button>
        {u.stripe_subscription_id && !u.cancel_at_period_end ? (
          <button
            className="sa-btn sa-btn-cancel"
            disabled={!!busy[`${u.id}_cancel`]}
            onClick={() => setPendingConfirm({
              title: 'Cancel subscription',
              message: `Cancel ${u.name}'s Stripe subscription at period end?`,
              variant: 'danger',
              action: () => cancelSub(u.id, u.name),
            })}
            title="Cancel Stripe subscription at period end"
          >
            {busy[`${u.id}_cancel`] ? '…' : 'Cancel sub'}
          </button>
        ) : null}
        {u.stripe_customer_id ? (
          <button
            className="sa-btn sa-btn-refund"
            onClick={() => setRefundTarget({ id: u.id, name: u.name, email: u.email })}
            title="Issue a refund via Stripe"
          >
            Refund
          </button>
        ) : null}
        {!u.email_verified ? (
          <button
            className="sa-btn sa-btn-comp"
            disabled={!!busy[`${u.id}_verify`]}
            onClick={() => verifyEmail(u.id, u.name)}
            title="Mark email as verified (bypasses verification link)"
          >
            {busy[`${u.id}_verify`] ? '…' : 'Verify email'}
          </button>
        ) : null}
        <button
          className={`sa-btn ${u.suspended ? 'sa-btn-comp' : 'sa-btn-cancel'}`}
          disabled={!!busy[`${u.id}_suspend`]}
          onClick={() => setPendingConfirm({
            title: u.suspended ? 'Unsuspend account' : 'Suspend account',
            message: u.suspended
              ? `Unsuspend ${u.name}? They will be able to log in again.`
              : `Suspend ${u.name}? They will be blocked from logging in immediately.`,
            variant: u.suspended ? 'warning' : 'danger',
            action: () => toggleSuspend(u.id, u.name, !!u.suspended),
          })}
        >
          {busy[`${u.id}_suspend`] ? '…' : u.suspended ? 'Unsuspend' : 'Suspend'}
        </button>
        <button
          className="sa-btn sa-btn-delete"
          onClick={() => setDeleteTarget({ id: u.id, name: u.name, email: u.email })}
          title="Permanently delete account and all data (GDPR)"
        >
          Delete
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        <div className="page-date">{countLabel}</div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search by name, email, property or property ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
            fontSize: '0.875rem', width: '100%', maxWidth: 380, boxSizing: 'border-box',
          }}
        />
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="ml-filter-grid">
          <div className="ml-filter-field">
            <label className="ml-filter-label">Plan</label>
            <select
              className="ml-filter-select"
              value={filters.plan}
              onChange={e => handleFilterChange('plan', e.target.value)}
            >
              {PLAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="ml-filter-field">
            <label className="ml-filter-label">Role</label>
            <select
              className="ml-filter-select"
              value={filters.role}
              onChange={e => handleFilterChange('role', e.target.value)}
            >
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="ml-filter-field">
            <label className="ml-filter-label">Status</label>
            <select
              className="ml-filter-select"
              value={filters.status}
              onChange={e => handleFilterChange('status', e.target.value)}
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="ml-filter-field">
            <label className="ml-filter-label">Registered</label>
            <select
              className="ml-filter-select"
              value={filters.datePreset}
              onChange={e => handleFilterChange('datePreset', e.target.value)}
            >
              {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="ml-filter-field">
            <label className="ml-filter-label">Property Type</label>
            <select
              className="ml-filter-select"
              value={filters.propertyType}
              onChange={e => handleFilterChange('propertyType', e.target.value)}
            >
              {PROPERTY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Custom date range inputs */}
        {filters.datePreset === 'custom' && (
          <div style={{ display: 'flex', gap: 16, padding: '0 20px 16px', flexWrap: 'wrap' }}>
            <div className="ml-filter-field">
              <label className="ml-filter-label">From</label>
              <input
                type="date"
                className="ml-filter-input"
                value={filters.from}
                onChange={e => handleFilterChange('from', e.target.value)}
              />
            </div>
            <div className="ml-filter-field">
              <label className="ml-filter-label">To</label>
              <input
                type="date"
                className="ml-filter-input"
                value={filters.to}
                onChange={e => handleFilterChange('to', e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Active filter pills */}
        {activePills.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            padding: '0 20px 14px', alignItems: 'center',
          }}>
            {activePills.map(pill => (
              <span
                key={pill.key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px 3px 10px', borderRadius: 20,
                  background: '#e0f2fe', color: '#0369a1',
                  fontSize: '0.78rem', fontWeight: 600,
                }}
              >
                {pill.label}
                <button
                  onClick={() => removePill(pill.key)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#0369a1', padding: '0 2px', fontSize: '0.85em', lineHeight: 1,
                  }}
                >✕</button>
              </span>
            ))}
            <button
              onClick={clearAllFilters}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', fontSize: '0.78rem', padding: '3px 4px',
                textDecoration: 'underline',
              }}
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* ── Desktop / Tablet table ─────────────────────────────────────────── */}
      <div className="admin-card admin-user-table-wrap">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name / Email</th>
                <th>Role</th>
                <th>Plan</th>
                <th>Property</th>
                <th>Discount</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id} style={u.suspended ? { opacity: 0.6, background: '#fef2f2' } : {}}>
                  <td>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                      {u.name}
                      {!!u.suspended && (
                        <span className="sa-badge sa-badge-cancel" style={{ marginLeft: 6 }}>SUSPENDED</span>
                      )}
                    </div>
                    <div className="admin-muted" style={{ fontSize: '0.8rem' }}>
                      {u.email}
                      {!u.email_verified && (
                        <span className="sa-badge sa-badge-cancel" style={{ marginLeft: 6 }}>unverified</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`role-badge role-${u.role}`}>
                      {u.role === 'owner' ? 'Owner' : u.role === 'charges_staff' ? 'Staff' : 'Reception'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <select
                        className="sa-plan-select"
                        value={u.plan ?? 'free'}
                        disabled={!!busy[`${u.id}_plan`]}
                        onChange={e => setPlan(u.id, e.target.value)}
                      >
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                        <option value="multi">Multi</option>
                      </select>
                      {u.sub_notes === 'Complimentary' && (
                        <span className="sa-badge sa-badge-comp">COMP</span>
                      )}
                      {u.cancel_at_period_end ? (
                        <span className="sa-badge sa-badge-cancel">Cancelling</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {u.owned_properties && u.owned_properties.includes('|') ? (
                      u.owned_properties.split('|').map(entry => {
                        const colon = entry.indexOf(':');
                        const pid   = entry.slice(0, colon);
                        const pname = entry.slice(colon + 1);
                        return (
                          <div key={pid} style={{ lineHeight: 1.5 }}>
                            <span style={{ fontSize: '0.82rem' }}>{pname}</span>{' '}
                            <CopyId id={pid} />
                          </div>
                        );
                      })
                    ) : (
                      <div>
                        <span>{u.property_name ?? '—'}</span>
                        {u.property_id && <>{' '}<CopyId id={u.property_id} /></>}
                      </div>
                    )}
                    {u.property_type && (
                      <div className="admin-muted" style={{ fontSize: '0.75rem' }}>
                        {u.property_type}
                      </div>
                    )}
                  </td>
                  <td className="admin-muted" style={{ fontSize: '0.8rem' }}>
                    {u.discount_code ?? '—'}
                  </td>
                  <td className="admin-muted">{fmtDate(u.created_at)}</td>
                  <td>
                    <ActionButtons u={u} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 16px' }}>
                    No users match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile card layout ─────────────────────────────────────────────── */}
      <div className="admin-user-cards">
        {rows.map(u => (
          <div
            key={u.id}
            className="admin-user-card"
            style={u.suspended ? { opacity: 0.7, borderColor: '#fecaca' } : {}}
          >
            <div className="admin-user-card-main">
              <div>
                <div className="admin-user-card-name">
                  {u.name}
                  {!!u.suspended && (
                    <span className="sa-badge sa-badge-cancel" style={{ marginLeft: 6 }}>SUSPENDED</span>
                  )}
                </div>
                <div className="admin-user-card-email">{u.email}</div>
              </div>
              <PlanBadge plan={u.plan} />
            </div>

            <div className="admin-user-card-meta">
              <span>{u.property_name ?? 'No property'}</span>
              {u.property_id && <CopyId id={u.property_id} />}
              <span>·</span>
              <span>{fmtDate(u.created_at)}</span>
              {u.sub_notes === 'Complimentary' && (
                <span className="sa-badge sa-badge-comp">COMP</span>
              )}
              {u.cancel_at_period_end ? (
                <span className="sa-badge sa-badge-cancel">Cancelling</span>
              ) : null}
            </div>

            <div className="admin-user-card-plan">
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Plan:</span>
              <select
                className="sa-plan-select"
                value={u.plan ?? 'free'}
                disabled={!!busy[`${u.id}_plan`]}
                onChange={e => setPlan(u.id, e.target.value)}
                style={{ flex: 1, padding: '5px 8px', fontSize: '0.85rem' }}
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="multi">Multi</option>
              </select>
            </div>

            {expandedCard === u.id ? (
              <div className="admin-user-card-details">
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>
                  <strong>Role:</strong> {u.role} ·
                  <strong> Discount:</strong> {u.discount_code ?? '—'}
                </div>
                {u.owned_properties && u.owned_properties.includes('|') && (
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 8 }}>
                    <strong>Properties:</strong>{' '}
                    {u.owned_properties.split('|').map((entry, i) => {
                      const colon = entry.indexOf(':');
                      const pid   = entry.slice(0, colon);
                      const pname = entry.slice(colon + 1);
                      return (
                        <span key={pid}>
                          {i > 0 && ', '}
                          {pname} <CopyId id={pid} />
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="admin-user-card-actions">
                  <ActionButtons u={u} />
                </div>
                <button
                  className="admin-user-card-expand"
                  style={{ marginTop: 10 }}
                  onClick={() => setExpandedCard(null)}
                >
                  Show less ▲
                </button>
              </div>
            ) : (
              <button
                className="admin-user-card-expand"
                onClick={() => setExpandedCard(u.id)}
              >
                Actions & details ▼
              </button>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 16px', fontSize: '0.9rem' }}>
            No users match the current filters.
          </div>
        )}
      </div>
      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {total > 0 && totalPages > 1 && (
        <div className="pagination" style={{ marginTop: 16 }}>
          <span className="pagination-info">
            Showing {fromIdx}–{toIdx} of {total}
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
      {refundTarget && (
        <RefundModal
          user={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={(msg) => { setRefundTarget(null); showToast(msg); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => handleDeleteSuccess(deleteTarget.id, deleteTarget.name)}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {toast && (
        <div className={`sa-toast sa-toast-${toast.type}`}>{toast.msg}</div>
      )}

      <ConfirmModal
        isOpen={!!pendingConfirm}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        variant={pendingConfirm?.variant ?? 'warning'}
        onConfirm={() => { const fn = pendingConfirm.action; setPendingConfirm(null); fn(); }}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
}

// ── CopyId ────────────────────────────────────────────────────────────────────

function CopyId({ id }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(String(id)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#94a3b8' }}>ID:{id}</span>
      <button
        onClick={copy}
        title="Copy property ID"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '0.68rem', color: copied ? '#16a34a' : '#94a3b8',
          padding: '0 2px', lineHeight: 1, fontWeight: 600,
        }}
      >
        {copied ? '✓' : 'copy'}
      </button>
    </span>
  );
}

// ── PlanBadge ─────────────────────────────────────────────────────────────────

function PlanBadge({ plan }) {
  return (
    <span className={`sidebar-plan-badge sidebar-plan-badge-${plan ?? 'free'}`}>
      {plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Free'}
    </span>
  );
}

// ── Delete / GDPR modal ───────────────────────────────────────────────────────

function DeleteModal({ user, onClose, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const res  = await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else {
        onError(data.error || 'Delete failed.');
        setLoading(false);
      }
    } catch {
      onError('Network error.');
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>Delete account</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: '0.875rem', color: '#991b1b',
          }}>
            <strong>This cannot be undone.</strong> All data for this account will be
            permanently deleted: property, rooms, bookings, guest records, and
            subscription. Any active Stripe subscription will be cancelled immediately.
          </div>
          <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: 4 }}>
            You are about to delete:
          </p>
          <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginBottom: 20 }}>
            {user.name} — {user.email}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6,
                       padding: '8px 18px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Refund modal ──────────────────────────────────────────────────────────────

function RefundModal({ user, onClose, onSuccess, onError }) {
  const [mode,    setMode]    = useState('full');
  const [amount,  setAmount]  = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (mode === 'partial' && (!amount || Number(amount) <= 0)) {
      onError('Enter a valid refund amount.');
      return;
    }
    setLoading(true);
    try {
      const body = mode === 'partial' ? { amount: Number(amount) } : {};
      const res  = await apiFetch(`/api/admin/users/${user.id}/refund`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess(`Refund of €${data.amount.toFixed(2)} issued. Stripe ID: ${data.refund_id}`);
      } else {
        onError(data.error || 'Refund failed.');
      }
    } catch { onError('Network error.'); }
    setLoading(false);
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>Issue refund</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 16, color: '#64748b', fontSize: '0.9rem' }}>
            Refund for <strong>{user.name}</strong> ({user.email})
          </p>
          <form onSubmit={submit}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.9rem' }}>
                <input type="radio" name="mode" checked={mode === 'full'} onChange={() => setMode('full')} />
                Full refund
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.9rem' }}>
                <input type="radio" name="mode" checked={mode === 'partial'} onChange={() => setMode('partial')} />
                Partial refund
              </label>
            </div>
            {mode === 'partial' && (
              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Amount (€)</label>
                <input
                  type="number" min="0.01" step="0.01"
                  className="form-control"
                  placeholder="e.g. 9.50"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  style={{ marginTop: 6, width: '100%' }}
                  autoFocus
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Processing…' : 'Issue refund'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
