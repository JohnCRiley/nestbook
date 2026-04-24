import { useState } from 'react';
import { nightsBetween } from '../../utils/format.js';
import { useT, useLocale } from '../../i18n/LocaleContext.jsx';
import PrintReceipt from '../../components/PrintReceipt.jsx';

const PAYMENT_METHODS = [
  { value: 'cash',          labelKey: 'pmCash'         },
  { value: 'card',          labelKey: 'pmCard'         },
  { value: 'bank_transfer', labelKey: 'pmBankTransfer' },
  { value: 'other',         labelKey: 'pmOther'        },
];

/**
 * CheckoutModal — shown when receptionist clicks "Check Out".
 * Calculates the full itemised bill and records payment method.
 *
 * Props:
 *   booking       — enriched booking object
 *   property      — property object (needs deposit_amount, breakfast_price, etc.)
 *   onConfirm(paymentMethod) — called when "Confirm checkout" is clicked
 *   onCancel      — close without checking out
 */
export default function CheckoutModal({ booking: b, property, onConfirm, onCancel }) {
  const t = useT();
  const { fmtCurrency, currencySymbol } = useLocale();
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [showReceipt,   setShowReceipt]   = useState(false);
  const [confirming,    setConfirming]    = useState(false);

  const nights          = nightsBetween(b.check_in_date, b.check_out_date);
  const pricePerNight   = b.price_per_night ?? 0;
  const roomSubtotal    = nights * pricePerNight;

  const breakfastFree    = !!(property?.breakfast_included || b.room_breakfast_included);
  const breakfastCharged = !!b.breakfast_added && !breakfastFree;
  const bfPricePerPerson = parseFloat(property?.breakfast_price) || 0;
  const bfStartDate      = b.breakfast_start_date || b.check_in_date;
  const bfDays           = breakfastCharged ? Math.max(1, nightsBetween(bfStartDate, b.check_out_date)) : 0;
  const bfGuests         = b.breakfast_start_date ? (b.breakfast_guests || 1) : (b.num_guests || 1);
  const breakfastSubtotal = breakfastCharged ? bfGuests * bfDays * bfPricePerPerson : 0;

  const depositPaid     = !!b.deposit_paid;
  const depositAmount   = parseFloat(property?.deposit_amount) || 0;
  const depositDeduction = depositPaid ? depositAmount : 0;

  const subtotal    = roomSubtotal + breakfastSubtotal;
  const totalDue    = Math.max(0, subtotal - depositDeduction);
  const outstanding = !depositPaid && depositAmount > 0 ? depositAmount : 0;

  const handleConfirm = async () => {
    if (!paymentMethod) return;
    setConfirming(true);
    await onConfirm(paymentMethod);
    setConfirming(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520,
        boxShadow: '0 8px 40px rgba(0,0,0,0.22)', overflow: 'hidden',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          background: '#1a4710', color: '#fff',
          padding: '18px 24px 14px',
        }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>
            {t('coTitle')} — {b.guest_first_name} {b.guest_last_name}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
            {b.room_name ?? t('roomDeleted')} &middot; {t('nightWord')(nights)}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Stay summary */}
          <Section title={t('coStaySummary')}>
            <LineRow label={t('moCinLbl')}    value={b.check_in_date} />
            <LineRow label={t('moCoutLbl')}   value={b.check_out_date} />
            <LineRow label={t('labelDuration')} value={t('nightWord')(nights)} />
            <LineRow label={t('coRatePerNight')}
              value={`${currencySymbol}${pricePerNight.toFixed(2)}`} />
            <LineRow label={t('coRoomSubtotal')}
              value={fmtCurrency(roomSubtotal)} bold />
          </Section>

          {/* Extras */}
          {(breakfastFree || breakfastCharged || b.notes) && (
            <Section title={t('coExtras')}>
              {breakfastFree && (
                <LineRow
                  label={t('fBreakfast')}
                  value={t('coComplimentary')}
                  valueStyle={{ color: '#166534', fontWeight: 600 }}
                />
              )}
              {breakfastCharged && (
                <LineRow
                  label={`${t('fBreakfast')} (${bfGuests} × ${bfDays} × ${currencySymbol}${bfPricePerPerson.toFixed(2)})`}
                  value={fmtCurrency(breakfastSubtotal)}
                />
              )}
              {b.notes && (
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6, padding: '6px 0 2px', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{t('moNotesLbl')}: </span>{b.notes}
                </div>
              )}
            </Section>
          )}

          {/* Deposit */}
          {(depositPaid || outstanding > 0) && (
            <Section title={t('depositPill')}>
              {depositPaid && (
                <LineRow
                  label={t('depositPaidPill')}
                  value={`-${fmtCurrency(depositAmount)}`}
                  valueStyle={{ color: '#166534', fontWeight: 600 }}
                />
              )}
              {outstanding > 0 && (
                <LineRow
                  label={t('coDepositOutstanding')}
                  value={fmtCurrency(outstanding)}
                  valueStyle={{ color: '#b45309', fontWeight: 700 }}
                />
              )}
            </Section>
          )}

          {/* Total */}
          <Section title={t('coTotal')}>
            {breakfastCharged && (
              <LineRow label={t('coSubtotal')} value={fmtCurrency(subtotal)} />
            )}
            {depositPaid && depositAmount > 0 && (
              <LineRow
                label={t('coLessDeposit')}
                value={`-${fmtCurrency(depositDeduction)}`}
                valueStyle={{ color: '#166534' }}
              />
            )}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0 4px', borderTop: '2px solid #1a4710', marginTop: 6,
            }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1a4710' }}>
                {t('coTotalDue')}
              </span>
              <span style={{ fontWeight: 800, fontSize: '1.3rem', color: '#1a4710' }}>
                {fmtCurrency(totalDue)}
              </span>
            </div>
            {outstanding > 0 && (
              <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: 4 }}>
                {t('coIncludingOutstanding')(fmtCurrency(outstanding))}
              </div>
            )}
          </Section>

          {/* Payment method */}
          <Section title={t('coPaymentMethod')}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PAYMENT_METHODS.map(({ value, labelKey }) => (
                <button
                  key={value}
                  onClick={() => setPaymentMethod(value)}
                  style={{
                    padding: '8px 16px', borderRadius: 6, fontSize: '0.88rem', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.12s',
                    background: paymentMethod === value ? '#1a4710' : '#f8fafc',
                    color:      paymentMethod === value ? '#fff'     : '#374151',
                    border:     paymentMethod === value ? '2px solid #1a4710' : '2px solid #e2e8f0',
                  }}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            {!paymentMethod && (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 6 }}>
                {t('coSelectPayment')}
              </div>
            )}
          </Section>

        </div>

        {/* Footer actions */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #e2e8f0',
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <button
            onClick={handleConfirm}
            disabled={!paymentMethod || confirming}
            style={{
              flex: 1, padding: '10px 20px', borderRadius: 7, border: 'none',
              background: paymentMethod ? '#1a4710' : '#d1d5db',
              color: '#fff', fontWeight: 700, fontSize: '0.95rem',
              cursor: paymentMethod ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {confirming ? t('coConfirming') : t('coConfirmCheckout')}
          </button>
          <button
            onClick={() => setShowReceipt(true)}
            style={{
              padding: '10px 16px', borderRadius: 7,
              background: '#f0fdf4', border: '1.5px solid #86efac',
              color: '#166534', fontWeight: 600, fontSize: '0.88rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('coPrintReceipt')}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 16px', borderRadius: 7,
              background: '#f8fafc', border: '1.5px solid #e2e8f0',
              color: '#64748b', fontWeight: 600, fontSize: '0.88rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('cancel')}
          </button>
        </div>
      </div>

      {/* Print receipt overlay */}
      {showReceipt && (
        <PrintReceipt
          booking={b}
          property={property}
          nights={nights}
          pricePerNight={pricePerNight}
          roomSubtotal={roomSubtotal}
          breakfastFree={breakfastFree}
          breakfastCharged={breakfastCharged}
          breakfastSubtotal={breakfastSubtotal}
          bfPricePerPerson={bfPricePerPerson}
          breakfastGuests={bfGuests}
          breakfastDays={bfDays}
          depositPaid={depositPaid}
          depositAmount={depositAmount}
          totalDue={totalDue}
          paymentMethod={paymentMethod}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function LineRow({ label, value, bold, valueStyle }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', fontSize: '0.88rem' }}>
      <span style={{ color: '#4b5563' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: '#1a2e14', ...valueStyle }}>{value}</span>
    </div>
  );
}
