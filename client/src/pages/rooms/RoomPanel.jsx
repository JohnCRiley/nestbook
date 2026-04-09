import { useState } from 'react';
import { BADGE_CLASS, BADGE_LABEL } from '../../utils/bookingConstants.js';
import { nightsBetween } from '../../utils/format.js';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale } from '../../i18n/LocaleContext.jsx';

const ROOM_TYPES    = ['single', 'double', 'twin', 'suite', 'apartment', 'other'];
const STATUS_OPTIONS = ['available', 'occupied', 'maintenance'];

/** Parse amenities string → array, filtering blanks. */
const parseAmenities = (str) =>
  (str ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Format a YYYY-MM-DD string as "30 Mar 2026". */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
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
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', textTransform: 'capitalize' }}>
              {room.type}
            </span>
          </div>
          <div className="panel-booking-ref" style={{ marginTop: 8 }}>Room #{room.id}</div>
        </div>

        {/* Scrollable body */}
        <div className="panel-scroll">
          <div className="panel-body">
            {mode === 'view'
              ? <ViewMode room={room} bookings={bookings} today={today}
                  onEdit={() => setMode('edit')} onBook={onBook} />
              : <EditMode room={room}
                  onCancel={() => setMode('view')}
                  onSaved={(updated) => { onRoomUpdated(updated); setMode('view'); }}
                  onDeleted={() => onRoomDeleted(room.id)} />
            }
          </div>
        </div>

      </aside>
    </>
  );
}

// ── View mode ─────────────────────────────────────────────────────────────────

function ViewMode({ room, bookings, today, onEdit, onBook }) {
  const { currencySymbol } = useLocale();
  const amenities = parseAmenities(room.amenities);
  const upcoming  = upcomingBookings(bookings, today);

  return (
    <>
      {/* Details */}
      <div className="panel-section">
        <div className="panel-section-title">Room Details</div>
        <PanelRow label="Type"       value={<span style={{ textTransform: 'capitalize' }}>{room.type}</span>} />
        <PanelRow label="Capacity"   value={`${room.capacity} ${room.capacity === 1 ? 'guest' : 'guests'}`} />
        <PanelRow label="Price"      value={`${currencySymbol}${room.price_per_night}/night`} />
        <PanelRow label="Status"     value={<StatusPill status={room.status} />} />
        {amenities.length > 0 && (
          <PanelRow label="Amenities" value={
            <div className="amenity-list" style={{ marginTop: 0 }}>
              {amenities.map((a) => <span key={a} className="amenity-tag">{formatAmenity(a)}</span>)}
            </div>
          } />
        )}
      </div>

      {/* Pricing callout */}
      <div className="panel-section">
        <div className="panel-price-callout">
          <div className="panel-price-main">{currencySymbol}{room.price_per_night}<span style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.75 }}>/night</span></div>
          <div className="panel-price-detail">Capacity: {room.capacity} · {room.type}</div>
        </div>
      </div>

      {/* Upcoming schedule */}
      <div className="panel-section">
        <div className="panel-section-title">
          Upcoming Schedule {upcoming.length > 0 && `(${upcoming.length})`}
        </div>
        {upcoming.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.83rem' }}>No upcoming bookings</div>
        ) : (
          upcoming.map((b) => <ScheduleRow key={b.id} booking={b} />)
        )}
      </div>

      {/* Actions */}
      <div className="panel-actions">
        {room.status === 'available' && (
          <button className="btn-panel-primary" onClick={onBook}>
            Book This Room
          </button>
        )}
        <button
          className={room.status === 'available' ? 'btn-secondary' : 'btn-panel-primary'}
          onClick={onEdit}
          style={{ border: '1.5px solid var(--border)' }}
        >
          Edit Room
        </button>
      </div>
    </>
  );
}

// ── Edit mode ─────────────────────────────────────────────────────────────────

function EditMode({ room, onCancel, onSaved, onDeleted }) {
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error,           setError]           = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Room name is required.'); return; }
    if (!form.price_per_night || isNaN(Number(form.price_per_night))) {
      setError('A valid price per night is required.');
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

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/rooms/${room.id}`, { method: 'DELETE' });
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
        <div className="panel-section-title">Edit Room</div>

        {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="panel-edit-form">
          <Field label="Room Name" name="name" value={form.name} onChange={handleChange} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="panel-field">
              <label className="panel-field-label">Type</label>
              <select name="type" className="panel-field-input" value={form.type} onChange={handleChange}>
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>
                ))}
              </select>
            </div>
            <div className="panel-field">
              <label className="panel-field-label">Status</label>
              <select name="status" className="panel-field-input" value={form.status} onChange={handleChange}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={`Price / Night (${currencySymbol})`} name="price_per_night" value={form.price_per_night}
              onChange={handleChange} type="number" />
            <Field label="Capacity (guests)" name="capacity" value={form.capacity}
              onChange={handleChange} type="number" min="1" max="20" />
          </div>

          <div className="panel-field">
            <label className="panel-field-label">Amenities</label>
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
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={saving || deleting}
          style={{ border: '1.5px solid var(--border)' }}>
          Cancel
        </button>
      </div>

      <div style={{ padding: '0 0 8px' }}>
        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={saving || deleting}
          style={{
            background: 'none', border: 'none', color: '#dc2626', fontSize: '0.8rem',
            cursor: 'pointer', padding: '6px 0', textDecoration: 'underline',
            fontFamily: 'inherit',
          }}
        >
          Delete this room
        </button>
      </div>

      {showDeleteModal && (
        <DeleteModal
          roomName={room.name}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

function DeleteModal({ roomName, deleting, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '28px 28px 24px',
        maxWidth: 360, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
          Delete room?
        </h3>
        <p style={{ margin: '0 0 22px', fontSize: '0.875rem', color: '#475569', lineHeight: 1.6 }}>
          Are you sure you want to delete <strong>{roomName}</strong>? This cannot be undone.
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
            Cancel
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
            {deleting ? 'Deleting…' : 'Delete room'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ScheduleRow ───────────────────────────────────────────────────────────────

function ScheduleRow({ booking: b }) {
  const { fmtCurrency } = useLocale();
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  return (
    <div className="schedule-row">
      <div className="schedule-guest">
        {b.guest_first_name} {b.guest_last_name}
      </div>
      <div className="schedule-meta">
        <span>{fmtDate(b.check_in_date)} → {fmtDate(b.check_out_date)}</span>
        <span>·</span>
        <span>{nights} {nights === 1 ? 'night' : 'nights'}</span>
        <span>·</span>
        <span className={BADGE_CLASS[b.status] ?? 'badge'} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
          {BADGE_LABEL[b.status] ?? b.status}
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

export function StatusPill({ status }) {
  const cfg = {
    available:   { cls: 'pill-available',   dot: 'dot-available',   label: 'Available'    },
    occupied:    { cls: 'pill-occupied',     dot: 'dot-occupied',    label: 'Occupied'     },
    maintenance: { cls: 'pill-maintenance',  dot: 'dot-maintenance', label: 'Maintenance'  },
  }[status] ?? { cls: 'pill-maintenance', dot: 'dot-maintenance', label: status };

  return (
    <span className={`status-pill ${cfg.cls}`}>
      <span className={`status-dot ${cfg.dot}`} />
      {cfg.label}
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
