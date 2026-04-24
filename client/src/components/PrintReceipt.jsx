import { useRef } from 'react';
import { useT } from '../i18n/LocaleContext.jsx';

const LOCALE_MAP = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', nl: 'nl-NL' };

const PM_LABELS = {
  cash:          { en: 'Cash', fr: 'Espèces', es: 'Efectivo', de: 'Bargeld', nl: 'Contant' },
  card:          { en: 'Card', fr: 'Carte', es: 'Tarjeta', de: 'Karte', nl: 'Kaart' },
  bank_transfer: { en: 'Bank Transfer', fr: 'Virement bancaire', es: 'Transferencia bancaria', de: 'Banküberweisung', nl: 'Bankoverschrijving' },
  other:         { en: 'Other', fr: 'Autre', es: 'Otro', de: 'Andere', nl: 'Anders' },
};

const THANK_YOU = {
  en: 'Thank you for staying with us. We hope to welcome you again soon.',
  fr: 'Merci pour votre séjour. Nous espérons vous accueillir à nouveau très prochainement.',
  es: 'Gracias por su estancia. Esperamos darle la bienvenida de nuevo muy pronto.',
  de: 'Vielen Dank für Ihren Aufenthalt. Wir freuen uns, Sie bald wieder bei uns begrüßen zu dürfen.',
  nl: 'Bedankt voor uw verblijf. Wij hopen u snel weer te mogen verwelkomen.',
};

