import { useState } from 'react';
import { BADGE_CLASS } from '../../utils/bookingConstants.js';
import { nightsBetween, LOCALE_MAP } from '../../utils/format.js';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';

const ROOM_TYPES    = ['single', 'double', 'twin', 'suite', 'apartment', 'other'];
const STATUS_OPTIONS = ['available', 'occupied', 'maintenance'];

/** Parse amenities string → array, filtering blanks. */
const parseAmenities = (str) =>
  (str ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Format a YYYY-MM-DD string as "30 Mar 2026". */
function fmtDate(dateStr, locale = 'en') {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Upcoming bookings: non-cancelled, check-out in the future, sorted by check-in, limit 5. */
function upcomingBookings(bookings, today) {
  return bookings
    .filter((b) => b.status !== 'cancelled' && b.check_out_date >= today)
    .sort((a, b) => (a.check_in_date > b.check_in_date ? 1 : -1))
    .slice(0, 5);
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function RoomPanel({ room, bookings, today, onClose, onRoomUpdated, onBook, onRoomDeleted }) {
  const [mode, setMode] = useState('view');
  const t = useT();
  const { locale } = useLocale();

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="detail-panel" role="dialog" aria-label="Room details">

        {/* Header */}
        <div className="panel-header">
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="panel-guest-name" style={{ marginBottom: 4 }}>{room.name}</div>
          <div className="panel-room-type-row">
            <StatusPill status={room.status} />
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem' }}>
              {t(`roomType${room.type.charAt(0).toUpperCase() + room.type.slice(1)}`)}
            </span>
          </div>
          <div className="panel-booking-ref" style={{ marginTop: 8 }}>{t('roomRef')}{room.id}</div>
        </div>

        {/* Scrollable body */}
        <div className="panel-scroll">
          <div className="panel-body">
            {mode === 'view'
              ? <ViewMode room={room} bookings={bookings} today={today}
                  onEdit={() => setMode('edit')} onBook={onBook} t={t} locale={locale} />
              : <EditMode room={room}
                  onCancel={() => setMode('view')}
                  onSaved={(updated) => { onRoomUpdated(updated); setMode('view'); }}
                  onDeleted={() => onRoomDeleted(room.id)} t={t} locale={locale} />
            }
          </div>
        </div>

      </aside>
    </>
  );
}

// ── View mode ─────────────────────────────────────────────────────────────────

function ViewMode({ room, bookings, today, onEdit, onBook, t, locale }) {
  const { currencySymbol } = useLocale();
  const amenities = parseAmenities(room.amenities);
  const upcoming  = upcomingBookings(bookings, today);
  const roomTypeKey = `roomType${room.type.charAt(0).toUpperCase() + room.type.slice(1)}`;

  const activeBooking = bookings.find((b) =>
    b.status !== 'cancelled' &&
    b.status !== 'checked_out' &&
    b.check_in_date <= today &&
    b.check_out_date > today
  );

  return (
    <>
      {/* Details */}
      <div className="panel-section">
        <div className="panel-section-title">{t('roomDetailsTitle')}</div>
        <PanelRow label={t('typeLabel')}    value={t(roomTypeKey)} />
        <PanelRow label={t('capacity')}     value={t('guestWord')(room.capacity)} />
        <PanelRow label={t('priceLabel')}   value={`${currencySymbol}${room.price_per_night}${t('perNight')}`} />
        <PanelRow label={t('status')}       value={<StatusPill status={room.status} t={t} />} />
        {!!room.breakfast_included && (
          <PanelRow label={t('breakfastIncludedLabel')} value={
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: '0.72rem', fontWeight: 700, color: '#1a4710',
              background: '#d9f0cc', border: '1px solid #86efac',
              borderRadius: 4, padding: '2px 7px',
            }}>
              {t('fBreakfast')}
            </span>
          } />
        )}
        {amenities.length > 0 && (
          <PanelRow label={t('amenities')} value={
            <div className="amenity-list" style={{ marginTop: 0 }}>
              {amenities.map((a) => <span key={a} className="amenity-tag">{formatAmenity(a)}</span>)}
            </div>
          } />
        )}
      </div>

      {/* Pricing callout */}
      <div className="panel-section">
        <div className="panel-price-callout">
          <div className="panel-price-main">{currencySymbol}{room.price_per_night}<span style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.75 }}>{t('perNight')}</span></div>
          <div className="panel-price-detail">{t('capacity')}: {room.capacity} · {t(roomTypeKey)}</div>
        </div>
      </div>

      {/* Upcoming schedule */}
      <div className="panel-section">
        <div className="panel-section-title">
          {t('upcomingSchedule')} {upcoming.length > 0 && `(${upcoming.length})`}
        </div>
        {upcoming.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.83rem' }}>{t('noUpcomingBookings')}</div>
        ) : (
          upcoming.map((b) => <ScheduleRow key={b.id} booking={b} t={t} locale={locale} />)
        )}
      </div>

      {/* Occupied notice */}
      {activeBooking && (
        <div style={{
          margin: '0 0 8px', padding: '8px 12px', borderRadius: 6,
          background: '#fef3c7', border: '1px solid #fbbf24',
          fontSize: '0.83rem', color: '#92400e', fontWeight: 500,
        }}>
          {activeBooking.guest_first_name} {activeBooking.guest_last_name}
          &nbsp;&mdash;&nbsp;{t('moCoutLbl')}: {activeBooking.check_out_date}
        </div>
      )}

      {/* Actions */}
      <div className="panel-actions">
        {!activeBooking && room.status === 'available' && (
          <button className="btn-panel-primary" onClick={onBook}>
            {t('bookThisRoom')}
          </button>
        )}
        <button
          className={(!activeBooking && room.status === 'available') ? 'btn-secondary' : 'btn-panel-primary'}
          onClick={onEdit}
          style={{ border: '1.5px solid var(--border)' }}
        >
          {t('editRoom')}
        </button>
      </div>
    </>
  );
}

