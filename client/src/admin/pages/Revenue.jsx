import { useEffect, useRef, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const PLAN_MRR = { pro: 19, multi: 39 };

export default function Revenue() {
  const [data, setData]       = useState(null);
  const [geo,  setGeo]        = useState([]);
  const chartRef              = useRef(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/revenue').then(r => r.json()),
      apiFetch('/api/admin/geography').then(r => r.json()),
    ]).then(([rev, geo]) => {
      setData(rev);
      setGeo(geo);
    }).catch(() => {});
  }, []);

  // Draw bar chart when data arrives
  useEffect(() => {
    if (!data?.signupsByMonth || !chartRef.current) return;
    const canvas = chartRef.current;
    const ctx    = canvas.getContext('2d');
    const months = data.signupsByMonth;

    const W = canvas.width  = canvas.offsetWidth;
    const H = canvas.height = 180;

    const maxVal  = Math.max(...months.map(m => m.count), 1);
    const barW    = Math.floor((W - 60) / months.length * 0.6);
    const gapW    = Math.floor((W - 60) / months.length);
    const padL    = 30;
    const padB    = 32;
    const chartH  = H - padB - 10;

    ctx.clearRect(0, 0, W, H);

    months.forEach((m, i) => {
      const barH = Math.round((m.count / maxVal) * chartH);
      const x    = padL + i * gapW + (gapW - barW) / 2;
      const y    = H - padB - barH;

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 4);
      ctx.fill();

      // Month label
      ctx.fillStyle  = '#94a3b8';
      ctx.font       = '11px system-ui';
      ctx.textAlign  = 'center';
      ctx.fillText(m.month.slice(5), x + barW / 2, H - 8);

      // Count label above bar
      if (m.count > 0) {
        ctx.fillStyle = '#334155';
        ctx.font      = '11px system-ui';
        ctx.fillText(m.count, x + barW / 2, y - 4);
      }
    });
  }, [data]);

  const proCount   = data?.planCounts?.find(p => p.plan === 'pro')?.count   ?? 0;
  const multiCount = data?.planCounts?.find(p => p.plan === 'multi')?.count ?? 0;
  const mrr        = proCount * PLAN_MRR.pro + multiCount * PLAN_MRR.multi;

  return (
    <>
      <div className="page-header">
        <h1>Revenue</h1>
        <div className="page-date">Subscription and growth metrics</div>
      </div>

      {/* MRR cards */}
      <div className="admin-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="admin-stat-card accent">
          <div className="admin-stat-value">€{mrr}</div>
          <div className="admin-stat-label">Monthly Recurring Revenue</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{proCount}</div>
          <div className="admin-stat-label">Pro subscriptions (€19/mo)</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{multiCount}</div>
          <div className="admin-stat-label">Multi subscriptions (€39/mo)</div>
        </div>
      </div>

      {/* Signups chart */}
      <div className="admin-card" style={{ marginTop: 28 }}>
        <div className="admin-card-header">
          <h2>New Signups — Last 6 Months</h2>
        </div>
        <div style={{ padding: '16px 20px 8px' }}>
          <canvas ref={chartRef} style={{ width: '100%', display: 'block' }} />
        </div>
      </div>

      {/* Geography */}
      <div className="admin-card" style={{ marginTop: 24 }}>
        <div className="admin-card-header">
          <h2>Properties by Country</h2>
        </div>
        <div style={{ padding: '8px 20px 16px' }}>
          {geo.map(g => (
            <div key={g.country} className="admin-geo-row">
              <span className="admin-geo-country">{g.country}</span>
              <div className="admin-geo-bar-wrap">
                <div className="admin-geo-bar" style={{ width: `${g.percentage}%` }} />
              </div>
              <span className="admin-geo-count">{g.count} ({g.percentage}%)</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
