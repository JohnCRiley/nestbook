import { useEffect, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

export default function Users() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    apiFetch('/api/admin/users').then(r => r.json()).then(setRows).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        <div className="page-date">{rows.length} users registered</div>
      </div>

      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Plan</th>
              <th>Property</th>
              <th>Country</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong></td>
                <td className="admin-muted">{u.email}</td>
                <td>
                  <span className={`role-badge role-${u.role}`}>
                    {u.role === 'owner' ? 'Owner' : 'Reception'}
                  </span>
                </td>
                <td><PlanBadge plan={u.plan} /></td>
                <td>{u.property_name ?? '—'}</td>
                <td className="admin-muted">{u.country ?? '—'}</td>
                <td className="admin-muted">{fmtDate(u.created_at)}</td>
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
