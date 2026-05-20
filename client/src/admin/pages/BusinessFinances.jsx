import { useEffect, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const GBP = v => `£${Number(v).toFixed(2)}`;
const pct = v => `${Number(v).toFixed(1)}%`;

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const EXPENSE_CATEGORIES = [
  'hosting','email_svc','dns','biz_email','domain','accountant',
  'marketing','software','companies_house','other',
];
const VAT_THRESHOLD = 90000;

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentTaxYear() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 4 ? y : y - 1;
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_LABELS[parseInt(m, 10) - 1]} ${y}`;
}

function downloadCsv(rows, totals, taxYear) {
  const headers = ['Month', 'Revenue (£)', 'Expenses (£)', 'Stripe Fees (£)', 'Net Profit (£)', 'Corp Tax 19% (£)', 'Post-Tax (£)'];
  const dataRows = rows.map(r => [
    fmtMonth(r.month),
    r.revenue.toFixed(2),
    r.expenses.toFixed(2),
    r.stripeFees.toFixed(2),
    r.netProfit.toFixed(2),
    r.corpTax.toFixed(2),
    (r.netProfit - r.corpTax).toFixed(2),
  ]);
  const totalRow = [
    `TOTAL (${taxYear}/${taxYear + 1})`,
    totals.revenue.toFixed(2),
    totals.expenses.toFixed(2),
    totals.stripeFees.toFixed(2),
    totals.netProfit.toFixed(2),
    totals.corpTax.toFixed(2),
    (totals.netProfit - totals.corpTax).toFixed(2),
  ];
  const lines = [headers, ...dataRows, [], totalRow]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `nestbook-business-${taxYear}-${taxYear + 1}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: '#1e293b', borderRadius: 10, padding: '18px 22px',
      border: `1px solid ${accent || '#334155'}`, flex: '1 1 160px', minWidth: 140,
    }}>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || '#f1f5f9' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── VAT progress bar ──────────────────────────────────────────────────────────
