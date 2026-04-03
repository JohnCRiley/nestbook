import { useEffect, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

export default function Overview() {
  const [stats,   setStats]   = useState(null);
  const [signups, setSignups] = useState([]);

  useEffect(() => {
    apiFetch('/api/admin/stats').then(r => r.json()).then(setStats).catch(() => {});
    apiFetch('/api/admin/signups').then(r => r.json()).then(setSignups).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Overview</h1>
        <div className="page-date">Platform at a glance</div>
      </div>

      {/* Stat cards */}
      <div className="admin-stats-grid">
        <StatCard label="Total Properties"  value={stats?.totalProperties ?? '—'} />
        <StatCard label="Total Users"       value={stats?.totalUsers      ?? '—'} />
        <StatCard label="Pro Subscriptions" value={stats?.proSubs         ?? '—'} />
        <StatCard label="Multi Subscriptions" value={stats?.multiSubs     ?? '—'} />
        <StatCard label="MRR"               value={stats ? `€${stats.mrr}` : '—'} accent />
        <StatCard label="New this week"     value={stats?.newThisWeek     ?? '—'} />
      </div>

      {/* Recent signups */}
      <div className="admin-card" style={{ marginTop: 28 }}>
        <div className="admin-card-header">
          <h2>Recent Signups</h2>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Property</th>
              <th>Plan</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {signups.map(u => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="admin-muted">{u.email}</td>
                <td>{u.property_name ?? '—'}</td>
                <td><PlanBadge plan={u.plan} /></td>
                <td className="admin-muted">{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`admin-stat-card${accent ? ' accent' : ''}`}>
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
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
