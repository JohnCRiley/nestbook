import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch }     from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import PlanGate          from '../components/PlanGate.jsx';
import Pagination        from '../components/Pagination.jsx';
import usePageSize       from '../hooks/usePageSize.js';

const RESERVED = 160;

// Human-readable action labels
const ACTION_LABELS = {
  LOGIN:               'Login',
  LOGIN_FAILED:        'Login failed',
  USER_REGISTERED:     'Registered',
  PASSWORD_CHANGED:    'Password changed',
  STAFF_PASSWORD_RESET:'Staff password reset',
  BOOKING_CREATED:     'Booking created',
  BOOKING_EDITED:      'Booking edited',
  BOOKING_CANCELLED:   'Booking cancelled',
  GUEST_CHECKED_IN:    'Checked in',
  GUEST_CHECKED_OUT:   'Checked out',
  DEPOSIT_REQUESTED:   'Deposit requested',
  DEPOSIT_PAID:        'Deposit paid',
  BREAKFAST_ADDED:     'Breakfast added',
  GUEST_CREATED:       'Guest created',
  GUEST_UPDATED:       'Guest updated',
  GUEST_ANONYMISED:    'Guest anonymised',
  GUEST_BLACKLISTED:   'Guest blacklisted',
  GUEST_UNBLACKLISTED: 'Guest unblacklisted',
  GUESTS_IMPORTED:     'Guests imported',
  ROOM_CREATED:        'Room created',
  ROOM_UPDATED:        'Room updated',
  ROOM_DELETED:        'Room deleted',
  PROPERTY_CREATED:    'Property created',
  PROPERTY_UPDATED:    'Property updated',
  PROPERTY_DELETED:    'Property deleted',
  USER_CREATED:        'Staff account created',
};

// Category badge styles
const CAT_STYLE = {
  auth:     { background: '#dbeafe', color: '#1e40af' },
  booking:  { background: '#dcfce7', color: '#166534' },
  guest:    { background: '#f3e8ff', color: '#6b21a8' },
  room:     { background: '#ffedd5', color: '#9a3412' },
  property: { background: '#ccfbf1', color: '#0f766e' },
  user:     { background: '#fce7f3', color: '#9d174d' },
};

export default function ActivityLog() {
  const t = useT();
  return (
    <>
      <div className="page-header">
        <h1>{t('activityLog')}</h1>
        <div className="page-date">{t('activityLogSubtitle')}</div>
      </div>
      <PlanGate requiredPlan="pro">
        <ActivityLogContent />
      </PlanGate>
    </>
  );
}

function ActivityLogContent() {
  const t = useT();
  const { property } = useLocale();
  const pageSize = usePageSize(56, RESERVED);

  const [logs,       setLogs]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [category,   setCategory]   = useState('');
  const [from,       setFrom]       = useState('');
  const [to,         setTo]         = useState('');

  const prevPageSizeRef = useRef(pageSize);
  useEffect(() => {
    if (prevPageSizeRef.current !== pageSize) {
      prevPageSizeRef.current = pageSize;
      setPage(1);
    }
  }, [pageSize]);

  const fetchLogs = useCallback(() => {
    if (!property?.id) return;
    const params = new URLSearchParams({ property_id: property.id, page, limit: pageSize });
    if (category) params.set('category', category);
    if (from)     params.set('from', from);
    if (to)       params.set('to', to);

    apiFetch(`/api/activity-log?${params}`)
      .then((r) => r.ok ? r.json() : { logs: [], total: 0, totalPages: 0 })
      .then(({ logs: rows, total: tot, totalPages: tp }) => {
        setLogs(rows);
        setTotal(tot);
        setTotalPages(tp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [property?.id, page, pageSize, category, from, to]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleCategoryChange = (cat) => { setCategory(cat); setPage(1); };

  const handleExportCSV = () => {
    if (!property?.id) return;
    const params = new URLSearchParams({ property_id: property.id, limit: 10000 });
    if (category) params.set('category', category);
    if (from)     params.set('from', from);
    if (to)       params.set('to', to);

    apiFetch(`/api/activity-log?${params}`)
      .then((r) => r.json())
      .then(({ logs: rows }) => {
        const header = 'Timestamp,User,Email,Role,Action,Category,Target,Detail,IP\n';
        const lines  = rows.map((l) => [
          l.timestamp,
          csvCell(l.user_name),
          csvCell(l.user_email),
          csvCell(l.user_role),
          csvCell(ACTION_LABELS[l.action] ?? l.action),
          csvCell(l.category),
          csvCell(l.target_name ?? (l.target_id ? `#${l.target_id}` : '')),
          csvCell(l.detail),
          csvCell(l.ip_address),
        ].join(','));
        const blob = new Blob([header + lines.join('\n')], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `activity-log-${property.id}.csv`; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {});
  };

  const CATEGORIES = [
    { key: '',         label: t('alFilterAll') },
    { key: 'auth',     label: t('alCatAuth') },
    { key: 'booking',  label: t('alCatBooking') },
    { key: 'guest',    label: t('alCatGuest') },
    { key: 'room',     label: t('alCatRoom') },
    { key: 'property', label: t('alCatProperty') },
    { key: 'user',     label: t('alCatUser') },
  ];

  return (
    <>
      {/* Controls */}
      <div className="controls-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="filter-bar">
          {CATEGORIES.map(({ key, label }) => (
            <button
              key={key}
              className={`filter-btn${category === key ? ' active' : ''}`}
              onClick={() => handleCategoryChange(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {t('reportFrom')}
          </label>
          <input
            type="date" value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem' }}
          />
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {t('reportTo')}
          </label>
          <input
            type="date" value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem' }}
          />
          <button className="btn-secondary" onClick={handleExportCSV} style={{ whiteSpace: 'nowrap' }}>
            {t('alExportCSV')}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-screen">{t('alLoadingLogs')}</div>
      ) : logs.length === 0 ? (
        <div className="table-empty">{t('alNoLogs')}</div>
      ) : (
        <div className="table-wrap">
          <table className="bookings-table" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th>{t('alTimestamp')}</th>
                <th>{t('alUser')}</th>
                <th>{t('alAction')}</th>
                <th>{t('alCategory')}</th>
                <th>{t('alTarget')}</th>
                <th>{t('alDetail')}</th>
                <th style={{ color: 'var(--text-muted)' }}>{t('alIPAddress')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} limit={pageSize} onPage={setPage} />
    </>
  );
}

function LogRow({ log }) {
  const catStyle = CAT_STYLE[log.category] ?? { background: '#f1f5f9', color: '#475569' };
  const actionLabel = ACTION_LABELS[log.action] ?? log.action;
  const targetLabel = log.target_name ?? (log.target_id ? `#${log.target_id}` : '');

  return (
    <tr>
      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
        {formatTs(log.timestamp)}
      </td>
      <td>
        <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{log.user_name ?? '—'}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.user_email}</div>
      </td>
      <td style={{ fontWeight: 600 }}>{actionLabel}</td>
      <td>
        <span style={{
          ...catStyle,
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 4,
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'capitalize',
        }}>
          {log.category}
        </span>
      </td>
      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {targetLabel || '—'}
      </td>
      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
        {log.detail ?? '—'}
      </td>
      <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
        {log.ip_address ?? '—'}
      </td>
    </tr>
  );
}

function formatTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function csvCell(val) {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
}
