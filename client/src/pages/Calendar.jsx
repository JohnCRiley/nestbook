import { useState, useEffect, useMemo, useCallback } from 'react';
import { localToday, addDays as addDaysStr } from '../utils/format.js';
import { isEligibleForBreakfast } from '../utils/breakfast.js';
import BookingPanel    from './bookings/BookingPanel.jsx';
import NewBookingModal from './bookings/NewBookingModal.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import { LOCALE_MAP } from '../utils/format.js';

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
 * For a given room + day, return the active booking (if any) that blocks the cell,
 * or a historical (checked_out) booking for faded display.
 *
 * "Covers" means: check_in_date <= day < check_out_date
 * Returns: { booking, historical: bool } | null
 */
function cellInfo(bookings, roomId, dayIso) {
  // Active booking — blocks the cell and prevents new bookings
  const active = bookings.find(
    (b) =>
      b.room_id === roomId &&
      b.status !== 'cancelled' &&
      b.status !== 'checked_out' &&
      b.check_in_date <= dayIso &&
      b.check_out_date > dayIso
  );
  if (active) return { booking: active, historical: false };

  // Historical checked-out booking — show faded, cell is available
  const historical = bookings.find(
    (b) =>
      b.room_id === roomId &&
      b.status === 'checked_out' &&
      b.check_in_date <= dayIso &&
      b.check_out_date > dayIso
  );
  if (historical) return { booking: historical, historical: true };

  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Calendar() {
  const today   = localToday();
  const todayDate = parseDate(today);
  const t = useT();
  const { property, locale } = useLocale();

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
  const [pageToast,        setPageToast]        = useState(null);

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

  const showPageToast = (msg) => {
    setPageToast(msg);
    setTimeout(() => setPageToast(null), 3000);
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
        if (newStatus === 'arriving') {
          setSelectedBooking(null);
          showPageToast(t('checkedInToast'));
        } else if (newStatus === 'cancelled') {
          setSelectedBooking(null);
          showPageToast(t('bookingCancelledToast'));
        } else {
          setSelectedBooking(updated);
        }
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
      {pageToast && (
        <div className="toast toast-success">{pageToast}</div>
      )}

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
              todayIso={today}
              bookings={bookings}
              selectedBookingId={selectedBooking?.id}
              onBookedClick={handleBookedClick}
              onEmptyClick={handleEmptyClick}
              t={t}
              locale={locale}
              property={property}
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
          onSave={(updated) => {
            setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
            if (updated.status === 'checked_out') {
              setSelectedBooking(null);
              showPageToast(t('coCheckedOutToast'));
            } else {
              setSelectedBooking(updated);
            }
          }}
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

function RoomRow({ room, days, today, bookings, selectedBookingId, onBookedClick, onEmptyClick, t, locale, todayIso, property }) {
  const isMaintenance = room.status === 'maintenance';

  return (
    <>
      {/* Room label */}
      <div className={`cal-room-label${isMaintenance ? ' cal-room-maintenance' : ''}`}>
        <div className="cal-room-name" title={room.name}>{room.name}</div>
        <div className="cal-room-type">{room.type} · {t('guestWord')(room.capacity)}</div>
      </div>

      {/* Day cells */}
      {days.map((day) => {
        const iso    = toIso(day);
        const info   = isMaintenance ? null : cellInfo(bookings, room.id, iso);

        if (isMaintenance) {
          return <div key={iso} className="cal-cell is-maintenance" />;
        }

        if (info && !info.historical) {
          return (
            <BookedCell
              key={iso}
              booking={info.booking}
              isSelected={selectedBookingId === info.booking.id}
              onClick={() => onBookedClick(info.booking)}
              locale={locale ?? 'en'}
              todayIso={todayIso ?? today}
              cellDate={iso}
              t={t}
              property={property}
            />
          );
        }

        if (info && info.historical) {
          return (
            <HistoricalCell
              key={iso}
              booking={info.booking}
              onClick={() => onEmptyClick(room.id, iso)}
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

function BookedCell({ booking: b, isSelected, onClick, locale = 'en', todayIso, cellDate, t, property }) {
  const statusClass =
    b.status === 'checked_out' ? 'is-checked-out' : 'is-booked';

  const isArriving = b.status === 'arriving';
  const cellClass  = isArriving ? 'is-arriving' : statusClass;

  const style = isSelected
    ? { outline: '2px solid var(--accent-dark)', outlineOffset: '-2px', zIndex: 1 }
    : {};

  const showCiBadge = todayIso && b.check_in_date === todayIso && b.status === 'confirmed';
  const showCoBadge = todayIso && b.check_out_date === todayIso && b.status === 'arriving';

  const showBfBadge = !!cellDate && isEligibleForBreakfast(b, null, property, cellDate);

  return (
    <div
      className={`cal-cell ${cellClass}`}
      style={style}
      onClick={onClick}
      title={`${b.guest_first_name} ${b.guest_last_name} — ${b.room_name}\n${b.check_in_date} → ${b.check_out_date}`}
    >
      {showBfBadge && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 6, background: '#16a34a',
        }} />
      )}
      <div className="cal-cell-inner">
        <div className="cal-guest-name" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {showCiBadge && <span className="cal-action-badge cal-ci-badge">{t ? t('calCiBadge') : 'CI'}</span>}
          {showCoBadge && <span className="cal-action-badge cal-co-badge">{t ? t('calCoBadge') : 'CO'}</span>}
          {b.guest_first_name}
        </div>
        <div className="cal-booking-nights">→ {formatCheckOut(b.check_out_date, locale)}</div>
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

// ── HistoricalCell ────────────────────────────────────────────────────────────

function HistoricalCell({ booking: b, onClick }) {
  return (
    <div
      className="cal-cell is-checked-out cal-cell-historical"
      onClick={onClick}
      title={`${b.guest_first_name} ${b.guest_last_name} — checked out\nClick to book`}
    >
      <div className="cal-cell-inner">
        <div className="cal-guest-name" style={{ textDecoration: 'line-through', opacity: 0.5 }}>
          {b.guest_first_name}
        </div>
      </div>
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
function formatCheckOut(dateStr, locale = 'en') {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', { day: 'numeric', month: 'short' });
}
