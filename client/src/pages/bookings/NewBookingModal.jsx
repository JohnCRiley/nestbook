import { useState, useEffect } from 'react';
import { nightsBetween } from '../../utils/format.js';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale } from '../../i18n/LocaleContext.jsx';

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
export default function NewBookingModal({ rooms, guests, onClose, onSuccess, initialValues }) {
  const { currencySymbol } = useLocale();
  const [form,       setForm]       = useState({ ...EMPTY_FORM, ...initialValues });
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

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
      setError('Please fill in all required fields.');
      return;
    }
    if (form.check_out_date <= form.check_in_date) {
      setError('Check-out must be after check-in.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id:    1,
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
          <h2>New Booking</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            {error && <div className="form-error">{error}</div>}

            <div className="form-grid">

              {/* Room */}
              <div className="form-group span-2">
                <label className="form-label">Room *</label>
                <select
                  name="room_id"
                  className="form-control"
                  value={form.room_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select a room…</option>
                  {rooms
                    .filter((r) => r.status !== 'maintenance')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.type}) — {currencySymbol}{r.price_per_night}/night · up to {r.capacity}{' '}
                        {r.capacity === 1 ? 'guest' : 'guests'}
                      </option>
                    ))}
                </select>
              </div>

              {/* Guest */}
              <div className="form-group span-2">
                <label className="form-label">Guest *</label>
                <select
                  name="guest_id"
                  className="form-control"
                  value={form.guest_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select a guest…</option>
                  {guests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.first_name} {g.last_name}
                      {g.email ? ` — ${g.email}` : ''}
                    </option>
                  ))}
                </select>
                {selectedGuest?.notes && (
                  <div className="form-hint">Note: {selectedGuest.notes}</div>
                )}
              </div>

              {/* Check-in */}
              <div className="form-group">
                <label className="form-label">Check-in *</label>
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
                <label className="form-label">Check-out *</label>
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
                  <div className="form-hint">{nightsCount} {nightsCount === 1 ? 'night' : 'nights'}</div>
                )}
              </div>

              {/* Number of guests */}
              <div className="form-group">
                <label className="form-label">Number of Guests</label>
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
                  <div className="form-hint">Max capacity: {selectedRoom.capacity}</div>
                )}
              </div>

              {/* Source */}
              <div className="form-group">
                <label className="form-label">Booking Source</label>
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
                <label className="form-label">Total Price ({currencySymbol})</label>
                <input
                  type="number"
                  name="total_price"
                  className="form-control"
                  value={form.total_price}
                  min="0"
                  step="0.01"
                  onChange={handleChange}
                  placeholder="Auto-calculated from room rate"
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
                <label className="form-label">Notes</label>
                <textarea
                  name="notes"
                  className="form-control"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Special requests, late arrival, etc."
                  style={{ resize: 'vertical' }}
                />
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