// ── Edit mode ─────────────────────────────────────────────────────────────────

function EditMode({ room, onCancel, onSaved, onDeleted, t }) {
  const { currencySymbol } = useLocale();
  const [form, setForm] = useState({
    name:               room.name               ?? '',
    type:               room.type               ?? 'double',
    price_per_night:    room.price_per_night    ?? '',
    capacity:           room.capacity           ?? 2,
    amenities:          room.amenities          ?? '',
    status:             room.status             ?? 'available',
    breakfast_included: room.breakfast_included ?? 0,
  });
  const [saving,          setSaving]          = useState(false);
  const [deleting,        setDeleting]        = useState(false);
  const [deleteBookingCount, setDeleteBookingCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error,           setError]           = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('roomNameLabel') + ' is required.'); return; }
    if (!form.price_per_night || isNaN(Number(form.price_per_night))) {
      setError(t('pricePerNightLabel') + ' is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/rooms/${room.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id:        room.property_id,
          name:               form.name.trim(),
          type:               form.type,
          price_per_night:    Number(form.price_per_night),
          capacity:           Number(form.capacity),
          amenities:          form.amenities.trim() || null,
          status:             form.status,
          breakfast_included: form.breakfast_included ? 1 : 0,
        }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      onSaved(await res.json());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleDeleteClick = async () => {
    setError(null);
    try {
      const res = await apiFetch(`/api/rooms/${room.id}`, { method: 'DELETE' });
      if (res.status === 409) {
        const data = await res.json();
        setDeleteBookingCount(data.booking_count ?? 0);
        setShowDeleteModal(true);
        return;
      }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      onDeleted();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/rooms/${room.id}?force=true`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const amenityPreview = parseAmenities(form.amenities);

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">{t('editRoom')}</div>

        {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="panel-edit-form">
          <Field label={t('roomNameLabel')} name="name" value={form.name} onChange={handleChange} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="panel-field">
              <label className="panel-field-label">{t('typeLabel')}</label>
              <select name="type" className="panel-field-input" value={form.type} onChange={handleChange}>
                {ROOM_TYPES.map((rt) => (
                  <option key={rt} value={rt}>{t(`roomType${rt.charAt(0).toUpperCase() + rt.slice(1)}`)}</option>
                ))}
              </select>
            </div>
            <div className="panel-field">
              <label className="panel-field-label">{t('status')}</label>
              <select name="status" className="panel-field-input" value={form.status} onChange={handleChange}>
                <option value="available">{t('available')}</option>
                <option value="occupied">{t('occupiedDot')}</option>
                <option value="maintenance">{t('maintenance')}</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={`${t('pricePerNightLabel')} (${currencySymbol})`} name="price_per_night" value={form.price_per_night}
              onChange={handleChange} type="number" />
            <Field label={t('capacityGuestsLabel')} name="capacity" value={form.capacity}
              onChange={handleChange} type="number" min="1" max="20" />
          </div>

          <div className="panel-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!form.breakfast_included}
                onChange={(e) => setForm((prev) => ({ ...prev, breakfast_included: e.target.checked ? 1 : 0 }))}
              />
              <span className="panel-field-label" style={{ marginBottom: 0 }}>{t('breakfastIncludedLabel')}</span>
            </label>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>{t('roomBreakfastSubtitle')}</div>
          </div>

          <div className="panel-field">
            <label className="panel-field-label">{t('amenities')}</label>
            <input
              name="amenities"
              className="panel-field-input"
              value={form.amenities}
              onChange={handleChange}
              placeholder="wifi, ensuite, balcony, parking…"
            />
            {amenityPreview.length > 0 && (
              <div className="amenity-preview">
                {amenityPreview.map((a) => (
                  <span key={a} className="amenity-tag">{formatAmenity(a)}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel-actions">
        <button className="btn-panel-primary" onClick={handleSave} disabled={saving || deleting}>
          {saving ? t('saving') : t('saveChanges')}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={saving || deleting}
          style={{ border: '1.5px solid var(--border)' }}>
          {t('cancel')}
        </button>
      </div>

      <div style={{ padding: '0 0 8px' }}>
        {room.is_demo ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: '0.78rem', color: 'var(--text-muted)',
          }}>
            🔒 {t('demoRoomLocked')}
          </span>
        ) : (
          <button
            onClick={handleDeleteClick}
            disabled={saving || deleting}
            style={{
              background: 'none', border: 'none', color: '#dc2626', fontSize: '0.8rem',
              cursor: 'pointer', padding: '6px 0', textDecoration: 'underline',
              fontFamily: 'inherit',
            }}
          >
            {t('deleteThisRoom')}
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        title={t('deleteRoomTitle')}
        message={deleteBookingCount > 0
          ? t('deleteRoomWithBookings')(deleteBookingCount)
          : t('deleteRoomConfirm')(room.name)}
        confirmLabel={deleting ? t('deleting') : t('deleteRoomBtn')}
        cancelLabel={t('cancel')}
        variant="danger"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
    </>
  );
}

// ── ScheduleRow ───────────────────────────────────────────────────────────────

function ScheduleRow({ booking: b, t, locale }) {
  const { fmtCurrency } = useLocale();
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  const statusLabel = { arriving: t('calLegendInHouse'), confirmed: t('confirmed'), checked_out: t('checkedOut'), cancelled: t('cancelled') }[b.status] ?? b.status;
  return (
    <div className="schedule-row">
      <div className="schedule-guest">
        {b.guest_first_name} {b.guest_last_name}
      </div>
      <div className="schedule-meta">
        <span>{fmtDate(b.check_in_date, locale)} → {fmtDate(b.check_out_date, locale)}</span>
        <span>·</span>
        <span>{t('nightWord')(nights)}</span>
        <span>·</span>
        <span className={BADGE_CLASS[b.status] ?? 'badge'} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
          {statusLabel}
        </span>
        <span className="schedule-price">{fmtCurrency(b.total_price)}</span>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function PanelRow({ label, value }) {
  return (
    <div className="panel-row">
      <span className="panel-row-label">{label}</span>
      <span className="panel-row-value">{value}</span>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', min, max }) {
  return (
    <div className="panel-field">
      <label className="panel-field-label">{label}</label>
      <input
        type={type} name={name} className="panel-field-input"
        value={value} onChange={onChange} min={min} max={max}
      />
    </div>
  );
}

export function StatusPill({ status, t: tProp }) {
  const tCtx = useT();
  const t = tProp ?? tCtx;
  const cfg = {
    available:   { cls: 'pill-available',   dot: 'dot-available',   labelKey: 'available'    },
    occupied:    { cls: 'pill-occupied',     dot: 'dot-occupied',    labelKey: 'occupiedDot'  },
    maintenance: { cls: 'pill-maintenance',  dot: 'dot-maintenance', labelKey: 'maintenance'  },
  }[status] ?? { cls: 'pill-maintenance', dot: 'dot-maintenance', labelKey: null };

  return (
    <span className={`status-pill ${cfg.cls}`}>
      <span className={`status-dot ${cfg.dot}`} />
      {cfg.labelKey ? t(cfg.labelKey) : status}
    </span>
  );
}

/** "booking_com" → "Booking.com", "ensuite" → "En-suite", etc. */
export function formatAmenity(str) {
  const map = {
    wifi: 'WiFi', ensuite: 'En-suite', balcony: 'Balcony', terrace: 'Terrace',
    parking: 'Parking', minibar: 'Minibar', kitchenette: 'Kitchenette',
    aircon: 'Air Con', tv: 'TV', safe: 'Safe', bathtub: 'Bathtub',
  };
  return map[str.toLowerCase()] ?? str.charAt(0).toUpperCase() + str.slice(1);
}
