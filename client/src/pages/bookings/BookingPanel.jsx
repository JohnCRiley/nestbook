import { useState, useEffect, useCallback, useRef } from 'react';
import { BADGE_CLASS, SOURCE_LABELS } from '../../utils/bookingConstants.js';
import { formatDateMedium, nightsBetween, localToday, addDays } from '../../utils/format.js';
import { isEligibleForBreakfast } from '../../utils/breakfast.js';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';
import { usePlan } from '../../hooks/usePlan.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';
import DepositPill from '../../components/DepositPill.jsx';
import CheckoutModal from './CheckoutModal.jsx';
import PrintReceipt, { buildReceiptHTML, PM_LABELS, THANK_YOU, LOCALE_MAP } from '../../components/PrintReceipt.jsx';
import AddChargeModal from '../charges/AddChargeModal.jsx';

const SOURCE_OPTIONS = [
  { value: 'direct',      label: 'Direct' },
  { value: 'phone',       label: 'Phone' },
  { value: 'email',       label: 'Email' },
  { value: 'walk_in',     label: 'Walk-in' },
  { value: 'website',     label: 'Website' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'airbnb',      label: 'Airbnb' },
  { value: 'other',       label: 'Other' },
];

const STATUS_OPTIONS = ['confirmed', 'arriving', 'in_house', 'checked_out', 'cancelled', 'pending_owner_approval', 'declined'];

export default function BookingPanel({ booking: initialBooking, rooms = [], guests = [], onClose, onStatusUpdate, onSave }) {
  const { fmtCurrency, locale, property, currencySymbol } = useLocale();
  const t = useT();
  const [mode, setMode] = useState('view');
  const [localBooking, setLocalBooking] = useState(initialBooking);

  // Keep local state in sync when a *different* booking is opened
  useEffect(() => { setLocalBooking(initialBooking); setMode('view'); }, [initialBooking.id]);

  // Handle any booking update: update local state immediately + notify parent list
  const handleBookingUpdated = useCallback((updated) => {
    setLocalBooking(updated);
    if (onSave) onSave(updated);
  }, [onSave]);

  const b = localBooking;
  console.log('[BookingPanel] booking status:', b?.status, 'breakfast_added:', b?.breakfast_added);
  const nights   = nightsBetween(b.check_in_date, b.check_out_date);
  const isWP     = property?.rental_type === 'whole_property';
  const perNight = isWP
    ? (nights > 0 && b.total_price ? b.total_price / nights : null)
    : (b.price_per_night ?? (b.total_price && nights ? b.total_price / nights : null));
  const statusLabel = {
    arriving:               isWP ? 'Arriving today' : t('calLegendInHouse'),
    in_house:               'In stay',
    confirmed:              t('confirmed'),
    checked_out:            t('checkedOut'),
    cancelled:              t('cancelled'),
    pending_owner_approval: t('wpPendingApprovalStatus'),
    declined:               t('wpDeclinedStatus'),
  }[b.status] ?? b.status;

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />

      <aside className="detail-panel" role="dialog" aria-label="Booking details">

        <div className="panel-header">
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="panel-guest-name">
            {b.guest_first_name} {b.guest_last_name}
          </div>
          <div style={{ marginBottom: 8 }}>
            <span className={BADGE_CLASS[b.status] ?? 'badge'}>{statusLabel}</span>
          </div>
          <div className="panel-booking-ref">{t('bookingRef')}{b.id}</div>
        </div>

        <div className="panel-scroll">
          <div className="panel-body">
            {mode === 'view' ? (
              <ViewMode
                b={b} nights={nights} perNight={perNight}
                fmtCurrency={fmtCurrency} locale={locale} t={t}
                property={property} currencySymbol={currencySymbol}
                onStatusUpdate={onStatusUpdate}
                onEdit={() => setMode('edit')}
                onBookingUpdated={handleBookingUpdated}
              />
            ) : (
              <EditMode
                b={b} rooms={rooms} guests={guests}
                onCancel={() => setMode('view')}
                onSaved={(updated) => { handleBookingUpdated(updated); setMode('view'); }}
                t={t}
              />
            )}
          </div>
        </div>

      </aside>
    </>
  );
}

// ── View mode ─────────────────────────────────────────────────────────────────

