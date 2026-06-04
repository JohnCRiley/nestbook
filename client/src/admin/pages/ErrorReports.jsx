import { useEffect, useState, useCallback } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const STATUS_LABELS = {
  new:         '🔴 New',
  in_progress: '🟡 In progress',
  resolved:    '🟢 Resolved',
  wont_fix:    '⚪ Won\'t fix',
};

const CATEGORY_LABELS = {
  calculation: 'Calculation',
  booking:     'Booking',
  payment:     'Payment',
  display:     'Display',
  email:       'Email',
  performance: 'Performance',
  other:       'Other',
};

export default function ErrorReports() {
  const [reports,         setReports]         = useState([]);
  const [total,           setTotal]           = useState(0);
  const [pages,           setPages]           = useState(1);
  const [page,            setPage]            = useState(1);
  const [newCount,        setNewCount]        = useState(0);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [resolvedCount,   setResolvedCount]   = useState(0);
  const [loading,         setLoading]         = useState(true);
  const [statusFilter,    setStatusFilter]    = useState('');
  const [categoryFilter,  setCategoryFilter]  = useState('');
  const [selected,        setSelected]        = useState(null); // report for modal
  const [adminNotes,      setAdminNotes]      = useState('');
  const [modalStatus,     setModalStatus]     = useState('new');
  const [saving,          setSaving]          = useState(false);

  const fetchReports = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 50 });
    if (statusFilter)   params.set('status',   statusFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    apiFetch(`/api/admin/error-reports?${params}`)
      .then((r) => r.ok ? r.json() : { reports: [], total: 0, pages: 1, newCount: 0, inProgressCount: 0, resolvedCount: 0 })
      .then(({ reports: rows, total: tot, pages: pg, newCount: nc, inProgressCount: ip, resolvedCount: rc }) => {
        setReports(rows);
        setTotal(tot);
        setPages(pg);
        setNewCount(nc);
        setInProgressCount(ip);
        setResolvedCount(rc);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, statusFilter, categoryFilter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);
  useEffect(() => { setPage(1); }, [statusFilter, categoryFilter]);

  function openReport(r) {
    setSelected(r);
    setAdminNotes(r.admin_notes ?? '');
    setModalStatus(r.status ?? 'new');
  }

  async function updateStatus(id, status) {
    const r = reports.find((x) => x.id === id);
    const notes = r?.admin_notes ?? null;
    await apiFetch(`/api/admin/error-reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, admin_notes: notes }),
    });
    setReports((prev) => prev.map((x) => x.id === id ? { ...x, status } : x));
    if (status === 'new') setNewCount((n) => n + 1);
  }

  async function saveReport() {
    if (!selected) return;
    setSaving(true);
    await apiFetch(`/api/admin/error-reports/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: modalStatus, admin_notes: adminNotes }),
    });
    setReports((prev) => prev.map((x) =>
      x.id === selected.id ? { ...x, status: modalStatus, admin_notes: adminNotes } : x
    ));
    setSaving(false);
    setSelected(null);
  }

  return (
    <>
      <div className="page-header">
        <h1>Error Reports</h1>
        <div className="page-date">Bug reports submitted by users</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard value={total}           label="Total reports"  />
        <StatCard value={newCount}        label="New (unread)"   accent="warn" />
        <StatCard value={inProgressCount} label="In progress"    />
        <StatCard value={resolvedCount}   label="Resolved"       accent="green" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          className="form-control"
          style={{ width: 160 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="new">🔴 New</option>
          <option value="in_progress">🟡 In progress</option>
          <option value="resolved">🟢 Resolved</option>
          <option value="wont_fix">⚪ Won't fix</option>
        </select>

        <select
          className="form-control"
          style={{ width: 160 }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-screen">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="table-empty">No error reports found.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Plan</th>
                <th>Category</th>
                <th>Description</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} style={{ background: r.status === 'new' ? '#fefce8' : undefined }}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#64748b' }}>
                    {fmtDate(r.created_at)}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{r.user_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.user_email}</div>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                      fontSize: '0.75rem', fontWeight: 600,
                      background: r.plan === 'pro' ? '#dbeafe' : r.plan === 'multi' ? '#f3e8ff' : '#f1f5f9',
                      color:      r.plan === 'pro' ? '#1e40af' : r.plan === 'multi' ? '#6b21a8' : '#475569',
                    }}>
                      {r.plan}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                      background: '#f1f5f9', color: '#475569',
                      fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize',
                    }}>
                      {r.category}
                    </span>
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    <div style={{
                      fontSize: '0.85rem', overflow: 'hidden',
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {r.description}
                    </div>
                  </td>
                  <td>
                    <select
                      className="form-control"
                      style={{ fontSize: '0.8rem', padding: '3px 6px', width: 140 }}
                      value={r.status}
                      onChange={(e) => updateStatus(r.id, e.target.value)}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                      onClick={() => openReport(r)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Page {page} of {pages} · {total} reports</span>
          <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal-box" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Error Report #{selected.id}</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem', marginBottom: 16, color: '#475569' }}>
                <div><strong>From:</strong> {selected.user_name} ({selected.user_email})</div>
                <div><strong>Plan:</strong> {selected.plan}</div>
                <div><strong>Date:</strong> {fmtDate(selected.created_at)}</div>
                <div><strong>Category:</strong> {selected.category}</div>
                {selected.page_url && <div><strong>Page:</strong> <span style={{ wordBreak: 'break-all' }}>{selected.page_url}</span></div>}
              </div>

              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '12px 14px',
                fontSize: '0.875rem', lineHeight: 1.6, marginBottom: 16,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {selected.description}
              </div>

              <label className="form-label" style={{ fontSize: '0.82rem' }}>Admin notes (internal only)</label>
              <textarea
                className="form-control"
                rows={3}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Internal notes about this issue…"
                style={{ marginBottom: 12 }}
              />

              <label className="form-label" style={{ fontSize: '0.82rem' }}>Status</label>
              <select
                className="form-control"
                value={modalStatus}
                onChange={(e) => setModalStatus(e.target.value)}
                style={{ marginBottom: 16 }}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setSelected(null)}>Cancel</button>
                <button className="btn-primary" onClick={saveReport} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ value, label, accent }) {
  const bg    = accent === 'warn' ? '#fefce8' : accent === 'green' ? '#f0fdf4' : '#f8fafc';
  const color = accent === 'warn' ? '#92400e' : accent === 'green' ? '#166534' : '#1e293b';
  return (
    <div style={{
      background: bg, border: '1px solid #e2e8f0', borderRadius: 10,
      padding: '14px 20px', minWidth: 120, flex: '0 0 auto',
    }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
