import { useEffect, useRef, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const PLAN_MRR = { pro: 19, multi: 39 };

export default function Revenue() {
  const [bi,  setBi]  = useState(null);
  const [geo, setGeo] = useState([]);

  const mrrChartRef     = useRef(null);
  const signupsChartRef = useRef(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/bi').then(r => r.json()),
      apiFetch('/api/admin/geography').then(r => r.json()),
    ]).then(([biData, geoData]) => {
      setBi(biData);
      setGeo(geoData);
    }).catch(() => {});
  }, []);

  // ── MRR trend chart (6 months, stacked pro + multi) ─────────────────────────
  useEffect(() => {
    if (!bi?.mrrTrend || !mrrChartRef.current) return;
    const canvas = mrrChartRef.current;
    const ctx    = canvas.getContext('2d');
    const months = bi.mrrTrend;

    const W = canvas.width  = canvas.offsetWidth;
    const H = canvas.height = 180;

    const maxVal = Math.max(...months.map(m => m.mrr), 1);
    const gapW   = Math.floor((W - 60) / months.length);
    const barW   = Math.floor(gapW * 0.6);
    const padL   = 30;
    const padB   = 32;
    const chartH = H - padB - 10;

    ctx.clearRect(0, 0, W, H);

    months.forEach((m, i) => {
      const x = padL + i * gapW + (gapW - barW) / 2;

      // Multi segment (bottom)
      const multiH = Math.round((m.multi * PLAN_MRR.multi / maxVal) * chartH);
      const proH   = Math.round((m.pro   * PLAN_MRR.pro   / maxVal) * chartH);
      const totalH = multiH + proH;

      if (multiH > 0) {
        ctx.fillStyle = '#6366f1';
        ctx.beginPath();
        ctx.roundRect(x, H - padB - multiH, barW, multiH, [0, 0, 3, 3]);
        ctx.fill();
      }
      if (proH > 0) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.roundRect(x, H - padB - multiH - proH, barW, proH, multiH > 0 ? [3, 3, 0, 0] : 4);
        ctx.fill();
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font      = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(m.month.slice(5), x + barW / 2, H - 8);

      if (m.mrr > 0) {
        ctx.fillStyle = '#334155';
        ctx.font      = '11px system-ui';
        ctx.fillText(`€${m.mrr}`, x + barW / 2, H - padB - totalH - 4);
      }
    });

    // Legend
    ctx.fillStyle = '#10b981'; ctx.fillRect(padL, H - padB + 14, 10, 10);
    ctx.fillStyle = '#475569'; ctx.font = '11px system-ui'; ctx.textAlign = 'left';
    ctx.fillText('Pro', padL + 14, H - padB + 23);
    ctx.fillStyle = '#6366f1'; ctx.fillRect(padL + 50, H - padB + 14, 10, 10);
    ctx.fillStyle = '#475569';
    ctx.fillText('Multi', padL + 64, H - padB + 23);
  }, [bi]);

  // ── Signups by plan chart (12 months, stacked) ──────────────────────────────
  useEffect(() => {
    if (!bi?.signupsByMonth || !signupsChartRef.current) return;
    const canvas = signupsChartRef.current;
    const ctx    = canvas.getContext('2d');
    const months = bi.signupsByMonth;

    const W = canvas.width  = canvas.offsetWidth;
    const H = canvas.height = 200;

    const maxVal = Math.max(...months.map(m => m.free + m.pro + m.multi), 1);
    const gapW   = Math.floor((W - 60) / months.length);
    const barW   = Math.floor(gapW * 0.6);
    const padL   = 30;
    const padB   = 32;
    const chartH = H - padB - 10;

    ctx.clearRect(0, 0, W, H);

    months.forEach((m, i) => {
      const x = padL + i * gapW + (gapW - barW) / 2;
      const total = m.free + m.pro + m.multi;

      const freeH  = Math.round((m.free  / maxVal) * chartH);
      const proH   = Math.round((m.pro   / maxVal) * chartH);
      const multiH = Math.round((m.multi / maxVal) * chartH);
      const totalH = freeH + proH + multiH;

      // Stack: free (bottom), pro, multi (top)
      let yBase = H - padB;

      if (freeH > 0) {
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.roundRect(x, yBase - freeH, barW, freeH, [0, 0, 3, 3]);
        ctx.fill();
        yBase -= freeH;
      }
      if (proH > 0) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.roundRect(x, yBase - proH, barW, proH, freeH > 0 ? 0 : [0, 0, 3, 3]);
        ctx.fill();
        yBase -= proH;
      }
      if (multiH > 0) {
        ctx.fillStyle = '#6366f1';
        ctx.beginPath();
        ctx.roundRect(x, yBase - multiH, barW, multiH, (freeH + proH > 0) ? [3, 3, 0, 0] : 4);
        ctx.fill();
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font      = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(m.month.slice(5), x + barW / 2, H - 8);

      if (total > 0) {
        ctx.fillStyle = '#334155';
        ctx.font      = '11px system-ui';
        ctx.fillText(total, x + barW / 2, H - padB - totalH - 4);
      }
    });

    // Legend
    const items = [['#cbd5e1', 'Free'], ['#10b981', 'Pro'], ['#6366f1', 'Multi']];
    items.forEach(([color, label], idx) => {
      const lx = padL + idx * 70;
      ctx.fillStyle = color;
      ctx.fillRect(lx, H - padB + 14, 10, 10);
      ctx.fillStyle = '#475569';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(label, lx + 14, H - padB + 23);
    });
  }, [bi]);

  if (!bi) return <div style={{ padding: 40, color: '#94a3b8' }}>Loading…</div>;

  const { mrr, proCount, multiCount, freeCount, activeSubscriptions,
          conversionRate, newPaidLast30, newUsersLast30,
          churned, trialsEndingSoon, failedPayments,
          netNewRevenue, newProThisMonth, newMultiThisMonth } = bi;

  return (
    <>
      <div className="page-header">
        <h1>Revenue & Business Intelligence</h1>
        <div className="page-date">Live metrics from local database</div>
      </div>

      {/* ── MRR section ──────────────────────────────────────────────────── */}
      <div className="admin-section-title">Monthly Recurring Revenue</div>
      <div className="admin-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="admin-stat-card accent">
          <div className="admin-stat-value">€{mrr}</div>
          <div className="admin-stat-label">Current MRR</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{proCount}</div>
          <div className="admin-stat-label">Pro subscribers (€19/mo)</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{multiCount}</div>
          <div className="admin-stat-label">Multi subscribers (€39/mo)</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{freeCount}</div>
          <div className="admin-stat-label">Free users (potential)</div>
        </div>
      </div>

      {/* MRR trend chart */}
      <div className="admin-card" style={{ marginTop: 20 }}>
        <div className="admin-card-header"><h2>MRR Trend — Last 6 Months</h2></div>
        <div style={{ padding: '16px 20px 8px' }}>
          <canvas ref={mrrChartRef} style={{ width: '100%', display: 'block' }} />
        </div>
      </div>

      {/* ── Growth metrics ───────────────────────────────────────────────── */}
      <div className="admin-section-title" style={{ marginTop: 32 }}>Growth Metrics</div>
      <div className="admin-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{conversionRate}%</div>
          <div className="admin-stat-label">Conversion rate (last 30 days)</div>
          <div className="admin-stat-sub">{newPaidLast30} paid of {newUsersLast30} signups</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{churned}</div>
          <div className="admin-stat-label">Total churned subscriptions</div>
        </div>
        <div className="admin-stat-card accent-green">
          <div className="admin-stat-value">€{netNewRevenue}</div>
          <div className="admin-stat-label">Net new revenue this month</div>
          <div className="admin-stat-sub">{newProThisMonth} Pro + {newMultiThisMonth} Multi</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{activeSubscriptions}</div>
          <div className="admin-stat-label">Active paid subscriptions</div>
        </div>
      </div>

      {/* Signups by plan chart */}
      <div className="admin-card" style={{ marginTop: 20 }}>
        <div className="admin-card-header"><h2>New Signups by Plan — Last 12 Months</h2></div>
        <div style={{ padding: '16px 20px 8px' }}>
          <canvas ref={signupsChartRef} style={{ width: '100%', display: 'block' }} />
        </div>
      </div>

      {/* ── Stripe / billing section ─────────────────────────────────────── */}
      <div className="admin-section-title" style={{ marginTop: 32 }}>Billing Status</div>
      <div className="admin-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className={`admin-stat-card${trialsEndingSoon > 0 ? ' accent-warn' : ''}`}>
          <div className="admin-stat-value">{trialsEndingSoon}</div>
          <div className="admin-stat-label">Subscriptions ending in 7 days</div>
          <div className="admin-stat-sub">Watch for potential churn</div>
        </div>
        <div className={`admin-stat-card${failedPayments > 0 ? ' accent-red' : ''}`}>
          <div className="admin-stat-value">{failedPayments}</div>
          <div className="admin-stat-label">Failed / past-due payments</div>
          <div className="admin-stat-sub">Requires follow-up</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">€{mrr * 12}</div>
          <div className="admin-stat-label">Annualised revenue (ARR)</div>
          <div className="admin-stat-sub">MRR × 12</div>
        </div>
      </div>

      {/* ── Geography ────────────────────────────────────────────────────── */}
      <div className="admin-section-title" style={{ marginTop: 32 }}>Properties by Country</div>
      <div className="admin-card">
        <div style={{ padding: '8px 20px 16px' }}>
          {geo.length === 0
            ? <div style={{ color: '#94a3b8', padding: '12px 0' }}>No geography data yet.</div>
            : geo.map(g => (
              <div key={g.country} className="admin-geo-row">
                <span className="admin-geo-country">{g.country}</span>
                <div className="admin-geo-bar-wrap">
                  <div className="admin-geo-bar" style={{ width: `${g.percentage}%` }} />
                </div>
                <span className="admin-geo-count">{g.count} ({g.percentage}%)</span>
              </div>
            ))
          }
        </div>
      </div>
    </>
  );
}
