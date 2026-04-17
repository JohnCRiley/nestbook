import { useState, useCallback, useRef, useEffect } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const PAGE_LIMIT = 50;

const PLAN_OPTIONS     = [
  { value: 'all',   label: 'All plans' },
  { value: 'free',  label: 'Free' },
  { value: 'pro',   label: 'Pro' },
  { value: 'multi', label: 'Multi' },
];
const PROPERTY_OPTIONS = [
  { value: 'all',        label: 'All types' },
  { value: 'bnb',        label: 'B&B' },
  { value: 'gite',       label: 'Gîte' },
  { value: 'guesthouse', label: 'Guest House' },
  { value: 'hotel',      label: 'Hotel' },
  { value: 'other',      label: 'Other' },
];
const COUNTRY_OPTIONS  = [
  { value: 'all',         label: 'All countries' },
  { value: 'UK',          label: 'UK' },
  { value: 'France',      label: 'France' },
  { value: 'Spain',       label: 'Spain' },
  { value: 'Germany',     label: 'Germany' },
  { value: 'Netherlands', label: 'Netherlands' },
  { value: 'other',       label: 'Other' },
];
const LANGUAGE_OPTIONS = [
  { value: 'all', label: 'All languages' },
  { value: 'en',  label: 'English' },
  { value: 'fr',  label: 'Français' },
  { value: 'es',  label: 'Español' },
  { value: 'de',  label: 'Deutsch' },
  { value: 'nl',  label: 'Nederlands' },
];
const STATUS_OPTIONS   = [
  { value: 'all',       label: 'All statuses' },
  { value: 'active',    label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EMPTY_FILTERS = {
  plan:            'all',
  propertyType:    'all',
  country:         'all',
  language:        'all',
  status:          'all',
  registeredFrom:  '',
  registeredTo:    '',
  verifiedOnly:    false,
};

export default function MailingList() {
  const [filters,    setFilters]    = useState(EMPTY_FILTERS);
  const [rows,       setRows]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [toast,      setToast]      = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // Build query params from current filters + pagination
  function buildParams(overrides = {}) {
    const f = { ...filters, ...overrides };
    const p = new URLSearchParams();
    if (f.plan          && f.plan          !== 'all') p.set('plan',         f.plan);
    if (f.propertyType  && f.propertyType  !== 'all') p.set('propertyType', f.propertyType);
    if (f.country       && f.country       !== 'all') p.set('country',      f.country);
    if (f.language      && f.language      !== 'all') p.set('language',     f.language);
    if (f.status        && f.status        !== 'all') p.set('status',       f.status);
    if (f.registeredFrom) p.set('registeredFrom', f.registeredFrom);
    if (f.registeredTo)   p.set('registeredTo',   f.registeredTo);
    if (f.verifiedOnly)   p.set('verifiedOnly',   'true');
    return p;
  }

  // Fetch current page
  const fetchPage = useCallback((pg = 1) => {
    const params = buildParams();
    params.set('page',  pg);
    params.set('limit', PAGE_LIMIT);
    setLoading(true);
    apiFetch(`/api/admin/mailing-list?${params}`)
      .then(r => r.json())
      .then(data => {
        setRows(data.users ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 0);
        setPage(data.page ?? 1);
        setHasSearched(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  function handleSearch(e) {
    e.preventDefault();
    fetchPage(1);
  }

  function handleFilterChange(field, value) {
    setFilters(f => ({ ...f, [field]: value }));
  }

  // ── Export helpers ────────────────────────────────────────────────────────

  // Fetch ALL matching rows (limit=5000) for export
  async function fetchAllForExport() {
    const params = buildParams();
    params.set('page', 1);
    params.set('limit', 5000);
    const res  = await apiFetch(`/api/admin/mailing-list?${params}`);
    const data = await res.json();
    return data.users ?? [];
  }

  async function handleCopyEmails() {
    setExporting(true);
    try {
      const all    = await fetchAllForExport();
      const emails = all.map(u => u.email).filter(Boolean).join(', ');
      await navigator.clipboard.writeText(emails);
      showToast(`${all.length} email address${all.length !== 1 ? 'es' : ''} copied to clipboard.`);
    } catch { showToast('Failed to copy emails.', 'error'); }
    setExporting(false);
  }

  async function handleExportCSV() {
    setExporting(true);
    try {
      const all = await fetchAllForExport();
      const header = ['Name', 'Email', 'Plan', 'Property Type', 'Country', 'Language', 'Registered'];
      const csvRows = all.map(u => [
        csvEscape(u.name ?? ''),
        csvEscape(u.email ?? ''),
        csvEscape(u.plan ?? ''),
        csvEscape(u.property_type ?? ''),
        csvEscape(u.country ?? ''),
        csvEscape(u.language ?? ''),
        csvEscape(u.created_at ? u.created_at.slice(0, 10) : ''),
      ]);
      downloadCSV([header, ...csvRows], 'nestbook-mailing-list.csv');
      showToast(`CSV with ${all.length} records downloaded.`);
    } catch { showToast('Export failed.', 'error'); }
    setExporting(false);
  }

  async function handleExportMailchimp() {
    setExporting(true);
    try {
      const all = await fetchAllForExport();
      const header = ['Email Address', 'First Name', 'Last Name', 'Tags'];
      const csvRows = all.map(u => {
        const [firstName, ...rest] = (u.name ?? '').split(' ');
        const lastName = rest.join(' ');
        const tags = [u.plan, u.property_type, u.country, u.language]
          .filter(Boolean).join(', ');
        return [
          csvEscape(u.email ?? ''),
          csvEscape(firstName ?? ''),
          csvEscape(lastName ?? ''),
          csvEscape(tags),
        ];
      });
      downloadCSV([header, ...csvRows], 'nestbook-mailchimp.csv');
      showToast(`Mailchimp CSV with ${all.length} contacts downloaded.`);
    } catch { showToast('Export failed.', 'error'); }
    setExporting(false);
  }

  return (
    <>
      <div className="page-header">
        <h1>Mailing List</h1>
        <div className="page-date">Filter and export user contacts</div>
      </div>

      {/* ── Filter panel ─────────────────────────────────────────────────── */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <div className="admin-card-header">
          <h2>Filters</h2>
        </div>
        <form onSubmit={handleSearch}>
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
              <label className="ml-filter-label">Property Type</label>
              <select
                className="ml-filter-select"
                value={filters.propertyType}
                onChange={e => handleFilterChange('propertyType', e.target.value)}
              >
                {PROPERTY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="ml-filter-field">
              <label className="ml-filter-label">Country</label>
              <select
                className="ml-filter-select"
                value={filters.country}
                onChange={e => handleFilterChange('country', e.target.value)}
              >
                {COUNTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="ml-filter-field">
              <label className="ml-filter-label">Language</label>
              <select
                className="ml-filter-select"
                value={filters.language}
                onChange={e => handleFilterChange('language', e.target.value)}
              >
                {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="ml-filter-field">
              <label className="ml-filter-label">Account Status</label>
              <select
                className="ml-filter-select"
                value={filters.status}
                onChange={e => handleFilterChange('status', e.target.value)}
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="ml-filter-field">
              <label className="ml-filter-label">Registered From</label>
              <input
                type="date"
                className="ml-filter-input"
                value={filters.registeredFrom}
                onChange={e => handleFilterChange('registeredFrom', e.target.value)}
              />
            </div>

            <div className="ml-filter-field">
              <label className="ml-filter-label">Registered To</label>
              <input
                type="date"
                className="ml-filter-input"
                value={filters.registeredTo}
                onChange={e => handleFilterChange('registeredTo', e.target.value)}
              />
            </div>

            <div className="ml-filter-field">
              <label className="ml-filter-label">Email Verified</label>
              <label className="ml-filter-toggle">
                <input
                  type="checkbox"
                  checked={filters.verifiedOnly}
                  onChange={e => handleFilterChange('verifiedOnly', e.target.checked)}
                />
                Verified only
              </label>
            </div>
          </div>

          <div style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setFilters(EMPTY_FILTERS); setRows([]); setTotal(0); setHasSearched(false); }}
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {hasSearched && (
        <div className="admin-card">
          {/* Actions bar */}
          <div className="ml-actions-bar">
            <span className="ml-count-text">
              {loading ? 'Loading…' : `${total} user${total !== 1 ? 's' : ''} match your filters`}
            </span>
            <div className="ml-export-btns">
              <button
                className="ml-btn ml-btn-copy"
                onClick={handleCopyEmails}
                disabled={exporting || total === 0}
                title="Copy all matching email addresses to clipboard"
              >
                {exporting ? '…' : '📋 Copy emails'}
              </button>
              <button
                className="ml-btn ml-btn-csv"
                onClick={handleExportCSV}
                disabled={exporting || total === 0}
                title="Download CSV with Name, Email, Plan, Property Type, Country, Language, Date"
              >
                {exporting ? '…' : '⬇ Export CSV'}
              </button>
              <button
                className="ml-btn ml-btn-mailchimp"
                onClick={handleExportMailchimp}
                disabled={exporting || total === 0}
                title="Download Mailchimp-format CSV (Email Address, First Name, Last Name, Tags)"
              >
                {exporting ? '…' : '✉ Mailchimp CSV'}
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8' }}>
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8' }}>
              No users match the current filters.
            </div>
          ) : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Plan</th>
                      <th>Property Type</th>
                      <th>Country</th>
                      <th>Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div style={{ fontWeight: 500, color: '#0f172a' }}>{u.name}</div>
                          {!!u.suspended && (
                            <span className="sa-badge sa-badge-cancel" style={{ fontSize: '0.7rem' }}>SUSPENDED</span>
                          )}
                        </td>
                        <td>
                          <a href={`mailto:${u.email}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                            {u.email}
                          </a>
                          {!u.email_verified && (
                            <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#f59e0b' }}>unverified</span>
                          )}
                        </td>
                        <td><PlanBadge plan={u.plan} /></td>
                        <td className="admin-muted" style={{ textTransform: 'capitalize' }}>
                          {u.property_type ?? '—'}
                        </td>
                        <td className="admin-muted">{u.country || '—'}</td>
                        <td className="admin-muted">{fmtDate(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination" style={{ margin: '12px 20px' }}>
                  <span className="pagination-info">
                    Showing {(page - 1) * PAGE_LIMIT + 1}–{Math.min(page * PAGE_LIMIT, total)} of {total}
                  </span>
                  <div className="pagination-controls">
                    <button
                      className="pagination-btn"
                      onClick={() => fetchPage(page - 1)}
                      disabled={page <= 1 || loading}
                    >
                      Previous
                    </button>
                    <span className="pagination-page">Page {page} of {totalPages}</span>
                    <button
                      className="pagination-btn"
                      onClick={() => fetchPage(page + 1)}
                      disabled={page >= totalPages || loading}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Usage tips ────────────────────────────────────────────────────── */}
      {!hasSearched && (
        <div className="admin-card" style={{ padding: '24px 28px' }}>
          <div style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.7 }}>
            <strong style={{ color: '#0f172a', display: 'block', marginBottom: 12 }}>
              Use cases
            </strong>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li><strong>Upgrade campaign:</strong> Filter by Plan = Free, Property Type = Gîte, Country = France → copy emails for Mailchimp campaign</li>
              <li><strong>Feature announcement:</strong> Filter by Plan = Pro → export all Pro users</li>
              <li><strong>Onboarding sequence:</strong> Filter by Registered From = last 30 days → export CSV for drip email</li>
              <li><strong>Newsletter:</strong> Leave all filters as "All" → export all emails</li>
            </ul>
          </div>
        </div>
      )}

      {toast && (
        <div className={`sa-toast sa-toast-${toast.type}`}>{toast.msg}</div>
      )}
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Escape a value for CSV (wrap in quotes if contains comma, quote, or newline) */
function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Trigger a CSV file download in the browser */
function downloadCSV(rows, filename) {
  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
