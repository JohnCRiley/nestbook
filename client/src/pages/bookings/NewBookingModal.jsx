import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { nightsBetween } from '../../utils/format.js';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';


const SOURCE_OPTIONS = [
  { value: 'direct',      label: 'Direct' },
  { value: 'phone',       label: 'Phone' },
  { value: 'email',       label: 'Email' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'airbnb',      label: 'Airbnb' },
  { value: 'other',       label: 'Other' },
];

const EMPTY_FORM = {
  room_id:        '',
  guest_id:       '',
  check_in_date:  '',
  check_out_date: '',
  num_guests:     1,
  source:         'direct',
  notes:          '',
  total_price:    '',
};

/**
 * Modal form for creating a new booking.
 * Total price auto-calculates from room rate × nights whenever room or dates change.
 * Pass `initialValues` to pre-fill fields (e.g. from a calendar cell click).
 */
export default function NewBookingModal({ rooms, guests: initialGuests, onClose, onSuccess, initialValues }) {
  const { currencySymbol, property } = useLocale();
  const t = useT();
  const navigate = useNavigate();
  const [form,              setForm]              = useState({ ...EMPTY_FORM, ...initialValues });
  const [guests]                                  = useState(initialGuests);
  const [submitting,        setSubmitting]        = useState(false);
  const [error,             setError]             = useState(null);
  const [availabilityError, setAvailabilityError] = useState(null);

  // ── Auto-calculate total price ─────────────────────────────────────────────
  useEffect(() => {
    const room = rooms.find((r) => r.id === Number(form.room_id));
    if (
      room &&
      form.check_in_date &&
      form.check_out_date &&
      form.check_out_date > form.check_in_date
    ) {
      const nights = nightsBetween(form.check_in_date, form.check_out_date);
      setForm((prev) => ({ ...prev, total_price: room.price_per_night * nights }));
    }
  }, [form.room_id, form.check_in_date, form.check_out_date, rooms]);

  // ── Availability pre-flight check ──────────────────────────────────────────
  useEffect(() => {
    setAvailabilityError(null);
    if (!form.room_id || !form.check_in_date || !form.check_out_date) return;
    if (form.check_out_date <= form.check_in_date) return;
    const params = new URLSearchParams({
      room_id:        form.room_id,
      check_in_date:  form.check_in_date,
      check_out_date: form.check_out_date,
    });
    apiFetch(`/api/bookings/check?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data && !data.available) setAvailabilityError(t('roomNotAvailable')); })
      .catch(() => {});
  }, [form.room_id, form.check_in_date, form.check_out_date, t]);

  // ── Handle field changes ───────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.room_id || !form.guest_id || !form.check_in_date || !form.check_out_date) {
      setError(t('requiredFields'));
      return;
    }
    if (form.check_out_date <= form.check_in_date) {
      setError(t('checkoutAfterCheckin'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id:    property?.id ?? 1,
          room_id:        Number(form.room_id),
          guest_id:       Number(form.guest_id),
          check_in_date:  form.check_in_date,
          check_out_date: form.check_out_date,
          num_guests:     Number(form.num_guests),
          source:         form.source,
          notes:          form.notes || null,
          total_price:    form.total_price !== '' ? Number(form.total_price) : null,
          status:         'confirmed',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }

      onSuccess();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  // ── Derived values for hints ───────────────────────────────────────────────
  const selectedRoom   = rooms.find((r) => r.id === Number(form.room_id));
  const selectedGuest  = guests.find((g) => g.id === Number(form.guest_id));
  const nightsCount    =
    form.check_in_date && form.check_out_date && form.check_out_date > form.check_in_date
      ? nightsBetween(form.check_in_date, form.check_out_date)
      : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="New booking">

        {/* Header */}
        <div className="modal-header">
          <h2>{t('moNewTitle')}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            {error             && <div className="form-error">{error}</div>}
            {availabilityError && <div className="form-error">{availabilityError}</div>}

            <div className="form-grid">

              {/* Room */}
              <div className="form-group span-2">
                <label className="form-label">{t('moRoomLbl')} *</label>
                <select
                  name="room_id"
                  className="form-control"
                  value={form.room_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">{t('selectRoom')}</option>
                  {rooms
                    .filter((r) => r.status !== 'maintenance')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.type}) — {currencySymbol}{r.price_per_night}{t('perNight')} · {t('guestWord')(r.capacity)}
                      </option>
                    ))}
                </select>
              </div>

              {/* Guest */}
              <div className="form-group span-2">
                <label className="form-label">{t('moGuestLbl')} *</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    name="guest_id"
                    className="form-control"
                    value={form.guest_id}
                    onChange={handleChange}
                    required
                    style={{ flex: 1 }}
                  >
                    <option value="">{t('selectGuest')}</option>
                    {guests.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.first_name} {g.last_name}
                        {g.email ? ` — ${g.email}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-new-guest-inline"
                    onClick={() => navigate('/guests?newguest=true')}
                    title={t('newGuestTooltip')}
                  >
                    {t('newGuest')}
                  </button>
                </div>
                {selectedGuest?.notes && (
                  <div className="form-hint">Note: {selectedGuest.notes}</div>
                )}
              </div>

              {/* Check-in */}
              <div className="form-group">
                <label className="form-label">{t('moCinLbl')} *</label>
                <input
                  type="date"
                  name="check_in_date"
                  className="form-control"
                  value={form.check_in_date}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Check-out */}
              <div className="form-group">
                <label className="form-label">{t('moCoutLbl')} *</label>
                <input
                  type="date"
                  name="check_out_date"
                  className="form-control"
                  value={form.check_out_date}
                  min={form.check_in_date || undefined}
                  onChange={handleChange}
                  required
                />
                {nightsCount && (
                  <div className="form-hint">{t('nightWord')(nightsCount)}</div>
                )}
              </div>

              {/* Number of guests */}
              <div className="form-group">
                <label className="form-label">{t('moGuestsLbl')}</label>
                <input
                  type="number"
                  name="num_guests"
                  className="form-control"
                  value={form.num_guests}
                  min="1"
                  max={selectedRoom?.capacity ?? 10}
                  onChange={handleChange}
                />
                {selectedRoom && (
                  <div className="form-hint">{t('capacity')}: {selectedRoom.capacity}</div>
                )}
              </div>

              {/* Source */}
              <div className="form-group">
                <label className="form-label">{t('bookingSourceLabel')}</label>
                <select
                  name="source"
                  className="form-control"
                  value={form.source}
                  onChange={handleChange}
                >
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Total price */}
              <div className="form-group span-2">
                <label className="form-label">{t('totalPriceLabel')} ({currencySymbol})</label>
                <input
                  type="number"
                  name="total_price"
                  className="form-control"
                  value={form.total_price}
                  min="0"
                  step="0.01"
                  onChange={handleChange}
                  placeholder={t('autoCalcHint')}
                />
                {selectedRoom && nightsCount && (
                  <div className="form-hint">
                    {currencySymbol}{selectedRoom.price_per_night}/night × {nightsCount} nights
                    = {currencySymbol}{selectedRoom.price_per_night * nightsCount}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="form-group span-2">
                <label className="form-label">{t('moNotesLbl')}</label>
                <textarea
                  name="notes"
                  className="form-control"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder={t('notesPlaceholder')}
                  style={{ resize: 'vertical' }}
                />
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !!availabilityError}>
              {submitting ? t('creating') : t('createBooking')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
