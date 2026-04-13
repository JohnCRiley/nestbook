import { useState, useEffect, useMemo, useCallback } from 'react';
import { localToday }  from '../utils/format.js';
import BookingPanel    from './bookings/BookingPanel.jsx';
import NewBookingModal from './bookings/NewBookingModal.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string into a local-midnight Date (avoids UTC drift). */
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as YYYY-MM-DD. */
function toIso(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Return the Monday of the week containing `date`. */
function weekStart(date) {
  const d = new Date(date);
  const day = d.getDay();                     // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;     // shift to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

/** Return an array of 7 Date objects starting from `monday`. */
function weekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Add N weeks to a Date (returns a new Date). */
function addWeeks(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}

/** Add N days to a Date (returns a new Date). */
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** "Mon 30" */
function fmtDayHeader(date, dayNames) {
  return {
    name: dayNames[date.getDay() === 0 ? 6 : date.getDay() - 1],
    num:  date.getDate(),
  };
}

/** "March 2026" or "March – April 2026" for the week label. */
function weekLabel(days, monthNames) {
  const first = days[0], last = days[6];
  if (first.getMonth() === last.getMonth()) {
    return `${monthNames[first.getMonth()]} ${first.getFullYear()}`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${monthNames[first.getMonth()]} \u2013 ${monthNames[last.getMonth()]} ${first.getFullYear()}`;
  }
  return `${monthNames[first.getMonth()]} ${first.getFullYear()} \u2013 ${monthNames[last.getMonth()]} ${last.getFullYear()}`;
}

/** "5 – 7 Apr 2026" or "30 Mar – 1 Apr 2026" for the mobile 3-day label. */
function mobileDayLabel(days, monthNames) {
  const first = days[0], last = days[days.length - 1];
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} \u2013 ${last.getDate()} ${monthNames[first.getMonth()]} ${first.getFullYear()}`;
  }
  return `${first.getDate()} ${monthNames[first.getMonth()]} \u2013 ${last.getDate()} ${monthNames[last.getMonth()]} ${last.getFullYear()}`;
}

// ── Cell state resolver ───────────────────────────────────────────────────────

/**
 * For a given room + day, find the booking (if any) that covers that day,
 * then return a descriptor used to render and style the cell.
 *
 * "Covers" means: check_in_date <= day < check_out_date
 * (guests leave on check-out day so that cell is free for the next arrival).
 */
function cellInfo(bookings, roomId, dayIso) {
  const booking = bookings.find(
    (b) =>
      b.room_id === roomId &&
      b.status !== 'cancelled' &&
      b.check_in_date <= dayIso &&
      b.check_out_date > dayIso
  );
  return booking ?? null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Calendar() {
  const today   = localToday();
  const todayDate = parseDate(today);
  const t = useT();
  const { property } = useLocale();

  const DAY_NAMES   = t('dayNames');
  const MONTH_NAMES = t('monthNames');

  // week anchor: always a Monday (desktop/tablet)
  const [monday, setMonday] = useState(() => weekStart(todayDate));

  // mobile 3-day view: center date
  const [mobileCenter, setMobileCenter] = useState(todayDate);

  // responsive breakpoint detection
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const [bookings, setBookings] = useState([]);
  const [rooms,    setRooms]    = useState([]);
  const [guests,   setGuests]   = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [selectedBooking,  setSelectedBooking]  = useState(null);
  const [newModalValues,   setNewModalValues]   = useState(null);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!property?.id) return;
    Promise.all([
      apiFetch(`/api/bookings?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
      apiFetch(`/api/rooms?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
      apiFetch('/api/guests').then((r) => r.ok ? r.json() : []),
    ]).then(([b, r, g]) => {
      setBookings(Array.isArray(b) ? b : []);
      setRooms(Array.isArray(r) ? r : []);
      setGuests(Array.isArray(g) ? g : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [property?.id]);

  const refreshBookings = useCallback(() =>
    apiFetch(`/api/bookings?property_id=${property?.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((b) => setBookings(Array.isArray(b) ? b : [])), [property?.id]);

  // ── Days derived from anchor (7-day desktop or 3-day mobile) ─────────────
  const days = useMemo(() => {
    if (isMobile) return [-1, 0, 1].map((offset) => addDays(mobileCenter, offset));
    return weekDays(monday);
  }, [isMobile, monday, mobileCenter]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goPrev  = () => { if (isMobile) setMobileCenter((c) => addDays(c, -3)); else setMonday((m) => addWeeks(m, -1)); };
  const goNext  = () => { if (isMobile) setMobileCenter((c) => addDays(c, +3)); else setMonday((m) => addWeeks(m, +1)); };
  const goToday = () => { if (isMobile) setMobileCenter(todayDate); else setMonday(weekStart(todayDate)); };

  // ── Cell click handlers ────────────────────────────────────────────────────
  const handleBookedClick = (booking) => {
    setNewModalValues(null);
    setSelectedBooking((prev) => (prev?.id === booking.id ? null : booking));
  };

  const handleEmptyClick = (roomId, dayIso) => {
    setSelectedBooking(null);
    // Pre-fill modal: room selected, check-in = clicked day, check-out = next day
    const nextDay = toIso(new Date(parseDate(dayIso).setDate(parseDate(dayIso).getDate() + 1)));
    setNewModalValues({ room_id: String(roomId), check_in_date: dayIso, check_out_date: nextDay });
  };

  const handlePanelStatusUpdate = (bookingId, newStatus) => {
    apiFetch(`/api/bookings/${bookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...selectedBooking, status: newStatus }),
    })
      .then((r) => r.json())
      .then((updated) => {
        setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        setSelectedBooking(updated);
      });
  };

  const handleNewSuccess = () => {
    setNewModalValues(null);
    refreshBookings();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="loading-screen">{t('loadingCalendar')}</div>;

  const isCurrentPeriod = isMobile
    ? toIso(mobileCenter) === today
    : toIso(monday) === toIso(weekStart(todayDate));

  return (
    <>
      {/* ── Page toolbar ────────────────────────────────────────────────── */}
      <div className="page-toolbar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('calendar')}</h1>
          <div className="page-date">{t('calHint')}</div>
        </div>

        {/* Week navigation */}
        <div className="calendar-nav">
          <button className="cal-nav-btn" onClick={goPrev} aria-label="Previous">‹</button>

          <span className="cal-week-label">
            {isMobile ? mobileDayLabel(days, MONTH_NAMES) : weekLabel(days, MONTH_NAMES)}
          </span>

          <button className="cal-nav-btn" onClick={goNext} aria-label="Next">›</button>

          {!isCurrentPeriod && (
            <button className="btn-secondary" onClick={goToday} style={{ padding: '7px 14px' }}>
              {t('today')}
            </button>
          )}
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <Legend t={t} />
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div className="calendar-scroll">
        <div className="calendar-grid">

          {/* ── Header row ─────────────────────────────────────────────── */}
          <div className="cal-corner" />
          {days.map((day) => {
            const iso      = toIso(day);
            const isToday  = iso === today;
            const { name, num } = fmtDayHeader(day, DAY_NAMES);
            return (
              <div key={iso} className={`cal-day-header${isToday ? ' is-today' : ''}`}>
                <div className="cal-day-name">{name}</div>
                <div className="cal-day-num">{num}</div>
              </div>
            );
          })}

          {/* ── Room rows ──────────────────────────────────────────────── */}
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              days={days}
              today={today}
              bookings={bookings}
              selectedBookingId={selectedBooking?.id}
              onBookedClick={handleBookedClick}
              onEmptyClick={handleEmptyClick}
            />
          ))}

        </div>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selectedBooking && (
        <BookingPanel
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onStatusUpdate={handlePanelStatusUpdate}
        />
      )}

      {/* ── New booking modal ─────────────────────────────────────────────── */}
      {newModalValues && (
        <NewBookingModal
          rooms={rooms}
          guests={guests}
          initialValues={newModalValues}
          onClose={() => setNewModalValues(null)}
          onSuccess={handleNewSuccess}
        />
      )}
    </>
  );
}

