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

      {/* Marketing Materials */}
      <div className="admin-card" style={{ marginTop: 28 }}>
        <div className="admin-card-header">
          <h2>Marketing Materials</h2>
          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Open in browser · Ctrl+P to print</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 0 4px' }}>
          {[
            {
              lang: '🇬🇧 English',
              files: [
                { label: 'A4 Flyer',      href: '/marketing/flyer-a4.html' },
                { label: 'A5 Handout',    href: '/marketing/handout-a5.html' },
                { label: 'A-Frame Sign',  href: '/marketing/aframe.html' },
                { label: 'Feather Flag',  href: '/marketing/feather-flag.html' },
                { label: 'Business Card', href: '/marketing/business-card.html' },
              ],
            },
            {
              lang: '🇫🇷 Français',
              files: [
                { label: 'Flyer A4',     href: '/marketing/flyer-a4-fr.html' },
                { label: 'Handout A5',   href: '/marketing/handout-a5-fr.html' },
                { label: 'Affiche A1',   href: '/marketing/aframe-fr.html' },
              ],
            },
            {
              lang: '🇩🇪 Deutsch',
              files: [
                { label: 'Flyer A4',         href: '/marketing/flyer-a4-de.html' },
                { label: 'Handout A5',       href: '/marketing/handout-a5-de.html' },
                { label: 'A-Aufsteller A1',  href: '/marketing/aframe-de.html' },
              ],
            },
            {
              lang: '🇳🇱 Nederlands',
              files: [
                { label: 'Flyer A4',      href: '/marketing/flyer-a4-nl.html' },
                { label: 'Handout A5',    href: '/marketing/handout-a5-nl.html' },
                { label: 'A-Frame A1',    href: '/marketing/aframe-nl.html' },
              ],
            },
            {
              lang: '🇪🇸 Español',
              files: [
                { label: 'Flyer A4',    href: '/marketing/flyer-a4-es.html' },
                { label: 'Handout A5',  href: '/marketing/handout-a5-es.html' },
                { label: 'Cartel A1',   href: '/marketing/aframe-es.html' },
              ],
            },
            {
              lang: '🚗 Magnetic Signs',
              files: [
                { label: 'Portrait EN',    href: '/marketing/car-door-magnetic-portrait.html' },
                { label: 'Landscape EN',   href: '/marketing/car-door-magnetic-landscape.html' },
                { label: 'Portrait FR',    href: '/marketing/car-door-magnetic-portrait-fr.html' },
              ],
            },
          ].map(({ lang, files }) => (
            <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', minWidth: 130, flexShrink: 0 }}>{lang}</span>
              {files.map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 13px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600,
                    background: '#f0fdf4', border: '1.5px solid #86efac', color: '#166534',
                    textDecoration: 'none',
                  }}
                >
                  {label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Recent signups */}
      <div className="admin-card" style={{ marginTop: 28 }}>
        <div className="admin-card-header">
          <h2>Recent Signups</h2>
        </div>
        <div className="admin-table-wrap">
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
