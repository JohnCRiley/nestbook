import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { localToday, LOCALE_MAP } from '../utils/format.js';
import { StatusPill, formatAmenity, fmtDate, upcomingBookings } from './rooms/RoomPanel.jsx';
import RoomPanel    from './rooms/RoomPanel.jsx';
import NewRoomModal from './rooms/NewRoomModal.jsx';
import NewBookingModal from './bookings/NewBookingModal.jsx';
import Pagination from '../components/Pagination.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import usePageSize from '../hooks/usePageSize.js';
import { usePlan } from '../hooks/usePlan.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { BADGE_CLASS } from '../utils/bookingConstants.js';
import { calcDue } from './Dashboard.jsx';

// toolbar + stat-bar + padding
const RESERVED = 120;

// ── Main component ────────────────────────────────────────────────────────────

export default function Rooms() {
  const today = localToday();
  const t = useT();
  const { currencySymbol, fmtCurrency, property, locale } = useLocale();
  const pageSize = usePageSize(140, RESERVED);
  const plan = usePlan();
  const { user } = useAuth();
  const hasChargesAddon = plan === 'multi' || !!user?.has_charges_addon;

  const [rooms,         setRooms]         = useState([]);
  const [bookings,      setBookings]      = useState([]);
  const [guests,        setGuests]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedRoom,  setSelectedRoom]  = useState(null);
  const [showNewRoom,   setShowNewRoom]   = useState(false);
  const [bookingValues, setBookingValues] = useState(null);   // pre-fill for booking modal
  const [page,          setPage]          = useState(1);

  // Unit mode: which unit (if any) a "+ Room"/"+ Add Unit" click is scoped to.
  // null = creating a unit itself; a unit id = creating an internal room inside it.
  const [newRoomParentUnitId, setNewRoomParentUnitId] = useState(null);

  const prevPageSizeRef = useRef(pageSize);
  useEffect(() => {
    if (prevPageSizeRef.current !== pageSize) {
      prevPageSizeRef.current = pageSize;
      setPage(1);
    }
  }, [pageSize]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!property?.id) return;
    Promise.all([
      apiFetch(`/api/rooms?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
      apiFetch(`/api/bookings?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
      apiFetch(`/api/guests?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
    ]).then(([r, b, g]) => {
      setRooms(Array.isArray(r) ? r : []);
      setBookings(Array.isArray(b) ? b : []);
      setGuests(Array.isArray(g) ? g : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [property?.id]);

  const refreshRooms = () =>
    apiFetch(`/api/rooms?property_id=${property?.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((r) => setRooms(Array.isArray(r) ? r : []));

  // ── Active booking per room (covers today) ─────────────────────────────────
  // "Active" = non-cancelled, check_in <= today < check_out
  const activeByRoom = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (
        b.status !== 'cancelled' &&
        b.status !== 'checked_out' &&
        b.check_in_date <= today &&
        b.check_out_date > today
      ) {
        map[b.room_id] = b;
      }
    }
    return map;
  }, [bookings, today]);

  // ── Bookings per room (for the panel schedule) ─────────────────────────────
  const bookingsByRoom = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (!map[b.room_id]) map[b.room_id] = [];
      map[b.room_id].push(b);
    }
    return map;
  }, [bookings]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total       = rooms.length;
    const occupied    = Object.keys(activeByRoom).length;
    const maintenance = rooms.filter((r) => r.status === 'maintenance').length;
    const available   = total - occupied - maintenance;
    return { total, available: Math.max(available, 0), occupied, maintenance };
  }, [rooms, activeByRoom]);

  const totalRoomPages = Math.ceil(rooms.length / pageSize) || 1;
  const pagedRooms = rooms.slice((page - 1) * pageSize, page * pageSize);

  // ── Unit mode: split the flat rooms array into units + their internal rooms ─
  const units = useMemo(() => rooms.filter((r) => !r.parent_unit_id), [rooms]);
  const roomsByUnit = useMemo(() => {
    const map = {};
    for (const r of rooms) {
      if (!r.parent_unit_id) continue;
      (map[r.parent_unit_id] ??= []).push(r);
    }
    return map;
  }, [rooms]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCardClick = (room) =>
    setSelectedRoom((prev) => (prev?.id === room.id ? null : room));

  const handleRoomUpdated = (updated) => {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedRoom(updated);
  };

  // Unit accordion's own inline sub-sections (Unit Details, Access & Arrival)
  // save without opening the RoomPanel side panel — update the rooms list only,
  // unlike handleRoomUpdated above which also opens/refreshes that panel.
  const handleUnitFieldsUpdated = (updated) => {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleNewRoomSuccess = (created) => {
    setRooms((prev) => [...prev, created]);
    setShowNewRoom(false);
    setSelectedRoom(created);
  };

  const handleRoomDeleted = (id) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
    setSelectedRoom(null);
  };

  // "Book this room" — open booking modal pre-filled with room + today's date
  const handleBook = (room) => {
    setSelectedRoom(null);
    const tomorrow = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-');
    })();
    setBookingValues({
      room_id:        String(room.id),
      check_in_date:  today,
      check_out_date: tomorrow,
    });
  };

  const handleBookingSuccess = () => {
    setBookingValues(null);
    // Refresh bookings so active-room state updates
    apiFetch(`/api/bookings?property_id=${property?.id}`).then((r) => r.json()).then(setBookings);
  };

  const isWholeProp = property?.rental_type === 'whole_property';
  const isUnitsMode = property?.rental_type === 'units';

  // ── Unit mode handlers ───────────────────────────────────────────────────
  const handleAddUnit = () => {
    setNewRoomParentUnitId(null);
    setShowNewRoom(true);
  };
  const handleAddRoomToUnit = (unit) => {
    setNewRoomParentUnitId(unit.id);
    setShowNewRoom(true);
  };
  const handleEditUnit = (unit) => setSelectedRoom(unit);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {isWholeProp ? (
        /* ── Whole-property bedrooms view ──────────────────────────────── */
        <WholePropertyPage
          rooms={rooms}
          loading={loading}
          today={today}
          activeByRoom={activeByRoom}
          selectedRoom={selectedRoom}
          onCardClick={handleCardClick}
          onAddBedroom={() => setShowNewRoom(true)}
          stats={stats}
          t={t}
          locale={locale}
        />
      ) : isUnitsMode ? (
        /* ── Unit-mode accordion view ──────────────────────────────────── */
        <UnitsPage
          units={units}
          roomsByUnit={roomsByUnit}
          bookingsByRoom={bookingsByRoom}
          today={today}
          property={property}
          fmtCurrency={fmtCurrency}
          locale={locale}
          hasChargesAddon={hasChargesAddon}
          loading={loading}
          selectedRoom={selectedRoom}
          onCardClick={handleCardClick}
          onAddUnit={handleAddUnit}
          onAddRoomToUnit={handleAddRoomToUnit}
          onEditUnit={handleEditUnit}
          onUnitFieldsUpdated={handleUnitFieldsUpdated}
          t={t}
          currencySymbol={currencySymbol}
        />
      ) : (
        /* ── B&B rooms view ────────────────────────────────────────────── */
        <>
          {/* ── Page header ────────────────────────────────────────────── */}
          <div className="page-toolbar">
            <div className="page-header" style={{ marginBottom: 0 }}>
              <h1>{t('rooms')}</h1>
              <div className="page-date">{rooms.length} {t('roomsCount')}</div>
            </div>
            <button className="btn-primary" onClick={() => setShowNewRoom(true)}>
              <span style={{ fontSize: '1.1em', lineHeight: 1 }}>+</span>
              {t('addRoom').replace('+ ', '')}
            </button>
          </div>

          {/* ── Stat bar ───────────────────────────────────────────────── */}
          <div className="stat-bar">
            <StatBarItem value={stats.total}       label={t('totalRooms')} />
            <StatBarItem value={stats.available}   label={t('availableTonight')} accent="var(--accent)" />
            <StatBarItem value={stats.occupied}    label={t('occupied')}         accent="#f59e0b" />
            <StatBarItem value={stats.maintenance} label={t('maintenance')}      accent="#94a3b8" />
          </div>

          {/* ── Card grid ──────────────────────────────────────────────── */}
          {loading ? (
            <div className="loading-screen">{t('loadingRooms')}</div>
          ) : (
            <div className="room-grid">
              {pagedRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  activeBooking={activeByRoom[room.id] ?? null}
                  isSelected={selectedRoom?.id === room.id}
                  today={today}
                  onClick={handleCardClick}
                  onBook={handleBook}
                  t={t}
                  currencySymbol={currencySymbol}
                  locale={locale}
                  breakfastIncluded={!!property?.breakfast_included || !!room.breakfast_included}
                />
              ))}
            </div>
          )}
          <Pagination
            page={page}
            totalPages={totalRoomPages}
            total={rooms.length}
            limit={pageSize}
            onPage={setPage}
          />
        </>
      )}

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selectedRoom && (
        <RoomPanel
          room={selectedRoom}
          bookings={bookingsByRoom[selectedRoom.id] ?? []}
          today={today}
          onClose={() => setSelectedRoom(null)}
          onRoomUpdated={handleRoomUpdated}
          onBook={() => handleBook(selectedRoom)}
          onRoomDeleted={handleRoomDeleted}
        />
      )}

      {/* ── Add room modal ────────────────────────────────────────────────── */}
      {showNewRoom && (
        <NewRoomModal
          parentUnitId={newRoomParentUnitId}
          onClose={() => { setShowNewRoom(false); setNewRoomParentUnitId(null); }}
          onSuccess={handleNewRoomSuccess}
        />
      )}

      {/* ── New booking modal (pre-filled from "Book this room") ─────────── */}
      {bookingValues && (
        <NewBookingModal
          rooms={rooms}
          guests={guests}
          initialValues={bookingValues}
          onClose={() => setBookingValues(null)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </>
  );
}

// ── RoomCard ──────────────────────────────────────────────────────────────────

function RoomCard({ room, activeBooking, isSelected, today, onClick, onBook, t, currencySymbol, locale, breakfastIncluded }) {
  const amenities     = (room.amenities ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const stripeClass   = `stripe-${room.status}`;
  const isAvailable   = room.status === 'available' && !activeBooking;
  const isOccupied    = !!activeBooking;
  const isMaintenance = room.status === 'maintenance';

  // Effective status for the pill (a room may be "available" in DB but have an active booking)
  const effectiveStatus = isOccupied ? 'occupied' : room.status;

  return (
    <div
      className={`room-card${isSelected ? ' active' : ''}`}
      onClick={() => onClick(room)}
    >
      {/* Coloured stripe — status accent at top of card */}
      <div className={`room-card-stripe ${stripeClass}`}
        style={isOccupied ? { background: '#f59e0b' } : {}} />

      <div className="room-card-body">
        {/* Header: name + status pill */}
        <div className="room-card-header">
          <div>
            <div className="room-card-name">{room.name}</div>
            <div className="room-card-type">{room.type}</div>
          </div>
          <StatusPill status={effectiveStatus} />
        </div>

        {/* Price */}
        <div className="room-price">
          {currencySymbol}{room.price_per_night}
          <span className="room-price-sub">{t('perNight')}</span>
        </div>

        {/* Facts: capacity */}
        <div className="room-facts">
          <span className="room-fact">
            <GuestIcon />
            {t('guestWord')(room.capacity)}
          </span>
        </div>

        {/* Breakfast badge */}
        {breakfastIncluded && (
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-dark)',
            background: 'var(--light-green)', border: '1px solid var(--tint-border)',
            borderRadius: 4, padding: '2px 7px', marginBottom: 6,
          }}>
            {t('fBreakfast')}
          </div>
        )}

        {/* Amenities */}
        {amenities.length > 0 && (
          <div className="amenity-list">
            {amenities.slice(0, 4).map((a) => (
              <span key={a} className="amenity-tag">{formatAmenity(a)}</span>
            ))}
            {amenities.length > 4 && (
              <span className="amenity-tag">{t('moreAmenities')(amenities.length - 4)}</span>
            )}
          </div>
        )}

        {/* Photo thumbnail + count */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {room.photo_count > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
              {(room.primary_thumb || room.primary_photo) && (
                <img
                  src={`/uploads/rooms/${room.primary_thumb || room.primary_photo}`}
                  alt=""
                  onError={(e) => { e.target.style.display = 'none'; }}
                  style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }}
                />
              )}
              <span><i className="ti ti-camera" /> {room.photo_count} photo{room.photo_count !== 1 ? 's' : ''}</span>
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-camera" /> No photos yet
            </div>
          )}
        </div>
      </div>

      {/* Occupied strip */}
      {isOccupied && (
        <div className="room-occupied-strip">
          <i className="ti ti-bed" />
          <span>
            <strong>{activeBooking.guest_first_name} {activeBooking.guest_last_name}</strong>
            {' '}— {t('checksOut')} {formatCheckOut(activeBooking.check_out_date, locale)}
          </span>
        </div>
      )}

      {/* Maintenance label */}
      {isMaintenance && (
        <div className="room-occupied-strip" style={{ background: '#f8fafc', borderTopColor: '#cbd5e1', color: '#475569' }}>
          <span>🔧</span>
          <span>{t('underMaintenance')}</span>
        </div>
      )}

      {/* Book button (available rooms only, stop propagation so card click doesn't also fire) */}
      {isAvailable && (
        <div className="room-card-footer" onClick={(e) => e.stopPropagation()}>
          <button className="btn-book" onClick={() => onBook(room)}>
            {t('bookThisRoom')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBarItem({ value, label, accent }) {
  return (
    <div className="stat-bar-item" style={accent ? { borderLeftColor: accent } : {}}>
      <div className="sb-value" style={accent ? { color: accent === 'var(--accent)' ? 'var(--accent-dark)' : accent } : {}}>
        {value}
      </div>
      <div className="sb-label">{label}</div>
    </div>
  );
}

function GuestIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  );
}

/** "2 Apr" */
function formatCheckOut(dateStr, locale = 'en') {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', { day: 'numeric', month: 'short' });
}

// ── WholePropertyPage ─────────────────────────────────────────────────────────

const ROOM_TYPE_LABELS = {
  double: 'Double bedroom', twin: 'Twin bedroom', single: 'Single bedroom',
  bunk: 'Bunk room', master: 'Master suite', kids: 'Kids room',
  bathroom: 'Bathroom', ensuite: 'En-suite', shower_room: 'Shower room', wc: 'WC / Cloakroom',
  living_room: 'Living room', kitchen: 'Kitchen', kitchen_diner: 'Kitchen / Diner',
  dining_room: 'Dining room', study: 'Study / Office', games_room: 'Games room',
  cinema_room: 'Cinema room', playroom: 'Playroom',
  garden: 'Garden', terrace: 'Terrace / Patio', pool: 'Swimming pool',
  hot_tub: 'Hot tub', sauna: 'Sauna', gym: 'Gym',
  garage: 'Garage / Parking', games_area: 'Outdoor games area', other: 'Other',
};

function BedroomCard({ room, isSelected, onClick, t }) {
  const amenities = (room.amenities ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const typeLabel = ROOM_TYPE_LABELS[room.type] ?? room.type;

  return (
    <div
      className={`room-card${isSelected ? ' is-selected' : ''}`}
      onClick={() => onClick(room)}
      style={{ cursor: 'pointer' }}
    >
      <div className="room-card-body">
        <div className="room-name">{room.name}</div>
        {typeLabel && <div className="room-card-type">{typeLabel}</div>}
        {room.description && (
          <p style={{ margin: '6px 0 4px', fontSize: '0.82rem', color: 'var(--text-muted, #6b7280)', lineHeight: 1.4 }}>
            {room.description}
          </p>
        )}
        {amenities.length > 0 && (
          <div className="amenity-list">
            {amenities.slice(0, 4).map((a) => (
              <span key={a} className="amenity-tag">{formatAmenity(a)}</span>
            ))}
            {amenities.length > 4 && (
              <span className="amenity-tag">{t('moreAmenities')(amenities.length - 4)}</span>
            )}
          </div>
        )}
        <div style={{
          display: 'flex', alignItems: 'center',
          marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)',
        }}>
          {room.photo_count > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
              {room.primary_photo && (
                <img
                  src={`/uploads/rooms/${room.primary_thumb || room.primary_photo}`}
                  alt=""
                  onError={(e) => { e.target.style.display = 'none'; }}
                  style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }}
                />
              )}
              <span><i className="ti ti-camera" /> {room.photo_count} photo{room.photo_count !== 1 ? 's' : ''}</span>
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-camera" /> No photos yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WholePropertyPage({ rooms, loading, today, activeByRoom, selectedRoom, onCardClick, onAddBedroom, stats, t, locale }) {
  return (
    <>
      <div className="page-toolbar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('nav.property')}</h1>
          <div className="page-date">{rooms.length} {t('roomsCount')}</div>
        </div>
        <button className="btn-primary" onClick={onAddBedroom}>
          <span style={{ fontSize: '1.1em', lineHeight: 1 }}>+</span>
          {t('rooms.addRoom')}
        </button>
      </div>

      <RoomGridSection rooms={rooms} loading={loading} selectedRoom={selectedRoom} onCardClick={onCardClick} t={t} />
    </>
  );
}

// Stats + room-tile grid, shared by the WP property page and each expanded
// unit panel in Unit mode (scoped to that unit's internal rooms instead).
function RoomGridSection({ rooms, loading, selectedRoom, onCardClick, t, emptyMessage }) {
  const totalCapacity = rooms.reduce((sum, r) => sum + (r.capacity || 0), 0);

  return (
    <>
      <div className="stat-bar">
        <StatBarItem value={rooms.length}  label={t('totalRooms')} />
        <StatBarItem value={totalCapacity} label={t('guestWord')(totalCapacity)} />
      </div>

      {loading ? (
        <div className="loading-screen">{t('loadingRooms')}</div>
      ) : (rooms.length === 0 && emptyMessage) ? (
        <div className="loading-screen">{emptyMessage}</div>
      ) : (
        <div className="room-grid">
          {rooms.map((room) => (
            <BedroomCard
              key={room.id}
              room={room}
              isSelected={selectedRoom?.id === room.id}
              onClick={onCardClick}
              t={t}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── UnitsPage (Unit mode) ───────────────────────────────────────────────────
// Un mode — hardcoded English strings below are not yet in the i18n catalogue;
// this UI isn't customer-facing yet (see plan-gating note in the task).

function UnitsPage({ units, roomsByUnit, bookingsByRoom, today, property, fmtCurrency, locale, hasChargesAddon, loading, selectedRoom, onCardClick, onAddUnit, onAddRoomToUnit, onEditUnit, onUnitFieldsUpdated, t, currencySymbol }) {
  const [expandedUnitId, setExpandedUnitId] = useState(null);

  return (
    <>
      <div className="page-toolbar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Units</h1>
          <div className="page-date">{units.length} unit{units.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn-primary" onClick={onAddUnit}>
          <span style={{ fontSize: '1.1em', lineHeight: 1 }}>+</span>
          Add Unit
        </button>
      </div>

      {loading ? (
        <div className="loading-screen">{t('loadingRooms')}</div>
      ) : (
        <div className="unit-accordion">
          {units.map((unit) => (
            <UnitAccordionPanel
              key={unit.id}
              unit={unit}
              rooms={roomsByUnit[unit.id] ?? []}
              bookings={bookingsByRoom[unit.id] ?? []}
              today={today}
              property={property}
              fmtCurrency={fmtCurrency}
              locale={locale}
              hasChargesAddon={hasChargesAddon}
              isExpanded={expandedUnitId === unit.id}
              onToggle={() => setExpandedUnitId((prev) => (prev === unit.id ? null : unit.id))}
              onEdit={() => onEditUnit(unit)}
              onAddRoom={() => onAddRoomToUnit(unit)}
              onUnitFieldsUpdated={onUnitFieldsUpdated}
              selectedRoom={selectedRoom}
              onCardClick={onCardClick}
              t={t}
              currencySymbol={currencySymbol}
            />
          ))}
        </div>
      )}
    </>
  );
}

function UnitAccordionPanel({
  unit, rooms, bookings = [], today, property, fmtCurrency, locale, hasChargesAddon,
  isExpanded, onToggle, onEdit, onAddRoom, onUnitFieldsUpdated, selectedRoom, onCardClick, t, currencySymbol,
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showAccess, setShowAccess] = useState(false);

  // Same active-booking window used everywhere else (Rooms.jsx activeByRoom, RoomPanel).
  const activeBooking = bookings.find((b) =>
    b.status !== 'cancelled' &&
    b.status !== 'checked_out' &&
    b.check_in_date <= today &&
    b.check_out_date > today
  );
  // Current stay if occupied today, otherwise the soonest upcoming booking — reuses
  // RoomPanel's upcomingBookings() so "current or next" falls out for free.
  const current = activeBooking ?? upcomingBookings(bookings, today)[0] ?? null;
  const isDepartingToday = activeBooking?.check_out_date === today;
  // Same status→label map already used in RoomPanel's ScheduleRow / GuestPanel.
  const currentStatusLabel = current
    ? ({ arriving: t('calLegendInHouse'), in_house: t('calLegendInHouse'), confirmed: t('confirmed'), checked_out: t('checkedOut'), cancelled: t('cancelled') }[current.status] ?? current.status)
    : null;
  const due = current ? calcDue(current, property) : null;

  return (
    <div className={`unit-panel${isExpanded ? ' is-expanded' : ''}`}>
      <div className="unit-panel-header" onClick={onToggle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <ChevronIcon expanded={isExpanded} />
          {(unit.primary_thumb || unit.primary_photo) ? (
            <img
              src={`/uploads/rooms/${unit.primary_thumb || unit.primary_photo}`}
              alt=""
              onError={(e) => { e.target.style.display = 'none'; }}
              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--page-bg)', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {unit.name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {currencySymbol}{unit.price_per_night} {t('perNight')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <StatusPill status={unit.status} />
          <button
            className="btn-secondary"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{ border: '1.5px solid var(--border)', padding: '5px 12px', fontSize: '0.8rem' }}
          >
            Edit
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="unit-panel-body" style={{ padding: '16px 18px' }}>

          {/* ── Unit Details + Access & Arrival — side by side, 50% width each; ── */}
          {/* stacks full-width on mobile (see .unit-subsections-row, matches the */}
          {/* app's existing 767px breakpoint used by .dashboard-grid/.settings-layout) */}
          <div className="unit-subsections-row">
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div
              onClick={() => setShowDetails((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                background: 'var(--page-bg)',
              }}
            >
              <span>Unit Details</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{showDetails ? '▴' : '▾'}</span>
            </div>

            {showDetails && (
              <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                {!current ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                    <StatusPill status="available" t={t} />
                    <span>{t('noUpcomingBookings')}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {current.guest_first_name} {current.guest_last_name}
                      </span>
                      <span className={BADGE_CLASS[current.status] ?? 'badge'} style={{ fontSize: '0.68rem', padding: '2px 7px' }}>
                        {currentStatusLabel}
                      </span>
                      {isDepartingToday && (
                        <span style={{
                          fontSize: '0.68rem', padding: '2px 7px', borderRadius: 4,
                          background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24', fontWeight: 700,
                        }}>
                          Departing today
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {fmtDate(current.check_in_date, locale)} → {fmtDate(current.check_out_date, locale)}
                    </div>
                    {due != null && (
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-dark)' }}>
                        {t('coTotalDue')}: {fmtCurrency(due)}
                      </div>
                    )}

                    {/* Charges & Bar add-on gate — same condition used in Charges.jsx / Settings' Dev Tools Plan Switcher */}
                    {activeBooking && (
                      hasChargesAddon ? (
                        <Link
                          to="/app/charges"
                          style={{ marginTop: 2, fontSize: '0.83rem', fontWeight: 600, color: 'var(--accent-dark)', textDecoration: 'none' }}
                        >
                          View/Add Charges →
                        </Link>
                      ) : (
                        <div style={{ marginTop: 2, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          🔒 Requires the Charges & Bar add-on
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div
              onClick={() => setShowAccess((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                background: 'var(--page-bg)',
              }}
            >
              <span>Access & Arrival</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{showAccess ? '▴' : '▾'}</span>
            </div>

            {showAccess && (
              <UnitAccessSection unit={unit} property={property} onUnitUpdated={onUnitFieldsUpdated} />
            )}
          </div>
          </div>

          <div className="page-toolbar" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Rooms in this unit</div>
            <button className="btn-primary" onClick={onAddRoom}>
              <span style={{ fontSize: '1.1em', lineHeight: 1 }}>+</span>
              {t('rooms.addRoom')}
            </button>
          </div>
          <RoomGridSection
            rooms={rooms}
            loading={false}
            selectedRoom={selectedRoom}
            onCardClick={onCardClick}
            t={t}
            emptyMessage="No rooms added yet — click + Room to add the first one."
          />
        </div>
      )}
    </div>
  );
}

// ── UnitAccessSection — per-unit Access & Arrival ─────────────────────────────
// Reuses WP's Settings AccessCodeSection as the reference pattern (same fields,
// same photo-upload flow), scoped to this unit's own rooms row instead of the
// property. WP's own Settings section/endpoints are untouched.
const UNIT_ACCESS_METHOD_OPTIONS = [
  { value: 'none',   label: '— Not specified —' },
  { value: 'code',   label: 'Keypad / door code' },
  { value: 'keybox', label: 'Key lockbox' },
  { value: 'keyed',  label: 'Physical key (collect at office)' },
  { value: 'app',    label: 'Smart lock app' },
  { value: 'other',  label: 'Other — see arrival instructions' },
];

const UNIT_SEND_ACCESS_OPTIONS = [
  { value: '72', label: '72 hours before arrival' },
  { value: '48', label: '48 hours before arrival' },
  { value: '24', label: '24 hours before arrival' },
  { value: '12', label: '12 hours before arrival' },
];

function UnitAccessSection({ unit, property, onUnitUpdated }) {
  const [form, setForm] = useState({
    access_method:        unit.access_method ?? 'none',
    access_code:          unit.access_code ?? '',
    arrival_instructions: unit.arrival_instructions ?? '',
    send_access_hours:    String(unit.send_access_hours ?? '48'),
    staffed_checkin_available: unit.staffed_checkin_available ? 1 : 0,
  });
  const [accessPhoto,     setAccessPhoto]     = useState(unit.access_photo ?? null);
  const [uploadingPhoto,  setUploadingPhoto]  = useState(false);
  const [saving,          setSaving]          = useState(false);
  const photoInputRef = useRef(null);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/rooms/${unit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Unrelated room fields — sent as-is since PUT /:id isn't defensive
          // about these; only the 4 new access fields fall back to the room's
          // existing value when a caller (like RoomPanel) omits them.
          property_id:        unit.property_id,
          name:                unit.name,
          type:                unit.type,
          price_per_night:     unit.price_per_night,
          capacity:            unit.capacity,
          amenities:           unit.amenities,
          status:              unit.status,
          breakfast_included:  unit.breakfast_included,
          description:         unit.description,
          access_method:        form.access_method,
          access_code:          form.access_code.trim() || null,
          arrival_instructions: form.arrival_instructions.trim() || null,
          send_access_hours:    form.send_access_hours,
          staffed_checkin_available: form.staffed_checkin_available ? 1 : 0,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUnitUpdated?.(updated);
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await apiFetch(`/api/rooms/${unit.id}/access-photo`, { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        setAccessPhoto(data.filename);
        onUnitUpdated?.({ ...unit, access_photo: data.filename });
      }
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handlePhotoDelete = async () => {
    const res = await apiFetch(`/api/rooms/${unit.id}/access-photo`, { method: 'DELETE' });
    if (res.ok) {
      setAccessPhoto(null);
      onUnitUpdated?.({ ...unit, access_photo: null });
    }
  };

  return (
    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
          Access method
        </label>
        <select name="access_method" className="form-control" value={form.access_method} onChange={handleChange}>
          {UNIT_ACCESS_METHOD_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
          Access code
        </label>
        <input
          type="text" name="access_code" className="form-control"
          value={form.access_code} onChange={handleChange}
          placeholder="e.g. 1234 or A-2468"
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
          Arrival instructions
        </label>
        <textarea
          name="arrival_instructions" className="form-control" rows={4}
          value={form.arrival_instructions} onChange={handleChange}
          placeholder="e.g. The key safe is to the right of the front door. Code is 1234. Parking available on-site..."
          style={{ resize: 'vertical', width: '100%' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
          Send access details
        </label>
        <select name="send_access_hours" className="form-control" value={String(form.send_access_hours)} onChange={handleChange}>
          {UNIT_SEND_ACCESS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Only relevant when walk-in is enabled (Aparthotel/Glamping) — Serviced
          Apartment always has walk_in_enabled locked off, so this stays hidden there. */}
      {!!property?.walk_in_enabled && (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!form.staffed_checkin_available}
              onChange={(e) => setForm((p) => ({ ...p, staffed_checkin_available: e.target.checked ? 1 : 0 }))}
            />
            <span style={{ fontSize: '0.875rem' }}>
              Offer staffed check-in (a person meets the guest, e.g. at your office/reception)
            </span>
          </label>
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
          Key location photo
        </label>
        <input
          ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }} onChange={handlePhotoUpload}
        />
        {accessPhoto ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <img
              src={`/uploads/access/${accessPhoto}`}
              alt="Key location"
              style={{ maxWidth: 240, maxHeight: 180, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 12px' }}
                onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
              >
                {uploadingPhoto ? 'Uploading…' : 'Replace photo'}
              </button>
              <button
                type="button" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 12px', color: '#dc2626' }}
                onClick={handlePhotoDelete} disabled={uploadingPhoto}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 12px' }}
            onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
          >
            {uploadingPhoto ? 'Uploading…' : 'Upload photo'}
          </button>
        )}
      </div>

      <div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`unit-chevron${expanded ? ' is-expanded' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
