import { useEffect, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const TYPE_LABELS = {
  bnb: 'B&B', gite: 'Gîte', guesthouse: 'Guest House', hotel: 'Hotel', other: 'Other',
};

export default function Properties() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    apiFetch('/api/admin/properties').then(r => r.json()).then(setRows).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Properties</h1>
        <div className="page-date">{rows.length} properties on the platform</div>
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
