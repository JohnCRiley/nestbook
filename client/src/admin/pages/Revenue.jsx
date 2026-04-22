import { useEffect, useRef, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const PLAN_MRR = { pro: 19, multi: 39 };

// ── UK tax year helpers ───────────────────────────────────────────────────────
function ukTaxYear(yearStart) {
  // Tax year starts April 6 of yearStart, ends April 5 of yearStart+1
  return {
    from: `${yearStart}-04-06`,
    to:   `${yearStart + 1}-04-05`,
  };
}

function currentUkTaxYearStart() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth() + 1;
  const d   = now.getDate();
  return (m > 4 || (m === 4 && d >= 6)) ? y : y - 1;
}

function toISODate(d) { return d.toISOString().slice(0, 10); }

function csvBlob(rows, headers) {
  const escape = v => (String(v ?? '').includes(',') || String(v ?? '').includes('"') || String(v ?? '').includes('\n'))
    ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))];
  return new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ── AccountantExports component ───────────────────────────────────────────────
function AccountantExports() {
  const [open,    setOpen]    = useState(false);
  const [preset,  setPreset]  = useState('this-tax-year');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [vatRate, setVatRate] = useState(() => {
    const saved = localStorage.getItem('acct_vat_rate');
    return saved != null ? saved : '20';
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Sync from/to when preset changes
  useEffect(() => {
    const now = new Date();
    const y   = now.getFullYear();
    const m   = now.getMonth();

    if (preset === 'this-month') {
      const start = new Date(y, m, 1);
      const end   = new Date(y, m + 1, 0);
      setFrom(toISODate(start)); setTo(toISODate(end));
    } else if (preset === 'last-month') {
      const start = new Date(y, m - 1, 1);
      const end   = new Date(y, m, 0);
      setFrom(toISODate(start)); setTo(toISODate(end));
    } else if (preset === 'this-quarter') {
      const qStart = Math.floor(m / 3) * 3;
      setFrom(toISODate(new Date(y, qStart, 1)));
      setTo(toISODate(new Date(y, qStart + 3, 0)));
    } else if (preset === 'last-quarter') {
      const qStart = Math.floor(m / 3) * 3 - 3;
      const qy     = qStart < 0 ? y - 1 : y;
      const qs     = ((qStart % 12) + 12) % 12;
      setFrom(toISODate(new Date(qy, qs, 1)));
      setTo(toISODate(new Date(qy, qs + 3, 0)));
    } else if (preset === 'this-tax-year') {
      const { from: f, to: t } = ukTaxYear(currentUkTaxYearStart());
      setFrom(f); setTo(t);
    } else if (preset === 'last-tax-year') {
      const { from: f, to: t } = ukTaxYear(currentUkTaxYearStart() - 1);
      setFrom(f); setTo(t);
    }
    // 'custom' — leave from/to as-is
  }, [preset]);

  const handleVatChange = (e) => {
    setVatRate(e.target.value);
    localStorage.setItem('acct_vat_rate', e.target.value);
  };

  const fetchData = async () => {
    if (!from || !to) { setError('Select a date range first.'); return null; }
    setLoading(true); setError(null);
    try {
      const r    = await apiFetch(`/api/admin/export?from=${from}&to=${to}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
      return data;
    } catch (e) {
      setError(e.message); return null;
    } finally {
      setLoading(false);
    }
  };

  // ── Export 1: Subscription Revenue Report ─────────────────────────────────
  const exportSubsCSV = async () => {
    const data = await fetchData(); if (!data) return;
    const vat  = parseFloat(vatRate) || 0;
    const rows = data.subscriptions.map(s => ({
      Date:      s.createdAt?.slice(0, 10) ?? '',
      Name:      s.name,
      Email:     s.email,
      Country:   s.country,
      Plan:      s.plan,
      'Gross (£)':  s.amount.toFixed(2),
      'VAT (£)':    (s.amount * vat / 100).toFixed(2),
      'Net (£)':    (s.amount * (1 - vat / 100)).toFixed(2),
      Status:    s.status,
      'Stripe ID':  s.stripeId ?? '',
    }));
    const total = data.subscriptions.reduce((sum, s) => sum + s.amount, 0);
    rows.push({
      Date: '', Name: 'TOTAL', Email: '', Country: '', Plan: '',
      'Gross (£)': total.toFixed(2),
      'VAT (£)':   (total * vat / 100).toFixed(2),
      'Net (£)':   (total * (1 - vat / 100)).toFixed(2),
      Status: '', 'Stripe ID': '',
    });
    downloadBlob(csvBlob(rows, Object.keys(rows[0])), `nestbook-subscriptions-${from}-${to}.csv`);
  };

  const exportSubsPDF = async () => {
    const data = await fetchData(); if (!data) return;
    const vat  = parseFloat(vatRate) || 0;
    const total = data.subscriptions.reduce((sum, s) => sum + s.amount, 0);
    const rows  = data.subscriptions.map(s => `
      <tr>
        <td>${s.createdAt?.slice(0, 10) ?? ''}</td>
        <td>${s.name}</td>
        <td>${s.email}</td>
        <td>${s.country}</td>
        <td style="text-transform:capitalize">${s.plan}</td>
        <td class="num">£${s.amount.toFixed(2)}</td>
        <td class="num">£${(s.amount * vat / 100).toFixed(2)}</td>
        <td class="num">£${(s.amount * (1 - vat / 100)).toFixed(2)}</td>
        <td>${s.status}</td>
      </tr>`).join('');
    openPrintWindow(`<!DOCTYPE html><html><head><title>Subscription Revenue Report</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 32px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #e2e8f0; }
      td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
      tr:last-child td { border-bottom: none; }
      .num { text-align: right; }
      .total td { font-weight: 700; background: #f8fafc; border-top: 2px solid #e2e8f0; }
      @media print { body { margin: 16px; } }
    </style></head><body>
    <h1>NestBook — Subscription Revenue Report</h1>
    <div class="sub">Period: ${from} to ${to} &nbsp;|&nbsp; VAT rate: ${vat}% &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString('en-GB')}</div>
    <table>
      <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Country</th><th>Plan</th><th class="num">Gross</th><th class="num">VAT</th><th class="num">Net</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total"><td colspan="5">TOTAL (${data.subscriptions.length} subscriptions)</td>
        <td class="num">£${total.toFixed(2)}</td>
        <td class="num">£${(total * vat / 100).toFixed(2)}</td>
        <td class="num">£${(total * (1 - vat / 100)).toFixed(2)}</td>
        <td></td></tr></tfoot>
    </table>
    </body></html>`);
  };

  // ── Export 2: Monthly Revenue Summary ─────────────────────────────────────
  const exportMonthlySummaryCSV = async () => {
    const data = await fetchData(); if (!data) return;
    const rows = data.monthlySummary.map(m => ({
      Month:          m.month,
      'New Pro':      m.newPro,
      'New Multi':    m.newMulti,
      Cancellations:  m.cancelled,
      'Active Pro':   m.activePro,
      'Active Multi': m.activeMulti,
      'MRR (£)':      m.mrr.toFixed(2),
      'Revenue (£)':  m.revenue.toFixed(2),
    }));
    downloadBlob(csvBlob(rows, Object.keys(rows[0])), `nestbook-monthly-summary-${from}-${to}.csv`);
  };

  const exportMonthlySummaryPDF = async () => {
    const data = await fetchData(); if (!data) return;
    const rows = data.monthlySummary.map(m => `
      <tr>
        <td>${m.month}</td>
        <td class="num">${m.newPro}</td>
        <td class="num">${m.newMulti}</td>
        <td class="num">${m.cancelled}</td>
        <td class="num">${m.activePro}</td>
        <td class="num">${m.activeMulti}</td>
        <td class="num">£${m.mrr.toFixed(2)}</td>
        <td class="num">£${m.revenue.toFixed(2)}</td>
      </tr>`).join('');
    openPrintWindow(`<!DOCTYPE html><html><head><title>Monthly Revenue Summary</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 32px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #e2e8f0; }
      td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
      .num { text-align: right; }
      @media print { body { margin: 16px; } }
    </style></head><body>
    <h1>NestBook — Monthly Revenue Summary</h1>
    <div class="sub">Period: ${from} to ${to} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString('en-GB')}</div>
    <table>
      <thead><tr>
        <th>Month</th><th class="num">New Pro</th><th class="num">New Multi</th>
        <th class="num">Cancellations</th><th class="num">Active Pro</th><th class="num">Active Multi</th>
        <th class="num">MRR</th><th class="num">Revenue</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`);
  };

  // ── Export 3: Annual Summary PDF ──────────────────────────────────────────
  const exportAnnualPDF = async () => {
    const data = await fetchData(); if (!data) return;
    const vat  = parseFloat(vatRate) || 0;
    const totalGross = data.subscriptions.reduce((sum, s) => sum + s.amount, 0);
    const totalVat   = totalGross * vat / 100;
    const totalNet   = totalGross - totalVat;
    const proCount   = data.subscriptions.filter(s => s.plan === 'pro').length;
    const multiCount = data.subscriptions.filter(s => s.plan === 'multi').length;
    const monthRows  = data.monthlySummary.map(m => `
      <tr>
        <td>${m.month}</td>
        <td class="num">${m.newPro + m.newMulti}</td>
        <td class="num">${m.cancelled}</td>
        <td class="num">£${m.revenue.toFixed(2)}</td>
        <td class="num">£${(m.revenue * vat / 100).toFixed(2)}</td>
        <td class="num">£${(m.revenue * (1 - vat / 100)).toFixed(2)}</td>
      </tr>`).join('');

    openPrintWindow(`<!DOCTYPE html><html><head><title>Annual Summary</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 48px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #1e293b; padding-bottom: 24px; }
      .company h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.5px; }
      .company p { margin: 2px 0; color: #475569; font-size: 11px; }
      .doc-title { text-align: right; }
      .doc-title h2 { font-size: 18px; margin: 0 0 4px; color: #0f172a; }
      .doc-title p { margin: 2px 0; color: #64748b; font-size: 11px; }
      .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
      .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; }
      .summary-box .val { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
      .summary-box .lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .07em; }
      h3 { font-size: 13px; margin: 24px 0 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #e2e8f0; }
      td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
      .num { text-align: right; }
      .total-row td { font-weight: 700; border-top: 2px solid #e2e8f0; background: #f8fafc; }
      .vat-summary { margin-top: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; }
      .vat-summary table { font-size: 12px; }
      footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
      @media print { body { margin: 24px; } }
    </style></head><body>
    <div class="header">
      <div class="company">
        <h1>NestBook Ltd</h1>
        <p>Subscription Software for Hospitality</p>
        <p>nestbook.app</p>
      </div>
      <div class="doc-title">
        <h2>Annual Revenue Summary</h2>
        <p>Period: ${from} to ${to}</p>
        <p>Generated: ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</p>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-box">
        <div class="val">£${totalGross.toFixed(2)}</div>
        <div class="lbl">Total Gross Revenue</div>
      </div>
      <div class="summary-box">
        <div class="val">£${totalVat.toFixed(2)}</div>
        <div class="lbl">VAT Collected (${vat}%)</div>
      </div>
      <div class="summary-box">
        <div class="val">£${totalNet.toFixed(2)}</div>
        <div class="lbl">Net Revenue</div>
      </div>
    </div>

    <h3>Subscription Breakdown</h3>
    <table>
      <thead><tr><th>Plan</th><th class="num">Count</th><th class="num">Rate/mo</th><th class="num">Total Gross</th></tr></thead>
      <tbody>
        <tr><td>Pro</td><td class="num">${proCount}</td><td class="num">£19.00</td><td class="num">£${(proCount * 19).toFixed(2)}</td></tr>
        <tr><td>Multi</td><td class="num">${multiCount}</td><td class="num">£39.00</td><td class="num">£${(multiCount * 39).toFixed(2)}</td></tr>
      </tbody>
      <tfoot><tr class="total-row"><td colspan="3">Total</td><td class="num">£${totalGross.toFixed(2)}</td></tr></tfoot>
    </table>

    <h3>Month-by-Month</h3>
    <table>
      <thead><tr>
        <th>Month</th><th class="num">New Subs</th><th class="num">Cancellations</th>
        <th class="num">Revenue</th><th class="num">VAT</th><th class="num">Net</th>
      </tr></thead>
      <tbody>${monthRows}</tbody>
    </table>

    <div class="vat-summary">
      <strong>VAT Summary</strong>
      <table style="margin-top:10px">
        <tr><td>VAT rate applied</td><td class="num">${vat}%</td></tr>
        <tr><td>Gross revenue</td><td class="num">£${totalGross.toFixed(2)}</td></tr>
        <tr><td>VAT element (${vat}% of gross)</td><td class="num">£${totalVat.toFixed(2)}</td></tr>
        <tr><td>Net revenue ex-VAT</td><td class="num">£${totalNet.toFixed(2)}</td></tr>
      </table>
    </div>

    <footer>NestBook Ltd &nbsp;·&nbsp; This document was generated automatically from subscription data &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-GB')}</footer>
    </body></html>`);
  };

  // ── Export 4: Customer List for VAT ───────────────────────────────────────
  const exportCustomerListCSV = async () => {
    const data = await fetchData(); if (!data) return;
    const rows = data.customerList.map(c => ({
      Name:                 c.name,
      Email:                c.email,
      Country:              c.country,
      Plan:                 c.plan,
      'Monthly Amount (£)': c.amount.toFixed(2),
      'Subscription Start': c.subStart?.slice(0, 10) ?? '',
    }));
    downloadBlob(csvBlob(rows, Object.keys(rows[0])), `nestbook-customers-vat-${new Date().toISOString().slice(0,10)}.csv`);
  };

  return (
    <div className="acct-accordion" style={{ marginTop: 40 }}>
      <button className="acct-accordion-toggle" onClick={() => setOpen(o => !o)}>
        <span>Accountant Exports</span>
        <span className={`acct-accordion-chevron${open ? ' open' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="acct-accordion-body">
          {/* Date range row */}
          <div className="acct-range-row">
            <div className="acct-range-group">
              <label>Period</label>
              <select value={preset} onChange={e => setPreset(e.target.value)} className="form-control acct-select">
                <option value="this-month">This month</option>
                <option value="last-month">Last month</option>
                <option value="this-quarter">This quarter</option>
                <option value="last-quarter">Last quarter</option>
                <option value="this-tax-year">This tax year (Apr 6 – Apr 5)</option>
                <option value="last-tax-year">Last tax year (Apr 6 – Apr 5)</option>
                <option value="custom">Custom range</option>
              </select>
            </div>
            <div className="acct-range-group">
              <label>From</label>
              <input type="date" className="form-control" value={from}
                onChange={e => { setPreset('custom'); setFrom(e.target.value); }} />
            </div>
            <div className="acct-range-group">
              <label>To</label>
              <input type="date" className="form-control" value={to}
                onChange={e => { setPreset('custom'); setTo(e.target.value); }} />
            </div>
            <div className="acct-range-group">
              <label>VAT Rate (%)</label>
              <input type="number" min="0" max="100" step="0.1" className="form-control"
                value={vatRate} onChange={handleVatChange} style={{ width: 80 }} />
            </div>
          </div>

          {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

          {/* Export cards */}
          <div className="acct-export-grid">
            <div className="acct-export-card">
              <div className="acct-export-title">Subscription Revenue Report</div>
              <div className="acct-export-desc">Per-subscription rows with gross, VAT, and net amounts. Includes a totals row.</div>
              <div className="acct-export-actions">
                <button className="btn-secondary" disabled={loading} onClick={exportSubsCSV}>CSV</button>
                <button className="btn-secondary" disabled={loading} onClick={exportSubsPDF}>PDF</button>
              </div>
            </div>

            <div className="acct-export-card">
              <div className="acct-export-title">Monthly Revenue Summary</div>
              <div className="acct-export-desc">Month-by-month new signups, cancellations, active subscribers, MRR, and revenue.</div>
              <div className="acct-export-actions">
                <button className="btn-secondary" disabled={loading} onClick={exportMonthlySummaryCSV}>CSV</button>
                <button className="btn-secondary" disabled={loading} onClick={exportMonthlySummaryPDF}>PDF</button>
              </div>
            </div>

            <div className="acct-export-card">
              <div className="acct-export-title">Annual Summary</div>
              <div className="acct-export-desc">Formal one-page PDF with NestBook Ltd header, plan breakdown, month table, and VAT summary.</div>
              <div className="acct-export-actions">
                <button className="btn-primary" disabled={loading} onClick={exportAnnualPDF}>PDF only</button>
              </div>
            </div>

            <div className="acct-export-card">
              <div className="acct-export-title">Customer List for VAT</div>
              <div className="acct-export-desc">All currently active paying customers with name, email, country, plan, amount, and start date.</div>
              <div className="acct-export-actions">
                <button className="btn-secondary" disabled={loading} onClick={exportCustomerListCSV}>CSV</button>
              </div>
            </div>
          </div>

          {loading && <div style={{ textAlign: 'center', color: '#64748b', padding: '12px 0' }}>Loading…</div>}
        </div>
      )}
    </div>
  );
}

// ── Main Revenue page ─────────────────────────────────────────────────────────
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

      {/* ── Accountant Exports ───────────────────────────────────────────── */}
      <AccountantExports />
    </>
  );
}
