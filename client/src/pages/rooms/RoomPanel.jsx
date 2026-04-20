import { useState } from 'react';
import { BADGE_CLASS } from '../../utils/bookingConstants.js';
import { nightsBetween, LOCALE_MAP } from '../../utils/format.js';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';

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

  return (
    <>
      {/* Details */}
      <div className="panel-section">
        <div className="panel-section-title">{t('roomDetailsTitle')}</div>
        <PanelRow label={t('typeLabel')}    value={t(roomTypeKey)} />
        <PanelRow label={t('capacity')}     value={t('guestWord')(room.capacity)} />
        <PanelRow label={t('priceLabel')}   value={`${currencySymbol}${room.price_per_night}${t('perNight')}`} />
        <PanelRow label={t('status')}       value={<StatusPill status={room.status} t={t} />} />
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

      {/* Actions */}
      <div className="panel-actions">
        {room.status === 'available' && (
          <button className="btn-panel-primary" onClick={onBook}>
            {t('bookThisRoom')}
          </button>
        )}
        <button
          className={room.status === 'available' ? 'btn-secondary' : 'btn-panel-primary'}
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
    name:            room.name            ?? '',
    type:            room.type            ?? 'double',
    price_per_night: room.price_per_night ?? '',
    capacity:        room.capacity        ?? 2,
    amenities:       room.amenities       ?? '',
    status:          room.status          ?? 'available',
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
          property_id:    room.property_id,
          name:           form.name.trim(),
          type:           form.type,
          price_per_night: Number(form.price_per_night),
          capacity:       Number(form.capacity),
          amenities:      form.amenities.trim() || null,
          status:         form.status,
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
      </div>

      {showDeleteModal && (
        <DeleteModal
          roomName={room.name}
          bookingCount={deleteBookingCount}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          t={t}
        />
      )}
    </>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

function DeleteModal({ roomName, bookingCount, deleting, onConfirm, onCancel, t }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '28px 28px 24px',
        maxWidth: 380, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
          {t('deleteRoomTitle')}
        </h3>
        <p style={{ margin: '0 0 22px', fontSize: '0.875rem', color: '#475569', lineHeight: 1.6 }}>
          {bookingCount > 0 ? t('deleteRoomWithBookings')(bookingCount) : t('deleteRoomConfirm')(roomName)}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              padding: '8px 16px', borderRadius: 7, border: '1.5px solid #e2e8f0',
              background: '#fff', color: '#334155', fontSize: '0.85rem',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: '8px 16px', borderRadius: 7, border: 'none',
              background: '#dc2626', color: '#fff', fontSize: '0.85rem',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {deleting ? t('deleting') : t('deleteRoomBtn')}
          </button>
        </div>
      </div>
    </div>
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
