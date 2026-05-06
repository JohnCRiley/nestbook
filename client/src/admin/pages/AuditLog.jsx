import { useState, useEffect, useCallback } from 'react';
import { saApiFetch } from '../saApiFetch.js';

const ACTION_LABELS = {
  LOGIN: 'Login', LOGIN_FAILED: 'Login failed', USER_REGISTERED: 'Registered',
  PASSWORD_CHANGED: 'Password changed', STAFF_PASSWORD_RESET: 'Staff pw reset',
  BOOKING_CREATED: 'Booking created', BOOKING_EDITED: 'Booking edited',
  BOOKING_CANCELLED: 'Booking cancelled', GUEST_CHECKED_IN: 'Checked in',
  GUEST_CHECKED_OUT: 'Checked out', DEPOSIT_REQUESTED: 'Deposit requested',
  DEPOSIT_PAID: 'Deposit paid', BREAKFAST_ADDED: 'Breakfast added',
  GUEST_CREATED: 'Guest created', GUEST_UPDATED: 'Guest updated',
  GUEST_ANONYMISED: 'Guest anonymised', GUEST_BLACKLISTED: 'Guest blacklisted',
  GUEST_UNBLACKLISTED: 'Guest unblacklisted', GUESTS_IMPORTED: 'Guests imported',
  ROOM_CREATED: 'Room created', ROOM_UPDATED: 'Room updated', ROOM_DELETED: 'Room deleted',
  PROPERTY_CREATED: 'Property created', PROPERTY_UPDATED: 'Property updated',
  PROPERTY_DELETED: 'Property deleted', USER_CREATED: 'Staff created',
  PLAN_UPGRADED: 'Plan upgraded',
};

const CAT_COLOR = {
  auth: '#dbeafe', booking: '#dcfce7', guest: '#f3e8ff',
  room: '#ffedd5', property: '#ccfbf1', user: '#fce7f3',
};

const LIMIT = 50;

export default function AuditLog() {
  const [logs,       setLogs]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [category,   setCategory]   = useState('');
  const [from,       setFrom]       = useState('');
  const [to,         setTo]         = useState('');

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (category) params.set('category', category);
    if (from)     params.set('from', from);
    if (to)       params.set('to', to);

    saApiFetch(`/api/admin/audit-log?${params}`)
      .then((r) => r.ok ? r.json() : { logs: [], total: 0, totalPages: 0 })
      .then(({ logs: rows, total: tot, totalPages: tp }) => {
        setLogs(rows);
        setTotal(tot);
        setTotalPages(tp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, category, from, to]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const CATS = ['', 'auth', 'booking', 'guest', 'room', 'property', 'user'];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 700 }}>Audit Log</h2>
        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
          Cross-property activity trail — {total.toLocaleString()} entries
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.83rem' }}
        >
          {CATS.map((c) => (
            <option key={c} value={c}>{c || 'All categories'}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.83rem' }} />
        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>to</span>
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }}
          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.83rem' }} />
      </div>

      {/* Table */}
      {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No activity found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['When', 'Property', 'User', 'Action', 'Cat', 'Target', 'Detail', 'IP'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', color: '#94a3b8', whiteSpace: 'nowrap', fontSize: '0.77rem' }}>
                      {formatTs(log.timestamp)}
                    </td>
                    <td style={{ padding: '7px 10px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.property_name ?? (log.property_id ? `#${log.property_id}` : '—')}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{log.user_name ?? '—'}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{log.user_email}</div>
                    </td>
                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{
                        background: CAT_COLOR[log.category] ?? '#f1f5f9',
                        padding: '2px 7px', borderRadius: 4, fontSize: '0.73rem', fontWeight: 600,
                      }}>
                        {log.category}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.target_name ?? (log.target_id ? `#${log.target_id}` : '—')}
                    </td>
                    <td style={{ padding: '7px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }}>
                      {log.detail ?? '—'}
                    </td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#94a3b8' }}>
                      {log.ip_address ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'center', flexShrink: 0 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: '0.83rem', color: '#64748b' }}>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
