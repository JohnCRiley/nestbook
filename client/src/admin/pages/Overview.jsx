import { useEffect, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const MARKETING_MATERIALS = [
  {
    title: 'A4 Flyer',     icon: 'ti ti-file-text', spec: 'A4 · 170gsm gloss',
    variants: [
      { lang: 'EN', name: 'flyer-a4',    href: '/marketing/flyer-a4.html' },
      { lang: 'FR', name: 'flyer-a4-fr', href: '/marketing/flyer-a4-fr.html' },
      { lang: 'DE', name: 'flyer-a4-de', href: '/marketing/flyer-a4-de.html' },
      { lang: 'NL', name: 'flyer-a4-nl', href: '/marketing/flyer-a4-nl.html' },
      { lang: 'ES', name: 'flyer-a4-es', href: '/marketing/flyer-a4-es.html' },
    ],
  },
  {
    title: 'A5 Handout',   icon: 'ti ti-clipboard', spec: 'A5 · 150gsm silk · double-sided',
    variants: [
      { lang: 'EN', name: 'handout-a5',    href: '/marketing/handout-a5.html' },
      { lang: 'FR', name: 'handout-a5-fr', href: '/marketing/handout-a5-fr.html' },
      { lang: 'DE', name: 'handout-a5-de', href: '/marketing/handout-a5-de.html' },
      { lang: 'NL', name: 'handout-a5-nl', href: '/marketing/handout-a5-nl.html' },
      { lang: 'ES', name: 'handout-a5-es', href: '/marketing/handout-a5-es.html' },
    ],
  },
  {
    title: 'A-Frame Poster', icon: 'ti ti-layout-board', spec: 'A1 · vinyl or foam board',
    variants: [
      { lang: 'EN', name: 'aframe',    href: '/marketing/aframe.html' },
      { lang: 'FR', name: 'aframe-fr', href: '/marketing/aframe-fr.html' },
      { lang: 'DE', name: 'aframe-de', href: '/marketing/aframe-de.html' },
      { lang: 'NL', name: 'aframe-nl', href: '/marketing/aframe-nl.html' },
      { lang: 'ES', name: 'aframe-es', href: '/marketing/aframe-es.html' },
    ],
  },
  {
    title: 'Feather Flag',  icon: 'ti ti-flag', spec: 'Dye-sub fabric · 50cm × 150cm',
    variants: [
      { lang: 'EN', name: 'feather-flag', href: '/marketing/feather-flag.html' },
    ],
  },
  {
    title: 'Business Card', icon: 'ti ti-id-badge', spec: 'A4 sheet · 85×55mm cards · 400gsm',
    variants: [
      { lang: 'EN', name: 'business-card', href: '/marketing/business-card.html' },
    ],
  },
  {
    title: 'Car Door Magnet', icon: 'ti ti-car', spec: 'Magnetic vinyl · 3mm bleed',
    variants: [
      { lang: 'EN Portrait',  name: 'car-door-portrait',    href: '/marketing/car-door-magnetic-portrait.html' },
      { lang: 'FR Portrait',  name: 'car-door-portrait-fr', href: '/marketing/car-door-magnetic-portrait-fr.html' },
      { lang: 'EN Landscape', name: 'car-door-landscape',   href: '/marketing/car-door-magnetic-landscape.html' },
    ],
  },
  {
    title: 'Plan Comparison', icon: 'ti ti-table', spec: 'A4 · PDF-ready comparison table',
    variants: [
      { lang: 'EN', name: 'compare-plans', href: '/marketing/compare-plans.html' },
    ],
  },
];

export default function Overview() {
  const [stats,    setStats]    = useState(null);
  const [signups,  setSignups]  = useState([]);
  const [activeMat, setActiveMat] = useState(null);

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
        <StatCard label="Total Properties"    value={stats?.totalProperties ?? '—'} />
        <StatCard label="Total Users"         value={stats?.totalUsers      ?? '—'} />
        <StatCard label="Pro Subscriptions"   value={stats?.proSubs         ?? '—'} />
        <StatCard label="Multi Subscriptions" value={stats?.multiSubs       ?? '—'} />
        <StatCard label="MRR"                 value={stats ? `€${stats.mrr}` : '—'} accent />
        <StatCard label="New this week"       value={stats?.newThisWeek     ?? '—'} />
      </div>

      {/* Marketing Materials — Download Centre */}
      <div className="admin-card" style={{ marginTop: 28 }}>
        <div className="admin-card-header">
          <h2>Marketing Materials — Download Centre</h2>
          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Server-generated PDFs · Full colour · Correct dimensions</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 0 4px' }}>
          {MARKETING_MATERIALS.map((mat) => (
            <button
              key={mat.title}
              onClick={() => setActiveMat(mat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 7,
                border: '1.5px solid #e2e8f0', background: '#f8fafc',
                fontSize: '0.82rem', fontWeight: 600, color: '#1a2e14',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <i className={mat.icon} style={{ fontSize: '0.95rem' }} />
              {mat.title}
            </button>
          ))}
        </div>
      </div>

      {/* Material modal */}
      {activeMat && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setActiveMat(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, width: 340, maxWidth: '92vw',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ background: '#f0fdf4', padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a2e14' }}>
                  <i className={activeMat.icon} /> {activeMat.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{activeMat.spec}</div>
              </div>
              <button
                onClick={() => setActiveMat(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.1rem', lineHeight: 1, padding: '2px 4px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>
            {/* Variants */}
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeMat.variants.map(({ lang, name, href }) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', minWidth: 90 }}>{lang}</span>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '5px 12px', borderRadius: 5, fontSize: '0.78rem', fontWeight: 600,
                      background: '#f0fdf4', border: '1px solid #86efac', color: '#166534',
                      textDecoration: 'none',
                    }}
                  >
                    Preview
                  </a>
                  <a
                    href={`/api/marketing/pdf/${name}`}
                    style={{
                      padding: '5px 12px', borderRadius: 5, fontSize: '0.78rem', fontWeight: 600,
                      background: '#1a4710', color: '#fff',
                      textDecoration: 'none',
                    }}
                  >
                    PDF
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


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
