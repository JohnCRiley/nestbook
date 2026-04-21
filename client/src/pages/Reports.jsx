import { useState, useMemo, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import PlanGate from '../components/PlanGate.jsx';

// ── Date helpers ──────────────────────────────────────────────────────────────

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

// ── Page shell ────────────────────────────────────────────────────────────────

export default function Reports() {
  const t = useT();
  return (
    <>
      <div className="page-header">
        <h1>{t('reportsTitle')}</h1>
        <div className="page-date">{t('reportsSubtitle')}</div>
      </div>
      <PlanGate requiredPlan="pro">
        <ReportsContent />
      </PlanGate>
    </>
  );
}

// ── Content (Pro/Multi only) ──────────────────────────────────────────────────

function ReportsContent() {
  const t = useT();
  const plan = usePlan();
  const { property, properties } = useLocale();
  const currency = property?.currency ?? 'EUR';

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

  // ── Helpers ────────────────────────────────────────────────────────────────

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
    try {
      const params = new URLSearchParams({ from, to, status });
      if (propFilter !== 'all') params.set('propertyId', propFilter);
      const r = await apiFetch(`/api/reports/revenue?${params}`);
      const data = await r.json();
      if (r.ok) setResults(data);
    } catch { /* network error */ }
    setLoading(false);
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
    return { totalBookings, totalNights, totalRevenue, totalTax, netRevenue, avgBookingValue, occupancy };
  }, [results, tax, from, to, rooms]);

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

  function downloadCSV() {
    if (!results) return;
    const activeFields = ALL_FIELDS.filter(f => fields.has(f));
    const headers = activeFields.map(fieldLabel);
    const dataRows = results.map(b => {
      const cells = buildRow(b);
      const nights   = Math.max(0, Math.round((new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000));
      const totalAmt = b.total_price || 0;
      const taxAmt   = totalAmt * tax;
      const netAmt   = totalAmt - taxAmt;
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
          case 'total':     return totalAmt.toFixed(2);
          case 'taxRate':   return taxRate || '0';
          case 'taxAmount': return taxAmt.toFixed(2);
          case 'net':       return netAmt.toFixed(2);
          case 'source':    return `"${b.source || ''}"`;
          default:          return '';
        }
      }).join(',');
    });
    // Summary row
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
    triggerDownload(
      [headers.join(','), ...dataRows].join('\n'),
      'text/csv',
      `nestbook-report-${from}-${to}.csv`
    );
  }

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

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Revenue Report \u2014 ${propName}</title>
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
  @media print{body{margin:20px}}
</style>
</head><body>
<div class="leaf">\uD83C\uDF3F</div>
<div class="prop-name">${propName}</div>
<div class="prop-addr">${propAddress}</div>
<h1>${t('revenueReportTitle')}</h1>
<div class="subtitle">${from} \u2013 ${to}</div>
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
    triggerDownload(
      [headers.join(','), ...rows].join('\n'),
      'text/csv',
      `nestbook-guests-${gFrom}-${gTo}.csv`
    );
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

            {/* Date range preset */}
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

            {/* Custom dates */}
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

            {/* Property selector — Multi plan + multiple properties only */}
            {plan === 'multi' && properties && properties.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportProperty')}</label>
                <select className="form-control" style={{ width: 190 }} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
                  <option value="all">{t('reportAllProperties')}</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {/* Booking status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('reportStatus')}</label>
              <select className="form-control" style={{ width: 190 }} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="all">{t('reportAllStatuses')}</option>
                <option value="confirmed">{t('reportConfirmedOnly')}</option>
                <option value="checked_out">{t('reportCheckedOutOnly')}</option>
              </select>
            </div>

            {/* Tax rate */}
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

        {/* Field selection */}
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {[
                      [t('reportSumBookings'),  summary.totalBookings],
                      [t('reportSumNights'),    summary.totalNights],
                      [t('reportSumRevenue'),   fmtMoney(summary.totalRevenue)],
                      [t('reportSumTax'),       fmtMoney(summary.totalTax)],
                      [t('reportSumNet'),       fmtMoney(summary.netRevenue)],
                      [t('reportSumAvg'),       fmtMoney(summary.avgBookingValue)],
                      [t('reportSumOccupancy'), `${summary.occupancy}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="report-summary-card">
                        <div className="report-summary-label">{label}</div>
                        <div className="report-summary-value">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Export buttons */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn-secondary" onClick={downloadCSV}>⬇ {t('reportDownloadCSV')}</button>
                <button className="btn-secondary" onClick={downloadPDF}>⬇ {t('reportDownloadPDF')}</button>
              </div>

              {/* Data table */}
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
            </>
          )
        )}
      </div>

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
