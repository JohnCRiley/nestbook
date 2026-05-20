import { useEffect, useState } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

const GBP  = v => `£${Number(v).toFixed(2)}`;
const pct  = v => `${Number(v).toFixed(1)}%`;
const pad2 = n => String(n).padStart(2, '0');

const MONTH_LABELS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const VAT_THRESHOLD  = 90000;
const MILEAGE_RATE   = 0.45;          // HMRC 2024/25
const NI_THRESHOLD   = 12570;         // Primary Threshold / Personal Allowance 2024/25
const DIV_ALLOWANCE  = 500;           // Dividend allowance 2024/25
const DIV_TAX_RATE   = 0.0875;        // Basic rate dividend tax 2024/25
const CORP_TAX_RATE  = 0.19;

const CATEGORY_GROUPS = [
  {
    label: 'Operating Costs',
    options: [
      { value: 'hosting',         label: 'Hosting' },
      { value: 'email_svc',       label: 'Email service' },
      { value: 'dns',             label: 'DNS' },
      { value: 'biz_email',       label: 'Business email' },
      { value: 'domain',          label: 'Domain' },
      { value: 'accountant',      label: 'Accountant' },
      { value: 'marketing',       label: 'Marketing' },
      { value: 'software',        label: 'Software' },
      { value: 'companies_house', label: 'Companies House' },
      { value: 'other',           label: 'Other' },
    ],
  },
  {
    label: 'Travel & Expenses',
    options: [
      { value: 'travel_flights',       label: 'Flights' },
      { value: 'travel_train',         label: 'Train / public transport' },
      { value: 'travel_mileage',       label: 'Car mileage' },
      { value: 'travel_accommodation', label: 'Accommodation' },
      { value: 'travel_subsistence',   label: 'Subsistence (meals)' },
      { value: 'travel_expo',          label: 'Expo fees' },
      { value: 'travel_parking',       label: 'Parking' },
      { value: 'travel_other',         label: 'Other travel' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function currentTaxYear() {
  const d = new Date();
  const y = d.getFullYear();
  return (d.getMonth() + 1) >= 4 ? y : y - 1;
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_LABELS[parseInt(m, 10) - 1]} ${y}`;
}

function fmtDate(d) {
  return `${pad2(d.getDate())} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function daysUntil(d) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const ms = d - now;
  return Math.round(ms / 86400000);
}

function downloadCsv(rows, totals, taxYear) {
  const headers = ['Month','Revenue (£)','Expenses (£)','Stripe Fees (£)','Net Profit (£)','Corp Tax 19% (£)','Post-Tax (£)'];
  const dataRows = rows.map(r => [
    fmtMonth(r.month), r.revenue.toFixed(2), r.expenses.toFixed(2),
    r.stripeFees.toFixed(2), r.netProfit.toFixed(2), r.corpTax.toFixed(2),
    (r.netProfit - r.corpTax).toFixed(2),
  ]);
  const totalRow = [
    `TOTAL (${taxYear}/${taxYear + 1})`, totals.revenue.toFixed(2),
    totals.expenses.toFixed(2), totals.stripeFees.toFixed(2),
    totals.netProfit.toFixed(2), totals.corpTax.toFixed(2),
    (totals.netProfit - totals.corpTax).toFixed(2),
  ];
  const lines = [headers, ...dataRows, [], totalRow]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `nestbook-business-${taxYear}-${taxYear + 1}.csv`,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getTaxDeadlines() {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const pastApril6 = m > 4 || (m === 4 && d >= 6);
  const tys  = pastApril6 ? y : y - 1;   // tax year start (Apr 6)
  const tye  = tys + 1;                   // year in which Apr 5 end falls

  const items = [
    { date: new Date(tye,     3,  5), label: 'Tax year end',                          note: `${tys}/${String(tye).slice(2)} tax year closes` },
    { date: new Date(tye,     3,  6), label: 'New tax year begins',                   note: `${tye}/${String(tye + 1).slice(2)} starts` },
    { date: new Date(tye,     4, 31), label: 'P60 must be issued to employees',       note: `For tax year ${tys}/${String(tye).slice(2)}` },
    { date: new Date(tye + 1, 0,  5), label: 'Corporation Tax payment due',           note: `9 months + 1 day after 5 Apr ${tye} year end` },
    { date: new Date(tye + 1, 0, 31), label: 'Personal Self Assessment deadline',     note: `Online filing for ${tys}/${String(tye).slice(2)}` },
    { date: new Date(tye + 1, 3,  5), label: 'Tax year end',                          note: `${tye}/${String(tye + 1).slice(2)} tax year closes` },
    { date: new Date(tye + 1, 3,  6), label: 'New tax year begins',                   note: `${tye + 1}/${String(tye + 2).slice(2)} starts` },
    { date: new Date(tye + 1, 4, 31), label: 'P60 must be issued to employees',       note: `For tax year ${tye}/${String(tye + 1).slice(2)}` },
    { date: new Date(tye + 2, 0, 31), label: 'Personal Self Assessment deadline',     note: `Online filing for ${tye}/${String(tye + 1).slice(2)}` },
  ];

  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
  return items.filter(i => i.date >= cutoff).sort((a, b) => a.date - b.date).slice(0, 7);
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const card = { background: '#1e293b', borderRadius: 10, padding: '24px', border: '1px solid #334155', marginBottom: 28 };
const inputBase = { background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 5, padding: '5px 8px', fontSize: 12 };
const sectionTitle = { margin: '0 0 18px 0', fontSize: 15, fontWeight: 600, color: '#f1f5f9' };

function Row({ label, value, accent, bold, borderTop, indent }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: borderTop ? '10px 0 6px' : '5px 0',
      borderTop: borderTop ? '1px solid #334155' : 'none',
      marginTop: borderTop ? 6 : 0,
      paddingLeft: indent ? 16 : 0,
    }}>
      <span style={{ color: bold ? '#f1f5f9' : '#94a3b8', fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ color: accent || '#f1f5f9', fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 600 }}>{value}</span>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 10, padding: '18px 22px', border: `1px solid ${accent || '#334155'}`, flex: '1 1 160px', minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || '#f1f5f9' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── VAT monitor ───────────────────────────────────────────────────────────────

function VatMonitor({ vatRolling12 }) {
  const pctUsed   = Math.min(100, (vatRolling12 / VAT_THRESHOLD) * 100);
  const color     = pctUsed >= 100 ? '#ef4444' : pctUsed >= 80 ? '#f59e0b' : '#22c55e';
  const remaining = VAT_THRESHOLD - vatRolling12;
  return (
    <div style={{ ...card }}>
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
          {pctUsed >= 100 && ' — REGISTER FOR VAT NOW'}
          {pctUsed >= 80 && pctUsed < 100 && ' — approaching threshold'}
        </span>
        {remaining > 0 && <span style={{ color: '#64748b' }}>{GBP(remaining)} remaining</span>}
      </div>
    </div>
  );
}

// ── Category select ───────────────────────────────────────────────────────────

function CategorySelect({ value, onChange, style }) {
  return (
    <select value={value} onChange={onChange} style={style}>
      {CATEGORY_GROUPS.map(g => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

// ── Expense row ───────────────────────────────────────────────────────────────

function ExpenseRow({ row, index, onChange, onRemove }) {
  const isMileage = row.category === 'travel_mileage';
  function handleMilesChange(val) {
    const miles = val === '' ? '' : parseFloat(val) || 0;
    onChange(index, { ...row, miles: val, amount_gbp: miles === '' ? '' : +(miles * MILEAGE_RATE).toFixed(2) });
  }
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <CategorySelect
          value={row.category}
          onChange={ev => {
            const cat = ev.target.value;
            onChange(index, { ...row, category: cat, ...(cat === 'travel_mileage' ? { miles: '', amount_gbp: '' } : { miles: null }) });
          }}
          style={{ ...inputBase, width: 168, flexShrink: 0 }}
        />
        <input type="text" placeholder="Description" value={row.description}
          onChange={ev => onChange(index, { ...row, description: ev.target.value })}
          style={{ ...inputBase, flex: 1, minWidth: 80 }} />
        <input type="text" placeholder="Receipt ref" value={row.receipt_ref || ''}
          onChange={ev => onChange(index, { ...row, receipt_ref: ev.target.value })}
          style={{ ...inputBase, width: 120, flexShrink: 0 }}
          title="Receipt or reference number for audit trail" />
        {isMileage ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <input type="number" placeholder="Miles" value={row.miles ?? ''} min="0"
              onChange={ev => handleMilesChange(ev.target.value)}
              style={{ ...inputBase, width: 68, textAlign: 'right' }} />
            <span style={{ color: '#64748b', fontSize: 11 }}>mi</span>
            <span style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600, width: 70, textAlign: 'right' }}>
              {row.miles ? GBP(parseFloat(row.miles) * MILEAGE_RATE) : '£0.00'}
            </span>
          </div>
        ) : (
          <input type="number" placeholder="0.00" value={row.amount_gbp}
            onChange={ev => onChange(index, { ...row, amount_gbp: ev.target.value })}
            style={{ ...inputBase, width: 90, textAlign: 'right', flexShrink: 0 }} />
        )}
        <button onClick={() => onRemove(index)}
          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
      {isMileage && (
        <div style={{ marginTop: 3, marginLeft: 174, fontSize: 10, color: '#475569' }}>
          HMRC approved mileage rate 2024/25 · 45p per mile
        </div>
      )}
    </div>
  );
}

// ── Director Salary & PAYE section ────────────────────────────────────────────

function DirectorSalary({ annualSalary, onSalaryChange }) {
  const monthlySalary = annualSalary / 12;
  const isAtNIThreshold = Math.abs(annualSalary - NI_THRESHOLD) < 1;

  // Monthly payroll checklist — persisted per month in localStorage
  const [checkMonth, setCheckMonth] = useState(currentMonth());
  const checkKey = `nb_payroll_${checkMonth}`;
  const [checks, setChecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(checkKey)) || [false, false, false]; } catch { return [false, false, false]; }
  });

  // Reload checks when month changes
  useEffect(() => {
    try { setChecks(JSON.parse(localStorage.getItem(`nb_payroll_${checkMonth}`)) || [false, false, false]); } catch { setChecks([false, false, false]); }
  }, [checkMonth]);

  function toggleCheck(i) {
    const next = checks.map((v, idx) => idx === i ? !v : v);
    setChecks(next);
    localStorage.setItem(`nb_payroll_${checkMonth}`, JSON.stringify(next));
  }

  // Employer registration — persisted globally
  const [registered, setRegistered] = useState(() => localStorage.getItem('nb_employer_registered') === 'true');
  function toggleRegistered() {
    const next = !registered;
    setRegistered(next);
    localStorage.setItem('nb_employer_registered', String(next));
  }

  const payrollItems = [
    `Pay salary (${GBP(monthlySalary)}) to personal account`,
    'Submit RTI to HMRC (via HMRC Basic PAYE Tools — free)',
    'Record payroll in expenses',
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>

      {/* ── Left: Salary settings ── */}
      <div style={{ ...card, marginBottom: 0 }}>
        <h3 style={sectionTitle}>Director Salary</h3>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Annual salary (£)</label>
          <input
            type="number"
            value={annualSalary}
            onChange={ev => onSalaryChange(parseFloat(ev.target.value) || 0)}
            style={{ ...inputBase, width: '100%', fontSize: 18, padding: '8px 12px', fontWeight: 700 }}
          />
          {isAtNIThreshold && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>✓</span> Set at NI threshold — no National Insurance payable
            </div>
          )}
        </div>

        <div style={{ background: '#0f172a', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>Monthly salary</span>
            <span style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700 }}>{GBP(monthlySalary)}</span>
          </div>
          <div style={{ fontSize: 11, color: '#475569' }}>Annual ÷ 12 · auto-included in monthly P&amp;L</div>
        </div>

        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
          <div style={{ marginBottom: 6, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span>ℹ</span>
            <span>Salary at the NI threshold means no National Insurance is payable by you or the company.</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span>⚠</span>
            <span>Always consult an accountant before making salary or dividend decisions.</span>
          </div>
        </div>
      </div>

      {/* ── Right: PAYE obligations + monthly checklist ── */}
      <div style={{ ...card, marginBottom: 0 }}>
        <h3 style={sectionTitle}>PAYE Obligations</h3>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Even on a salary below the NI threshold, the company must:</div>
          {[
            'Register as an employer with HMRC',
            'Run payroll each month (even if no tax/NI is due)',
            'Submit RTI (Real Time Information) to HMRC each pay day',
            'File a P60 by 31 May each year',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5, fontSize: 12, color: '#94a3b8' }}>
              {i === 0 ? (
                <>
                  <input type="checkbox" id="nb_emp_reg" checked={registered} onChange={toggleRegistered}
                    style={{ accentColor: '#22c55e', cursor: 'pointer' }} />
                  <label htmlFor="nb_emp_reg" style={{ cursor: 'pointer', color: registered ? '#22c55e' : '#94a3b8' }}>
                    {item} {registered ? '✓' : ''}
                  </label>
                </>
              ) : (
                <><span style={{ color: '#475569' }}>•</span><span>{item}</span></>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #334155', paddingTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{fmtMonth(checkMonth)} Payroll</div>
            <input type="month" value={checkMonth} onChange={e => setCheckMonth(e.target.value)}
              style={{ ...inputBase, fontSize: 11, padding: '3px 8px' }} />
          </div>
          {payrollItems.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7, cursor: 'pointer' }}
              onClick={() => toggleCheck(i)}>
              <input type="checkbox" checked={checks[i]} onChange={() => toggleCheck(i)}
                style={{ accentColor: '#22c55e', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: checks[i] ? '#22c55e' : '#94a3b8', textDecoration: checks[i] ? 'line-through' : 'none' }}>{item}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 11, color: '#475569' }}>
            HMRC Basic PAYE Tools is free — download at gov.uk
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dividend calculator ───────────────────────────────────────────────────────

function DividendCalculator({ annualSalary }) {
  const [profit, setProfit] = useState('');

  const companyProfit  = parseFloat(profit) || 0;
  const taxable        = Math.max(0, companyProfit - DIV_ALLOWANCE);
  const divTax         = +(taxable * DIV_TAX_RATE).toFixed(2);
  const netDividend    = +(companyProfit - divTax).toFixed(2);
  const totalIncome    = annualSalary + netDividend;

  return (
    <div style={{ ...card }}>
      <h3 style={sectionTitle}>Dividend Planning</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* Left: input + breakdown */}
        <div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>
              Company profit available for dividends (£)
            </label>
            <input type="number" placeholder="0.00" value={profit} min="0"
              onChange={ev => setProfit(ev.target.value)}
              style={{ ...inputBase, width: '100%', fontSize: 15, padding: '7px 10px', fontWeight: 600 }} />
            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>Enter post-corporation-tax profit</div>
          </div>

          <div style={{ background: '#0f172a', borderRadius: 8, padding: '12px 14px', fontFamily: 'monospace' }}>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, letterSpacing: 1 }}>DIVIDEND BREAKDOWN</div>
            <Row label="Company profit after Corp Tax" value={GBP(companyProfit)} accent="#f1f5f9" />
            <Row label="Less dividend allowance" value={`−${GBP(DIV_ALLOWANCE)}`} accent="#94a3b8" indent />
            <Row label="Taxable dividends" value={GBP(taxable)} borderTop bold />
            <Row label="Dividend tax (8.75%)" value={`−${GBP(divTax)}`} accent="#f59e0b" indent />
            <Row label="Net dividend in pocket" value={GBP(netDividend)} accent="#22c55e" bold borderTop />
          </div>
        </div>

        {/* Right: combined income */}
        <div>
          <div style={{ background: '#0f172a', borderRadius: 8, padding: '12px 14px', fontFamily: 'monospace', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, letterSpacing: 1 }}>COMBINED PERSONAL INCOME</div>
            <Row label="Director salary" value={GBP(annualSalary)} accent="#f1f5f9" />
            <Row label="Dividend (net)" value={GBP(netDividend)} accent="#f1f5f9" />
            <Row label="Total personal income" value={GBP(totalIncome)} accent="#22c55e" bold borderTop />
          </div>

          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#f59e0b' }}>⚠</span> {`Dividend allowance is £${DIV_ALLOWANCE.toLocaleString()} for 2024/25.`}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#64748b' }}>•</span> Dividend tax rate shown is basic rate (8.75%). Higher-rate taxpayers pay 33.75%.
            </div>
            <div>
              <span style={{ color: '#64748b' }}>•</span> Always consult an accountant before paying dividends.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Monthly P&L editor ────────────────────────────────────────────────────────

function MonthlyPL({ monthlySalary }) {
  const [month,    setMonth]    = useState(currentMonth());
  const [data,     setData]     = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    setData(null); setError(null);
    apiFetch(`/api/admin/business/month?month=${month}`)
      .then(r => r.json())
      .then(d => { setData(d); setExpenses(d.expenses.map(e => ({ ...e }))); })
      .catch(() => setError('Failed to load.'));
  }, [month]);

  function addRow() {
    setExpenses(prev => [...prev, { category: 'other', description: '', amount_gbp: '', receipt_ref: '', miles: null }]);
  }
  function removeRow(i) { setExpenses(prev => prev.filter((_, idx) => idx !== i)); }
  function updateRow(i, updated) { setExpenses(prev => prev.map((row, idx) => idx === i ? updated : row)); }

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null);
    try {
      const clean = expenses.map(e => ({
        category:    e.category,
        description: e.description,
        amount_gbp:  parseFloat(e.amount_gbp) || 0,
        receipt_ref: e.receipt_ref || null,
        miles:       e.miles != null && e.miles !== '' ? parseFloat(e.miles) || null : null,
      })).filter(e => e.amount_gbp > 0 || e.description);
      const r = await apiFetch('/api/admin/business/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, expenses: clean }),
      });
      if (!r.ok) throw new Error();
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch { setError('Save failed.'); } finally { setSaving(false); }
  }

  const manualExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount_gbp) || 0), 0);
  const revenue        = data?.revenue    || 0;
  const stripeFees     = data?.stripeFees || 0;
  const salary         = monthlySalary    || 0;
  const totalExpenses  = manualExpenses + salary;
  const netProfit      = revenue - stripeFees - totalExpenses;
  const corpTax        = Math.max(0, netProfit * CORP_TAX_RATE);
  const postTax        = netProfit - corpTax;

  return (
    <div style={{ ...card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 0 }}>Monthly P&amp;L</h3>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          style={{ ...inputBase, fontSize: 13, padding: '6px 10px' }} />
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {/* Revenue + automatic deductions */}
      <div style={{ background: '#0f172a', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
        <Row label="Subscription Revenue (est.)" value={GBP(revenue)} accent="#22c55e" bold />
        <Row label={`Stripe Fees (1.5% + £0.20×${data?.subscriberCount ?? '…'} txns)`} value={`−${GBP(stripeFees)}`} accent="#ef4444" indent />
        {salary > 0 && (
          <Row label="Director Salary (monthly)" value={`−${GBP(salary)}`} accent="#f59e0b" indent />
        )}
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, paddingRight: 24 }}>
        <div style={{ width: 168, flexShrink: 0, fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Category</div>
        <div style={{ flex: 1, minWidth: 80, fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Description</div>
        <div style={{ width: 120, flexShrink: 0, fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Receipt ref</div>
        <div style={{ width: 152, flexShrink: 0, fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>Amount</div>
      </div>

      {/* Expense rows */}
      <div style={{ marginBottom: 8 }}>
        {expenses.map((e, i) => (
          <ExpenseRow key={i} row={e} index={i} onChange={updateRow} onRemove={removeRow} />
        ))}
        <button onClick={addRow}
          style={{ background: 'none', border: '1px dashed #334155', color: '#64748b', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', width: '100%', marginTop: 4 }}>
          + Add expense
        </button>
      </div>

      {/* P&L summary */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: 14, marginTop: 8 }}>
        <Row label="Operating expenses" value={`−${GBP(manualExpenses)}`} accent="#ef4444" />
        <Row label="Total deductions" value={`−${GBP(stripeFees + totalExpenses)}`} accent="#ef4444" />
        <Row label="Net Profit (pre-tax)" value={GBP(netProfit)} accent={netProfit >= 0 ? '#22c55e' : '#ef4444'} bold borderTop />
        <Row label="Corp Tax est. (19%)" value={`−${GBP(corpTax)}`} accent="#f59e0b" indent />
        <Row label="Post-Tax Profit" value={GBP(postTax)} accent={postTax >= 0 ? '#22c55e' : '#ef4444'} bold borderTop />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 10, alignItems: 'center' }}>
        {saved && <span style={{ color: '#22c55e', fontSize: 13 }}>Saved</span>}
        <button onClick={handleSave} disabled={saving}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Expenses'}
        </button>
      </div>
    </div>
  );
}

// ── Tax Calendar ──────────────────────────────────────────────────────────────

function TaxCalendar() {
  const deadlines = getTaxDeadlines();
  const now = new Date(); now.setHours(0, 0, 0, 0);

  return (
    <div style={{ ...card }}>
      <h3 style={sectionTitle}>Tax Calendar — NestBook Ltd</h3>
      <div style={{ fontSize: 11, color: '#475569', marginBottom: 16 }}>Key HMRC deadlines · dates auto-update based on current date</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {deadlines.map((dl, i) => {
          const days    = daysUntil(dl.date);
          const isPast  = days < 0;
          const isClose = days >= 0 && days <= 30;
          const accent  = isPast ? '#475569' : isClose ? '#f59e0b' : '#60a5fa';

          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px',
              borderRadius: 7, background: isClose && !isPast ? '#1a1200' : '#0f172a',
              border: `1px solid ${isClose && !isPast ? '#78350f' : '#1e293b'}`,
            }}>
              <div style={{ flexShrink: 0, width: 120 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: accent, fontFamily: 'monospace' }}>{fmtDate(dl.date)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: isPast ? '#475569' : '#f1f5f9' }}>{dl.label}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>{dl.note}</div>
              </div>
              <div style={{ flexShrink: 0, fontSize: 11, color: accent, textAlign: 'right', minWidth: 70 }}>
                {isPast ? 'passed' : days === 0 ? 'today' : `${days}d away`}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, padding: '10px 14px', background: '#0f172a', borderRadius: 7, border: '1px solid #1e293b', fontSize: 12, color: '#64748b' }}>
        Corp Tax payment: 9 months + 1 day after company year-end · dates assume 5 April year-end
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
    setLoading(true); setError(null);
    apiFetch(`/api/admin/business/annual?taxYear=${taxYear}`)
      .then(r => r.json()).then(d => setData(d))
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, [taxYear]);

  const yearOpts = [];
  for (let y = 2024; y <= currentTaxYear() + 1; y++) yearOpts.push(y);

  const th  = { padding: '8px 10px', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right', whiteSpace: 'nowrap' };
  const td  = { padding: '8px 10px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid #1e293b' };
  const tdL = { ...td, textAlign: 'left', color: '#94a3b8' };

  return (
    <div style={{ ...card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 0 }}>Annual Summary (UK Tax Year)</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={taxYear} onChange={e => setTaxYear(Number(e.target.value))}
            style={{ ...inputBase, fontSize: 13, padding: '6px 10px' }}>
            {yearOpts.map(y => <option key={y} value={y}>{y}/{y + 1}</option>)}
          </select>
          {data && (
            <button onClick={() => downloadCsv(data.rows, data.totals, data.taxYear)}
              style={{ background: '#1e3a5f', border: '1px solid #3b82f6', color: '#60a5fa', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              Export CSV
            </button>
          )}
        </div>
      </div>

      {error   && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
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
                <td style={{ ...td, color: '#22c55e',  fontWeight: 700 }}>{GBP(data.totals.revenue)}</td>
                <td style={{ ...td, color: '#ef4444',  fontWeight: 700 }}>−{GBP(data.totals.expenses)}</td>
                <td style={{ ...td, color: '#ef4444',  fontWeight: 700 }}>−{GBP(data.totals.stripeFees)}</td>
                <td style={{ ...td, color: data.totals.netProfit >= 0 ? '#f1f5f9' : '#ef4444', fontWeight: 700 }}>{GBP(data.totals.netProfit)}</td>
                <td style={{ ...td, color: '#f59e0b',  fontWeight: 700 }}>−{GBP(data.totals.corpTax)}</td>
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
  const [stats,        setStats]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [annualSalary, setAnnualSalary] = useState(() => {
    const saved = parseFloat(localStorage.getItem('nb_annual_salary'));
    return isNaN(saved) ? NI_THRESHOLD : saved;
  });

  function handleSalaryChange(val) {
    setAnnualSalary(val);
    localStorage.setItem('nb_annual_salary', String(val));
  }

  useEffect(() => {
    apiFetch('/api/admin/business/stats')
      .then(r => r.json()).then(d => setStats(d))
      .catch(() => setError('Failed to load stats.'))
      .finally(() => setLoading(false));
  }, []);

  const monthlySalary = +(annualSalary / 12).toFixed(2);

  return (
    <div style={{ padding: '28px 24px', maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>NestBook Business</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 28, marginTop: 0 }}>
        Financial overview of NestBook Ltd — separate from property owners' finances.
      </p>

      {error   && <div style={{ color: '#ef4444', marginBottom: 20 }}>{error}</div>}
      {loading && <div style={{ color: '#64748b', marginBottom: 20 }}>Loading…</div>}

      {stats && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
            <StatCard label="Monthly Recurring Revenue" value={GBP(stats.mrr)} sub="Current MRR" accent="#22c55e" />
            <StatCard label="Annual Run Rate" value={GBP(stats.arr)} sub="MRR × 12" />
            <StatCard label="Paid Subscribers" value={stats.proCount + stats.multiCount} sub={`Pro: ${stats.proCount} · Multi: ${stats.multiCount}`} />
            <StatCard label="Free Users" value={stats.freeCount} sub={`${stats.totalUsers} total`} />
            <StatCard label="Conversion Rate" value={pct(stats.conversionPct)} sub="Free → paid" />
            {stats.atRisk > 0 && <StatCard label="Cancelling" value={stats.atRisk} sub="end of period" accent="#ef4444" />}
          </div>
          <VatMonitor vatRolling12={stats.vatRolling12} />
        </>
      )}

      <DirectorSalary annualSalary={annualSalary} onSalaryChange={handleSalaryChange} />
      <MonthlyPL monthlySalary={monthlySalary} />
      <DividendCalculator annualSalary={annualSalary} />
      <AnnualSummary />
      <TaxCalendar />
    </div>
  );
}
