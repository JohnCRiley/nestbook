import { BADGE_CLASS, BADGE_LABEL, SOURCE_LABELS } from '../../utils/bookingConstants.js';
import { formatDateMedium, nightsBetween, formatCurrency } from '../../utils/format.js';

/**
 * Slide-in panel showing full details for a selected booking.
 * Appears from the right; closed by clicking the backdrop or the × button.
 */
export default function BookingPanel({ booking: b, onClose, onStatusUpdate }) {
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  const perNight = b.price_per_night ?? (b.total_price && nights ? b.total_price / nights : null);

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
              {BADGE_LABEL[b.status] ?? b.status}
            </span>
          </div>
          <div className="panel-booking-ref">Booking #{b.id}</div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────── */}
        <div className="panel-scroll">
          <div className="panel-body">

            {/* Guest contact */}
            <div className="panel-section">
              <div className="panel-section-title">Guest</div>
              <PanelRow label="Name"  value={`${b.guest_first_name} ${b.guest_last_name}`} />
              <PanelRow label="Email" value={b.guest_email  ?? '—'} />
              <PanelRow label="Phone" value={b.guest_phone  ?? '—'} />
            </div>

            {/* Booking details */}
            <div className="panel-section">
              <div className="panel-section-title">Booking</div>
              <PanelRow label="Room"      value={`${b.room_name ?? '—'} (${b.room_type ?? ''})`} />
              <PanelRow label="Check-in"  value={formatDateMedium(b.check_in_date)} />
              <PanelRow label="Check-out" value={formatDateMedium(b.check_out_date)} />
              <PanelRow label="Duration"  value={`${nights} ${nights === 1 ? 'night' : 'nights'}`} />
              <PanelRow label="Guests"    value={`${b.num_guests} ${b.num_guests === 1 ? 'guest' : 'guests'}`} />
              <PanelRow label="Source"    value={SOURCE_LABELS[b.source] ?? b.source} />
              <PanelRow label="Created"   value={b.created_at ? formatDateMedium(b.created_at.slice(0, 10)) : '—'} />
            </div>

            {/* Notes */}
            {b.notes && (
              <div className="panel-section">
                <div className="panel-section-title">Notes</div>
                <div className="panel-notes">{b.notes}</div>
              </div>
            )}

            {/* Pricing */}
            <div className="panel-section">
              <div className="panel-section-title">Pricing</div>
              <div className="panel-price-callout">
                <div className="panel-price-main">{formatCurrency(b.total_price)}</div>
                {perNight && (
                  <div className="panel-price-detail">
                    {formatCurrency(perNight)}/night × {nights} {nights === 1 ? 'night' : 'nights'}
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

function StatusActions({ status, bookingId, onStatusUpdate }) {
  // Show contextual action buttons based on current booking status.
  if (status === 'arriving') {
    return (
      <div className="panel-actions">
        <button
          className="btn-panel-primary"
          onClick={() => onStatusUpdate(bookingId, 'checked_out')}
        >
          Mark as Checked Out
        </button>
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
          Check In Guest
        </button>
        <button
          className="btn-panel-danger"
          onClick={() => {
            if (window.confirm('Cancel this booking?')) {
              onStatusUpdate(bookingId, 'cancelled');
            }
          }}
        >
          Cancel Booking
        </button>
      </div>
    );
  }

  // checked_out or cancelled — no further actions
  return null;
}
