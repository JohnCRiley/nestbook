import { useState, useMemo, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PlanGate from '../components/PlanGate.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────

function toIso(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function getPresetRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'this_month':  return { from: toIso(new Date(y, m, 1)),     to: toIso(new Date(y, m + 1, 1)) };
    case 'last_month':  return { from: toIso(new Date(y, m - 1, 1)), to: toIso(new Date(y, m, 1)) };
    case 'this_quarter': {
      const q = Math.floor(m / 3);
      return { from: toIso(new Date(y, q * 3, 1)), to: toIso(new Date(y, q * 3 + 3, 1)) };
    }
    case 'this_year':   return { from: toIso(new Date(y, 0, 1)),     to: toIso(new Date(y + 1, 0, 1)) };
    default:            return null;
  }
}

const ALL_FIELDS = [
  'ref', 'guestName', 'guestEmail', 'room', 'checkIn', 'checkOut',
  'duration', 'rate', 'total', 'taxRate', 'taxAmount', 'net', 'source',
];

const EXPENSE_CATS = [
  'consumables', 'utilities', 'maintenance', 'marketing',
  'insurance', 'professional', 'staff', 'other',
];

const PM_KEY_MAP = {
  cash:          'pmCash',
  card:          'pmCard',
  bank_transfer: 'pmBankTransfer',
  other:         'pmOther',
  _none:         'reportPMNotRecorded',
};

const emptyExpenses = () =>
  Object.fromEntries(EXPENSE_CATS.map(k => [k, { amount: '', desc: '' }]));

const emptyAdj = () => [{ note: '', amount: '' }];

// ── Page shell ────────────────────────────────────────────────────────────────

export default function Reports() {
  const t = useT();
  return (
    <>
      <div className="page-header">
        <h1>{t('reportsTitle')}</h1>
        <div className="page-date">{t('reportsSubtitle')}</div>
      </div>
      <PlanGate requiredPlan="pro" title="Revenue reports & income summaries" detail="Monthly income summaries, occupancy rates and a P&L your accountant can use directly. Export to CSV.">
        <ReportsContent />
      </PlanGate>
    </>
  );
}

// ── Content (Pro/Multi only) ──────────────────────────────────────────────────