// ── RoomRow ───────────────────────────────────────────────────────────────────

function RoomRow({ room, days, today, bookings, selectedBookingId, onBookedClick, onEmptyClick }) {
  const isMaintenance = room.status === 'maintenance';

  return (
    <>
      {/* Room label */}
      <div className={`cal-room-label${isMaintenance ? ' cal-room-maintenance' : ''}`}>
        <div className="cal-room-name" title={room.name}>{room.name}</div>
        <div className="cal-room-type">{room.type} · {room.capacity} guests</div>
      </div>

      {/* Day cells */}
      {days.map((day) => {
        const iso     = toIso(day);
        const booking = isMaintenance ? null : cellInfo(bookings, room.id, iso);

        if (isMaintenance) {
          return <div key={iso} className="cal-cell is-maintenance" />;
        }

        if (booking) {
          return (
            <BookedCell
              key={iso}
              booking={booking}
              isSelected={selectedBookingId === booking.id}
              onClick={() => onBookedClick(booking)}
            />
          );
        }

        return (
          <EmptyCell
            key={iso}
            isPast={iso < today}
            onClick={() => onEmptyClick(room.id, iso)}
          />
        );
      })}
    </>
  );
}

// ── BookedCell ────────────────────────────────────────────────────────────────

function BookedCell({ booking: b, isSelected, onClick }) {
  const statusClass =
    b.status === 'checked_out' ? 'is-checked-out' :
    b.status === 'arriving' && b.check_in_date === b.check_in_date ? 'is-booked' :
    'is-booked';

  // Use a lighter shade on check-in day specifically
  const isArriving = b.status === 'arriving';
  const cellClass  = isArriving ? 'is-arriving' : statusClass;

  const style = isSelected
    ? { outline: '2px solid var(--accent-dark)', outlineOffset: '-2px', zIndex: 1 }
    : {};

  return (
    <div
      className={`cal-cell ${cellClass}`}
      style={style}
      onClick={onClick}
      title={`${b.guest_first_name} ${b.guest_last_name} — ${b.room_name}\n${b.check_in_date} → ${b.check_out_date}`}
    >
      <div className="cal-cell-inner">
        <div className="cal-guest-name">{b.guest_first_name}</div>
        <div className="cal-booking-nights">→ {formatCheckOut(b.check_out_date)}</div>
      </div>
    </div>
  );
}

// ── EmptyCell ─────────────────────────────────────────────────────────────────

function EmptyCell({ isPast, onClick }) {
  // Past empty cells are not clickable — can't book in the past
  return (
    <div
      className="cal-cell is-empty"
      style={isPast ? { cursor: 'default', opacity: 0.5 } : {}}
      onClick={isPast ? undefined : onClick}
    >
      {!isPast && (
        <div className="cal-cell-inner" style={{ alignItems: 'center' }}>
          <span className="cal-empty-hint">+</span>
        </div>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({ t }) {
  const items = [
    { cls: 'sw-arriving',    label: t('calLegendInHouse') },
    { cls: 'sw-booked',      label: t('calLegendConfirmed') },
    { cls: 'sw-checked-out', label: t('calLegendCheckedOut') },
    { cls: 'sw-available',   label: t('calLegendAvailable') },
    { cls: 'sw-maintenance', label: t('calLegendMaintenance') },
  ];
  return (
    <div className="cal-legend">
      {items.map(({ cls, label }) => (
        <div key={cls} className="legend-item">
          <span className={`legend-swatch ${cls}`} />
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Tiny helper ───────────────────────────────────────────────────────────────

/** "2 Apr" — used in booked cell subtitle. */
function formatCheckOut(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