function fmtDate(dateStr, locale = 'en') {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtCur(amount, symbol) {
  if (amount == null) return '—';
  return `${symbol}${Number(amount).toFixed(2)}`;
}

/**
 * PrintReceipt — renders a print-friendly guest receipt.
 * Supports A4 and 80mm receipt-printer widths.
 */
export default function PrintReceipt({
  booking: b, property,
  nights, pricePerNight, roomSubtotal,
  breakfastFree, breakfastCharged, breakfastSubtotal, bfPricePerPerson,
  depositPaid, depositAmount, totalDue,
  paymentMethod,
  onClose,
}) {
  const t = useT();
  const printRef = useRef(null);
  const locale   = property?.locale ?? 'en';
  const symbol   = { EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' }[property?.currency ?? 'EUR'] ?? '€';
  const thankyou = THANK_YOU[locale] ?? THANK_YOU.en;
  const pmLabel  = paymentMethod ? (PM_LABELS[paymentMethod]?.[locale] ?? PM_LABELS[paymentMethod]?.en ?? paymentMethod) : '—';
  const today    = new Date().toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  function doPrint(format) {
    const cls = format === 'receipt' ? 'nb-print-receipt' : 'nb-print-a4';
    if (printRef.current) printRef.current.className = `nb-receipt-wrap ${cls}`;
    window.print();
    if (printRef.current) printRef.current.className = 'nb-receipt-wrap nb-print-a4';
  }

  return (
    <>
      {/* Print CSS injected into document head via a style tag rendered into the DOM */}
      <style>{`
        @media print {
          body > *:not(#nb-print-root) { display: none !important; }
          #nb-print-root { display: block !important; }
          .nb-receipt-wrap { box-shadow: none !important; border: none !important; }
          .nb-print-actions { display: none !important; }
        }
        .nb-print-receipt .nb-receipt-page { width: 80mm; font-size: 11px; }
        .nb-print-a4 .nb-receipt-page { width: 148mm; font-size: 13px; }
      `}</style>

      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>
        <div style={{
          background: '#fff', borderRadius: 10, maxWidth: 560, width: '100%',
          maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
        }}>

          {/* Toolbar */}
          <div className="nb-print-actions" style={{
            display: 'flex', gap: 8, padding: '12px 16px',
            borderBottom: '1px solid #e2e8f0', alignItems: 'center',
          }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>
              {t('coPrintReceipt')}
            </span>
            <button
              onClick={() => doPrint('a4')}
              style={btnStyle('#1a4710', '#fff')}
            >
              {t('printA4')}
            </button>
            <button
              onClick={() => doPrint('receipt')}
              style={btnStyle('#0f172a', '#fff')}
            >
              {t('print80mm')}
            </button>
            <button onClick={onClose} style={btnStyle('#f8fafc', '#374151', '#e2e8f0')}>
              {t('cancel')}
            </button>
          </div>

          {/* Receipt body */}
          <div id="nb-print-root" ref={printRef} className="nb-receipt-wrap nb-print-a4"
            style={{ padding: '20px 24px' }}>
            <div className="nb-receipt-page" style={{ margin: '0 auto' }}>

              {/* Property header */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                {/* Leaf logo */}
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 6 }}>
                  <path d="M17 8C8 10 5.9 16.17 3.82 19.34C2.7 21.07 2 21 2 21C2 21 3.5 13 10 10C10 10 6 14 6 19C6 19 10.5 11 20 9C22 8.5 22 6 20 4C18 2 12 3 12 3C12 3 18 4 17 8Z" fill="#1a4710"/>
                </svg>
                <div style={{ fontWeight: 800, fontSize: '1.15em', color: '#1a2e14', letterSpacing: '-0.3px' }}>
                  {property?.name ?? 'Property'}
                </div>
                {property?.address && (
                  <div style={{ fontSize: '0.8em', color: '#64748b', marginTop: 2 }}>{property.address}</div>
                )}
                {(property?.city || property?.country) && (
                  <div style={{ fontSize: '0.8em', color: '#64748b' }}>
                    {[property.city, property.country].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>

              <Divider />

              {/* Receipt title */}
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1em', color: '#1a2e14', margin: '12px 0 8px' }}>
                {t('coReceiptTitle')}
              </div>

              <Row label={t('coReceiptDate')}      value={today} />
              <Row label={t('coReceiptGuest')}     value={`${b.guest_first_name} ${b.guest_last_name}`} />
              <Row label={t('bookingRef')}          value={`#${b.id}`} />

              <Divider />

              {/* Itemised breakdown */}
              <Row label={`${b.room_name ?? t('roomDeleted')} (${b.room_type ?? ''})`} value="" />
              <Row
                label={`  ${b.check_in_date} → ${b.check_out_date}`}
                value=""
                small
              />
              <Row
                label={`  ${nights} × ${fmtCur(pricePerNight, symbol)}`}
                value={fmtCur(roomSubtotal, symbol)}
              />

              {breakfastFree && (
                <Row label={`  ${t('fBreakfast')}`} value={t('coComplimentary')} />
              )}

              {breakfastCharged && (
                <Row
                  label={`  ${t('addBreakfastLabel')} (${b.num_guests || 1} × ${nights} × ${fmtCur(bfPricePerPerson, symbol)})`}
                  value={fmtCur(breakfastSubtotal, symbol)}
                />
              )}

              {depositPaid && depositAmount > 0 && (
                <Row
                  label={`  ${t('depositPaidPill')}`}
                  value={`-${fmtCur(depositAmount, symbol)}`}
                  valueStyle={{ color: '#166534' }}
                />
              )}

              <Divider />

              {/* Total paid */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '8px 0 4px' }}>
                <span style={{ fontWeight: 800, fontSize: '1em', color: '#1a2e14' }}>{t('coTotalPaid')}</span>
                <span style={{ fontWeight: 800, fontSize: '1.2em', color: '#1a4710' }}>{fmtCur(totalDue, symbol)}</span>
              </div>
              <Row label={t('coReceiptPaymentMethod')} value={pmLabel} />

              <Divider />

              {/* Thank you */}
              <div style={{ textAlign: 'center', fontSize: '0.8em', color: '#4b5563', margin: '12px 0 16px', lineHeight: 1.5 }}>
                {thankyou}
              </div>

              {/* Powered by */}
              <div style={{ textAlign: 'center', fontSize: '0.65em', color: '#94a3b8', marginTop: 8 }}>
                Powered by NestBook
              </div>

            </div>
          </div>

        </div>
      </div>
    </>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px dashed #cbd5e1', margin: '8px 0' }} />;
}

function Row({ label, value, small, valueStyle }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0', fontSize: small ? '0.82em' : '0.88em' }}>
      <span style={{ color: '#374151', flex: 1 }}>{label}</span>
      {value !== '' && (
        <span style={{ fontWeight: 600, color: '#1a2e14', whiteSpace: 'nowrap', marginLeft: 8, ...valueStyle }}>{value}</span>
      )}
    </div>
  );
}

function btnStyle(bg, color, border) {
  return {
    padding: '7px 14px', borderRadius: 6, border: `1.5px solid ${border ?? bg}`,
    background: bg, color, fontWeight: 600, fontSize: '0.82rem',
    cursor: 'pointer', fontFamily: 'inherit',
  };
}
