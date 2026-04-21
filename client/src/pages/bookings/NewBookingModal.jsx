import { useState, useEffect, useRef } from 'react';
import { nightsBetween } from '../../utils/format.js';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';

const SOURCE_OPTIONS = [
  { value: 'direct',      labelKey: 'sourceDirect'  },
  { value: 'phone',       labelKey: 'sourcePhone'   },
  { value: 'walk_in',     labelKey: 'sourceWalkIn'  },
  { value: 'website',     labelKey: 'sourceWebsite' },
  { value: 'airbnb',      label:    'Airbnb'        },
  { value: 'booking_com', label:    'Booking.com'   },
  { value: 'other',       labelKey: 'sourceOther'   },
];

const EMPTY = {
  firstName: '', lastName: '', email: '', phone: '',
  checkIn: '', checkOut: '',
  roomId: '',
  numGuests: 1, source: 'direct', totalPrice: '', notes: '',
};

/**
 * New booking modal — redesigned with smart guest search, sectioned layout,
 * and inline new-guest creation.
 *
 * Props unchanged for callers: rooms, onClose, onSuccess, initialValues.
 * `guests` prop is accepted but unused (kept for backward compat).
 */
export default function NewBookingModal({ rooms, onClose, onSuccess, initialValues }) {
  const { currencySymbol, property } = useLocale();
  const t = useT();

  const [form, setForm] = useState({
    ...EMPTY,
    checkIn:  initialValues?.check_in_date  ?? '',
    checkOut: initialValues?.check_out_date ?? '',
    roomId:   initialValues?.room_id ? String(initialValues.room_id) : '',
  });

  // ── Guest search ───────────────────────────────────────────────────────────
  const [guestId,           setGuestId]           = useState(null);
  const [selectedGuestName, setSelectedGuestName] = useState('');
  const [suggestions,       setSuggestions]       = useState([]);
  const [showSuggestions,   setShowSuggestions]   = useState(false);
  const searchDebounce  = useRef(null);
  const lastNameInputRef = useRef(null);
  const suggestionsRef   = useRef(null);

  // ── Room / availability ────────────────────────────────────────────────────
  const [bookedRoomIds,     setBookedRoomIds]     = useState(new Set());
  const [availabilityError, setAvailabilityError] = useState(null);

  // ── Submit state ───────────────────────────────────────────────────────────
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState(null);
  const [showDiscard,   setShowDiscard]   = useState(false);

  // ── Last name search — debounced ───────────────────────────────────────────
  useEffect(() => {
    if (guestId || form.lastName.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      apiFetch(`/api/guests?search=${encodeURIComponent(form.lastName)}&limit=8`)
        .then(r => r.ok ? r.json() : { guests: [] })
        .then(data => {
          const list = Array.isArray(data) ? data : (data.guests ?? []);
          const matches = list.filter(g => !g.deleted);
          setSuggestions(matches);
          setShowSuggestions(matches.length > 0);
        })
        .catch(() => {});
    }, 280);
    return () => clearTimeout(searchDebounce.current);
  }, [form.lastName, guestId]);

  // Close suggestions on outside click
  useEffect(() => {
    if (!showSuggestions) return;
    const close = (e) => {
      if (
        suggestionsRef.current  && !suggestionsRef.current.contains(e.target) &&
        lastNameInputRef.current && !lastNameInputRef.current.contains(e.target)
      ) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showSuggestions]);

  // ── Escape — ask to discard if form has data ───────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (showSuggestions) { setShowSuggestions(false); return; }
      const hasData = form.firstName || form.lastName || form.email || form.checkIn || form.roomId || form.notes;
      if (hasData) setShowDiscard(true);
      else onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [form, showSuggestions, onClose]);

  // ── Booked room IDs — refreshed when dates change ─────────────────────────
  useEffect(() => {
    setBookedRoomIds(new Set());
    setAvailabilityError(null);
    if (!form.checkIn || !form.checkOut || form.checkOut <= form.checkIn || !property?.id) return;
    const params = new URLSearchParams({
      property_id: property.id, check_in_date: form.checkIn, check_out_date: form.checkOut,
    });
    apiFetch(`/api/bookings/booked-rooms?${params}`)
      .then(r => r.ok ? r.json() : [])
      .then(ids => setBookedRoomIds(new Set(ids)))
      .catch(() => {});
  }, [form.checkIn, form.checkOut, property?.id]);

  // ── Availability check for selected room ──────────────────────────────────
  useEffect(() => {
    setAvailabilityError(null);
    if (!form.roomId || !form.checkIn || !form.checkOut || form.checkOut <= form.checkIn) return;
    const params = new URLSearchParams({
      room_id: form.roomId, check_in_date: form.checkIn, check_out_date: form.checkOut,
    });
    apiFetch(`/api/bookings/check?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !data.available) setAvailabilityError(t('roomNotAvailable')); })
      .catch(() => {});
  }, [form.roomId, form.checkIn, form.checkOut, t]);

  // ── Auto-calculate total price ─────────────────────────────────────────────
  useEffect(() => {
    const room = rooms.find(r => r.id === Number(form.roomId));
    if (room && form.checkIn && form.checkOut && form.checkOut > form.checkIn) {
      setForm(prev => ({
        ...prev,
        totalPrice: room.price_per_night * nightsBetween(form.checkIn, form.checkOut),
      }));
    }
  }, [form.roomId, form.checkIn, form.checkOut, rooms]);

  // ── Field change handler ───────────────────────────────────────────────────
  function set(field) {
    return (e) => {
      const val = e.target.value;
      setForm(prev => ({ ...prev, [field]: val }));
      // Editing guest name/contact after a selection → deselect the existing guest
      if (['firstName', 'lastName', 'email', 'phone'].includes(field) && guestId) {
        setGuestId(null);
        setSelectedGuestName('');
      }
    };
  }

  function selectGuest(g) {
    setForm(prev => ({
      ...prev,
      firstName: g.first_name ?? '',
      lastName:  g.last_name  ?? '',
      email:     g.email      ?? '',
      phone:     g.phone      ?? '',
    }));
    setGuestId(g.id);
    setSelectedGuestName(`${g.first_name} ${g.last_name}`);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError(t('nameRequired'));
      return;
    }
    if (!form.checkIn || !form.checkOut || form.checkOut <= form.checkIn) {
      setError(t('checkoutAfterCheckin'));
      return;
    }
    if (!form.roomId) {
      setError(t('requiredFields'));
      return;
    }

    setSubmitting(true);
    let resolvedGuestId = guestId;

    // Create new guest inline if no existing guest was selected
    if (!resolvedGuestId) {
      try {
        const res = await apiFetch('/api/guests', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            first_name: form.firstName.trim(),
            last_name:  form.lastName.trim(),
            email:      form.email.trim() || null,
            phone:      form.phone.trim() || null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Could not create guest');
        }
        resolvedGuestId = (await res.json()).id;
      } catch (err) {
        setError(err.message);
        setSubmitting(false);
        return;
      }
    }

    // Create the booking
    try {
      const res = await apiFetch('/api/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id:    property?.id ?? 1,
          room_id:        Number(form.roomId),
          guest_id:       resolvedGuestId,
          check_in_date:  form.checkIn,
          check_out_date: form.checkOut,
          num_guests:     Number(form.numGuests),
          source:         form.source,
          notes:          form.notes || null,
          total_price:    form.totalPrice !== '' ? Number(form.totalPrice) : null,
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
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const datesValid   = !!(form.checkIn && form.checkOut && form.checkOut > form.checkIn);
  const nightsCount  = datesValid ? nightsBetween(form.checkIn, form.checkOut) : null;
  const selectedRoom = rooms.find(r => r.id === Number(form.roomId));
  const availableRooms = datesValid
    ? rooms.filter(r => r.status !== 'maintenance' && !bookedRoomIds.has(r.id))
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // NO onClick on overlay — backdrop does not close this modal
    <div className="modal-overlay">
      <div className="modal modal--new-booking" role="dialog" aria-label={t('moNewTitle')}>

        {/* Header */}
        <div className="modal-header">
          <h2>{t('moNewTitle')}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body--sections">

            {(error || availabilityError) && (
              <div style={{ padding: '12px 0 0' }}>
                {error             && <div className="form-error">{error}</div>}
                {availabilityError && <div className="form-error">{availabilityError}</div>}
              </div>
            )}

            {/* ── Section 1: Guest ────────────────────────────────────────── */}
            <div className="nbm-section">
              <div className="nbm-section-title">{t('nbSectionGuest')}</div>
              <div className="form-grid">

                {/* First Name */}
                <div className="form-group">
                  <label className="form-label">{t('firstName')} *</label>
                  <input
                    className="form-control"
                    value={form.firstName}
                    onChange={set('firstName')}
                    placeholder={t('firstName')}
                    autoFocus
                  />
                </div>

                {/* Last Name — smart search */}
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">{t('lastName')} *</label>
                  <input
                    ref={lastNameInputRef}
                    className="form-control"
                    value={form.lastName}
                    onChange={set('lastName')}
                    onFocus={() => { if (suggestions.length > 0 && !guestId) setShowSuggestions(true); }}
                    placeholder={t('nbLastNameHint')}
                    autoComplete="off"
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="nbm-suggestions" ref={suggestionsRef}>
                      {suggestions.map(g => (
                        <div
                          key={g.id}
                          className="nbm-suggestion-item"
                          onMouseDown={(e) => { e.preventDefault(); selectGuest(g); }}
                        >
                          <div className="nbm-suggestion-name">
                            {g.last_name}, {g.first_name}
                          </div>
                          {g.email && (
                            <div className="nbm-suggestion-email">{g.email}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Guest status badge */}
                {guestId ? (
                  <div className="form-group span-2" style={{ marginTop: -4 }}>
                    <span className="nbm-guest-selected">
                      ✓ {t('nbGuestSelected')} {selectedGuestName}
                    </span>
                  </div>
                ) : (form.firstName || form.lastName) ? (
                  <div className="form-group span-2" style={{ marginTop: -4 }}>
                    <span className="nbm-new-guest-hint">{t('nbNewGuestHint')}</span>
                  </div>
                ) : null}

                {/* Email */}
                <div className="form-group span-2">
                  <label className="form-label">{t('moEmailLbl')}</label>
                  <input
                    type="email"
                    className="form-control"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="guest@example.com"
                  />
                </div>

                {/* Phone */}
                <div className="form-group span-2">
                  <label className="form-label">{t('moPhoneLbl')}</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={form.phone}
                    onChange={set('phone')}
                    placeholder="+33 6 12 34 56 78"
                  />
                </div>

              </div>
            </div>

            {/* ── Section 2: Dates ────────────────────────────────────────── */}
            <div className="nbm-section">
              <div className="nbm-section-title">{t('nbSectionDates')}</div>
              <div className="form-grid">

                <div className="form-group">
                  <label className="form-label">{t('moCinLbl')} *</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.checkIn}
                    onChange={set('checkIn')}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('moCoutLbl')} *</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.checkOut}
                    min={form.checkIn || undefined}
                    onChange={set('checkOut')}
                    required
                  />
                </div>

                {nightsCount && (
                  <div className="form-group span-2" style={{ marginTop: -4 }}>
                    <span className="nbm-nights-badge">{t('nightWord')(nightsCount)}</span>
                  </div>
                )}

              </div>
            </div>

            {/* ── Section 3: Room ─────────────────────────────────────────── */}
            <div className="nbm-section">
              <div className="nbm-section-title">{t('nbSectionRoom')}</div>
              <div className="form-grid">
                <div className="form-group span-2">
                  {!datesValid ? (
                    <select className="form-control" disabled>
                      <option>{t('nbSelectDatesFirst')}</option>
                    </select>
                  ) : availableRooms.length === 0 ? (
                    <div className="form-error" style={{ display: 'inline-block' }}>
                      {t('noRoomsForDates')}
                    </div>
                  ) : (
                    <select
                      className="form-control"
                      value={form.roomId}
                      onChange={set('roomId')}
                    >
                      <option value="">{t('selectRoom')}</option>
                      {availableRooms.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.type}) · {t('guestWord')(r.capacity)} · {currencySymbol}{r.price_per_night}{t('perNight')}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section 4: Booking Details ───────────────────────────────── */}
            <div className="nbm-section">
              <div className="nbm-section-title">{t('nbSectionDetails')}</div>
              <div className="form-grid">

                {/* Num guests */}
                <div className="form-group">
                  <label className="form-label">{t('moGuestsLbl')}</label>
                  <input
                    type="number"
                    className="form-control"
                    value={form.numGuests}
                    min="1"
                    max={selectedRoom?.capacity ?? 20}
                    onChange={set('numGuests')}
                  />
                  {selectedRoom && (
                    <span className="form-hint">{t('capacity')}: {selectedRoom.capacity}</span>
                  )}
                </div>

                {/* Source */}
                <div className="form-group">
                  <label className="form-label">{t('bookingSourceLabel')}</label>
                  <select
                    className="form-control"
                    value={form.source}
                    onChange={set('source')}
                  >
                    {SOURCE_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>
                        {s.label ?? t(s.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Total price */}
                <div className="form-group span-2">
                  <label className="form-label">{t('totalPriceLabel')} ({currencySymbol})</label>
                  <input
                    type="number"
                    className="form-control"
                    value={form.totalPrice}
                    min="0"
                    step="0.01"
                    onChange={set('totalPrice')}
                    placeholder={t('autoCalcHint')}
                  />
                  {selectedRoom && nightsCount && (
                    <span className="form-hint">
                      {currencySymbol}{selectedRoom.price_per_night} × {nightsCount} = {currencySymbol}{selectedRoom.price_per_night * nightsCount}
                    </span>
                  )}
                </div>

                {/* Notes */}
                <div className="form-group span-2">
                  <label className="form-label">{t('moNotesLbl')}</label>
                  <textarea
                    className="form-control"
                    value={form.notes}
                    onChange={set('notes')}
                    rows={3}
                    placeholder={t('notesPlaceholder')}
                    style={{ resize: 'vertical' }}
                  />
                </div>

              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !!availabilityError || (datesValid && availableRooms.length === 0)}
            >
              {submitting ? t('creating') : t('createBooking')}
            </button>
          </div>
        </form>
      </div>

      {/* Discard confirmation (shown on Escape) */}
      <ConfirmModal
        isOpen={showDiscard}
        title={t('nbDiscardTitle')}
        message={t('nbDiscardMsg')}
        confirmLabel={t('nbDiscardBtn')}
        cancelLabel={t('cancel')}
        variant="warning"
        onConfirm={() => { setShowDiscard(false); onClose(); }}
        onCancel={() => setShowDiscard(false)}
      />
    </div>
  );
}