function VatMonitor({ vatRolling12 }) {
  const pctUsed = Math.min(100, (vatRolling12 / VAT_THRESHOLD) * 100);
  const color   = pctUsed >= 100 ? '#ef4444' : pctUsed >= 80 ? '#f59e0b' : '#22c55e';
  const remaining = VAT_THRESHOLD - vatRolling12;

  return (
    <div style={{
      background: '#1e293b', borderRadius: 10, padding: '20px 24px',
      border: '1px solid #334155', marginBottom: 28,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>VAT Threshold Monitor</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>UK threshold: {GBP(VAT_THRESHOLD)} rolling 12 months</span>
      </div>
      <div style={{ background: '#0f172a', borderRadius: 6, height: 14, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${pctUsed}%`, height: '100%', background: color, transition: 'width 0.4s', borderRadius: 6 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color }}>
          {GBP(vatRolling12)} used ({pct(pctUsed)})
          {pctUsed >= 100 && ' — REGISTER FOR VAT'}
          {pctUsed >= 80 && pctUsed < 100 && ' — approaching threshold'}
        </span>
        {remaining > 0 && (
          <span style={{ color: '#64748b' }}>{GBP(remaining)} remaining</span>
        )}
      </div>
    </div>
  );
}

// ── Monthly P&L editor ────────────────────────────────────────────────────────
function MonthlyPL() {
  const [month,    setMonth]    = useState(currentMonth());
  const [data,     setData]     = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    apiFetch(`/api/admin/business/month?month=${month}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setExpenses(d.expenses.map(e => ({ ...e })));
      })
      .catch(() => setError('Failed to load.'));
  }, [month]);

  function addRow() {
    setExpenses(prev => [...prev, { category: 'other', description: '', amount_gbp: '' }]);
  }

  function removeRow(i) {
    setExpenses(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateRow(i, field, val) {
    setExpenses(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const clean = expenses.map(e => ({
        category:    e.category,
        description: e.description,
        amount_gbp:  parseFloat(e.amount_gbp) || 0,
      })).filter(e => e.amount_gbp > 0 || e.description);
      const r = await apiFetch('/api/admin/business/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, expenses: clean }),
      });
      if (!r.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount_gbp) || 0), 0);
  const revenue       = data?.revenue || 0;
  const stripeFees    = data?.stripeFees || 0;
  const netProfit     = revenue - totalExpenses - stripeFees;
  const corpTax       = Math.max(0, netProfit * 0.19);
  const postTax       = netProfit - corpTax;

  return (
    <div style={{
      background: '#1e293b', borderRadius: 10, padding: '24px',
      border: '1px solid #334155', marginBottom: 28,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>Monthly P&amp;L</h3>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{
            background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9',
            borderRadius: 6, padding: '6px 10px', fontSize: 13,
          }}
        />
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {/* Revenue + Stripe fees */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          <tr style={{ borderBottom: '1px solid #1e3a5f' }}>
            <td style={{ padding: '8px 4px', color: '#94a3b8', fontSize: 13 }}>Subscription Revenue (est.)</td>
            <td style={{ padding: '8px 4px', textAlign: 'right', color: '#22c55e', fontWeight: 600, fontSize: 13 }}>{GBP(revenue)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #334155' }}>
            <td style={{ padding: '8px 4px', color: '#94a3b8', fontSize: 13 }}>
              Stripe Fees (1.5% + £0.20×{data?.subscriberCount ?? '…'} txns)
            </td>
            <td style={{ padding: '8px 4px', textAlign: 'right', color: '#ef4444', fontSize: 13 }}>−{GBP(stripeFees)}</td>
          </tr>
        </tbody>
      </table>

      {/* Expenses */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Operating Expenses</div>
        {expenses.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <select
              value={e.category}
              onChange={ev => updateRow(i, 'category', ev.target.value)}
              style={{
                background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9',
                borderRadius: 5, padding: '5px 8px', fontSize: 12, width: 140, flexShrink: 0,
              }}
            >
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Description"
              value={e.description}
              onChange={ev => updateRow(i, 'description', ev.target.value)}
              style={{
                flex: 1, background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9',
                borderRadius: 5, padding: '5px 8px', fontSize: 12,
              }}
            />
            <input
              type="number"
              placeholder="0.00"
              value={e.amount_gbp}
              onChange={ev => updateRow(i, 'amount_gbp', ev.target.value)}
              style={{
                width: 90, background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9',
                borderRadius: 5, padding: '5px 8px', fontSize: 12, textAlign: 'right',
              }}
            />
            <button
              onClick={() => removeRow(i)}
              style={{
                background: 'none', border: 'none', color: '#ef4444',
                cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1,
              }}
            >×</button>
          </div>
        ))}
        <button
          onClick={addRow}
          style={{
            background: 'none', border: '1px dashed #334155', color: '#64748b',
            borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            width: '100%', marginTop: 4,
          }}
        >+ Add expense</button>
      </div>

      {/* P&L summary */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: 14, marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Total expenses</span>
          <span style={{ color: '#ef4444', fontSize: 13 }}>−{GBP(totalExpenses)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 600 }}>Net Profit (pre-tax)</span>
          <span style={{ color: netProfit >= 0 ? '#22c55e' : '#ef4444', fontSize: 14, fontWeight: 700 }}>{GBP(netProfit)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Corp Tax est. (19%)</span>
          <span style={{ color: '#f59e0b', fontSize: 13 }}>−{GBP(corpTax)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #334155', paddingTop: 10, marginTop: 4 }}>
          <span style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 700 }}>Post-Tax Profit</span>
          <span style={{ color: postTax >= 0 ? '#22c55e' : '#ef4444', fontSize: 15, fontWeight: 700 }}>{GBP(postTax)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 10, alignItems: 'center' }}>
        {saved && <span style={{ color: '#22c55e', fontSize: 13 }}>Saved</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6,
            padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >{saving ? 'Saving…' : 'Save Expenses'}</button>
      </div>
    </div>
  );
}

// ── Annual Summary ────────────────────────────────────────────────────────────
function AnnualSummary() {
  const [taxYear, setTaxYear] = useState(currentTaxYear());
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/admin/business/annual?taxYear=${taxYear}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, [taxYear]);

  const yearOpts = [];
  for (let y = 2024; y <= currentTaxYear() + 1; y++) yearOpts.push(y);

  const th = { padding: '8px 10px', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid #1e293b' };
  const tdL = { ...td, textAlign: 'left', color: '#94a3b8' };

  return (
    <div style={{
      background: '#1e293b', borderRadius: 10, padding: '24px',
      border: '1px solid #334155',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>Annual Summary (UK Tax Year)</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={taxYear}
            onChange={e => setTaxYear(Number(e.target.value))}
            style={{
              background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9',
              borderRadius: 6, padding: '6px 10px', fontSize: 13,
            }}
          >
            {yearOpts.map(y => (
              <option key={y} value={y}>{y}/{y + 1}</option>
            ))}
          </select>
          {data && (
            <button
              onClick={() => downloadCsv(data.rows, data.totals, data.taxYear)}
              style={{
                background: '#1e3a5f', border: '1px solid #3b82f6', color: '#60a5fa',
                borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
              }}
            >Export CSV</button>
          )}
        </div>
      </div>

      {error  && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
      {loading && <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>}

      {data && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                <th style={{ ...th, textAlign: 'left' }}>Month</th>
                <th style={th}>Revenue</th>
                <th style={th}>Expenses</th>
                <th style={th}>Stripe Fees</th>
                <th style={th}>Net Profit</th>
                <th style={th}>Corp Tax</th>
                <th style={th}>Post-Tax</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => {
                const postTax = r.netProfit - r.corpTax;
                return (
                  <tr key={r.month} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={tdL}>{fmtMonth(r.month)}</td>
                    <td style={{ ...td, color: '#22c55e' }}>{GBP(r.revenue)}</td>
                    <td style={{ ...td, color: r.expenses > 0 ? '#ef4444' : '#475569' }}>{r.expenses > 0 ? `−${GBP(r.expenses)}` : '—'}</td>
                    <td style={{ ...td, color: '#ef4444' }}>−{GBP(r.stripeFees)}</td>
                    <td style={{ ...td, color: r.netProfit >= 0 ? '#f1f5f9' : '#ef4444', fontWeight: 600 }}>{GBP(r.netProfit)}</td>
                    <td style={{ ...td, color: r.corpTax > 0 ? '#f59e0b' : '#475569' }}>{r.corpTax > 0 ? `−${GBP(r.corpTax)}` : '—'}</td>
                    <td style={{ ...td, color: postTax >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{GBP(postTax)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #334155', background: '#0f172a' }}>
                <td style={{ ...tdL, fontWeight: 700, color: '#f1f5f9' }}>Total</td>
                <td style={{ ...td, color: '#22c55e', fontWeight: 700 }}>{GBP(data.totals.revenue)}</td>
                <td style={{ ...td, color: '#ef4444', fontWeight: 700 }}>−{GBP(data.totals.expenses)}</td>
                <td style={{ ...td, color: '#ef4444', fontWeight: 700 }}>−{GBP(data.totals.stripeFees)}</td>
                <td style={{ ...td, color: data.totals.netProfit >= 0 ? '#f1f5f9' : '#ef4444', fontWeight: 700 }}>{GBP(data.totals.netProfit)}</td>
                <td style={{ ...td, color: '#f59e0b', fontWeight: 700 }}>−{GBP(data.totals.corpTax)}</td>
                <td style={{ ...td, color: (data.totals.netProfit - data.totals.corpTax) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{GBP(data.totals.netProfit - data.totals.corpTax)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BusinessFinances() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    apiFetch('/api/admin/business/stats')
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => setError('Failed to load stats.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: '28px 24px', maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>NestBook Business</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 28, marginTop: 0 }}>
        Financial overview of NestBook Ltd — separate from property owners' finances.
      </p>

      {error  && <div style={{ color: '#ef4444', marginBottom: 20 }}>{error}</div>}
      {loading && <div style={{ color: '#64748b', marginBottom: 20 }}>Loading…</div>}

      {stats && (
        <>
          {/* Revenue stats */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
            <StatCard label="Monthly Recurring Revenue" value={GBP(stats.mrr)} sub="Current MRR" accent="#22c55e" />
            <StatCard label="Annual Run Rate" value={GBP(stats.arr)} sub="MRR × 12" />
            <StatCard label="Paid Subscribers" value={stats.proCount + stats.multiCount} sub={`Pro: ${stats.proCount} · Multi: ${stats.multiCount}`} />
            <StatCard label="Free Users" value={stats.freeCount} sub={`${stats.totalUsers} total`} />
            <StatCard label="Conversion Rate" value={pct(stats.conversionPct)} sub="Free → paid" />
            {stats.atRisk > 0 && (
              <StatCard label="Cancelling" value={stats.atRisk} sub="end of period" accent="#ef4444" />
            )}
          </div>

          {/* VAT monitor */}
          <VatMonitor vatRolling12={stats.vatRolling12} />
        </>
      )}

      {/* Monthly P&L (always visible) */}
      <MonthlyPL />

      {/* Annual summary */}
      <AnnualSummary />
    </div>
  );
}
