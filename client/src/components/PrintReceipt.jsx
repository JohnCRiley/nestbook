import { useT } from '../i18n/LocaleContext.jsx';

const LOCALE_MAP = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', nl: 'nl-NL' };

const PM_LABELS = {
  cash:          { en: 'Cash',          fr: 'Espèces',          es: 'Efectivo',               de: 'Bargeld',        nl: 'Contant' },
  card:          { en: 'Card',          fr: 'Carte',            es: 'Tarjeta',                de: 'Karte',          nl: 'Kaart' },
  bank_transfer: { en: 'Bank Transfer', fr: 'Virement bancaire', es: 'Transferencia bancaria', de: 'Banküberweisung', nl: 'Bankoverschrijving' },
  other:         { en: 'Other',         fr: 'Autre',            es: 'Otro',                   de: 'Sonstiges',      nl: 'Anders' },
};

const THANK_YOU = {
  en: 'Thank you for staying with us. We hope to welcome you again soon.',
  fr: 'Merci pour votre séjour. Nous espérons vous accueillir à nouveau très prochainement.',
  es: 'Gracias por su estancia. Esperamos darle la bienvenida de nuevo muy pronto.',
  de: 'Vielen Dank für Ihren Aufenthalt. Wir freuen uns, Sie bald wieder bei uns begrüßen zu dürfen.',
  nl: 'Bedankt voor uw verblijf. Wij hopen u snel weer te mogen verwelkomen.',
};

