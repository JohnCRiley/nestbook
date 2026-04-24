import { useState, useEffect, useMemo, useRef } from 'react';
import { localToday, LOCALE_MAP } from '../utils/format.js';
import { StatusPill, formatAmenity } from './rooms/RoomPanel.jsx';
import RoomPanel    from './rooms/RoomPanel.jsx';
import NewRoomModal from './rooms/NewRoomModal.jsx';
import NewBookingModal from './bookings/NewBookingModal.jsx';
import Pagination from '../components/Pagination.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import usePageSize from '../hooks/usePageSize.js';

// toolbar + stat-bar + padding
const RESERVED = 120;

// ── Main component ────────────────────────────────────────────────────────────

export default function Rooms() {
  const today = localToday();
  const t = useT();
  const { currencySymbol, property, locale } = useLocale();
  const pageSize = usePageSize(140, RESERVED);

  const [rooms,         setRooms]         = useState([]);
  const [bookings,      setBookings]      = useState([]);
  const [guests,        setGuests]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedRoom,  setSelectedRoom]  = useState(null);
  const [showNewRoom,   setShowNewRoom]   = useState(false);
  const [bookingValues, setBookingValues] = useState(null);   // pre-fill for booking modal
  const [page,          setPage]          = useState(1);

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
      apiFetch('/api/guests').then((r) => r.ok ? r.json() : []),
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCardClick = (room) =>
    setSelectedRoom((prev) => (prev?.id === room.id ? null : room));

  const handleRoomUpdated = (updated) => {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedRoom(updated);
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
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

      {/* ── Stat bar ─────────────────────────────────────────────────────── */}
      <div className="stat-bar">
        <StatBarItem value={stats.total}       label={t('totalRooms')} />
        <StatBarItem value={stats.available}   label={t('availableTonight')} accent="var(--accent)" />
        <StatBarItem value={stats.occupied}    label={t('occupied')}         accent="#f59e0b" />
        <StatBarItem value={stats.maintenance} label={t('maintenance')}      accent="#94a3b8" />
      </div>

      {/* ── Card grid ────────────────────────────────────────────────────── */}
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
              breakfastIncluded={!!property?.breakfast_included}
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
          onClose={() => setShowNewRoom(false)}
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
      {/* Coloured top stripe */}
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
            fontSize: '0.72rem', fontWeight: 600, color: '#1a4710',
            background: '#d9f0cc', border: '1px solid #86efac',
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
      </div>

      {/* Occupied strip */}
      {isOccupied && (
        <div className="room-occupied-strip">
          <span>🛏</span>
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
