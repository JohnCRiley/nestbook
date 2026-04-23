import { useEffect, useState, useCallback, useRef } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';
import usePageSize from '../../hooks/usePageSize.js';

const TYPE_LABELS = {
  bnb: 'B&B', gite: 'Gîte', guesthouse: 'Guest House', hotel: 'Hotel', other: 'Other',
};

// page-header(64) + search(52) + pagination(48) + padding(72) + buffer(24)
const RESERVED = 260;

export default function Properties() {
  const pageSize = usePageSize(48, RESERVED);
  const [rows,       setRows]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [search,     setSearch]     = useState('');

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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 0 && (
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
    </>
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