function ReportsContent() {
  const t = useT();
  const plan = usePlan();
  const { user } = useAuth();
  const { property, properties } = useLocale();
  const currency = property?.currency ?? 'EUR';
  const isWP     = property?.rental_type === 'whole_property';

  // ── Revenue report state ───────────────────────────────────────────────────
  const [preset,     setPreset]     = useState('this_month');
  const [from,       setFrom]       = useState(() => getPresetRange('this_month').from);
  const [to,         setTo]         = useState(() => getPresetRange('this_month').to);
  const [propFilter, setPropFilter] = useState('all');
  const [status,     setStatus]     = useState('all');
  const [fields,     setFields]     = useState(() => new Set(ALL_FIELDS));
  const [taxRate,    setTaxRate]    = useState('');
  const [loading,    setLoading]    = useState(false);
  const [results,    setResults]    = useState(null);
  const [rooms,      setRooms]      = useState([]);

  // ── Payment methods state (from revenue response) ──────────────────────────
  const [paymentMethods, setPaymentMethods] = useState(null);

  // ── Room charges report state ──────────────────────────────────────────────
  const [chargesResults,  setChargesResults]  = useState(null);
  const [chargesLoading,  setChargesLoading]  = useState(false);

  // ── Business expenses state ────────────────────────────────────────────────
  const [expenses,    setExpenses]    = useState(emptyExpenses);
  const [adjustments, setAdjustments] = useState(emptyAdj);
  const [expOpen,     setExpOpen]     = useState(false);
  const [expSaving, setExpSaving] = useState(false);
  const [expSaved,  setExpSaved]  = useState(false);

  // ── Guest list state ───────────────────────────────────────────────────────
  const [gFrom,         setGFrom]         = useState(() => getPresetRange('this_month').from);
  const [gTo,           setGTo]           = useState(() => getPresetRange('this_month').to);
  const [guestLoading,  setGuestLoading]  = useState(false);
  const [guestResults,  setGuestResults]  = useState(null);
  const [copiedToast,   setCopiedToast]   = useState(false);

  // Load rooms for occupancy calculation
  useEffect(() => {
    if (!property?.id) return;
    apiFetch(`/api/rooms?property_id=${property.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(r => setRooms(Array.isArray(r) ? r : []))
      .catch(() => {});
  }, [property?.id]);

  // Single property ID — expenses only supported for one property at a time
  const singlePropId = useMemo(() => {
    if (propFilter !== 'all') return Number(propFilter);
    if (property?.id) return property.id;
    return null;
  }, [propFilter, property?.id]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatMonthKey(key) {
    if (!key) return '—';
    const [y, m] = key.split('-').map(Number);
    try {
      return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
    } catch {
      return key;
    }
  }

  function fmtMoney(n) {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n || 0);
    } catch {
      return `${(n || 0).toFixed(2)} ${currency}`;
    }
  }

  function handlePreset(p) {
    setPreset(p);
    if (p !== 'custom') {
      const range = getPresetRange(p);
      setFrom(range.from);
      setTo(range.to);
    }
  }

  function toggleField(f) {
    setFields(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }

  function fieldLabel(f) {
    return t(`reportField_${f}`);
  }

  // ── Revenue report ─────────────────────────────────────────────────────────

  async function generate() {
    setLoading(true);
    setResults(null);
    setPaymentMethods(null);
    setExpenses(emptyExpenses());
    setAdjustments(emptyAdj());
    try {
      const params = new URLSearchParams({ from, to, status });
      if (propFilter !== 'all') params.set('propertyId', propFilter);
      const r = await apiFetch(`/api/reports/revenue?${params}`);
      const data = await r.json();
      if (r.ok) {
        // Revenue endpoint now returns { rows, paymentMethods }
        setResults(Array.isArray(data) ? data : (data.rows ?? []));
        setPaymentMethods(Array.isArray(data) ? [] : (data.paymentMethods ?? []));
        // Auto-load saved expenses for this period
        if (singlePropId) fetchExpenses(singlePropId, from, to);
      }
    } catch { /* network error */ }
    setLoading(false);
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  async function fetchExpenses(pid, f, t_) {
    try {
      const r = await apiFetch(`/api/reports/expenses?propertyId=${pid}&from=${f}&to=${t_}`);
      if (!r.ok) return;
      const rows = await r.json();
      const next = emptyExpenses();
      const adjRows = [];
      for (const row of rows) {
        if (row.category === '_adj') {
          adjRows.push({
            note:   row.description ?? '',
            amount: row.amount < 0 ? String(-row.amount) : String(row.amount || ''),
          });
        } else if (next[row.category] !== undefined) {
          next[row.category] = {
            amount: row.amount ? String(row.amount) : '',
            desc:   row.description ?? '',
          };
        }
      }
      setExpenses(next);
      setAdjustments(adjRows.length > 0 ? adjRows : emptyAdj());
    } catch { /* ignore */ }
  }

  async function saveExpenses() {
    if (!singlePropId) return;
    const expRows = EXPENSE_CATS
      .map(k => ({ category: k, description: expenses[k].desc, amount: Number(expenses[k].amount) || 0 }))
      .filter(e => e.amount > 0 || e.description);

    for (const adj of adjustments) {
      if (adj.note || adj.amount) {
        expRows.push({
          category:    '_adj',
          description: adj.note,
          amount:      -(Number(adj.amount) || 0),
        });
      }
    }

    setExpSaving(true);
    try {
      await apiFetch('/api/reports/expenses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ propertyId: singlePropId, from, to, expenses: expRows }),
      });
      setExpSaved(true);
      setTimeout(() => setExpSaved(false), 2500);
    } catch { /* ignore */ }
    setExpSaving(false);
  }

  // ── Room charges report ────────────────────────────────────────────────────

  async function generateCharges() {
    setChargesLoading(true);
    setChargesResults(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (propFilter !== 'all') params.set('propertyId', propFilter);
      const r = await apiFetch(`/api/reports/charges?${params}`);
      const data = await r.json();
      if (r.ok) setChargesResults(data);
    } catch { /* network error */ }
    setChargesLoading(false);
  }

  const tax = taxRate ? Number(taxRate) / 100 : 0;

  const summary = useMemo(() => {
    if (!results) return null;
    const totalBookings = results.length;
    const totalNights = results.reduce((s, b) => {
      const diff = (new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000;
      return s + Math.max(0, Math.round(diff));
    }, 0);
    const totalRevenue = results.reduce((s, b) => s + (b.total_price || 0), 0);
    const totalTax     = totalRevenue * tax;
    const netRevenue   = totalRevenue - totalTax;
    const avgBookingValue = totalBookings ? totalRevenue / totalBookings : 0;
    const daysInRange  = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000));
    const activeRooms  = rooms.filter(r => r.status !== 'maintenance').length || 1;
    const occupancy    = Math.min(100, Math.round((totalNights / (activeRooms * daysInRange)) * 100));
    const totalRefunds = results.reduce((s, b) => s + (b.refund_amount || 0), 0);
    return { totalBookings, totalNights, totalRevenue, totalTax, netRevenue, avgBookingValue, occupancy, totalRefunds };
  }, [results, tax, from, to, rooms]);

  const wpStats = useMemo(() => {
    if (!results || !isWP) return null;
    const stayLengths = results
      .map(b => Math.max(0, Math.round((new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000)))
      .filter(n => n > 0);
    const avgStay      = stayLengths.length
      ? Math.round((stayLengths.reduce((s, n) => s + n, 0) / stayLengths.length) * 10) / 10
      : 0;
    const longestStay  = stayLengths.length ? Math.max(...stayLengths) : 0;
    const shortestStay = stayLengths.length ? Math.min(...stayLengths) : 0;
    const byMonth = {};
    for (const b of results) {
      const m = (b.check_in_date ?? '').slice(0, 7);
      if (!m) continue;
      byMonth[m] = (byMonth[m] ?? 0) + (b.total_price || 0);
    }
    const busiestMonthKey = Object.keys(byMonth).sort((a, bk) => byMonth[bk] - byMonth[a])[0] ?? null;
    return { avgStay, longestStay, shortestStay, busiestMonthKey };
  }, [results, isWP]);

  const wpMonthlyOcc = useMemo(() => {
    if (!results || !isWP) return [];
    const bookedDates = new Set();
    for (const b of results) {
      if (b.status === 'cancelled') continue;
      let cur = new Date((b.check_in_date  ?? '').slice(0, 10) + 'T00:00:00Z');
      const end = new Date((b.check_out_date ?? '').slice(0, 10) + 'T00:00:00Z');
      while (cur < end) {
        bookedDates.add(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    const months     = [];
    const startDate  = new Date(from + 'T00:00:00Z');
    const endDate    = new Date(to   + 'T00:00:00Z');
    let mDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    while (mDate < endDate) {
      const y = mDate.getUTCFullYear();
      const m = mDate.getUTCMonth();
      const monthStart = new Date(Date.UTC(y, m, 1));
      const monthEnd   = new Date(Date.UTC(y, m + 1, 1));
      const rangeStart = startDate > monthStart ? startDate : monthStart;
      const rangeEnd   = endDate   < monthEnd   ? endDate   : monthEnd;
      let total = 0, booked = 0;
      let cur = new Date(rangeStart);
      while (cur < rangeEnd) {
        total++;
        if (bookedDates.has(cur.toISOString().slice(0, 10))) booked++;
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      const pct = total > 0 ? Math.round((booked / total) * 100) : 0;
      months.push({ key: `${y}-${String(m + 1).padStart(2, '0')}`, y, m, booked, total, pct });
      mDate = new Date(Date.UTC(y, m + 1, 1));
    }
    return months;
  }, [results, isWP, from, to]);

  // ── P&L summary ────────────────────────────────────────────────────────────

  const plSummary = useMemo(() => {
    if (!summary) return null;
    const bookingRev   = summary.totalRevenue;
    const chargesRev   = chargesResults?.totals?.gross ?? 0;
    const totalIncome  = bookingRev + chargesRev;
    const totalRefunds  = summary.totalRefunds ?? 0;
    const adjAmt        = adjustments.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const netIncome     = totalIncome - totalRefunds - adjAmt;
    const totalExpenses = EXPENSE_CATS.reduce((s, k) => s + (Number(expenses[k].amount) || 0), 0);
    const netProfit     = netIncome - totalExpenses;
    return { bookingRev, chargesRev, totalIncome, totalRefunds, adjAmt, netIncome, totalExpenses, netProfit };
  }, [summary, chargesResults, adjustments, expenses]);

  // ── Build row ──────────────────────────────────────────────────────────────

  function buildRow(b) {
    const nights   = Math.max(0, Math.round((new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000));
    const totalAmt = b.total_price || 0;
    const taxAmt   = totalAmt * tax;
    const netAmt   = totalAmt - taxAmt;
    const cells = {};
    cells.ref       = `#${b.id}`;
    cells.guestName = `${b.guest_first_name || ''} ${b.guest_last_name || ''}`.trim();
    cells.guestEmail= b.guest_email || '';
    cells.room      = b.room_name || '';
    cells.checkIn   = b.check_in_date;
    cells.checkOut  = b.check_out_date;
    cells.duration  = nights;
    cells.rate      = b.price_per_night ? fmtMoney(b.price_per_night) : '—';
    cells.total     = fmtMoney(totalAmt);
    cells.taxRate   = taxRate ? `${taxRate}%` : '—';
    cells.taxAmount = fmtMoney(taxAmt);
    cells.net       = fmtMoney(netAmt);
    cells.source    = b.source || '—';
    return cells;
  }

  // ── CSV export ─────────────────────────────────────────────────────────────

  function downloadCSV() {
    if (!results) return;
    const activeFields = ALL_FIELDS.filter(f => fields.has(f));
    const headers = activeFields.map(fieldLabel);
    const dataRows = results.map(b => {
      const cells   = buildRow(b);
      const nights  = Math.max(0, Math.round((new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000));
      const total   = b.total_price || 0;
      const taxAmt  = total * tax;
      const netAmt  = total - taxAmt;
      return activeFields.map(f => {
        switch (f) {
          case 'ref':       return `"#${b.id}"`;
          case 'guestName': return `"${cells.guestName}"`;
          case 'guestEmail':return `"${b.guest_email || ''}"`;
          case 'room':      return `"${b.room_name || ''}"`;
          case 'checkIn':   return `"${b.check_in_date}"`;
          case 'checkOut':  return `"${b.check_out_date}"`;
          case 'duration':  return nights;
          case 'rate':      return b.price_per_night || '';
          case 'total':     return total.toFixed(2);
          case 'taxRate':   return taxRate || '0';
          case 'taxAmount': return taxAmt.toFixed(2);
          case 'net':       return netAmt.toFixed(2);
          case 'source':    return `"${b.source || ''}"`;
          default:          return '';
        }
      }).join(',');
    });
    if (summary) {
      const sumRow = activeFields.map(f => {
        switch (f) {
          case 'ref':       return '"TOTAL"';
          case 'duration':  return summary.totalNights;
          case 'total':     return summary.totalRevenue.toFixed(2);
          case 'taxRate':   return taxRate || '0';
          case 'taxAmount': return summary.totalTax.toFixed(2);
          case 'net':       return summary.netRevenue.toFixed(2);
          default:          return '""';
        }
      }).join(',');
      dataRows.push(sumRow);
    }
    const csvBlocks = [[headers.join(','), ...dataRows].join('\n')];

    if (chargesResults?.rows?.length) {
      csvBlocks.push('');
      csvBlocks.push(t('reportRoomChargesTitle'));
      csvBlocks.push([t('reportChargesCategory'), t('reportChargesTransactions'), t('reportChargesGross'), t('reportChargesTax'), t('reportChargesNet')].join(','));
      for (const r of chargesResults.rows) {
        csvBlocks.push([`"${r.category_name || 'Uncategorised'}"`, r.count, r.gross.toFixed(2), r.tax.toFixed(2), r.net.toFixed(2)].join(','));
      }
      const ct = chargesResults.totals;
      csvBlocks.push(['"TOTAL"', ct.count, ct.gross.toFixed(2), ct.tax.toFixed(2), ct.net.toFixed(2)].join(','));
    }

    if (paymentMethods?.length) {
      csvBlocks.push('');
      csvBlocks.push(t('reportPaymentMethods'));
      csvBlocks.push([t('reportChargesCategory'), t('reportPMBookings'), t('reportChargesGross')].join(','));
      for (const pm of paymentMethods) {
        csvBlocks.push([`"${t(PM_KEY_MAP[pm.method] ?? 'reportPMNotRecorded')}"`, pm.count, (pm.total || 0).toFixed(2)].join(','));
      }
      const pmTotal = paymentMethods.reduce((s, pm) => s + (pm.total || 0), 0);
      csvBlocks.push([`"${t('reportChargesGrandTotal')}"`, paymentMethods.reduce((s, pm) => s + (pm.count || 0), 0), pmTotal.toFixed(2)].join(','));
    }

    const expenseHasData = EXPENSE_CATS.some(k => Number(expenses[k].amount) > 0);
    const adjHasData = adjustments.some(a => Number(a.amount) > 0 || a.note);
    if (expenseHasData || adjHasData) {
      if (adjHasData) {
        csvBlocks.push('');
        csvBlocks.push(t('reportAdjustments'));
        csvBlocks.push([t('reportAdjNote'), t('reportAdjAmount')].join(','));
        for (const a of adjustments) {
          if (a.note || a.amount) {
            csvBlocks.push([`"${a.note || '—'}"`, (-Number(a.amount || 0)).toFixed(2)].join(','));
          }
        }
        const adjTotal = adjustments.reduce((s, a) => s + (Number(a.amount) || 0), 0);
        csvBlocks.push([`"${t('reportAdjTotal')}"`, (-adjTotal).toFixed(2)].join(','));
      }
      if (expenseHasData) {
        csvBlocks.push('');
        csvBlocks.push(t('reportBusinessExpenses'));
        csvBlocks.push([t('reportChargesCategory'), t('reportExpDescription'), t('reportExpAmount')].join(','));
        for (const k of EXPENSE_CATS) {
          const amt = Number(expenses[k].amount) || 0;
          if (amt > 0 || expenses[k].desc) {
            csvBlocks.push([`"${t(`expCat_${k}`)}"`, `"${expenses[k].desc}"`, amt.toFixed(2)].join(','));
          }
        }
        csvBlocks.push([`"${t('reportPLTotalExpenses')}"`, '', EXPENSE_CATS.reduce((s, k) => s + (Number(expenses[k].amount) || 0), 0).toFixed(2)].join(','));
      }
    }

    if (plSummary) {
      csvBlocks.push('');
      csvBlocks.push(t('reportPL'));
      csvBlocks.push(`"${t('reportPLIncome')}"`);
      csvBlocks.push([`"${t('reportPLBookingRevenue')}"`, plSummary.bookingRev.toFixed(2)].join(','));
      if (plSummary.chargesRev > 0) csvBlocks.push([`"${t('reportPLRoomCharges')}"`, plSummary.chargesRev.toFixed(2)].join(','));
      csvBlocks.push([`"${t('reportPLTotalIncome')}"`, plSummary.totalIncome.toFixed(2)].join(','));
      if (plSummary.totalRefunds > 0) csvBlocks.push([`"${t('reportPLLessRefunds')}"`, (-plSummary.totalRefunds).toFixed(2)].join(','));
      if (plSummary.adjAmt > 0) csvBlocks.push([`"${t('reportPLLessAdj')}"`, (-plSummary.adjAmt).toFixed(2)].join(','));
      if (plSummary.totalRefunds > 0 || plSummary.adjAmt > 0) csvBlocks.push([`"${t('reportPLNetIncome')}"`, plSummary.netIncome.toFixed(2)].join(','));
      csvBlocks.push(`"${t('reportPLExpenses')}"`);
      for (const k of EXPENSE_CATS) {
        const amt = Number(expenses[k].amount) || 0;
        if (amt > 0) csvBlocks.push([`"${t(`expCat_${k}`)}"`, amt.toFixed(2)].join(','));
      }
      csvBlocks.push([`"${t('reportPLTotalExpenses')}"`, plSummary.totalExpenses.toFixed(2)].join(','));
      csvBlocks.push([`"${t('reportPLNetProfit')}"`, plSummary.netProfit.toFixed(2)].join(','));
      csvBlocks.push(`"${t('reportPLDisclaimer')}"`);
    }

    triggerDownload(csvBlocks.join('\n'), 'text/csv', `nestbook-report-${from}-${to}.csv`);
  }

  // ── WP CSV export ──────────────────────────────────────────────────────────

  function downloadWPCSV() {
    if (!results) return;
    const headers = ['Guest name', 'Email', 'Check-in', 'Check-out', 'Nights', 'Rate per night', 'Total', 'Status', 'Source', 'Notes'];
    const dataRows = results.map(b => {
      const nights = Math.max(0, Math.round((new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000));
      const total  = b.total_price || 0;
      const rate   = nights > 0 ? total / nights : 0;
      return [
        `"${(`${b.guest_first_name || ''} ${b.guest_last_name || ''}`).trim()}"`,
        `"${b.guest_email || ''}"`,
        `"${b.check_in_date}"`,
        `"${b.check_out_date}"`,
        nights,
        rate.toFixed(2),
        total.toFixed(2),
        `"${b.status || ''}"`,
        `"${b.source || ''}"`,
        `"${b.notes || ''}"`,
      ].join(',');
    });
    const csvBlocks = [[headers.join(','), ...dataRows].join('\n')];

    if (summary) {
      const sumRow = ['""', '""', '""', '"TOTAL"',
        summary.totalNights, '', summary.totalRevenue.toFixed(2),
        '""', '""', '""'].join(',');
      csvBlocks[0] += '\n' + sumRow;
    }

    const expenseHasData = EXPENSE_CATS.some(k => Number(expenses[k].amount) > 0);
    const adjHasData = adjustments.some(a => Number(a.amount) > 0 || a.note);
    if (adjHasData) {
      csvBlocks.push('');
      csvBlocks.push(t('reportAdjustments'));
      csvBlocks.push([t('reportAdjNote'), t('reportAdjAmount')].join(','));
      for (const a of adjustments) {
        if (a.note || a.amount) csvBlocks.push([`"${a.note || '—'}"`, (-Number(a.amount || 0)).toFixed(2)].join(','));
      }
    }
    if (expenseHasData) {
      csvBlocks.push('');
      csvBlocks.push(t('reportBusinessExpenses'));
      csvBlocks.push([t('reportChargesCategory'), t('reportExpDescription'), t('reportExpAmount')].join(','));
      for (const k of EXPENSE_CATS) {
        const amt = Number(expenses[k].amount) || 0;
        if (amt > 0 || expenses[k].desc) {
          csvBlocks.push([`"${t(`expCat_${k}`)}"`, `"${expenses[k].desc}"`, amt.toFixed(2)].join(','));
        }
      }
    }
    if (plSummary) {
      csvBlocks.push('');
      csvBlocks.push(t('reportPL'));
      csvBlocks.push([`"${t('reportPLBookingRevenue')}"`, plSummary.bookingRev.toFixed(2)].join(','));
      csvBlocks.push([`"${t('reportPLTotalIncome')}"`, plSummary.totalIncome.toFixed(2)].join(','));
      if (plSummary.totalRefunds > 0) csvBlocks.push([`"${t('reportPLLessRefunds')}"`, (-plSummary.totalRefunds).toFixed(2)].join(','));
      if (plSummary.adjAmt > 0) csvBlocks.push([`"${t('reportPLLessAdj')}"`, (-plSummary.adjAmt).toFixed(2)].join(','));
      csvBlocks.push([`"${t('reportPLTotalExpenses')}"`, (-plSummary.totalExpenses).toFixed(2)].join(','));
      csvBlocks.push([`"${t('reportPLNetProfit')}"`, plSummary.netProfit.toFixed(2)].join(','));
    }

    triggerDownload(csvBlocks.join('\n'), 'text/csv', `nestbook-report-${from}-${to}.csv`);
  }

  // ── WP PDF export ──────────────────────────────────────────────────────────

  function downloadWPPDF() {
    if (!results || !summary) return;
    const propName    = property?.name ?? 'Property';
    const propAddress = property?.address ?? '';
    const genDate     = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const tableRows = results.map(b => {
      const nights = Math.max(0, Math.round((new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000));
      const total  = b.total_price || 0;
      const rate   = nights > 0 ? total / nights : 0;
      const name   = `${b.guest_first_name || ''} ${b.guest_last_name || ''}`.trim();
      return `<tr>
        <td style="font-weight:500">${name}</td>
        <td class="muted">${b.check_in_date}</td>
        <td class="muted">${b.check_out_date}</td>
        <td style="text-align:right">${nights}</td>
        <td style="text-align:right">${fmtMoney(rate)}</td>
        <td style="text-align:right;font-weight:600">${fmtMoney(total)}</td>
      </tr>`;
    }).join('');

    const occRows = wpMonthlyOcc.map(mo => {
      const label = formatMonthKey(mo.key);
      const bar   = Math.round(mo.pct * 1.2);
      return `<tr>
        <td style="width:120px;font-weight:500">${label}</td>
        <td>
          <div style="background:#e2e8f0;border-radius:4px;height:12px;width:100%">
            <div style="background:#1a4710;border-radius:4px;height:12px;width:${bar}%"></div>
          </div>
        </td>
        <td style="width:200px;text-align:right;font-size:11px;color:#374151">${mo.booked} / ${mo.total} nights (${mo.pct}%)</td>
      </tr>`;
    }).join('');

    let plSection = '';
    if (plSummary) {
      const expRows = EXPENSE_CATS
        .filter(k => Number(expenses[k].amount) > 0)
        .map(k => `<div class="pl-row"><span>${t(`expCat_${k}`)}${expenses[k].desc ? ` <small style="color:#64748b;font-size:10px">${expenses[k].desc}</small>` : ''}</span><span>${fmtMoney(Number(expenses[k].amount))}</span></div>`)
        .join('');
      plSection = `<div class="pl-box">
  <h2>${t('reportPL')}</h2>
  <div class="pl-group">
    <div class="pl-label">${t('reportPLIncome')}</div>
    <div class="pl-row"><span>${t('reportPLBookingRevenue')}</span><span>${fmtMoney(plSummary.bookingRev)}</span></div>
    <div class="pl-row pl-subtotal"><span>${t('reportPLTotalIncome')}</span><span>${fmtMoney(plSummary.totalIncome)}</span></div>
    ${plSummary.totalRefunds > 0 ? `<div class="pl-row pl-adj"><span>${t('reportPLLessRefunds')}</span><span>-${fmtMoney(plSummary.totalRefunds)}</span></div>` : ''}
    ${adjustments.filter(a => Number(a.amount) > 0).map(a =>
      `<div class="pl-row pl-adj"><span>${t('reportPLLessAdj')}${a.note ? ` (${a.note})` : ''}</span><span>-${fmtMoney(Number(a.amount))}</span></div>`
    ).join('')}
  </div>
  ${expRows ? `<div class="pl-group" style="margin-top:12px">
    <div class="pl-label">${t('reportPLExpenses')}</div>
    ${expRows}
    <div class="pl-row pl-subtotal"><span>${t('reportPLTotalExpenses')}</span><span>${fmtMoney(plSummary.totalExpenses)}</span></div>
  </div>` : ''}
  <div class="pl-net">
    <span>${t('reportPLNetProfit')}</span>
    <span style="color:${plSummary.netProfit >= 0 ? '#166534' : '#dc2626'}">${fmtMoney(plSummary.netProfit)}</span>
  </div>
  <div class="pl-disclaimer">${t('reportPLDisclaimer')}</div>
</div>`;
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Revenue Report — ${propName}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:40px;color:#0f172a;font-size:12px}
  .prop-name{font-size:18px;font-weight:700;margin-bottom:2px}
  .prop-addr{color:#64748b;margin-bottom:24px}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:15px;margin:20px 0 10px}
  .subtitle{color:#64748b;font-size:13px;margin-bottom:28px}
  .summary{background:#f1f5f9;border-radius:8px;padding:18px;margin-bottom:28px}
  .summary h2{margin:0 0 14px;font-size:15px}
  .sum-grid{display:flex;flex-wrap:wrap;gap:12px}
  .sum-item label{font-size:10px;color:#64748b;display:block;margin-bottom:2px}
  .sum-item span{font-size:15px;font-weight:700}
  table{width:100%;border-collapse:collapse;margin-bottom:28px;font-size:11px}
  th{background:#1a4710;color:#fff;padding:7px 6px;text-align:left;white-space:nowrap}
  td{padding:5px 6px;border-bottom:1px solid #e2e8f0}
  tr:nth-child(even) td{background:#f8fafc}
  .muted{color:#64748b}
  .footer{color:#94a3b8;font-size:10px;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:8px}
  .leaf{font-size:18px;float:right;opacity:.3}
  .pl-box{background:#f0fdf4;border:2px solid #1a4710;border-radius:8px;padding:20px;margin:28px 0}
  .pl-box h2{margin:0 0 14px;font-size:15px;color:#1a4710}
  .pl-group{margin-bottom:8px}
  .pl-label{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:8px 0 4px}
  .pl-row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
  .pl-subtotal{border-top:1px solid #1a4710;font-weight:700;margin-top:4px;padding-top:4px}
  .pl-adj{color:#b45309}
  .pl-net{display:flex;justify-content:space-between;font-size:16px;font-weight:800;border-top:3px double #1a4710;margin-top:12px;padding-top:10px}
  .pl-disclaimer{font-size:9px;color:#94a3b8;margin-top:10px;font-style:italic}
  @media print{body{margin:20px}}
</style>
</head><body>
<div class="prop-name">${propName}</div>
<div class="prop-addr">${propAddress}</div>
<h1>${t('revenueReportTitle')}</h1>
<div class="subtitle">${from} – ${to}</div>
<div class="summary">
  <h2>${t('reportSummaryTitle')}</h2>
  <div class="sum-grid">
    <div class="sum-item"><label>${t('reportSumRevenue')}</label><span>${fmtMoney(summary.totalRevenue)}</span></div>
    <div class="sum-item"><label>${t('reportSumBookings')}</label><span>${summary.totalBookings}</span></div>
    <div class="sum-item"><label>${t('reportSumAvg')}</label><span>${fmtMoney(summary.avgBookingValue)}</span></div>
    ${wpStats ? `
    <div class="sum-item"><label>${t('reportWPAvgStay')}</label><span>${wpStats.avgStay} ${t('reportWPNights')}</span></div>
    <div class="sum-item"><label>${t('reportWPLongestStay')}</label><span>${wpStats.longestStay} ${t('reportWPNights')}</span></div>
    <div class="sum-item"><label>${t('reportWPShortestStay')}</label><span>${wpStats.shortestStay} ${t('reportWPNights')}</span></div>
    <div class="sum-item"><label>${t('reportWPBusiestMonth')}</label><span>${formatMonthKey(wpStats.busiestMonthKey)}</span></div>
    ` : ''}
  </div>
</div>
<table>
  <thead><tr>
    <th>${t('reportField_guestName')}</th>
    <th>${t('reportField_checkIn')}</th>
    <th>${t('reportField_checkOut')}</th>
    <th style="text-align:right">${t('reportWPNights')}</th>
    <th style="text-align:right">${t('reportField_rate')}</th>
    <th style="text-align:right">${t('reportField_total')}</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
${wpMonthlyOcc.length > 0 ? `
<h2>${t('reportWPMonthlyOcc')}</h2>
<table>
  <tbody>${occRows}</tbody>
</table>` : ''}
${plSection}
<div class="footer">${t('reportGeneratedBy')} ${genDate}</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // ── PDF export ─────────────────────────────────────────────────────────────

  function downloadPDF() {
    if (!results || !summary) return;
    const propName    = property?.name ?? 'Property';
    const propAddress = property?.address ?? '';
    const genDate     = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const activeFields = ALL_FIELDS.filter(f => fields.has(f));

    const tableRows = results.map(b => {
      const cells = buildRow(b);
      return `<tr>${activeFields.map(f => `<td>${cells[f]}</td>`).join('')}</tr>`;
    }).join('');

    let chargesSection = '';
    if (chargesResults?.rows?.length) {
      const ct = chargesResults.totals;
      const grandGross = summary.totalRevenue + ct.gross;
      const grandTax   = summary.totalTax   + ct.tax;
      const grandNet   = summary.netRevenue  + ct.net;
      const chargesRows = chargesResults.rows.map(r =>
        `<tr><td>${r.category_name || 'Uncategorised'}</td><td>${r.count}</td><td>${fmtMoney(r.gross)}</td><td>${fmtMoney(r.tax)}</td><td>${fmtMoney(r.net)}</td></tr>`
      ).join('');
      chargesSection = `<h2 style="font-size:15px;margin:28px 0 10px">${t('reportRoomChargesTitle')}</h2>
<table>
  <thead><tr><th>${t('reportChargesCategory')}</th><th>${t('reportChargesTransactions')}</th><th>${t('reportChargesGross')}</th><th>${t('reportChargesTax')}</th><th>${t('reportChargesNet')}</th></tr></thead>
  <tbody>${chargesRows}</tbody>
</table>
<div class="summary" style="margin-top:20px">
  <h2>${t('reportRevenueSummary')}</h2>
  <div class="sum-grid">
    <div class="sum-item"><label>${t('reportChargesAccommodation')}</label><span>${fmtMoney(summary.totalRevenue)}</span></div>
    <div class="sum-item"><label>${t('reportRoomChargesTitle')}</label><span>${fmtMoney(ct.gross)}</span></div>
    <div class="sum-item"><label>${t('reportChargesGrandTotal')}</label><span>${fmtMoney(grandGross)}</span></div>
    <div class="sum-item"><label>${t('reportSumTax')}</label><span>${fmtMoney(grandTax)}</span></div>
    <div class="sum-item"><label>${t('reportSumNet')}</label><span>${fmtMoney(grandNet)}</span></div>
  </div>
</div>`;
    }

    let pmSection = '';
    if (paymentMethods?.length) {
      const pmRows = paymentMethods.map(pm =>
        `<tr><td>${t(PM_KEY_MAP[pm.method] ?? 'reportPMNotRecorded')}</td><td>${pm.count} ${t('reportPMBookings')}</td><td style="text-align:right;font-weight:700">${fmtMoney(pm.total || 0)}</td></tr>`
      ).join('');
      const pmTotal = paymentMethods.reduce((s, pm) => s + (pm.total || 0), 0);
      pmSection = `<h2 style="font-size:15px;margin:28px 0 10px">${t('reportPaymentMethods')}</h2>
<table>
  <thead><tr><th>${t('reportChargesCategory')}</th><th>${t('reportPMBookings')}</th><th style="text-align:right">${t('reportChargesGross')}</th></tr></thead>
  <tbody>${pmRows}<tr style="background:#f1f5f9;font-weight:700"><td>${t('reportChargesGrandTotal')}</td><td>${paymentMethods.reduce((s, pm) => s + (pm.count || 0), 0)} ${t('reportPMBookings')}</td><td style="text-align:right">${fmtMoney(pmTotal)}</td></tr></tbody>
</table>`;
    }

    let plSection = '';
    if (plSummary) {
      const expRows = EXPENSE_CATS
        .filter(k => Number(expenses[k].amount) > 0)
        .map(k => `<div class="pl-row"><span>${t(`expCat_${k}`)}${expenses[k].desc ? ` <small style="color:#64748b;font-size:10px">${expenses[k].desc}</small>` : ''}</span><span>${fmtMoney(Number(expenses[k].amount))}</span></div>`)
        .join('');

      plSection = `<div class="pl-box">
  <h2>${t('reportPL')}</h2>
  <div class="pl-group">
    <div class="pl-label">${t('reportPLIncome')}</div>
    <div class="pl-row"><span>${t('reportPLBookingRevenue')}</span><span>${fmtMoney(plSummary.bookingRev)}</span></div>
    ${plSummary.chargesRev > 0 ? `<div class="pl-row"><span>${t('reportPLRoomCharges')}</span><span>${fmtMoney(plSummary.chargesRev)}</span></div>` : ''}
    <div class="pl-row pl-subtotal"><span>${t('reportPLTotalIncome')}</span><span>${fmtMoney(plSummary.totalIncome)}</span></div>
    ${(plSummary.totalRefunds > 0 || plSummary.adjAmt > 0) ? [
      plSummary.totalRefunds > 0 ? `<div class="pl-row pl-adj"><span>${t('reportPLLessRefunds')}</span><span>-${fmtMoney(plSummary.totalRefunds)}</span></div>` : '',
      ...adjustments.filter(a => Number(a.amount) > 0).map(a =>
        `<div class="pl-row pl-adj"><span>${t('reportPLLessAdj')}${a.note ? ` (${a.note})` : ''}</span><span>-${fmtMoney(Number(a.amount))}</span></div>`
      ),
      `<div class="pl-row pl-subtotal"><span>${t('reportPLNetIncome')}</span><span>${fmtMoney(plSummary.netIncome)}</span></div>`,
    ].join('') : ''}
  </div>
  ${expRows ? `<div class="pl-group" style="margin-top:12px">
    <div class="pl-label">${t('reportPLExpenses')}</div>
    ${expRows}
    <div class="pl-row pl-subtotal"><span>${t('reportPLTotalExpenses')}</span><span>${fmtMoney(plSummary.totalExpenses)}</span></div>
  </div>` : ''}
  <div class="pl-net">
    <span>${t('reportPLNetProfit')}</span>
    <span style="color:${plSummary.netProfit >= 0 ? '#166534' : '#dc2626'}">${fmtMoney(plSummary.netProfit)}</span>
  </div>
  <div class="pl-disclaimer">${t('reportPLDisclaimer')}</div>
</div>`;
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Revenue Report — ${propName}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:40px;color:#0f172a;font-size:12px}
  .prop-name{font-size:18px;font-weight:700;margin-bottom:2px}
  .prop-addr{color:#64748b;margin-bottom:24px}
  h1{font-size:22px;margin:0 0 4px}
  .subtitle{color:#64748b;font-size:13px;margin-bottom:28px}
  .summary{background:#f1f5f9;border-radius:8px;padding:18px;margin-bottom:28px}
  .summary h2{margin:0 0 14px;font-size:15px}
  .sum-grid{display:flex;flex-wrap:wrap;gap:12px}
  .sum-item label{font-size:10px;color:#64748b;display:block;margin-bottom:2px}
  .sum-item span{font-size:15px;font-weight:700}
  table{width:100%;border-collapse:collapse;margin-bottom:28px;font-size:11px}
  th{background:#1a4710;color:#fff;padding:7px 6px;text-align:left;white-space:nowrap}
  td{padding:5px 6px;border-bottom:1px solid #e2e8f0}
  tr:nth-child(even) td{background:#f8fafc}
  .footer{color:#94a3b8;font-size:10px;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:8px}
  .leaf{font-size:18px;float:right;opacity:.3}
  .pl-box{background:#f0fdf4;border:2px solid #1a4710;border-radius:8px;padding:20px;margin:28px 0}
  .pl-box h2{margin:0 0 14px;font-size:15px;color:#1a4710}
  .pl-group{margin-bottom:8px}
  .pl-label{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:8px 0 4px}
  .pl-row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
  .pl-subtotal{border-top:1px solid #1a4710;font-weight:700;margin-top:4px;padding-top:4px}
  .pl-adj{color:#b45309}
  .pl-net{display:flex;justify-content:space-between;font-size:16px;font-weight:800;border-top:3px double #1a4710;margin-top:12px;padding-top:10px}
  .pl-disclaimer{font-size:9px;color:#94a3b8;margin-top:10px;font-style:italic}
  @media print{body{margin:20px}}
</style>
</head><body>
<div class="prop-name">${propName}</div>
<div class="prop-addr">${propAddress}</div>
<h1>${t('revenueReportTitle')}</h1>
<div class="subtitle">${from} – ${to}</div>
<div class="summary">
  <h2>${t('reportSummaryTitle')}</h2>
  <div class="sum-grid">
    <div class="sum-item"><label>${t('reportSumBookings')}</label><span>${summary.totalBookings}</span></div>
    <div class="sum-item"><label>${t('reportSumNights')}</label><span>${summary.totalNights}</span></div>
    <div class="sum-item"><label>${t('reportSumRevenue')}</label><span>${fmtMoney(summary.totalRevenue)}</span></div>
    <div class="sum-item"><label>${t('reportSumTax')}</label><span>${fmtMoney(summary.totalTax)}</span></div>
    <div class="sum-item"><label>${t('reportSumNet')}</label><span>${fmtMoney(summary.netRevenue)}</span></div>
    <div class="sum-item"><label>${t('reportSumAvg')}</label><span>${fmtMoney(summary.avgBookingValue)}</span></div>
    <div class="sum-item"><label>${t('reportSumOccupancy')}</label><span>${summary.occupancy}%</span></div>
  </div>
</div>
<table>
  <thead><tr>${activeFields.map(f => `<th>${fieldLabel(f)}</th>`).join('')}</tr></thead>
  <tbody>${tableRows}</tbody>
</table>
${pmSection}
${chargesSection}
${plSection}
<div class="footer">${t('reportGeneratedBy')} ${genDate}</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // ── Guest list ─────────────────────────────────────────────────────────────

  async function loadGuests() {
    setGuestLoading(true);
    setGuestResults(null);
    try {
      const params = new URLSearchParams({ from: gFrom, to: gTo });
      if (propFilter !== 'all') params.set('propertyId', propFilter);
      const r = await apiFetch(`/api/reports/guests?${params}`);
      const data = await r.json();
      if (r.ok) setGuestResults(data);
    } catch { /* network error */ }
    setGuestLoading(false);
  }

  function downloadGuestCSV() {
    if (!guestResults) return;
    const headers = ['Name', 'Email', 'Check-in', 'Check-out', 'Room'];
    const rows = guestResults.map(g =>
      [`"${g.first_name || ''} ${g.last_name || ''}"`, `"${g.email || ''}"`,
       `"${g.check_in_date}"`, `"${g.check_out_date}"`, `"${g.room_name || ''}"`].join(',')
    );
    triggerDownload([headers.join(','), ...rows].join('\n'), 'text/csv', `nestbook-guests-${gFrom}-${gTo}.csv`);
  }

  function copyEmails() {
    if (!guestResults) return;
    const list = guestResults.map(g => g.email).filter(Boolean).join(', ');
    navigator.clipboard.writeText(list).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100 }}>

      {/* ── Revenue Report ─────────────────────────────────────────────────── */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <div className="admin-card-header">
          <h2>{t('revenueReportTitle')}</h2>
        </div>

        {/* Filters */}
        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportDateRange')}</label>
              <select className="form-control" style={{ width: 190 }} value={preset} onChange={e => handlePreset(e.target.value)}>
                <option value="this_month">{t('reportThisMonth')}</option>
                <option value="last_month">{t('reportLastMonth')}</option>
                <option value="this_quarter">{t('reportThisQuarter')}</option>
                <option value="this_year">{t('reportThisYear')}</option>
                <option value="custom">{t('reportCustomRange')}</option>
              </select>
            </div>

            {preset === 'custom' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportFrom')}</label>
                  <input type="date" className="form-control" value={from} onChange={e => setFrom(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportTo')}</label>
                  <input type="date" className="form-control" value={to} onChange={e => setTo(e.target.value)} />
                </div>
              </>
            )}

            {plan === 'multi' && properties && properties.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportProperty')}</label>
                <select className="form-control" style={{ width: 190 }} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
                  <option value="all">{t('reportAllProperties')}</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportStatus')}</label>
              <select className="form-control" style={{ width: 190 }} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="all">{t('reportAllStatuses')}</option>
                <option value="confirmed">{t('reportConfirmedOnly')}</option>
                <option value="checked_out">{t('reportCheckedOutOnly')}</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportTaxRateLabel')}</label>
              <input
                type="number" className="form-control" style={{ width: 110 }}
                min="0" max="100" step="0.1"
                placeholder={t('reportTaxRatePlaceholder')}
                value={taxRate}
                onChange={e => setTaxRate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Field selection — B&B only */}
        {!isWP && (
          <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 12 }}>
              {t('reportSelectFields')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {ALL_FIELDS.map(f => (
                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', cursor: 'pointer', color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={fields.has(f)}
                    onChange={() => toggleField(f)}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                  />
                  {fieldLabel(f)}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Generate */}
        <div style={{ padding: '16px 20px', borderBottom: results !== null ? '1px solid #f1f5f9' : 'none' }}>
          <button className="btn-primary" onClick={generate} disabled={loading}>
            {loading ? '…' : t('reportGenerate')}
          </button>
        </div>

        {/* Results */}
        {results !== null && (
          results.length === 0 ? (
            <div style={{ padding: '20px', color: '#94a3b8', fontSize: '0.875rem' }}>
              {t('reportNoData')}
            </div>
          ) : (
            <>
              {/* Summary cards */}
              {summary && (
                <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 14 }}>
                    {t('reportSummaryTitle')}
                  </div>
                  {property?.require_deposit && property?.deposit_amount ? (
                    <div style={{
                      marginBottom: 14, padding: '8px 12px', borderRadius: 6,
                      background: '#fffbeb', border: '1px solid #fde68a',
                      fontSize: '0.84rem', color: '#92400e', fontWeight: 500,
                    }}>
                      <i className="ti ti-cash" /> Deposit required per booking: {fmtMoney(property.deposit_amount)}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {(isWP ? [
                      [t('reportSumRevenue'),        fmtMoney(summary.totalRevenue)],
                      [t('reportSumBookings'),        summary.totalBookings],
                      [t('reportSumAvg'),             fmtMoney(summary.avgBookingValue)],
                      [t('reportWPAvgStay'),          `${wpStats?.avgStay ?? 0} ${t('reportWPNights')}`],
                      [t('reportWPLongestStay'),      `${wpStats?.longestStay ?? 0} ${t('reportWPNights')}`],
                      [t('reportWPShortestStay'),     `${wpStats?.shortestStay ?? 0} ${t('reportWPNights')}`],
                      [t('reportWPBusiestMonth'),     formatMonthKey(wpStats?.busiestMonthKey ?? null)],
                      ...(summary.totalRefunds > 0 ? [[t('reportSumRefunds'), `-${fmtMoney(summary.totalRefunds)}`]] : []),
                    ] : [
                      [t('reportSumBookings'),  summary.totalBookings],
                      [t('reportSumNights'),    summary.totalNights],
                      [t('reportSumRevenue'),   fmtMoney(summary.totalRevenue)],
                      [t('reportSumTax'),       fmtMoney(summary.totalTax)],
                      [t('reportSumNet'),       fmtMoney(summary.netRevenue)],
                      [t('reportSumAvg'),       fmtMoney(summary.avgBookingValue)],
                      [t('reportSumOccupancy'), `${summary.occupancy}%`],
                      ...(summary.totalRefunds > 0 ? [[t('reportSumRefunds'), `-${fmtMoney(summary.totalRefunds)}`]] : []),
                    ]).map(([label, value]) => (
                      <div key={label} className="report-summary-card">
                        <div className="report-summary-label">{label}</div>
                        <div className="report-summary-value">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Methods breakdown */}
              {paymentMethods && paymentMethods.length > 0 && (
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 10 }}>
                    {t('reportPaymentMethods')}
                  </div>
                  <table style={{ width: '100%', maxWidth: 480, borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <tbody>
                      {paymentMethods.map(pm => (
                        <tr key={pm.method} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '5px 8px 5px 0', color: '#374151', fontWeight: 500 }}>
                            {t(PM_KEY_MAP[pm.method] ?? 'reportPMNotRecorded')}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#64748b', fontSize: '0.8rem' }}>
                            {pm.count} {t('reportPMBookings')}
                          </td>
                          <td style={{ padding: '5px 0 5px 8px', fontWeight: 600, textAlign: 'right', color: '#1a2e14' }}>
                            {fmtMoney(pm.total || 0)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #1a4710' }}>
                        <td style={{ padding: '7px 8px 5px 0', fontWeight: 700 }}>{t('reportChargesGrandTotal')}</td>
                        <td style={{ padding: '7px 8px', color: '#64748b', fontSize: '0.8rem' }}>
                          {paymentMethods.reduce((s, pm) => s + (pm.count || 0), 0)} {t('reportPMBookings')}
                        </td>
                        <td style={{ padding: '7px 0 5px 8px', fontWeight: 700, textAlign: 'right', color: '#1a4710' }}>
                          {fmtMoney(paymentMethods.reduce((s, pm) => s + (pm.total || 0), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Export buttons */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn-secondary" onClick={isWP ? downloadWPCSV : downloadCSV}>⬇ {t('reportDownloadCSV')}</button>
                <button className="btn-secondary" onClick={isWP ? downloadWPPDF : downloadPDF}>⬇ {t('reportDownloadPDF')}</button>
              </div>

              {/* Data table — WP mode: per-booking fixed columns */}
              {isWP ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t('reportField_guestName')}</th>
                        <th>{t('reportField_checkIn')}</th>
                        <th>{t('reportField_checkOut')}</th>
                        <th style={{ textAlign: 'right' }}>{t('reportWPNights')}</th>
                        <th style={{ textAlign: 'right' }}>{t('reportField_rate')}</th>
                        <th style={{ textAlign: 'right' }}>{t('reportField_total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map(b => {
                        const nights = Math.max(0, Math.round((new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000));
                        const total  = b.total_price || 0;
                        const rate   = nights > 0 ? total / nights : 0;
                        const name   = `${b.guest_first_name || ''} ${b.guest_last_name || ''}`.trim();
                        return (
                          <tr key={b.id}>
                            <td style={{ fontWeight: 500 }}>{name}</td>
                            <td className="admin-muted">{b.check_in_date}</td>
                            <td className="admin-muted">{b.check_out_date}</td>
                            <td style={{ textAlign: 'right' }}>{nights}</td>
                            <td style={{ textAlign: 'right' }}>{fmtMoney(rate)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Data table — B&B mode: configurable columns */
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        {ALL_FIELDS.filter(f => fields.has(f)).map(f => <th key={f}>{fieldLabel(f)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map(b => {
                        const cells = buildRow(b);
                        return (
                          <tr key={b.id}>
                            {fields.has('ref')        && <td><code style={{ fontSize: '0.78rem', background: '#f1f5f9', padding: '2px 5px', borderRadius: 3 }}>{cells.ref}</code></td>}
                            {fields.has('guestName')  && <td style={{ fontWeight: 500 }}>{cells.guestName}</td>}
                            {fields.has('guestEmail') && <td className="admin-muted">{cells.guestEmail}</td>}
                            {fields.has('room')       && <td>{cells.room}</td>}
                            {fields.has('checkIn')    && <td className="admin-muted">{cells.checkIn}</td>}
                            {fields.has('checkOut')   && <td className="admin-muted">{cells.checkOut}</td>}
                            {fields.has('duration')   && <td>{cells.duration}</td>}
                            {fields.has('rate')       && <td>{cells.rate}</td>}
                            {fields.has('total')      && <td style={{ fontWeight: 600 }}>{cells.total}</td>}
                            {fields.has('taxRate')    && <td>{cells.taxRate}</td>}
                            {fields.has('taxAmount')  && <td>{cells.taxAmount}</td>}
                            {fields.has('net')        && <td style={{ fontWeight: 600 }}>{cells.net}</td>}
                            {fields.has('source')     && <td className="admin-muted">{cells.source}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Monthly occupancy chart — WP mode only */}
              {isWP && wpMonthlyOcc.length > 0 && (
                <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 14 }}>
                    {t('reportWPMonthlyOcc')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {wpMonthlyOcc.map(mo => (
                      <div key={mo.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ minWidth: 110, fontSize: '0.82rem', fontWeight: 500, color: '#374151' }}>
                          {formatMonthKey(mo.key)}
                        </div>
                        <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                          <div style={{
                            width: `${mo.pct}%`, height: '100%', borderRadius: 4,
                            background: mo.pct >= 80 ? '#166534' : mo.pct >= 50 ? '#1a4710' : '#4ade80',
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                        <div style={{ minWidth: 180, fontSize: '0.8rem', color: '#64748b', textAlign: 'right' }}>
                          {t('reportWPNightsBooked')(mo.booked, mo.total, mo.pct)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>

      {/* ── Room Charges Report (Multi or Charges add-on, not applicable for whole_property) ── */}
      {(plan === 'multi' || !!user?.has_charges_addon) && !isWP && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <div className="admin-card-header">
            <h2>{t('reportRoomChargesTitle')}</h2>
          </div>

          <div style={{ padding: '16px 20px', borderBottom: chargesResults !== null ? '1px solid #f1f5f9' : 'none' }}>
            <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: '#64748b', fontStyle: 'italic' }}>
              {t('reportChargesAccommodation')} taxes use per-category rates set in Settings.
            </p>
            <button className="btn-primary" onClick={generateCharges} disabled={chargesLoading}>
              {chargesLoading ? '…' : t('reportGenerate')}
            </button>
          </div>

          {chargesResults !== null && (
            chargesResults.rows.length === 0 ? (
              <div style={{ padding: '20px', color: '#94a3b8', fontSize: '0.875rem' }}>
                {t('reportChargesNoData')}
              </div>
            ) : (
              <>
                {summary && (
                  <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 14 }}>
                      {t('reportRevenueSummary')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {[
                        [t('reportChargesAccommodation'), fmtMoney(summary.totalRevenue)],
                        [t('reportRoomChargesTitle'),     fmtMoney(chargesResults.totals.gross)],
                        [t('reportChargesGrandTotal'),    fmtMoney(summary.totalRevenue + chargesResults.totals.gross)],
                        [t('reportSumTax'),               fmtMoney(summary.totalTax + chargesResults.totals.tax)],
                        [t('reportSumNet'),               fmtMoney(summary.netRevenue + chargesResults.totals.net)],
                      ].map(([label, value]) => (
                        <div key={label} className="report-summary-card">
                          <div className="report-summary-label">{label}</div>
                          <div className="report-summary-value">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t('reportChargesCategory')}</th>
                        <th>{t('reportChargesTransactions')}</th>
                        <th>{t('reportChargesGross')}</th>
                        <th>{t('reportChargesTax')}</th>
                        <th>{t('reportChargesNet')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chargesResults.rows.map(r => (
                        <tr key={r.category_id ?? 'uncategorised'}>
                          <td style={{ fontWeight: 500 }}>
                            {r.category_color && (
                              <span style={{
                                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                background: r.category_color, marginRight: 6,
                              }} />
                            )}
                            {r.category_name || 'Uncategorised'}
                            {r.tax_rate > 0 && (
                              <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#94a3b8' }}>
                                {r.tax_rate}%
                              </span>
                            )}
                          </td>
                          <td>{r.count}</td>
                          <td style={{ fontWeight: 600 }}>{fmtMoney(r.gross)}</td>
                          <td className="admin-muted">{fmtMoney(r.tax)}</td>
                          <td style={{ fontWeight: 600 }}>{fmtMoney(r.net)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                        <td>{t('reportChargesGrandTotal')}</td>
                        <td>{chargesResults.totals.count}</td>
                        <td>{fmtMoney(chargesResults.totals.gross)}</td>
                        <td>{fmtMoney(chargesResults.totals.tax)}</td>
                        <td>{fmtMoney(chargesResults.totals.net)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}
        </div>
      )}

      {/* ── Business Expenses (Pro/Multi, single property) ─────────────────── */}
      {singlePropId && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          {/* Accordion header */}
          <button
            onClick={() => setExpOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1a2e14' }}>
              {t('reportBusinessExpenses')}
              <span style={{ marginLeft: 8, fontSize: '0.8rem', fontWeight: 400, color: '#94a3b8' }}>
                {from} — {to}
              </span>
            </span>
            <span style={{ fontSize: '1.1rem', color: '#64748b', transform: expOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
          </button>

          {expOpen && (
            <div style={{ borderTop: '1px solid #f1f5f9' }}>
              {/* Expenses table */}
              <div style={{ padding: '16px 20px 0', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px 6px 0', color: '#64748b', fontWeight: 600, fontSize: '0.78rem' }}>
                        {t('reportChargesCategory')}
                      </th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600, fontSize: '0.78rem' }}>
                        {t('reportExpDescription')}
                      </th>
                      <th style={{ textAlign: 'right', padding: '6px 0 6px 8px', color: '#64748b', fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {t('reportExpAmount')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {EXPENSE_CATS.map(k => (
                      <tr key={k} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '7px 8px 7px 0', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {t(`expCat_${k}`)}
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input
                            className="form-control"
                            style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                            placeholder={t('reportExpDescription')}
                            value={expenses[k].desc}
                            onChange={e => setExpenses(prev => ({ ...prev, [k]: { ...prev[k], desc: e.target.value } }))}
                          />
                        </td>
                        <td style={{ padding: '4px 0 4px 8px' }}>
                          <input
                            type="number" min="0" step="0.01"
                            className="form-control"
                            style={{ fontSize: '0.82rem', padding: '5px 8px', textAlign: 'right', width: 120 }}
                            placeholder="0.00"
                            value={expenses[k].amount}
                            onChange={e => setExpenses(prev => ({ ...prev, [k]: { ...prev[k], amount: e.target.value } }))}
                          />
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 8px 8px 0', fontWeight: 700 }}>{t('reportPLTotalExpenses')}</td>
                      <td />
                      <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontWeight: 700, color: '#1a4710' }}>
                        {fmtMoney(EXPENSE_CATS.reduce((s, k) => s + (Number(expenses[k].amount) || 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Revenue Adjustments */}
              <div style={{
                margin: '12px 20px 0', padding: '14px 16px', borderRadius: 8,
                background: '#fffbeb', border: '1px solid #fde68a',
              }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                  {t('reportAdjustments')}
                </div>
                <div style={{ fontSize: '0.77rem', color: '#92400e', marginBottom: 10 }}>
                  {t('reportAdjHint')}
                </div>

                {/* Column headers */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, fontSize: '0.75rem', fontWeight: 600, color: '#92400e' }}>{t('reportAdjNote')}</div>
                  <div style={{ width: 130, fontSize: '0.75rem', fontWeight: 600, color: '#92400e', textAlign: 'right' }}>{t('reportAdjAmount')}</div>
                  <div style={{ width: 28 }} />
                </div>

                {/* Dynamic rows */}
                {adjustments.map((adj, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <input
                      className="form-control"
                      style={{ flex: 1, fontSize: '0.82rem', padding: '5px 8px' }}
                      placeholder={t('reportAdjPlaceholder')}
                      value={adj.note}
                      onChange={e => setAdjustments(prev => prev.map((a, j) => j === i ? { ...a, note: e.target.value } : a))}
                    />
                    <input
                      type="number" min="0" step="0.01"
                      className="form-control"
                      style={{ width: 130, fontSize: '0.82rem', padding: '5px 8px', textAlign: 'right' }}
                      placeholder="0.00"
                      value={adj.amount}
                      onChange={e => setAdjustments(prev => prev.map((a, j) => j === i ? { ...a, amount: e.target.value } : a))}
                    />
                    <button
                      onClick={() => setAdjustments(prev => prev.filter((_, j) => j !== i))}
                      style={{ width: 28, height: 32, background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', fontSize: '0.9rem', padding: 0, flexShrink: 0, lineHeight: 1 }}
                      title={t('reportAdjRemove')}
                    >✕</button>
                  </div>
                ))}

                {/* Add row link */}
                {adjustments.length < 20 && (
                  <button
                    onClick={() => setAdjustments(prev => [...prev, { note: '', amount: '' }])}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: '0.82rem', padding: '4px 0', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    {t('reportAdjAddRow')}
                  </button>
                )}

                {/* Running total */}
                {adjustments.some(a => Number(a.amount) > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 6, borderTop: '1px solid #fde68a', fontSize: '0.875rem', fontWeight: 700, color: '#92400e' }}>
                    <span>{t('reportAdjTotal')}</span>
                    <span>-{fmtMoney(adjustments.reduce((s, a) => s + (Number(a.amount) || 0), 0))}</span>
                  </div>
                )}
              </div>

              {/* Save button */}
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn-primary" onClick={saveExpenses} disabled={expSaving}>
                  {expSaving ? '…' : t('reportExpSave')}
                </button>
                {expSaved && (
                  <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>
                    {t('reportExpSaved')}
                  </span>
                )}
              </div>

              {/* P&L Summary */}
              {plSummary && (
                <div style={{
                  margin: '0 20px 20px', padding: '18px 20px', borderRadius: 8,
                  background: '#f0fdf4', border: '2px solid #1a4710',
                }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a4710', marginBottom: 14, letterSpacing: '0.01em' }}>
                    {t('reportPL')} — {from} to {to}
                  </div>

                  {/* Income */}
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                    {t('reportPLIncome')}
                  </div>
                  <PLRow label={t('reportPLBookingRevenue')} value={fmtMoney(plSummary.bookingRev)} />
                  {plSummary.chargesRev > 0 && (
                    <PLRow label={t('reportPLRoomCharges')} value={fmtMoney(plSummary.chargesRev)} />
                  )}
                  <PLRow label={t('reportPLTotalIncome')} value={fmtMoney(plSummary.totalIncome)} bold divider />
                  {(plSummary.totalRefunds > 0 || plSummary.adjAmt > 0) && (
                    <>
                      {plSummary.totalRefunds > 0 && (
                        <PLRow label={t('reportPLLessRefunds')} value={`-${fmtMoney(plSummary.totalRefunds)}`} muted />
                      )}
                      {plSummary.adjAmt > 0 && adjustments.filter(a => Number(a.amount) > 0).map((a, i) => (
                        <PLRow key={i} label={`${t('reportPLLessAdj')}${a.note ? ` (${a.note})` : ''}`} value={`-${fmtMoney(Number(a.amount))}`} muted />
                      ))}
                      <PLRow label={t('reportPLNetIncome')} value={fmtMoney(plSummary.netIncome)} bold divider />
                    </>
                  )}

                  {/* Expenses */}
                  {plSummary.totalExpenses > 0 && (
                    <>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase', margin: '12px 0 4px' }}>
                        {t('reportPLExpenses')}
                      </div>
                      {EXPENSE_CATS.filter(k => Number(expenses[k].amount) > 0).map(k => (
                        <PLRow
                          key={k}
                          label={`${t(`expCat_${k}`)}${expenses[k].desc ? ` — ${expenses[k].desc}` : ''}`}
                          value={fmtMoney(Number(expenses[k].amount))}
                        />
                      ))}
                      <PLRow label={t('reportPLTotalExpenses')} value={fmtMoney(plSummary.totalExpenses)} bold divider />
                    </>
                  )}

                  {/* Net profit */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    marginTop: 12, paddingTop: 10, borderTop: '3px double #1a4710',
                  }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a2e14' }}>
                      {t('reportPLNetProfit')}
                    </span>
                    <span style={{
                      fontWeight: 800, fontSize: '1.2rem',
                      color: plSummary.netProfit >= 0 ? '#166534' : '#dc2626',
                    }}>
                      {fmtMoney(plSummary.netProfit)}
                    </span>
                  </div>

                  <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    {t('reportPLDisclaimer')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Guest Contact List ──────────────────────────────────────────────── */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h2>{t('guestListTitle')}</h2>
        </div>

        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
          <p style={{ margin: '0 0 16px', fontSize: '0.875rem', color: '#64748b', fontStyle: 'italic' }}>
            {t('reportGuestNote')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportFrom')}</label>
              <input type="date" className="form-control" value={gFrom} onChange={e => setGFrom(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportTo')}</label>
              <input type="date" className="form-control" value={gTo} onChange={e => setGTo(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={loadGuests} disabled={guestLoading}>
              {guestLoading ? '…' : t('reportApplyFilters')}
            </button>
          </div>
        </div>

        {guestResults !== null && (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ marginBottom: 14, fontSize: '0.875rem', color: '#334155', fontWeight: 500 }}>
              {t('reportGuestMatchCount')(guestResults.length)}
            </div>
            {guestResults.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn-secondary" onClick={downloadGuestCSV}>
                  ⬇ {t('reportExportGuestCSV')}
                </button>
                <button className="btn-secondary" onClick={copyEmails}>
                  {copiedToast ? `✓ ${t('reportEmailsCopied')}` : t('reportCopyEmails')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PLRow({ label, value, bold, divider, muted }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: divider ? '5px 0' : '3px 0',
      borderTop: divider ? '1px solid #bbf7d0' : 'none',
      marginTop: divider ? 4 : 0,
      fontSize: '0.875rem',
    }}>
      <span style={{ color: muted ? '#92400e' : '#374151', flex: 1 }}>{label}</span>
      <span style={{
        fontWeight: bold ? 700 : 500,
        color: muted ? '#b45309' : '#1a2e14',
        minWidth: 90, textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  );
}

// ── Util ──────────────────────────────────────────────────────────────────────

function triggerDownload(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
