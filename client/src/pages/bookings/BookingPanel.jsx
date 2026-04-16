import { BADGE_CLASS, SOURCE_LABELS } from '../../utils/bookingConstants.js';
import { formatDateMedium, nightsBetween } from '../../utils/format.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';

/**
 * Slide-in panel showing full details for a selected booking.
 * Appears from the right; closed by clicking the backdrop or the × button.
 */
export default function BookingPanel({ booking: b, onClose, onStatusUpdate, onEdit }) {
  const { fmtCurrency, locale } = useLocale();
  const t = useT();
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  const perNight = b.price_per_night ?? (b.total_price && nights ? b.total_price / nights : null);
  const statusLabel = { arriving: t('calLegendInHouse'), confirmed: t('confirmed'), checked_out: t('checkedOut'), cancelled: t('cancelled') }[b.status] ?? b.status;

  return (
    <>
      {/* Dimmed backdrop — click to close */}
      <div className="panel-backdrop" onClick={onClose} />

      <aside className="detail-panel" role="dialog" aria-label="Booking details">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="panel-header">
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="panel-guest-name">
            {b.guest_first_name} {b.guest_last_name}
          </div>
          <div style={{ marginBottom: 8 }}>
            <span className={BADGE_CLASS[b.status] ?? 'badge'}>
              {statusLabel}
            </span>
          </div>
          <div className="panel-booking-ref">{t('bookingRef')}{b.id}</div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────── */}
        <div className="panel-scroll">
          <div className="panel-body">

            {/* Guest contact */}
            <div className="panel-section">
              <div className="panel-section-title">{t('sectionGuest')}</div>
              <PanelRow label={t('labelName')}  value={`${b.guest_first_name} ${b.guest_last_name}`} />
              <PanelRow label={t('labelEmail')} value={b.guest_email  ?? '—'} />
              <PanelRow label={t('labelPhone')} value={b.guest_phone  ?? '—'} />
            </div>

            {/* Booking details */}
            <div className="panel-section">
              <div className="panel-section-title">{t('sectionBooking')}</div>
              <PanelRow label={t('labelRoom')}     value={`${b.room_name ?? '—'} (${b.room_type ?? ''})`} />
              <PanelRow label={t('moCinLbl')}      value={formatDateMedium(b.check_in_date, locale)} />
              <PanelRow label={t('moCoutLbl')}     value={formatDateMedium(b.check_out_date, locale)} />
              <PanelRow label={t('labelDuration')} value={t('nightWord')(nights)} />
              <PanelRow label={t('labelGuests')}   value={t('guestWord')(b.num_guests)} />
              <PanelRow label={t('labelSource')}   value={SOURCE_LABELS[b.source] ?? b.source} />
              <PanelRow label={t('labelCreated')}  value={b.created_at ? formatDateMedium(b.created_at.slice(0, 10), locale) : '—'} />
            </div>

            {/* Notes */}
            {b.notes && (
              <div className="panel-section">
                <div className="panel-section-title">{t('sectionNotes')}</div>
                <div className="panel-notes">{b.notes}</div>
              </div>
            )}

            {/* Pricing */}
            <div className="panel-section">
              <div className="panel-section-title">{t('sectionPricing')}</div>
              <div className="panel-price-callout">
                <div className="panel-price-main">{fmtCurrency(b.total_price)}</div>
                {perNight && (
                  <div className="panel-price-detail">
                    {fmtCurrency(perNight)}{t('perNight')} × {t('nightWord')(nights)}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <StatusActions
          status={b.status}
          bookingId={b.id}
          onStatusUpdate={onStatusUpdate}
          onEdit={onEdit}
        />

      </aside>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PanelRow({ label, value }) {
  return (
    <div className="panel-row">
      <span className="panel-row-label">{label}</span>
      <span className="panel-row-value">{value}</span>
    </div>
  );
}

function StatusActions({ status, bookingId, onStatusUpdate, onEdit }) {
  const t = useT();
  // Show contextual action buttons based on current booking status.
  if (status === 'arriving') {
    return (
      <div className="panel-actions">
        <button
          className="btn-panel-primary"
          onClick={() => onStatusUpdate(bookingId, 'checked_out')}
        >
          {t('markCheckedOut')}
        </button>
        {onEdit && (
          <button className="btn-panel-secondary" onClick={onEdit}>
            {t('editBookingLink')}
          </button>
        )}
      </div>
    );
  }

  if (status === 'confirmed') {
    return (
      <div className="panel-actions">
        <button
          className="btn-panel-primary"
          onClick={() => onStatusUpdate(bookingId, 'arriving')}
        >
          {t('checkInGuest')}
        </button>
        <button
          className="btn-panel-danger"
          onClick={() => {
            if (window.confirm(t('cancelBookingConfirm'))) {
              onStatusUpdate(bookingId, 'cancelled');
            }
          }}
        >
          {t('cancelBookingBtn')}
        </button>
        {onEdit && (
          <button className="btn-panel-secondary" onClick={onEdit}>
            {t('editBookingLink')}
          </button>
        )}
      </div>
    );
  }

  // checked_out or cancelled — show edit link if provided
  if (onEdit) {
    return (
      <div className="panel-actions">
        <button className="btn-panel-secondary" onClick={onEdit}>
          {t('editBookingLink')}
        </button>
      </div>
    );
  }

  return null;
}