function ViewMode({ b, nights, perNight, fmtCurrency, locale, t, property, currencySymbol, onStatusUpdate, onEdit, onBookingUpdated }) {
  const plan = usePlan();
  const { user } = useAuth();
  const [activeTab,          setActiveTab]          = useState('details');
  const [roomBreakdown,      setRoomBreakdown]      = useState(null);
  const [charges,            setCharges]            = useState(null); // null = not loaded
  const [categories,         setCategories]         = useState([]);
  const [addChargeFor,       setAddChargeFor]       = useState(null);
  const [showCancelConfirm,  setShowCancelConfirm]  = useState(false);
  const [showWPDeparture,       setShowWPDeparture]       = useState(false);
  const [showMarkAsPaidConfirm, setShowMarkAsPaidConfirm] = useState(false);
  const [markAsPaidWorking,     setMarkAsPaidWorking]     = useState(false);
  const [depositGateOpen,    setDepositGateOpen]    = useState(false);
  const [depositAction,      setDepositAction]      = useState(null);
  const [depositWorking,     setDepositWorking]     = useState(false);
  const [balanceWorking,          setBalanceWorking]          = useState(false);
  const [showMarkPaidFullConfirm, setShowMarkPaidFullConfirm] = useState(false);
  const [markPaidFullWorking,     setMarkPaidFullWorking]     = useState(false);
  const [toast,              setToast]              = useState(null);
  const [showCheckout,       setShowCheckout]       = useState(false);
  const [showReprint,        setShowReprint]        = useState(false);
  const [showRefund,         setShowRefund]         = useState(false);
  const [connectStatus,      setConnectStatus]      = useState(null);
  const checkedOutBookingRef = useRef(null);

  const showChargesTab = plan === 'multi';

  const depositRequired = !!property?.require_deposit;
  const isWP          = property?.rental_type === 'whole_property';
  const isHistorical  = ['checked_out', 'cancelled', 'declined', 'no_show'].includes(b.status);
  const storedRateBreakdown = b.rate_breakdown ? JSON.parse(b.rate_breakdown) : null;
  const useStoredTotal = !!(b.total_price && b.total_price > 0) && !storedRateBreakdown?.length && !(b.price_per_night > 0);
  const todayStr      = new Date().toISOString().split('T')[0];
  const canMarkArrived  = todayStr >= b.check_in_date;
  const canMarkDeparted = todayStr >= b.check_out_date;

  const cancellationDays   = property?.cancellation_days ?? 7;
  const daysUntilCheckIn   = Math.ceil((new Date(b.check_in_date) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
  const canFullyCancel     = daysUntilCheckIn > cancellationDays;
  const withinCancellationWindow = daysUntilCheckIn <= cancellationDays && daysUntilCheckIn > 0;
  const hasArrived         = daysUntilCheckIn <= 0;

  // Fetch room rate breakdown for accurate multi-period totals
  useEffect(() => {
    setRoomBreakdown(null);
    if (!b.room_id || !b.check_in_date || !b.check_out_date) return;
    apiFetch(`/api/rooms/${b.room_id}/rate-range?check_in=${b.check_in_date}&check_out=${b.check_out_date}`)
      .then(r => r.ok ? r.json() : null)
      .then(setRoomBreakdown)
      .catch(() => {});
  }, [b.room_id, b.check_in_date, b.check_out_date]);

  // Fetch charges eagerly so EstimatedTotal can include them
  useEffect(() => {
    if (plan !== 'multi') return;
    apiFetch(`/api/charges/booking/${b.id}?property_id=${b.property_id}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setCharges)
      .catch(() => setCharges([]));
  }, [b.id, plan]);

  // Check Stripe Connect status — only for owners, drives payment link visibility
  useEffect(() => {
    if (user?.role !== 'owner') return;
    apiFetch('/api/stripe/connect/status')
      .then(r => r.json())
      .then(setConnectStatus)
      .catch(() => {});
  }, [user?.role]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleRequestDeposit = async () => {
    setDepositWorking(true);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}/request-deposit`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      if (onBookingUpdated) onBookingUpdated(updated);
      showToast(t('depositRequestSent'));
    } catch {
      // silent
    } finally {
      setDepositWorking(false);
    }
  };

  const handleMarkDepositPaid = async () => {
    setDepositWorking(true);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}/mark-deposit-paid`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      if (onBookingUpdated) onBookingUpdated(updated);
      showToast(t('depositMarkedPaid'));
    } catch {
      // silent
    } finally {
      setDepositWorking(false);
    }
  };

  const handleResendDeposit = async () => {
    setDepositWorking(true);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}/resend-deposit`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      if (onBookingUpdated) onBookingUpdated(updated);
      showToast('Deposit request resent');
    } catch {
      // silent
    } finally {
      setDepositWorking(false);
    }
  };

  const handleMarkBalancePaid = async () => {
    setBalanceWorking(true);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}/mark-balance-paid`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      if (onBookingUpdated) onBookingUpdated(updated);
      showToast('Balance marked as received');
    } catch {
      // silent
    } finally {
      setBalanceWorking(false);
    }
  };

  const handleMarkPaidInFull = async () => {
    setMarkPaidFullWorking(true);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}/mark-paid-full`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      if (onBookingUpdated) onBookingUpdated(updated);
      setShowMarkPaidFullConfirm(false);
      showToast(t('booking.paidInFull'));
    } catch {
      // silent
    } finally {
      setMarkPaidFullWorking(false);
    }
  };

  const handleRefundConfirm = async (amount, reason) => {
    const res = await apiFetch(`/api/bookings/${b.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, reason }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Server error ${res.status}`);
    }
    const updated = await res.json();
    if (onBookingUpdated) onBookingUpdated(updated);
    setShowRefund(false);
    showToast(t('refundRecorded'));
  };

  // Intercept check-in: if deposit required but unpaid, show deposit gate
  const handleCheckIn = () => {
    if (depositRequired && !b.deposit_paid) {
      setDepositAction({ bookingId: b.id, newStatus: 'arriving' });
      setDepositGateOpen(true);
    } else {
      onStatusUpdate(b.id, 'arriving');
    }
  };

  // Checkout via modal
  const handleCheckoutConfirm = async (paymentMethod, shouldPrint) => {
    // Open print window NOW, inside the user-gesture call stack, before any await.
    // window.open() is blocked by popup blockers when called from async/useEffect.
    const printWin = shouldPrint
      ? window.open('', '_blank', 'width=720,height=800,menubar=no,toolbar=no')
      : null;

    const now = new Date().toISOString();
    const res = await apiFetch(`/api/bookings/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...b,
        status: 'checked_out',
        payment_method: paymentMethod,
        checked_out_at: now,
      }),
    });
    if (!res.ok) {
      if (printWin) printWin.close();
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Server error ${res.status}`);
    }
    const updated = await res.json();

    if (printWin) {
      const loc = property?.locale ?? 'en';
      const sym = { EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' }[property?.currency ?? 'EUR'] ?? '€';
      const fc  = (amount) => (amount == null ? '—' : `${sym}${Number(amount).toFixed(2)}`);

      const rpNights    = nightsBetween(b.check_in_date, b.check_out_date);
      const rpIsWP      = property?.rental_type === 'whole_property';
      const rpWPTotal   = parseFloat(b.total_price) || 0;
      const rpRate      = rpIsWP
        ? (rpNights > 0 ? rpWPTotal / rpNights : 0)
        : (b.price_per_night || (rpNights > 0 ? rpWPTotal / rpNights : 0));
      const rpRoom      = rpIsWP ? rpWPTotal : (roomBreakdown?.total ?? rpNights * rpRate);
      const rpStoredBd  = b.rate_breakdown ? JSON.parse(b.rate_breakdown) : null;
      const rpBdSource  = rpStoredBd ?? roomBreakdown?.breakdown ?? null;
      const rpSegments  = rpBdSource?.length > 0
        ? rpBdSource.map((seg) => ({
            label:       `${seg.nights} × ${fc(seg.ratePerNight)}${seg.periodName ? ` (${seg.periodName})` : ''}`,
            subtotalFmt: fc(seg.subtotal),
          }))
        : null;
      const rpBfFree    = !!(property?.breakfast_included || b.room_breakfast_included);
      const rpBfChg     = !!b.breakfast_added && !rpBfFree;
      const rpBfPrice   = parseFloat(b.breakfast_price_per_person) || parseFloat(property?.breakfast_price_per_person) || parseFloat(property?.breakfast_price) || 0;
      const bfStart     = b.breakfast_start_date || b.check_in_date;
      const rpBfDays    = rpBfChg ? Math.max(1, nightsBetween(bfStart, b.check_out_date)) : 0;
      const rpBfGuests  = b.breakfast_start_date ? (b.breakfast_guests || 1) : (b.num_guests || 1);
      const rpBfSub     = rpBfChg ? rpBfGuests * rpBfDays * rpBfPrice : 0;
      const rpDepPaid    = !!b.deposit_paid;
      const rpDepAmt     = parseFloat(property?.deposit_amount) || 0;
      const rpCharges    = charges?.filter((c) => !c.voided_at) ?? [];
      const rpChargeSub  = rpCharges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
      const rpSubtotal   = rpRoom + rpBfSub + rpChargeSub;
      const rpDepReqd    = property?.require_deposit === 1;
      const rpDepPdLine  = rpDepReqd && rpDepPaid && rpDepAmt > 0;
      const rpDepOutLine = rpDepReqd && !rpDepPaid  && rpDepAmt > 0;
      const rpRefund     = parseFloat(b.refund_amount) || 0;
      const rpGrandTotal = (rpDepPdLine  ? Math.max(0, rpSubtotal - rpDepAmt)
                         : rpDepOutLine ? rpSubtotal + rpDepAmt
                         : rpSubtotal) - rpRefund;

      const d = {
        locale: loc,
        propertyName:    property?.name    ?? '',
        propertyAddress: property?.address ?? '',
        propertyCity:    property?.city    ?? '',
        propertyCountry: property?.country ?? '',
        today: new Date().toLocaleDateString(LOCALE_MAP[loc] ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        guestName:   `${b.guest_first_name} ${b.guest_last_name}`,
        bookingRef:  `#${b.id}`,
        roomName:    `${b.room_name ?? t('roomDeleted')} (${b.room_type ?? ''})`,
        checkInOut:  `${b.check_in_date} → ${b.check_out_date}`,
        nightsLine:      rpSegments ? '' : `${rpNights} × ${fc(rpRate)}`,
        roomSubtotalFmt: fc(rpRoom),
        roomSegments:    rpSegments,
        breakfastFree: rpBfFree,
        breakfastLabel: t('fBreakfast'),
        breakfastComplimentary: t('coComplimentary'),
        breakfastCharged: rpBfChg,
        breakfastChargeLine: rpBfChg
          ? `${t('fBreakfast')} (${rpBfGuests} × ${rpBfDays} × ${fc(rpBfPrice)})`
          : '',
        breakfastSubtotalFmt: fc(rpBfSub),
        depositPaidLine:         rpDepPdLine,
        depositLabel:            t('depositPaidPill'),
        depositFmt:              `-${fc(rpDepAmt)}`,
        depositOutstandingLine:  rpDepOutLine,
        depositOutstandingFmt:   fc(rpDepAmt),
        depositOutstandingLabel: t('coDepositOutstanding'),
        subtotalFmt:             fc(rpSubtotal),
        subtotalLabel:           t('coSubtotal'),
        roomCharges: rpCharges,
        chargesLabel: t('chargesReceiptLabel'),
        symbol: sym,
        refundAmt:    rpRefund,
        refundReason: b.refund_reason ?? '',
        refundLabel:  t('refundLine'),
        refundFmt:    rpRefund > 0 ? `-${fc(rpRefund)}` : null,
        totalDueFmt:    fc(rpGrandTotal),
        pmLabel: PM_LABELS[paymentMethod]?.[loc] ?? PM_LABELS[paymentMethod]?.en ?? paymentMethod ?? '—',
        thankyou: THANK_YOU[loc] ?? THANK_YOU.en,
        receiptTitle:   t('coReceiptTitle'),
        dateLabel:      t('coReceiptDate'),
        guestLabel:     t('coReceiptGuest'),
        refLabel:       t('bookingRef'),
        stayLabel:      t('coStaySummary'),
        totalPaidLabel: t('coTotalPaid'),
        totalDueLabel:  t('coTotalDue'),
        paymentLabel:   t('coReceiptPaymentMethod'),
      };

      const html = buildReceiptHTML(d, 'a4');
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      printWin.print();
    }

    checkedOutBookingRef.current = updated;
  };

  const handleWPAction = async (action) => {
    const wpAction = action === 'arriving' ? 'wp_checkin' : 'wp_departure';
    const res = await apiFetch(`/api/bookings/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _wp_action: wpAction }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    onBookingUpdated(updated);
  };

  const handleCleaningStatus = async (status) => {
    const res = await apiFetch(`/api/bookings/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _wp_action: 'wp_cleaning', cleaning_status: status }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    onBookingUpdated(updated);
  };

  const handleMarkAsPaid = async () => {
    setMarkAsPaidWorking(true);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}/mark-paid`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        onBookingUpdated(updated);
        setShowMarkAsPaidConfirm(false);
        showToast('Payment confirmed — receipt sent to guest');
      } else {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? 'Failed to mark as paid');
      }
    } catch {
      showToast('Failed to mark as paid — please try again.');
    } finally {
      setMarkAsPaidWorking(false);
    }
  };

  return (
    <>
      {/* ── WP approval banner ───────────────────────────────────────────── */}
      {b.status === 'pending_owner_approval' && (
        <WpApprovalBanner bookingId={b.id} onBookingUpdated={onBookingUpdated} t={t} />
      )}

      {/* ── declined banner ─────────────────────────────────────────────── */}
      {b.status === 'declined' && (
        <div style={{
          padding: '12px 22px', borderBottom: '1px solid var(--border)',
          background: '#fee2e2', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: '1.1rem' }}>✕</span>
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#dc2626' }}>
            {t('wpDeclinedBannerMsg')}
          </span>
        </div>
      )}

      {/* ── Deposit strip ─────────────────────────────────────────────────── */}
      {depositRequired && (b.status === 'confirmed' || b.status === 'arriving' || b.status === 'in_house') && (
        <div style={{
          padding: '10px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DepositPill booking={b} property={property} />
            {!!b.deposit_paid && b.deposit_paid_at && (
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {t('depositPaidOn')} {formatDateMedium(b.deposit_paid_at.slice(0, 10), locale)}
              </span>
            )}
          </div>
          {!b.deposit_paid && (
            <div style={{ display: 'flex', gap: 6 }}>
              {!b.deposit_requested_at && (
                <button
                  className="btn-panel-secondary"
                  style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                  onClick={handleRequestDeposit}
                  disabled={depositWorking}
                >
                  {t('booking.requestDeposit')}
                </button>
              )}
              <button
                className="btn-panel-primary"
                style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                onClick={handleMarkDepositPaid}
                disabled={depositWorking}
              >
                {t('booking.markPaid')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── WP Deposit & Balance tracking ────────────────────────────────── */}
      {isWP && property?.deposit_enabled && b.deposit_amount > 0 &&
        ['confirmed', 'arriving', 'in_house', 'checked_out'].includes(b.status) && (() => {
        const depPaid  = !!b.deposit_paid;
        const balPaid  = !!b.balance_paid;
        const balOwed  = (b.balance_amount ?? 0) > 0;
        const allPaid  = depPaid && (!balOwed || balPaid);
        const fc       = fmtCurrency;

        return (
          <div style={{
            padding: '12px 22px', borderBottom: '1px solid var(--border)',
            background: allPaid ? 'var(--light-green)' : 'var(--page-bg)',
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Deposit & Balance
            </div>

            {/* Deposit row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: balOwed ? 8 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                  background: depPaid ? '#d1fae5' : '#fef3c7',
                  color: depPaid ? '#065f46' : '#92400e',
                }}>
                  {depPaid ? '✓' : '○'} Deposit {fc(b.deposit_amount)}
                </span>
                {depPaid && b.deposit_paid_at && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {formatDateMedium(b.deposit_paid_at.slice(0, 10), locale)}
                  </span>
                )}
              </div>
              {!depPaid && !isHistorical && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {b.deposit_requested_at && (
                    <button
                      className="btn-panel-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                      onClick={handleResendDeposit}
                      disabled={depositWorking}
                    >
                      Resend
                    </button>
                  )}
                  <button
                    className="btn-panel-primary"
                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    onClick={handleMarkDepositPaid}
                    disabled={depositWorking}
                  >
                    Mark received
                  </button>
                </div>
              )}
            </div>

            {/* Balance row */}
            {balOwed && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                    background: balPaid ? '#d1fae5' : (depPaid ? '#fef3c7' : '#f1f5f9'),
                    color: balPaid ? '#065f46' : (depPaid ? '#92400e' : '#6b7280'),
                  }}>
                    {balPaid ? '✓' : '○'} Balance {fc(b.balance_amount)}
                  </span>
                  {balPaid && b.balance_paid_at && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {formatDateMedium(b.balance_paid_at.slice(0, 10), locale)}
                    </span>
                  )}
                </div>
                {!balPaid && depPaid && !isHistorical && (
                  <button
                    className="btn-panel-primary"
                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    onClick={handleMarkBalancePaid}
                    disabled={balanceWorking}
                  >
                    Mark received
                  </button>
                )}
              </div>
            )}

            {!allPaid && !isHistorical && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                <button
                  className="btn-panel-secondary"
                  style={{ fontSize: '0.75rem', padding: '5px 12px', width: '100%' }}
                  onClick={() => setShowMarkPaidFullConfirm(true)}
                  disabled={markPaidFullWorking}
                >
                  <i className="ti ti-circle-check" style={{ marginRight: 5 }} />
                  {t('booking.markPaidFull')}
                </button>
              </div>
            )}

            {allPaid && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#065f46', fontWeight: 600, marginTop: 6 }}>
                <i className="ti ti-circle-check" />
                {t('booking.paidInFull')}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Stripe payment link ──────────────────────────────────────────── */}
      {connectStatus?.status === 'active' && user?.role === 'owner' &&
        ['confirmed', 'arriving', 'in_house'].includes(b.status) && (
        <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('bookingPanel.sendPaymentLink')}
          </div>
          <PaymentLinkButton booking={b} t={t} />
        </div>
      )}

      {/* ── Breakfast strip ───────────────────────────────────────────────── */}
      {property?.rental_type !== 'whole_property' && (!!property?.breakfast_included || !!b.room_breakfast_included || !!b.breakfast_added) && (() => {
        const bfStartDate  = (!property?.breakfast_included && !b.room_breakfast_included && b.breakfast_start_date)
          ? b.breakfast_start_date
          : b.check_in_date;
        const firstMorning = addDays(bfStartDate, 1);
        const mornings     = nightsBetween(bfStartDate, b.check_out_date);
        const guests       = (!property?.breakfast_included && !b.room_breakfast_included && b.breakfast_guests)
          ? b.breakfast_guests
          : b.num_guests || 1;
        return (
          <div style={{
            padding: '8px 22px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: '0.82rem', color: 'var(--accent-dark)', fontWeight: 600,
            background: 'var(--light-green)',
          }}>
            {t('bfPanelSummary')(
              formatDateMedium(firstMorning, locale),
              formatDateMedium(b.check_out_date, locale),
              mornings,
              guests
            )}
          </div>
        );
      })()}

      {toast && (
        <div style={{
          margin: '10px 22px 0', padding: '7px 12px',
          background: 'var(--tint-bg)', border: '1px solid var(--tint-border)',
          borderRadius: 6, fontSize: '0.82rem', color: 'var(--tint-text)', fontWeight: 600,
        }}>
          {toast}
        </div>
      )}

      {/* Tab bar — Details / Charges (Multi only) */}
      {showChargesTab && (
        <div style={{
          display: 'flex', borderBottom: '2px solid #f1f5f9',
          margin: '0 22px', gap: 0,
        }}>
          {[['details', t('sectionBooking')], ['charges', isWP ? t('charges.propertyCharges') : t('chargesTabLabel')]].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'charges') {
                  if (charges === null) {
                    apiFetch(`/api/charges/booking/${b.id}?property_id=${b.property_id}`)
                      .then((r) => r.ok ? r.json() : [])
                      .then(setCharges)
                      .catch(() => setCharges([]));
                  }
                  if (categories.length === 0) {
                    apiFetch(`/api/charges/categories?property_id=${b.property_id}`)
                      .then((r) => r.ok ? r.json() : [])
                      .then(setCategories)
                      .catch(() => {});
                  }
                }
              }}
              style={{
                padding: '10px 14px', border: 'none', background: 'none',
                fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600,
                cursor: 'pointer', color: activeTab === tab ? 'var(--accent-dark)' : '#94a3b8',
                borderBottom: activeTab === tab ? '2px solid var(--accent-dark)' : '2px solid transparent',
                marginBottom: -2,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Charges tab content */}
      {showChargesTab && activeTab === 'charges' && (
        <div style={{ padding: '14px 22px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 12 }}>
            <i className="ti ti-receipt" style={{ marginRight: 6 }} />
            {isWP ? t('charges.propertyCharges') : t('charges.roomCharges')}
          </div>
          {charges === null ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{t('chargesLoading')}</div>
          ) : (
            <>
              {charges.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 14 }}>{t('chargesNoItems')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 14 }}>
                  {charges.map((c) => (
                    <div key={c.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: 10,
                      opacity: c.voided_at ? 0.45 : 1,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a2e14' }}>
                          {c.description || c.category_name || '—'}
                          {c.voided_at && (
                            <span style={{ marginLeft: 6, fontSize: '0.72rem', color: '#ef4444', fontWeight: 500 }}>
                              {t('chargesVoided')}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {c.charge_date} · {c.charged_by_name ?? ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--accent-dark)' }}>
                          {fmtCurrency(parseFloat(c.amount))}
                        </span>
                        {!c.voided_at && (user?.role === 'owner' || user?.role === 'reception') && (
                          <button
                            onClick={async () => {
                              console.log('[void-charge] chargeId:', c.id, 'property_id:', b.property_id);
                              try {
                                const res = await apiFetch(
                                  `/api/charges/${c.id}?property_id=${b.property_id}`,
                                  { method: 'DELETE' },
                                );
                                if (res.ok) {
                                  setCharges((prev) => prev.map((x) => x.id === c.id ? { ...x, voided_at: 'voided' } : x));
                                } else {
                                  const body = await res.json().catch(() => ({}));
                                  showToast(body.error ?? `Void failed (${res.status})`);
                                }
                              } catch {
                                showToast('Void failed — please try again.');
                              }
                            }}
                            style={{
                              background: 'none', border: '1px solid #fca5a5', borderRadius: 4,
                              color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer',
                              padding: '2px 8px', fontFamily: 'inherit',
                            }}
                          >
                            {t('chargesVoid')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700 }}>
                    <span style={{ color: '#374151' }}>{t('coTotal')}</span>
                    <span style={{ color: 'var(--accent-dark)' }}>
                      {fmtCurrency(charges.filter((c) => !c.voided_at).reduce((s, c) => s + parseFloat(c.amount), 0))}
                    </span>
                  </div>
                </div>
              )}
              {(user?.role === 'owner' || user?.role === 'reception' || user?.role === 'charges_staff') && b.status !== 'cancelled' && b.status !== 'checked_out' && (
                <button
                  onClick={() => setAddChargeFor({ booking_id: b.id, property_id: b.property_id, guest_first_name: b.guest_first_name, guest_last_name: b.guest_last_name, room_name: b.room_name })}
                  style={{
                    padding: '8px 16px', borderRadius: 7,
                    background: 'var(--tint-bg)', border: '1.5px solid var(--tint-border)',
                    color: 'var(--tint-text)', fontWeight: 600, fontSize: '0.85rem',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {t('chargesAddCharge')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Details tab content — hide when charges tab is active */}
      {(!showChargesTab || activeTab === 'details') && <>

      {(b.status === 'confirmed' || b.status === 'arriving' || b.status === 'in_house') && (
        isWP ? (
          <div style={{ padding: '14px 22px 10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Future confirmed WP booking — show status summary */}
            {b.status === 'confirmed' && !canMarkArrived && (
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                padding: '12px 16px', marginBottom: 2, fontSize: '0.85rem', color: '#166534',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <i className="ti ti-calendar-check" />
                  Booking confirmed
                </div>
                <div>Check-in: <strong>{formatDateMedium(b.check_in_date, locale)}</strong></div>
                <div>Check-out: <strong>{formatDateMedium(b.check_out_date, locale)}</strong></div>
                <div style={{ marginTop: 6, color: '#059669' }}>
                  Arrival confirmation available from {formatDateMedium(b.check_in_date, locale)}
                </div>
              </div>
            )}

            {/* Arrival button — unlocked on/after check-in date */}
            {b.status === 'confirmed' && (
              canMarkArrived ? (
                <button
                  onClick={() => handleWPAction('arriving')}
                  style={{
                    background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10,
                    padding: '14px 20px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', justifyContent: 'center',
                  }}
                >
                  <i className="ti ti-home-check" style={{ fontSize: '1.2rem' }} />
                  Guests have arrived and have the key
                </button>
              ) : (
                <div style={{
                  background: 'var(--page-bg)', border: '1.5px solid var(--border)', borderRadius: 10,
                  padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10,
                  color: 'var(--text-muted)', fontSize: '0.88rem',
                }}>
                  <i className="ti ti-lock" style={{ fontSize: '1.1rem' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Arrival confirmation locked</div>
                    <div style={{ fontSize: '0.78rem', marginTop: 2 }}>
                      Available from {formatDateMedium(b.check_in_date, locale)}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Departure button — unlocked on/after check-out date */}
            {(b.status === 'arriving' || b.status === 'in_house') && (
              canMarkDeparted ? (
                <button
                  onClick={() => setShowWPDeparture(true)}
                  style={{
                    background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10,
                    padding: '14px 20px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', justifyContent: 'center',
                  }}
                >
                  <i className="ti ti-door-exit" style={{ fontSize: '1.2rem' }} />
                  Guests have departed and returned the key
                </button>
              ) : (
                <div style={{
                  background: 'var(--page-bg)', border: '1.5px solid var(--border)', borderRadius: 10,
                  padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10,
                  color: 'var(--text-muted)', fontSize: '0.88rem',
                }}>
                  <i className="ti ti-lock" style={{ fontSize: '1.1rem' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Departure confirmation locked</div>
                    <div style={{ fontSize: '0.78rem', marginTop: 2 }}>
                      Available from {formatDateMedium(b.check_out_date, locale)}
                    </div>
                  </div>
                </div>
              )
            )}

          </div>
        ) : (
          <StatusActions
            status={b.status} bookingId={b.id}
            onStatusUpdate={onStatusUpdate} onEdit={onEdit} t={t}
            prominent
            onCancelClick={() => setShowCancelConfirm(true)}
            onCheckIn={handleCheckIn}
            onCheckOut={() => setShowCheckout(true)}
            canCheckIn={canMarkArrived}
            canCheckOut={canMarkDeparted}
            checkInDate={b.check_in_date}
            checkOutDate={b.check_out_date}
          />
        )
      )}

      {b.status === 'pending_owner_approval' && (
        <div className="panel-actions" style={{ padding: '14px 22px 10px', borderBottom: '1px solid var(--border)' }}>
          <button className="btn-panel-secondary" onClick={onEdit}>{t('booking.editBooking')}</button>
        </div>
      )}

      {/* ── Historical booking notice ───────────────────────────────────────── */}
      {isHistorical && (
        <div style={{
          background: 'var(--page-bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '12px 22px 0',
        }}>
          <i className="ti ti-archive" style={{ fontSize: '1rem' }} />
          {b.status === 'checked_out'
            ? 'This stay is complete — record only'
            : b.status === 'cancelled'
            ? 'This booking was cancelled'
            : b.status === 'declined'
            ? 'This booking was declined'
            : 'Historical record'}
        </div>
      )}

      {/* ── Mid-stay breakfast management ──────────────────────────────────── */}
      {['confirmed', 'arriving', 'in_house'].includes(b.status) && property?.rental_type !== 'whole_property' && !property?.breakfast_included && !b.room_breakfast_included && (
        <AddBreakfastSection
          b={b} property={property}
          onBookingUpdated={onBookingUpdated}
          t={t} fmtCurrency={fmtCurrency} currencySymbol={currencySymbol} locale={locale}
          showToast={showToast}
        />
      )}

      <div className="panel-section">
        <div className="panel-section-title">{t('sectionGuest')}</div>
        <PanelRow label={t('labelName')}  value={`${b.guest_first_name} ${b.guest_last_name}`} />
        <PanelRow label={t('labelEmail')} value={b.guest_email ?? '—'} />
        <PanelRow label={t('labelPhone')} value={b.guest_phone ?? '—'} />
      </div>

      <div className="panel-section">
        <div className="panel-section-title">{t('sectionBooking')}</div>
        <PanelRow label={t('labelRoom')}     value={b.room_name ? `${b.room_name} (${b.room_type ?? ''})` : t('roomDeleted')} />
        <PanelRow label={t('moCinLbl')}      value={formatDateMedium(b.check_in_date, locale)} />
        <PanelRow label={t('moCoutLbl')}     value={formatDateMedium(b.check_out_date, locale)} />
        <PanelRow label={t('labelDuration')} value={t('nightWord')(nights)} />
        <PanelRow label={t('labelGuests')}   value={t('guestWord')(b.num_guests)} />
        <PanelRow label={t('labelSource')}   value={SOURCE_LABELS[b.source] ?? b.source} />
        <PanelRow label={t('labelCreated')}  value={b.created_at ? formatDateMedium(b.created_at.slice(0, 10), locale) : '—'} />
      </div>

      {b.notes && (
        <div className="panel-section">
          <div className="panel-section-title">{t('sectionNotes')}</div>
          <div className="panel-notes">{b.notes}</div>
        </div>
      )}

      <div className="panel-section">
        <div className="panel-section-title">{t('sectionPricing')}</div>
        <div className="panel-price-callout">
          <div className="panel-price-main">{fmtCurrency(b.total_price)}</div>
          {!useStoredTotal && perNight > 0 && (
            <div className="panel-price-detail">
              {fmtCurrency(perNight)}{t('perNight')} × {t('nightWord')(nights)}
            </div>
          )}
        </div>
      </div>

      {/* Estimated total breakdown */}
      <EstimatedTotal b={b} nights={nights} property={property} fmtCurrency={fmtCurrency} currencySymbol={currencySymbol} t={t} charges={charges} roomBreakdown={roomBreakdown} />

      {/* Refund info — shown when a refund has been recorded */}
      {b.refund_amount > 0 && (
        <div style={{
          margin: '0 22px 10px', padding: '10px 14px', borderRadius: 7,
          background: 'var(--tint-bg)', border: '1px solid var(--tint-border)', fontSize: '0.84rem',
        }}>
          <span style={{ fontWeight: 700, color: 'var(--tint-text)' }}>{t('refundRecorded')}: </span>
          <span style={{ color: '#1a2e14' }}>
            {fmtCurrency(b.refund_amount)}
            {b.refund_reason ? ` — ${b.refund_reason}` : ''}
          </span>
        </div>
      )}

      {/* Record Refund button — owner only, checked-in or checked-out */}
      {user?.role === 'owner' && (b.status === 'arriving' || b.status === 'in_house' || b.status === 'checked_out') && (
        <div style={{ padding: '0 22px 10px' }}>
          <button
            onClick={() => setShowRefund(true)}
            style={{
              background: 'none', border: '1px solid #fca5a5', borderRadius: 6,
              padding: '6px 14px', fontSize: '0.82rem', color: '#b91c1c',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            {t('booking.recordRefund')}
          </button>
        </div>
      )}

      {/* Reprint receipt for checked-out bookings — IP mode only */}
      {!isWP && b.status === 'checked_out' && b.payment_method && (
        <div style={{ padding: '0 22px 10px' }}>
          <button
            onClick={() => setShowReprint(true)}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, padding: '6px 14px', fontSize: '0.82rem',
              color: '#374151', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('booking.reprintReceipt')}
          </button>
        </div>
      )}

      {/* ── WP cleaning status ───────────────────────────────────────────── */}
      {isWP && b.status === 'checked_out' && (
        <div style={{ margin: '0 22px 14px', border: '1.5px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{
            fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <i className="ti ti-brush" />
            Cleaning
          </div>

          {!b.cleaning_status && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => handleCleaningStatus('in_progress')}
                style={{
                  background: 'var(--tint-bg)', color: 'var(--accent)',
                  border: '1.5px solid var(--accent)', borderRadius: 8,
                  padding: '10px 16px', fontWeight: 600, fontSize: '0.88rem',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', justifyContent: 'center',
                }}
              >
                <i className="ti ti-brush" />
                Cleaning in progress
              </button>
              <button
                onClick={() => handleCleaningStatus('completed')}
                style={{
                  background: '#f0fdf4', color: '#166534',
                  border: '1.5px solid #bbf7d0', borderRadius: 8,
                  padding: '10px 16px', fontWeight: 600, fontSize: '0.88rem',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', justifyContent: 'center',
                }}
              >
                <i className="ti ti-circle-check" />
                Property cleaned and ready
              </button>
              <button
                onClick={() => handleCleaningStatus('not_required')}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0',
                }}
              >
                Guests cleaned themselves — skip
              </button>
            </div>
          )}

          {b.cleaning_status === 'in_progress' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
                padding: '10px 14px', fontSize: '0.85rem', color: '#92400e',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <i className="ti ti-brush" />
                Cleaning in progress
              </div>
              <button
                onClick={() => handleCleaningStatus('completed')}
                style={{
                  background: '#f0fdf4', color: '#166534',
                  border: '1.5px solid #bbf7d0', borderRadius: 8,
                  padding: '10px 16px', fontWeight: 600, fontSize: '0.88rem',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', justifyContent: 'center',
                }}
              >
                <i className="ti ti-circle-check" />
                Mark as cleaned and ready
              </button>
            </div>
          )}

          {b.cleaning_status === 'completed' && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
              padding: '10px 14px', fontSize: '0.85rem', color: '#166534',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <i className="ti ti-circle-check" />
              Property cleaned and ready for next guests
            </div>
          )}

          {b.cleaning_status === 'not_required' && (
            <div style={{
              background: 'var(--page-bg)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <i className="ti ti-circle-check" />
              Guests cleaned — property ready
            </div>
          )}
        </div>
      )}

      {!isHistorical && (
        <div className="panel-actions">
          <button className="btn-panel-secondary" onClick={onEdit}>{t('booking.editBooking')}</button>
          {!isWP && b.status === 'confirmed' && (
            <button
              className="btn-panel-danger"
              style={{ fontSize: '0.82rem', padding: '7px 12px' }}
              onClick={() => setShowCancelConfirm(true)}
            >
              {t('booking.cancelBooking')}
            </button>
          )}
        </div>
      )}

      {isWP && ['confirmed', 'pending_owner_approval'].includes(b.status) && (
        <div style={{ marginTop: 16 }}>
          {canFullyCancel && (
            <div>
              <button
                onClick={() => setShowCancelConfirm(true)}
                style={{
                  background: 'none',
                  border: '1.5px solid #fca5a5',
                  color: '#dc2626',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <i className="ti ti-x" />
                Cancel booking
              </button>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
                {daysUntilCheckIn} days until arrival — full cancellation available until {cancellationDays} days before
              </p>
            </div>
          )}
          {withinCancellationWindow && (
            <div style={{
              background: '#fef3c7',
              border: '1.5px solid #f59e0b',
              borderRadius: 10,
              padding: '14px 16px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontWeight: 700, fontSize: '0.85rem', color: '#92400e', marginBottom: 8,
              }}>
                <i className="ti ti-alert-triangle" />
                Within cancellation window
              </div>
              <p style={{ fontSize: '0.78rem', color: '#78350f', lineHeight: 1.5, marginBottom: 10 }}>
                Arrival is in {daysUntilCheckIn} day{daysUntilCheckIn !== 1 ? 's' : ''}.
                Full cancellation closed {cancellationDays} days before arrival.
                You can shorten the stay via Edit booking — the guest pays at least one night as a forfeit.
              </p>
              <button
                onClick={onEdit}
                style={{
                  background: '#f59e0b', color: 'white', border: 'none',
                  borderRadius: 7, padding: '8px 16px',
                  fontSize: '0.82rem', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <i className="ti ti-calendar-minus" />
                Edit booking to shorten stay
              </button>
            </div>
          )}
          {hasArrived && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <i className="ti ti-lock" style={{ fontSize: '0.85rem' }} />
              Guests have arrived — use Edit booking to make changes
            </div>
          )}
        </div>
      )}

      {/* ── WP payment tracking — checked_out ─────────────────────────── */}
      {isWP && b.status === 'checked_out' && (
        <div style={{ padding: '0 22px 14px' }}>
          {b.payment_status !== 'paid' ? (
            <>
              <div style={{
                background: '#fef3c7', border: '1.5px solid #f59e0b',
                borderRadius: 8, padding: '12px 16px', marginBottom: 10,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontWeight: 700, fontSize: '0.85rem', color: '#92400e', marginBottom: 4,
                }}>
                  <i className="ti ti-clock" />
                  Payment outstanding
                </div>
                <div style={{ fontSize: '0.78rem', color: '#78350f' }}>
                  Grand total:{' '}
                  <strong>
                    {fmtCurrency(
                      (parseFloat(b.total_price) || 0) +
                      (charges ?? []).filter((c) => !c.voided_at).reduce((s, c) => s + parseFloat(c.amount), 0)
                    )}
                  </strong>
                  {b.charges_email_sent && ' — A charges summary has been sent to the guest.'}
                </div>
              </div>
              <button
                onClick={() => setShowMarkAsPaidConfirm(true)}
                style={{
                  background: 'var(--accent)', color: 'white', border: 'none',
                  borderRadius: 8, padding: '12px 20px', fontWeight: 700,
                  fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                  width: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                }}
              >
                <i className="ti ti-circle-check" />
                Mark as paid — send receipt
              </button>
            </>
          ) : (
            <div style={{
              background: '#f0fdf4', border: '1.5px solid #d1fae5',
              borderRadius: 8, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: '0.85rem', fontWeight: 600, color: '#166534',
            }}>
              <i className="ti ti-circle-check" />
              Payment received · Receipt sent to guest
              {b.paid_at && (
                <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 'auto', fontSize: '0.75rem' }}>
                  {b.paid_at.slice(0, 10)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      </> /* end details tab */}

      <ConfirmModal
        isOpen={showCancelConfirm}
        title={t('booking.cancelBooking')}
        message={t('cancelBookingConfirm')}
        confirmLabel={t('booking.cancelBooking')}
        cancelLabel={t('cancel')}
        variant="danger"
        onConfirm={() => { setShowCancelConfirm(false); onStatusUpdate(b.id, 'cancelled'); }}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* ── WP departure confirmation with charges summary ────────────────── */}
      {showWPDeparture && (() => {
        const outstanding  = (charges ?? []).filter((c) => !c.voided_at);
        const chargesTotal = outstanding.reduce((s, c) => s + parseFloat(c.amount), 0);
        const bookingTotal = parseFloat(b.total_price) || 0;
        const msg = outstanding.length > 0 ? (
          <span>
            {b.guest_first_name} {b.guest_last_name} has departed and returned the key.
            <br /><br />
            <strong>Outstanding charges:</strong> {fmtCurrency(chargesTotal)}<br />
            <strong>Booking total:</strong> {fmtCurrency(bookingTotal)}<br />
            <strong>Grand total:</strong> {fmtCurrency(bookingTotal + chargesTotal)}<br /><br />
            Remember to collect payment from the guest if not already done.
          </span>
        ) : (
          <span>
            {b.guest_first_name} {b.guest_last_name} has departed and returned the key.
            <br /><br />
            <strong>Booking total:</strong> {fmtCurrency(bookingTotal)}
          </span>
        );
        return (
          <ConfirmModal
            isOpen={true}
            title="Confirm guest departure"
            message={msg}
            confirmLabel="Confirm departure"
            cancelLabel={t('cancel')}
            variant="warning"
            onConfirm={() => { setShowWPDeparture(false); handleWPAction('departed'); }}
            onCancel={() => setShowWPDeparture(false)}
          />
        );
      })()}

      {/* ── Checkout summary modal ────────────────────────────────────────── */}
      {showCheckout && (
        <CheckoutModal
          booking={b}
          property={property}
          charges={charges}
          roomBreakdown={roomBreakdown}
          onConfirm={handleCheckoutConfirm}
          onCancel={() => setShowCheckout(false)}
          onDone={() => {
            setShowCheckout(false);
            if (onBookingUpdated && checkedOutBookingRef.current) {
              onBookingUpdated(checkedOutBookingRef.current);
            }
          }}
        />
      )}

      {/* ── Reprint receipt ───────────────────────────────────────────────── */}
      {showReprint && (() => {
        const rpNights   = nightsBetween(b.check_in_date, b.check_out_date);
        const rpIsWP     = property?.rental_type === 'whole_property';
        const rpWPTotal  = parseFloat(b.total_price) || 0;
        const rpRate     = rpIsWP
          ? (rpNights > 0 ? rpWPTotal / rpNights : 0)
          : (b.price_per_night || (rpNights > 0 ? rpWPTotal / rpNights : 0));
        const rpRoom     = rpIsWP ? rpWPTotal : (roomBreakdown?.total ?? rpNights * rpRate);
        const rpBfFree   = !!(property?.breakfast_included || b.room_breakfast_included);
        const rpBfChg    = !!b.breakfast_added && !rpBfFree;
        const rpBfPrice  = parseFloat(b.breakfast_price_per_person) || parseFloat(property?.breakfast_price) || 0;
        const rpBfStart  = b.breakfast_start_date || b.check_in_date;
        const rpBfDays   = rpBfChg ? Math.max(1, nightsBetween(rpBfStart, b.check_out_date)) : 0;
        const rpBfGuests = b.breakfast_start_date ? (b.breakfast_guests || 1) : (b.num_guests || 1);
        const rpBfSub    = rpBfChg ? rpBfGuests * rpBfDays * rpBfPrice : 0;
        const rpDepPaid  = !!b.deposit_paid;
        const rpDepAmt   = parseFloat(property?.deposit_amount) || 0;
        const rpRoomChs  = charges?.filter((c) => !c.voided_at) ?? [];
        const rpChargeSb = rpRoomChs.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
        const rpRefund   = parseFloat(b.refund_amount) || 0;
        return (
          <PrintReceipt
            booking={b} property={property}
            nights={rpNights} pricePerNight={rpRate} roomSubtotal={rpRoom}
            roomBreakdown={roomBreakdown}
            breakfastFree={rpBfFree} breakfastCharged={rpBfChg}
            breakfastSubtotal={rpBfSub} bfPricePerPerson={rpBfPrice}
            breakfastGuests={rpBfGuests} breakfastDays={rpBfDays}
            depositPaid={rpDepPaid} depositAmount={rpDepAmt}
            roomCharges={rpRoomChs}
            paymentMethod={b.payment_method}
            refundAmount={rpRefund} refundReason={b.refund_reason}
            onClose={() => setShowReprint(false)}
          />
        );
      })()}

      {/* ── Refund modal ──────────────────────────────────────────────────── */}
      {showRefund && (
        <RefundModal
          booking={b}
          fmtCurrency={fmtCurrency}
          t={t}
          onConfirm={handleRefundConfirm}
          onClose={() => setShowRefund(false)}
        />
      )}

      {/* ── Deposit gate modal ─────────────────────────────────────────────── */}
      {depositGateOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '28px 28px 24px',
            maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 10, color: '#111827' }}>
              {t('depositGateTitle')}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#374151', marginBottom: 22, lineHeight: 1.55 }}>
              {t('depositGateMsg')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn-panel-primary"
                onClick={() => {
                  setDepositGateOpen(false);
                  handleMarkDepositPaid().then(() => onStatusUpdate(depositAction.bookingId, depositAction.newStatus));
                }}
              >
                {t('markPaidAndCheckIn')}
              </button>
              <button
                className="btn-panel-secondary"
                onClick={() => {
                  setDepositGateOpen(false);
                  onStatusUpdate(depositAction.bookingId, depositAction.newStatus);
                }}
              >
                {t('checkInWithoutDeposit')}
              </button>
              <button
                className="btn-secondary"
                style={{ border: '1.5px solid var(--border)', marginTop: 2 }}
                onClick={() => setDepositGateOpen(false)}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark as paid in full confirmation ──────────────────────────────── */}
      {showMarkPaidFullConfirm && (
        <ConfirmModal
          isOpen={true}
          title={t('booking.markPaidFull')}
          message={
            <span>
              {t('booking.paidInFullConfirm')}
              <br /><br />
              <strong>{b.guest_first_name} {b.guest_last_name} — {fmtCurrency(b.total_price)}</strong>
              <br />A receipt will be emailed to the guest.
            </span>
          }
          confirmLabel={t('booking.markPaidFull')}
          cancelLabel={t('cancel')}
          variant="success"
          busy={markPaidFullWorking}
          onConfirm={handleMarkPaidInFull}
          onCancel={() => setShowMarkPaidFullConfirm(false)}
        />
      )}

      {/* ── Mark as paid confirmation ────────────────────────────────────── */}
      {showMarkAsPaidConfirm && (() => {
        const outstanding  = (charges ?? []).filter((c) => !c.voided_at);
        const chargesTotal = outstanding.reduce((s, c) => s + parseFloat(c.amount), 0);
        const grandTotal   = (parseFloat(b.total_price) || 0) + chargesTotal;
        const msg = (
          <span>
            Mark this booking as paid and send a receipt to{' '}
            <strong>{b.guest_email}</strong>?
            <br /><br />
            <strong>Grand total: {fmtCurrency(grandTotal)}</strong>
            <br />A full itemised receipt will be emailed to the guest immediately.
          </span>
        );
        return (
          <ConfirmModal
            isOpen={true}
            title="Confirm payment received"
            message={msg}
            confirmLabel="Yes — mark paid and send receipt"
            cancelLabel={t('cancel')}
            variant="success"
            busy={markAsPaidWorking}
            onConfirm={handleMarkAsPaid}
            onCancel={() => setShowMarkAsPaidConfirm(false)}
          />
        );
      })()}

      {addChargeFor && categories.length > 0 && (
        <AddChargeModal
          booking={addChargeFor}
          categories={categories}
          onSaved={(charge) => {
            setAddChargeFor(null);
            setCharges((prev) => (prev ? [charge, ...prev] : [charge]));
          }}
          onClose={() => setAddChargeFor(null)}
        />
      )}
    </>
  );
}

// ── Edit mode ─────────────────────────────────────────────────────────────────

function EditMode({ b, rooms, guests, onCancel, onSaved, t }) {
  const { currencySymbol, fmtCurrency, locale, property } = useLocale();
  const isWP = property?.rental_type === 'whole_property';
  const [form, setForm] = useState({
    room_id:        b.room_id        ? String(b.room_id)  : '',
    guest_id:       b.guest_id       ? String(b.guest_id) : '',
    check_in_date:  b.check_in_date  ?? '',
    check_out_date: b.check_out_date ?? '',
    num_guests:     b.num_guests     ?? 1,
    status:         b.status         ?? 'confirmed',
    source:         b.source         ?? 'direct',
    notes:          b.notes          ?? '',
    total_price:    b.total_price    ?? '',
  });
  const [saving,             setSaving]             = useState(false);
  const [error,              setError]              = useState(null);
  const [showShortenConfirm, setShowShortenConfirm] = useState(false);
  const [checkingExtension,  setCheckingExtension]  = useState(false);
  const [extensionData,      setExtensionData]      = useState(null);
  const [showExtendConfirm,  setShowExtendConfirm]  = useState(false);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const doSave = async () => {
    setSaving(true);
    setError(null);
    setShowShortenConfirm(false);
    setShowExtendConfirm(false);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...b,
          room_id:        form.room_id ? Number(form.room_id) : b.room_id,
          guest_id:       form.guest_id ? Number(form.guest_id) : b.guest_id,
          check_in_date:  form.check_in_date,
          check_out_date: form.check_out_date,
          num_guests:     Number(form.num_guests),
          status:         form.status,
          source:         form.source,
          notes:          form.notes || null,
          total_price:    form.total_price !== '' ? Number(form.total_price) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      onSaved(await res.json());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.check_in_date || !form.check_out_date) { setError(t('requiredFields')); return; }
    if (form.check_out_date <= form.check_in_date)   { setError(t('checkoutAfterCheckin')); return; }
    if (form.check_out_date < b.check_out_date) {
      setShowShortenConfirm(true);
      return;
    }
    if (form.check_out_date > b.check_out_date) {
      setCheckingExtension(true);
      setError(null);
      try {
        const r = await apiFetch(`/api/bookings/${b.id}/check-extension?newCheckOut=${form.check_out_date}`);
        const data = await r.json();
        setCheckingExtension(false);
        if (!data.available) {
          setError(`Cannot extend — ${data.clash.guest} is already booked from ${data.clash.checkIn}.`);
          return;
        }
        setExtensionData(data);
        setShowExtendConfirm(true);
      } catch {
        setCheckingExtension(false);
        setError('Could not check availability. Please try again.');
      }
      return;
    }
    doSave();
  };

  const nightsCount = form.check_in_date && form.check_out_date && form.check_out_date > form.check_in_date
    ? nightsBetween(form.check_in_date, form.check_out_date) : null;
  const selectedRoom = rooms.find((r) => r.id === Number(form.room_id));

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">{t('booking.editBooking')}</div>

        {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="panel-edit-form">

          {rooms.length > 0 && (
            <div className="panel-field">
              <label className="panel-field-label">{t('moRoomLbl')}</label>
              <select name="room_id" className="panel-field-input" value={form.room_id} onChange={handleChange}>
                <option value="">{t('selectRoom')}</option>
                {rooms.filter((r) => r.status !== 'maintenance').map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                ))}
              </select>
            </div>
          )}

          {guests.length > 0 && (
            <div className="panel-field">
              <label className="panel-field-label">{t('moGuestLbl')}</label>
              <select name="guest_id" className="panel-field-input" value={form.guest_id} onChange={handleChange}>
                {guests.filter((g) => !g.deleted).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.blacklisted ? '[!] ' : ''}{g.first_name} {g.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="panel-field">
              <label className="panel-field-label">{t('moCinLbl')} *</label>
              <input type="date" name="check_in_date" className="panel-field-input"
                value={form.check_in_date} onChange={handleChange} />
            </div>
            <div className="panel-field">
              <label className="panel-field-label">{t('moCoutLbl')} *</label>
              <input type="date" name="check_out_date" className="panel-field-input"
                value={form.check_out_date} min={form.check_in_date || undefined} onChange={handleChange} />
              {nightsCount && <div className="panel-field-hint">{t('nightWord')(nightsCount)}</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="panel-field">
              <label className="panel-field-label">{t('moGuestsLbl')}</label>
              <input type="number" name="num_guests" className="panel-field-input"
                value={form.num_guests} min="1" max={selectedRoom?.capacity ?? 20} onChange={handleChange} />
            </div>
            <div className="panel-field">
              <label className="panel-field-label">{t('status')}</label>
              <select name="status" className="panel-field-input" value={form.status} onChange={handleChange}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {{
                      confirmed:              t('confirmed'),
                      arriving:               t('calLegendInHouse'),
                      checked_out:            t('checkedOut'),
                      cancelled:              t('cancelled'),
                      pending_owner_approval: t('wpPendingApprovalStatus'),
                      declined:               t('wpDeclinedStatus'),
                    }[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel-field">
            <label className="panel-field-label">{t('bookingSourceLabel')}</label>
            <select name="source" className="panel-field-input" value={form.source} onChange={handleChange}>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="panel-field">
            <label className="panel-field-label">{t('totalPriceLabel')} ({currencySymbol})</label>
            <input type="number" name="total_price" className="panel-field-input"
              value={form.total_price} min="0" step="0.01" onChange={handleChange}
              placeholder={t('autoCalcHint')} />
          </div>

          <div className="panel-field">
            <label className="panel-field-label">{t('moNotesLbl')}</label>
            <textarea name="notes" className="panel-field-input panel-field-textarea"
              value={form.notes} onChange={handleChange} rows={3} />
          </div>

        </div>
      </div>

      <div className="panel-actions">
        <button className="btn-panel-primary" onClick={handleSave} disabled={saving || checkingExtension}>
          {saving ? t('saving') : checkingExtension ? 'Checking availability…' : t('saveChanges')}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={saving || checkingExtension}
          style={{ border: '1.5px solid var(--border)' }}>
          {t('cancel')}
        </button>
      </div>

      {showShortenConfirm && (() => {
        const cutNights = nightsBetween(form.check_out_date, b.check_out_date);
        return (
          <ConfirmModal
            isOpen={true}
            title="Shorten this stay?"
            message={`Changing check-out from ${formatDateMedium(b.check_out_date, locale)} to ${formatDateMedium(form.check_out_date, locale)} — shortening by ${cutNights} night${cutNights !== 1 ? 's' : ''}.`}
            detail="The total will be recalculated and a notification email will be sent to the guest. Has the guest requested this change?"
            confirmLabel="Yes — shorten the stay"
            cancelLabel={t('cancel')}
            variant="warning"
            onConfirm={doSave}
            onCancel={() => setShowShortenConfirm(false)}
          />
        );
      })()}

      {showExtendConfirm && extensionData && (() => {
        const extra = extensionData.extraNights;
        const rateDetail = extensionData.segments.length > 1
          ? extensionData.segments.map(s =>
              `${s.nights} night${s.nights !== 1 ? 's' : ''} × ${fmtCurrency(s.rate)}`
            ).join(' + ')
          : `${extra} night${extra !== 1 ? 's' : ''} × ${fmtCurrency(extensionData.extraTotal / extra)}`;
        return (
          <ConfirmModal
            isOpen={true}
            title={`Extend stay by ${extra} night${extra !== 1 ? 's' : ''}?`}
            message={`${rateDetail} = ${fmtCurrency(extensionData.extraTotal)} extra. New total: ${fmtCurrency(extensionData.newTotal)}.`}
            detail="Has the guest agreed to the extra cost? A confirmation email will be sent to them."
            confirmLabel={`Yes — extend to ${formatDateMedium(form.check_out_date, locale)}`}
            cancelLabel={t('cancel')}
            variant="success"
            onConfirm={() => { setShowExtendConfirm(false); setExtensionData(null); doSave(); }}
            onCancel={() => { setShowExtendConfirm(false); setExtensionData(null); }}
          />
        );
      })()}
    </>
  );
}

// ── AddBreakfastSection ───────────────────────────────────────────────────────

function AddBreakfastSection({ b, property, onBookingUpdated, t, fmtCurrency, currencySymbol, locale, showToast }) {
  // bfMorning = morning date (the first morning breakfast is served)
  // stored breakfast_start_date = addDays(bfMorning, -1) — one night before the morning
  const minMorning  = addDays(localToday(), 1);              // earliest = next morning (can't add retroactively)
  const maxMorning  = b.check_out_date;                     // latest = departure morning
  const tomorrow    = addDays(localToday(), 1);
  const defaultMorning = tomorrow > maxMorning ? maxMorning : tomorrow < minMorning ? minMorning : tomorrow;

  const [editing,   setEditing]   = useState(false);
  const [bfMorning, setBfMorning] = useState(defaultMorning);
  const [bfGuests,  setBfGuests]  = useState(parseInt(b.num_guests, 10) || 1);
  const [bfPrice,   setBfPrice]   = useState(parseFloat(property?.breakfast_price) || 0);
  const [saving,    setSaving]    = useState(false);

  // servings = Math.max(1, nightsBetween(stored_date, checkout))
  // stored_date = morning - 1 day
  const servings     = bfMorning <= maxMorning
    ? Math.max(1, nightsBetween(addDays(bfMorning, -1), b.check_out_date))
    : 0;
  const bfGuestsNum  = parseInt(bfGuests, 10) || 1;
  const bfPriceNum   = parseFloat(bfPrice) || 0;
  const previewTotal = bfGuestsNum * servings * bfPriceNum;

  const handleAdd = async () => {
    setSaving(true);
    const res = await apiFetch(`/api/bookings/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...b,
        breakfast_added: 1,
        breakfast_start_date: addDays(bfMorning, -1),
        breakfast_guests: bfGuestsNum,
        breakfast_price_per_person: bfPriceNum,
      }),
    });
    if (res.ok) {
      if (onBookingUpdated) onBookingUpdated(await res.json());
      setEditing(false);
      showToast(t('bfSavedToast'));
    }
    setSaving(false);
  };

  const handleRemove = async () => {
    const res = await apiFetch(`/api/bookings/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...b,
        breakfast_added: 0,
        breakfast_start_date: null,
        breakfast_guests: 0,
      }),
    });
    if (res.ok) {
      if (onBookingUpdated) onBookingUpdated(await res.json());
      showToast(t('bfRemovedToast'));
    }
  };

  if (b.breakfast_added) {
    const storedStart = b.breakfast_start_date || b.check_in_date;
    const morningDate = addDays(storedStart, 1);
    const guests      = parseInt(b.breakfast_guests, 10) || parseInt(b.num_guests, 10) || 1;
    return (
      <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border)', background: 'var(--tint-bg)' }}>
        {!editing ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--tint-text)', fontWeight: 600 }}>
              {t('bfAddedFromInfo')(formatDateMedium(morningDate, locale), guests)}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 5, border: '1px solid var(--tint-border)', background: '#fff', color: 'var(--tint-text)', cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => { setEditing(true); setBfMorning(morningDate); setBfGuests(guests); }}
              >{t('bfModify')}</button>
              <button
                style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 5, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={handleRemove}
              >{t('booking.removeBreakfast')}</button>
            </div>
          </div>
        ) : (
          <AddBreakfastForm
            b={b} bfMorning={bfMorning} bfGuests={bfGuests} bfPrice={bfPrice}
            bfGuestsNum={bfGuestsNum} bfPriceNum={bfPriceNum}
            servings={servings} previewTotal={previewTotal}
            minMorning={minMorning} maxMorning={maxMorning}
            currencySymbol={currencySymbol} fmtCurrency={fmtCurrency}
            locale={locale} t={t} saving={saving}
            onMorningChange={setBfMorning} onGuestsChange={setBfGuests} onPriceChange={setBfPrice}
            onSave={handleAdd} onCancel={() => setEditing(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border)' }}>
      {!editing ? (
        <button
          style={{
            fontSize: '0.82rem', padding: '6px 14px', borderRadius: 6,
            border: '1.5px solid var(--tint-border)', background: 'var(--tint-bg)',
            color: 'var(--tint-text)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
          onClick={() => setEditing(true)}
        >{t('booking.addBreakfast')}</button>
      ) : (
        <AddBreakfastForm
          b={b} bfMorning={bfMorning} bfGuests={bfGuests} bfPrice={bfPrice}
          bfGuestsNum={bfGuestsNum} bfPriceNum={bfPriceNum}
          servings={servings} previewTotal={previewTotal}
          minMorning={minMorning} maxMorning={maxMorning}
          currencySymbol={currencySymbol} fmtCurrency={fmtCurrency}
          locale={locale} t={t} saving={saving}
          onMorningChange={setBfMorning} onGuestsChange={setBfGuests} onPriceChange={setBfPrice}
          onSave={handleAdd} onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function AddBreakfastForm({ b, bfMorning, bfGuests, bfPrice, bfGuestsNum, bfPriceNum, servings, previewTotal, minMorning, maxMorning, currencySymbol, fmtCurrency, locale, t, saving, onMorningChange, onGuestsChange, onPriceChange, onSave, onCancel }) {
  return (
    <div style={{ fontSize: '0.85rem' }}>
      <div style={{ fontWeight: 600, color: 'var(--tint-text)', marginBottom: 6 }}>{t('bfAddTitle')}</div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 10 }}>{t('bfMorningHint')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>{t('bfAddFrom')}</div>
          <input
            type="date"
            className="panel-field-input"
            value={bfMorning}
            min={minMorning}
            max={maxMorning}
            onChange={(e) => onMorningChange(e.target.value)}
          />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>{t('bfGuestCountLabel')}</div>
          <input
            type="number"
            className="panel-field-input"
            value={bfGuests}
            min={1}
            max={b.num_guests || 1}
            onChange={(e) => onGuestsChange(Number(e.target.value))}
          />
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>
          {t('bfPricePerPersonDay')} ({currencySymbol})
        </div>
        <input
          type="number"
          className="panel-field-input"
          value={bfPrice}
          min={0}
          step={0.01}
          onChange={(e) => onPriceChange(parseFloat(e.target.value) || 0)}
          style={{ maxWidth: 120 }}
        />
      </div>
      {servings > 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--tint-text)', marginBottom: 10, background: 'var(--tint-bg)', padding: '5px 8px', borderRadius: 5 }}>
          {t('bfPreviewCalc')(servings, bfGuestsNum, `${currencySymbol}${bfPriceNum.toFixed(2)}`, fmtCurrency(previewTotal))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn-panel-primary"
          style={{ fontSize: '0.82rem', padding: '7px 14px' }}
          onClick={onSave}
          disabled={saving || servings <= 0}
        >{saving ? t('saving') : t('booking.addBreakfast')}</button>
        <button
          className="btn-secondary"
          style={{ fontSize: '0.82rem', padding: '7px 12px', border: '1.5px solid var(--border)' }}
          onClick={onCancel}
        >{t('cancel')}</button>
      </div>
    </div>
  );
}

// ── EstimatedTotal ────────────────────────────────────────────────────────────

function EstimatedTotal({ b, nights, property, fmtCurrency, currencySymbol, t, charges, roomBreakdown }) {
  const isWP             = property?.rental_type === 'whole_property';
  const wpTotal          = parseFloat(b.total_price) || 0;
  const storedBreakdown  = b.rate_breakdown ? JSON.parse(b.rate_breakdown) : null;
  const useStoredTotal   = !!(b.total_price && b.total_price > 0) && !storedBreakdown?.length && !(b.price_per_night > 0);
  const displayBreakdown = storedBreakdown ?? roomBreakdown?.breakdown ?? null;
  const fallbackPerNight = isWP ? (nights > 0 ? wpTotal / nights : 0) : (b.price_per_night ?? 0);
  const roomSubtotal     = isWP ? wpTotal : (roomBreakdown?.total ?? (nights * fallbackPerNight));
  const breakfastFree    = !!(property?.breakfast_included || b.room_breakfast_included);
  const breakfastCharged = !!b.breakfast_added && !breakfastFree;
  const bfPrice          = parseFloat(b.breakfast_price_per_person) || parseFloat(property?.breakfast_price) || 0;
  const bfStartDate      = b.breakfast_start_date || b.check_in_date;
  const bfDays           = breakfastCharged ? Math.max(1, nightsBetween(bfStartDate, b.check_out_date)) : 0;
  const bfGuests         = b.breakfast_start_date ? (b.breakfast_guests || 1) : (b.num_guests || 1);
  const breakfastSub     = breakfastCharged ? bfGuests * bfDays * bfPrice : 0;
  const depositPaid      = !!b.deposit_paid;
  const depositAmount    = parseFloat(property?.deposit_amount) || 0;
  const chargesTotal     = Array.isArray(charges)
    ? charges.filter((c) => !c.voided_at).reduce((s, c) => s + parseFloat(c.amount), 0)
    : 0;
  const refundAmt        = parseFloat(b.refund_amount) || 0;
  const total            = Math.max(0, roomSubtotal + breakfastSub + chargesTotal - (depositPaid ? depositAmount : 0) - refundAmt);

  if (useStoredTotal) {
    return (
      <div className="panel-section">
        <div className="panel-section-title">{t('coEstimatedTotal')}</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
          {fmtCurrency(b.total_price)}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
          {t('booking.importedTotal')}
        </div>
      </div>
    );
  }

  if (!roomSubtotal && !breakfastCharged && !depositPaid && !chargesTotal) return null;

  return (
    <div className="panel-section">
      <div className="panel-section-title">{t('coEstimatedTotal')}</div>
      <div style={{ fontSize: '0.85rem' }}>
        {/* Room rows — one per rate-period segment */}
        {displayBreakdown?.length > 0 ? (
          displayBreakdown.map((seg, i) => (
            <ERow
              key={i}
              label={`${currencySymbol}${seg.ratePerNight.toFixed(2)} × ${t('nightWord')(seg.nights)}${seg.periodName ? ` (${seg.periodName})` : ''}`}
              value={fmtCurrency(seg.subtotal)}
            />
          ))
        ) : (
          <ERow label={`${currencySymbol}${fallbackPerNight.toFixed(2)} × ${t('nightWord')(nights)}`} value={fmtCurrency(roomSubtotal)} />
        )}
        {breakfastFree && <ERow label={t('fBreakfast')} value={t('coComplimentary')} valueColor="var(--tint-text)" />}
        {breakfastCharged && (
          <ERow
            label={`${t('fBreakfast')} (${bfGuests} × ${bfDays} × ${currencySymbol}${bfPrice.toFixed(2)})`}
            value={fmtCurrency(breakfastSub)}
          />
        )}
        {chargesTotal > 0 && (
          <ERow label={t('chargesTabLabel')} value={fmtCurrency(chargesTotal)} />
        )}
        {depositPaid && depositAmount > 0 && <ERow label={t('coLessDeposit')} value={`-${fmtCurrency(depositAmount)}`} valueColor="var(--tint-text)" />}
        {refundAmt > 0 && <ERow label={t('refundLine')} value={`-${fmtCurrency(refundAmt)}`} valueColor="var(--tint-text)" />}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid var(--accent-dark)', marginTop: 6, paddingTop: 6 }}>
          <span style={{ fontWeight: 700, color: 'var(--accent-dark)' }}>{t('coTotalDue')}</span>
          <span style={{ fontWeight: 800, color: 'var(--accent-dark)', fontSize: '1.05rem' }}>{fmtCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}

function ERow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: valueColor ?? '#1a2e14', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ── Status action buttons ─────────────────────────────────────────────────────

function StatusActions({ status, bookingId, onStatusUpdate, onEdit, t, prominent, onCancelClick, onCheckIn, onCheckOut, canCheckIn = true, canCheckOut = true, checkInDate, checkOutDate }) {
  const { locale } = useLocale();
  const wrapStyle = prominent
    ? { padding: '14px 22px 10px', borderBottom: '1px solid var(--border)', marginBottom: 0 }
    : {};
  const lockedTile = (label, hint) => (
    <div style={{
      background: 'var(--page-bg)', border: '1.5px solid var(--border)', borderRadius: 10,
      padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10,
      color: 'var(--text-muted)', fontSize: '0.88rem',
    }}>
      <i className="ti ti-lock" style={{ fontSize: '1.1rem' }} />
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: '0.78rem', marginTop: 2 }}>{hint}</div>}
      </div>
    </div>
  );

  if (status === 'confirmed') {
    return (
      <div className="panel-actions" style={wrapStyle}>
        {canCheckIn ? (
          <button
            className="btn-panel-primary"
            style={prominent ? { fontSize: '1rem', padding: '12px 20px' } : {}}
            onClick={onCheckIn ?? (() => onStatusUpdate(bookingId, 'arriving'))}
          >
            {t('booking.checkIn')}
          </button>
        ) : (
          lockedTile('Check-in locked', checkInDate ? `Available from ${formatDateMedium(checkInDate, locale)}` : null)
        )}
        {!prominent && <button className="btn-panel-danger" onClick={onCancelClick}>{t('booking.cancelBooking')}</button>}
        {!prominent && <button className="btn-panel-secondary" onClick={onEdit}>{t('booking.editBooking')}</button>}
      </div>
    );
  }

  if (status === 'arriving' || status === 'in_house') {
    return (
      <div className="panel-actions" style={wrapStyle}>
        {canCheckOut ? (
          <button
            className="btn-panel-primary"
            style={prominent ? { fontSize: '1rem', padding: '12px 20px' } : {}}
            onClick={onCheckOut}
          >
            {t('booking.checkOut')}
          </button>
        ) : (
          lockedTile('Check-out locked', checkOutDate ? `Available from ${formatDateMedium(checkOutDate, locale)}` : null)
        )}
        {!prominent && <button className="btn-panel-secondary" onClick={onEdit}>{t('booking.editBooking')}</button>}
      </div>
    );
  }

  if (!prominent) {
    return (
      <div className="panel-actions">
        <button className="btn-panel-secondary" onClick={onEdit}>{t('booking.editBooking')}</button>
      </div>
    );
  }

  return null;
}

function PanelRow({ label, value }) {
  return (
    <div className="panel-row">
      <span className="panel-row-label">{label}</span>
      <span className="panel-row-value">{value}</span>
    </div>
  );
}

// ── Refund modal ──────────────────────────────────────────────────────────────

// ── WP Approval Banner ────────────────────────────────────────────────────────

function WpApprovalBanner({ bookingId, onBookingUpdated, t }) {
  const [working, setWorking] = useState(null); // 'approve' | 'decline' | null
  const [error,   setError]   = useState(null);

  const handleAction = async (action) => {
    setWorking(action);
    setError(null);
    try {
      const newStatus = action === 'approve' ? 'confirmed' : 'declined';
      const res = await apiFetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, _wp_action: action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const updated = await res.json();
      if (onBookingUpdated) onBookingUpdated(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div style={{
      padding: '12px 22px', borderBottom: '1px solid var(--border)',
      background: '#fef3c7', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1.1rem' }}>⏳</span>
        <div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#b45309' }}>
            {t('wpPendingBannerTitle')}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#78350f' }}>
            {t('wpPendingBannerMsg')}
          </div>
        </div>
      </div>
      {error && (
        <div style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => handleAction('approve')}
          disabled={!!working}
          style={{
            padding: '7px 18px', borderRadius: 7, border: 'none',
            background: 'var(--accent)', color: '#fff',
            fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
            opacity: working ? 0.6 : 1,
          }}
        >
          {working === 'approve' ? '…' : t('wpApproveBtnLabel')}
        </button>
        <button
          onClick={() => handleAction('decline')}
          disabled={!!working}
          style={{
            padding: '7px 14px', borderRadius: 7, border: '1px solid #fca5a5',
            background: '#fff', color: '#dc2626',
            fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
            opacity: working ? 0.6 : 1,
          }}
        >
          {working === 'decline' ? '…' : t('wpDeclineBtnLabel')}
        </button>
      </div>
    </div>
  );
}

// ── Refund modal ──────────────────────────────────────────────────────────────

function RefundModal({ booking: b, fmtCurrency, t, onConfirm, onClose }) {
  const [amount,  setAmount]  = useState('');
  const [reason,  setReason]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError(t('refundAmount') + ' required'); return; }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(amt, reason.trim() || null);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '24px 24px 20px',
        maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4, color: '#111827' }}>
          {t('refundRecord')}
        </div>
        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 18 }}>
          {b.guest_first_name} {b.guest_last_name} — #{b.id}
          {b.refund_amount > 0 && (
            <span style={{ marginLeft: 8, color: '#b91c1c', fontWeight: 600 }}>
              ({t('refundRecorded')}: {fmtCurrency(b.refund_amount)})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              {t('refundAmount')}
            </label>
            <input
              type="number" min="0.01" step="0.01"
              className="form-control"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              {t('refundReason')}
            </label>
            <input
              className="form-control"
              placeholder="e.g. Noise complaint"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 10, fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            className="btn-panel-primary"
            style={{ flex: 1 }}
            onClick={handleSubmit}
            disabled={saving || !amount}
          >
            {saving ? '…' : t('refundConfirm')}
          </button>
          <button
            className="btn-panel-secondary"
            onClick={onClose}
            disabled={saving}
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stripe payment link button ─────────────────────────────────────────────
function PaymentLinkButton({ booking, t }) {
  const { currencySymbol } = useLocale();
  const [amount,  setAmount]  = useState(booking.total_price > 0 ? String(booking.total_price.toFixed(2)) : '');
  const [loading, setLoading] = useState(false);
  const [link,    setLink]    = useState(null);
  const [error,   setError]   = useState(null);

  if (booking.stripe_payment_status === 'paid') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
        background: '#d1fae5', color: '#065f46',
      }}>
        <i className="ti ti-circle-check" /> {t('billing.status.paid')}
      </span>
    );
  }

  async function generateLink() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const r    = await apiFetch(`/api/bookings/${booking.id}/create-payment-link`, {
        method: 'POST',
        body:   JSON.stringify({
          amount:      amt,
          description: `Booking #${booking.id} — ${booking.guest_first_name} ${booking.guest_last_name}`,
        }),
      });
      const data = await r.json();
      if (data.url) setLink(data.url);
      else setError(data.error || 'Failed to create link. Please try again.');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (link) {
    return (
      <div className="payment-link-box">
        <input readOnly value={link} onClick={(e) => e.target.select()} />
        <button onClick={() => navigator.clipboard.writeText(link)}>{t('common.copy')}</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>{currencySymbol}</span>
        <input
          type="number" min="0.01" step="0.01" value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{
            flex: 1, fontSize: '0.85rem', padding: '5px 8px',
            border: '1px solid var(--border)', borderRadius: 6,
            fontFamily: 'inherit',
          }}
          placeholder="0.00"
        />
        <button
          className="btn-panel-primary"
          style={{ fontSize: '0.78rem', padding: '5px 10px', whiteSpace: 'nowrap' }}
          onClick={generateLink}
          disabled={loading || !parseFloat(amount)}
        >
          {loading ? t('bookingPanel.generatingLink') : t('bookingPanel.sendPaymentLink')}
        </button>
      </div>
      {error && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{error}</span>}
    </div>
  );
}