const LEAF_SVG = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 8C8 10 5.9 16.17 3.82 19.34C2.7 21.07 2 21 2 21C2 21 3.5 13 10 10C10 10 6 14 6 19C6 19 10.5 11 20 9C22 8.5 22 6 20 4C18 2 12 3 12 3C12 3 18 4 17 8Z" fill="#1a4710"/>
</svg>`;

function fc(amount, symbol) {
  if (amount == null) return '—';
  return `${symbol}${Number(amount).toFixed(2)}`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Build self-contained HTML for the print window ────────────────────────────

function buildReceiptHTML(d, format) {
  const isReceipt = format === 'receipt';

  const bodyCSS = isReceipt
    ? `width: 72mm; font-size: 9pt; margin: 0; padding: 3mm;`
    : `max-width: 160mm; margin: 20px auto; font-size: 12pt;`;

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      color: #000;
      background: white;
      ${bodyCSS}
    }
    .receipt-header {
      text-align: center;
      border-bottom: 2px solid #1a4710;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .receipt-property-name {
      font-size: ${isReceipt ? '13pt' : '18pt'};
      font-weight: bold;
      color: #1a4710;
      margin: 6px 0 2px;
    }
    .receipt-address {
      font-size: ${isReceipt ? '8pt' : '10pt'};
      color: #555;
      margin-top: 2px;
    }
    .receipt-title {
      font-size: ${isReceipt ? '11pt' : '14pt'};
      color: #444;
      margin: 8px 0 4px;
    }
    .receipt-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: ${isReceipt ? '3px 0' : '5px 0'};
      border-bottom: 1px solid #eee;
      font-size: ${isReceipt ? '8.5pt' : '11pt'};
      gap: 8px;
    }
    .receipt-row .label { flex: 1; color: #333; }
    .receipt-row .value { white-space: nowrap; font-weight: 600; }
    .receipt-row.indent .label { padding-left: ${isReceipt ? '6px' : '12px'}; color: #555; }
    .receipt-row.credit .value { color: #166534; }
    .receipt-divider {
      border: none;
      border-top: 1px dashed #aaa;
      margin: ${isReceipt ? '6px 0' : '10px 0'};
    }
    .receipt-total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: ${isReceipt ? '6px 0' : '10px 0'};
      font-size: ${isReceipt ? '12pt' : '16pt'};
      font-weight: bold;
      color: #1a4710;
      border-top: 2px solid #1a4710;
      margin-top: ${isReceipt ? '6px' : '10px'};
    }
    .receipt-footer {
      text-align: center;
      margin-top: ${isReceipt ? '10px' : '20px'};
      font-size: ${isReceipt ? '8pt' : '10pt'};
      color: #555;
      border-top: 1px solid #ddd;
      padding-top: ${isReceipt ? '8px' : '12px'};
      line-height: 1.5;
    }
    .receipt-powered {
      font-size: ${isReceipt ? '6.5pt' : '8pt'};
      color: #aaa;
      margin-top: 4px;
    }
    .section-label {
      font-size: ${isReceipt ? '7pt' : '9pt'};
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin: ${isReceipt ? '8px 0 3px' : '12px 0 4px'};
    }
  `;

  const row = (label, value, cls = '') =>
    `<div class="receipt-row ${cls}"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;

  const rowCredit = (label, value) =>
    `<div class="receipt-row credit"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;

  const divider = `<hr class="receipt-divider">`;

  const chargeRows = (d.roomCharges ?? [])
    .map((c) => row(`  ${c.category_icon ? c.category_icon + ' ' : ''}${c.description || c.category_name || ''}`, fc(c.amount, d.symbol), 'indent'))
    .join('');

  const chargesBlock = (d.roomCharges ?? []).length > 0
    ? `${divider}<div class="section-label">${esc(d.chargesLabel)}</div>${chargeRows}`
    : '';

  const extras = [
    d.breakfastFree
      ? row(`  ${d.breakfastLabel}`, d.breakfastComplimentary, 'indent')
      : '',
    d.breakfastCharged
      ? row(`  ${d.breakfastChargeLine}`, d.breakfastSubtotalFmt, 'indent')
      : '',
    d.depositPaidLine
      ? rowCredit(`  ${d.depositLabel}`, d.depositFmt)
      : '',
  ].join('');

  return `<!DOCTYPE html>
<html lang="${esc(d.locale)}">
<head>
<meta charset="UTF-8">
<title>Guest Receipt — ${esc(d.propertyName)}</title>
<style>${css}</style>
</head>
<body>
  <div class="receipt-header">
    ${LEAF_SVG}
    <div class="receipt-property-name">${esc(d.propertyName)}</div>
    ${d.propertyAddress ? `<div class="receipt-address">${esc(d.propertyAddress)}</div>` : ''}
    ${d.propertyCity || d.propertyCountry
      ? `<div class="receipt-address">${esc([d.propertyCity, d.propertyCountry].filter(Boolean).join(', '))}</div>`
      : ''}
    <div class="receipt-title">${esc(d.receiptTitle)}</div>
  </div>

  ${row(d.dateLabel,  d.today)}
  ${row(d.guestLabel, d.guestName)}
  ${row(d.refLabel,   d.bookingRef)}

  ${divider}

  <div class="section-label">${esc(d.stayLabel)}</div>
  <div class="receipt-row"><span class="label" style="font-weight:600">${esc(d.roomName)}</span></div>
  <div class="receipt-row indent"><span class="label">${esc(d.checkInOut)}</span></div>
  ${row(`  ${d.nightsLine}`, d.roomSubtotalFmt, 'indent')}
  ${extras}
  ${chargesBlock}

  ${divider}

  <div class="receipt-total">
    <span>${esc(d.totalPaidLabel)}</span>
    <span>${esc(d.totalDueFmt)}</span>
  </div>
  ${row(d.paymentLabel, d.pmLabel)}

  ${divider}

  <div class="receipt-footer">
    ${esc(d.thankyou)}
    <div class="receipt-powered">Powered by NestBook</div>
  </div>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * PrintReceipt — modal preview + separate-window print.
 * Opens a fresh window with self-contained HTML so printing is always clean.
 */
export default function PrintReceipt({
  booking: b, property,
  nights, pricePerNight, roomSubtotal,
  breakfastFree, breakfastCharged, breakfastSubtotal, bfPricePerPerson,
  breakfastGuests, breakfastDays,
  depositPaid, depositAmount,
  roomCharges,
  totalDue,
  paymentMethod,
  onClose,
}) {
  const t      = useT();
  const locale = property?.locale ?? 'en';
  const symbol = { EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' }[property?.currency ?? 'EUR'] ?? '€';

  // Pre-resolve all strings (hooks can't be called inside buildReceiptHTML)
  const d = {
    locale,
    propertyName:    property?.name    ?? '',
    propertyAddress: property?.address ?? '',
    propertyCity:    property?.city    ?? '',
    propertyCountry: property?.country ?? '',
    today: new Date().toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    guestName:   `${b.guest_first_name} ${b.guest_last_name}`,
    bookingRef:  `#${b.id}`,
    roomName:    `${b.room_name ?? t('roomDeleted')} (${b.room_type ?? ''})`,
    checkInOut:  `${b.check_in_date} → ${b.check_out_date}`,
    nightsLine:  `${nights} × ${fc(pricePerNight, symbol)}`,
    roomSubtotalFmt: fc(roomSubtotal, symbol),
    breakfastFree,
    breakfastLabel:       t('fBreakfast'),
    breakfastComplimentary: t('coComplimentary'),
    breakfastCharged,
    breakfastChargeLine: breakfastCharged
      ? `${t('fBreakfast')} (${breakfastGuests ?? (b.num_guests || 1)} × ${breakfastDays ?? nights} × ${fc(bfPricePerPerson, symbol)})`
      : '',
    breakfastSubtotalFmt: fc(breakfastSubtotal, symbol),
    depositPaidLine: property?.require_deposit === 1 && depositPaid && depositAmount > 0,
    depositLabel:  t('depositPaidPill'),
    depositFmt:    `-${fc(depositAmount, symbol)}`,
    roomCharges:   Array.isArray(roomCharges) ? roomCharges : [],
    chargesLabel:  t('chargesReceiptLabel'),
    symbol,
    totalDueFmt:   fc(totalDue, symbol),
    pmLabel: paymentMethod
      ? (PM_LABELS[paymentMethod]?.[locale] ?? PM_LABELS[paymentMethod]?.en ?? paymentMethod)
      : '—',
    thankyou:       THANK_YOU[locale] ?? THANK_YOU.en,
    receiptTitle:   t('coReceiptTitle'),
    dateLabel:      t('coReceiptDate'),
    guestLabel:     t('coReceiptGuest'),
    refLabel:       t('bookingRef'),
    stayLabel:      t('coStaySummary'),
    totalPaidLabel: t('coTotalPaid'),
    paymentLabel:   t('coReceiptPaymentMethod'),
  };

  function doPrint(format) {
    const html = buildReceiptHTML(d, format);
    const win  = window.open('', '_blank', 'width=720,height=800,menubar=no,toolbar=no');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  // ── Preview helpers (mirrors buildReceiptHTML layout) ──────────────────────
  const PreviewRow = ({ label, value, indent, credit }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '4px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.88rem', gap: 8,
    }}>
      <span style={{ color: indent ? '#64748b' : '#374151', paddingLeft: indent ? 12 : 0, flex: 1 }}>{label}</span>
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', color: credit ? '#166534' : '#1a2e14' }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, width: '100%', maxWidth: 500,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>

        {/* Toolbar */}
        <div style={{
          display: 'flex', gap: 8, padding: '12px 16px', flexShrink: 0,
          borderBottom: '1px solid #e2e8f0', alignItems: 'center', background: '#f8fafc',
        }}>
          <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>
            {t('coPrintReceipt')}
          </span>
          <button onClick={() => doPrint('a4')}      style={btnStyle('#1a4710', '#fff')}>
            {t('printA4')}
          </button>
          <button onClick={() => doPrint('receipt')} style={btnStyle('#0f172a', '#fff')}>
            {t('print80mm')}
          </button>
          <button onClick={onClose} style={btnStyle('#f1f5f9', '#374151', '#e2e8f0')}>
            {t('cancel')}
          </button>
        </div>

        {/* Scrollable receipt preview */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid #1a4710', paddingBottom: 12, marginBottom: 16 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d="M17 8C8 10 5.9 16.17 3.82 19.34C2.7 21.07 2 21 2 21C2 21 3.5 13 10 10C10 10 6 14 6 19C6 19 10.5 11 20 9C22 8.5 22 6 20 4C18 2 12 3 12 3C12 3 18 4 17 8Z" fill="#1a4710"/>
            </svg>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1a2e14', marginTop: 4 }}>
              {d.propertyName}
            </div>
            {d.propertyAddress && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{d.propertyAddress}</div>
            )}
            {(d.propertyCity || d.propertyCountry) && (
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                {[d.propertyCity, d.propertyCountry].filter(Boolean).join(', ')}
              </div>
            )}
            <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: 6, fontWeight: 500 }}>
              {d.receiptTitle}
            </div>
          </div>

          <PreviewRow label={d.dateLabel}  value={d.today} />
          <PreviewRow label={d.guestLabel} value={d.guestName} />
          <PreviewRow label={d.refLabel}   value={d.bookingRef} />

          <hr style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />

          <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
            {d.stayLabel}
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a2e14', padding: '2px 0' }}>{d.roomName}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', paddingLeft: 12, padding: '2px 0' }}>{d.checkInOut}</div>
          <PreviewRow label={`  ${d.nightsLine}`} value={d.roomSubtotalFmt} indent />

          {d.breakfastFree && (
            <PreviewRow label={`  ${d.breakfastLabel}`} value={d.breakfastComplimentary} indent credit />
          )}
          {d.breakfastCharged && (
            <PreviewRow label={`  ${d.breakfastChargeLine}`} value={d.breakfastSubtotalFmt} indent />
          )}
          {d.depositPaidLine && (
            <PreviewRow label={`  ${d.depositLabel}`} value={d.depositFmt} indent credit />
          )}

          {d.roomCharges.length > 0 && (
            <>
              <hr style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />
              <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                {d.chargesLabel}
              </div>
              {d.roomCharges.map((c) => (
                <PreviewRow
                  key={c.id}
                  label={`  ${c.category_icon ? c.category_icon + ' ' : ''}${c.description || c.category_name || ''}`}
                  value={fc(c.amount, symbol)}
                  indent
                />
              ))}
            </>
          )}

          <hr style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '8px 0', borderTop: '2px solid #1a4710',
          }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1a2e14' }}>{d.totalPaidLabel}</span>
            <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#1a4710' }}>{d.totalDueFmt}</span>
          </div>
          <PreviewRow label={d.paymentLabel} value={d.pmLabel} />

          <hr style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />

          <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#475569', margin: '10px 0 6px', lineHeight: 1.55 }}>
            {d.thankyou}
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#94a3b8' }}>
            Powered by NestBook
          </div>

        </div>
      </div>
    </div>
  );
}

function btnStyle(bg, color, border) {
  return {
    padding: '7px 13px', borderRadius: 6, border: `1.5px solid ${border ?? bg}`,
    background: bg, color, fontWeight: 600, fontSize: '0.82rem',
    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  };
}
