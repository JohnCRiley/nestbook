import { useEffect, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const MARKETING_MATERIALS = [
  {
    title: 'A4 Flyer',     icon: '🗒️', spec: 'A4 · 170gsm gloss',
    variants: [
      { lang: 'EN', name: 'flyer-a4',    href: '/marketing/flyer-a4.html' },
      { lang: 'FR', name: 'flyer-a4-fr', href: '/marketing/flyer-a4-fr.html' },
      { lang: 'DE', name: 'flyer-a4-de', href: '/marketing/flyer-a4-de.html' },
      { lang: 'NL', name: 'flyer-a4-nl', href: '/marketing/flyer-a4-nl.html' },
      { lang: 'ES', name: 'flyer-a4-es', href: '/marketing/flyer-a4-es.html' },
    ],
  },
  {
    title: 'A5 Handout',   icon: '📋', spec: 'A5 · 150gsm silk · double-sided',
    variants: [
      { lang: 'EN', name: 'handout-a5',    href: '/marketing/handout-a5.html' },
      { lang: 'FR', name: 'handout-a5-fr', href: '/marketing/handout-a5-fr.html' },
      { lang: 'DE', name: 'handout-a5-de', href: '/marketing/handout-a5-de.html' },
      { lang: 'NL', name: 'handout-a5-nl', href: '/marketing/handout-a5-nl.html' },
      { lang: 'ES', name: 'handout-a5-es', href: '/marketing/handout-a5-es.html' },
    ],
  },
  {
    title: 'A-Frame Poster', icon: '🪧', spec: 'A1 · vinyl or foam board',
    variants: [
      { lang: 'EN', name: 'aframe',    href: '/marketing/aframe.html' },
      { lang: 'FR', name: 'aframe-fr', href: '/marketing/aframe-fr.html' },
      { lang: 'DE', name: 'aframe-de', href: '/marketing/aframe-de.html' },
      { lang: 'NL', name: 'aframe-nl', href: '/marketing/aframe-nl.html' },
      { lang: 'ES', name: 'aframe-es', href: '/marketing/aframe-es.html' },
    ],
  },
  {
    title: 'Feather Flag',  icon: '🚩', spec: 'Dye-sub fabric · 50cm × 150cm',
    variants: [
      { lang: 'EN', name: 'feather-flag', href: '/marketing/feather-flag.html' },
    ],
  },
  {
    title: 'Business Card', icon: '💳', spec: 'A4 sheet · 85×55mm cards · 400gsm',
    variants: [
      { lang: 'EN', name: 'business-card', href: '/marketing/business-card.html' },
    ],
  },
  {
    title: 'Car Door Magnet', icon: '🚗', spec: 'Magnetic vinyl · 3mm bleed',
    variants: [
      { lang: 'EN Portrait',  name: 'car-door-portrait',    href: '/marketing/car-door-magnetic-portrait.html' },
      { lang: 'FR Portrait',  name: 'car-door-portrait-fr', href: '/marketing/car-door-magnetic-portrait-fr.html' },
      { lang: 'EN Landscape', name: 'car-door-landscape',   href: '/marketing/car-door-magnetic-landscape.html' },
    ],
  },
];

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

      {/* Marketing Materials — Download Centre */}
      <div className="admin-card" style={{ marginTop: 28 }}>
        <div className="admin-card-header">
          <h2>Marketing Materials — Download Centre</h2>
          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Server-generated PDFs · Full colour · Correct dimensions</span>
        </div>

        {/* Material cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, padding: '16px 0 4px' }}>
          {MARKETING_MATERIALS.map(({ title, icon, spec, variants }) => (
            <div key={title} style={{
              border: '1.5px solid #e2e8f0', borderRadius: 10,
              overflow: 'hidden', background: '#fff',
            }}>
              <div style={{ background: '#f0fdf4', padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1a2e14' }}>{icon} {title}</div>
                <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{spec}</div>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {variants.map(({ lang, name, href }) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', minWidth: 28 }}>{lang}</span>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '4px 10px', borderRadius: 5, fontSize: '0.75rem', fontWeight: 600,
                        background: '#f0fdf4', border: '1px solid #86efac', color: '#166534',
                        textDecoration: 'none', whiteSpace: 'nowrap',
                      }}
                    >
                      Preview
                    </a>
                    <a
                      href={`/api/marketing/pdf/${name}`}
                      style={{
                        padding: '4px 10px', borderRadius: 5, fontSize: '0.75rem', fontWeight: 600,
                        background: '#1a4710', color: '#fff',
                        textDecoration: 'none', whiteSpace: 'nowrap',
                      }}
                    >
                      PDF
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Print shop instructions */}
      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-card-header">
          <h2>Print Shop Instructions</h2>
        </div>
        <div style={{ padding: '12px 0 4px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1a2e14', marginBottom: 8 }}>How to send to a print shop</div>
            <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                'Click "PDF" on the material you want — it downloads automatically.',
                'Send the PDF file directly to your print shop.',
                'Or: click "Preview" → Ctrl+P → "Save as PDF" to print from browser.',
              ].map((step, i) => (
                <li key={i} style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.55 }}>{step}</li>
              ))}
            </ol>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1a2e14', marginBottom: 8 }}>Recommended print specs</div>
            <table style={{ fontSize: '0.78rem', borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {[
                  ['A4 Flyer',        'Full colour · 170gsm gloss · double-sided optional'],
                  ['A5 Handout',      'Full colour · 150gsm silk · double-sided'],
                  ['A-Frame (A1)',     'Full colour · weatherproof vinyl or foam board'],
                  ['Feather Flag',     'Dye-sub fabric · ~50cm × 150cm'],
                  ['Business Card',   '400gsm · laminated · 85×55mm'],
                  ['Car Door Magnet', 'Magnetic vinyl · 3mm bleed'],
                ].map(([mat, spec]) => (
                  <tr key={mat} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 8px 4px 0', fontWeight: 600, color: '#1a2e14', whiteSpace: 'nowrap' }}>{mat}</td>
                    <td style={{ padding: '4px 0', color: '#64748b' }}>{spec}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
