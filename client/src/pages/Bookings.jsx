import { useState, useEffect, useMemo } from 'react';
import { localToday } from '../utils/format.js';
import { BADGE_CLASS, BADGE_LABEL, SOURCE_LABELS } from '../utils/bookingConstants.js';
import BookingPanel    from './bookings/BookingPanel.jsx';
import NewBookingModal from './bookings/NewBookingModal.jsx';
import { apiFetch } from '../utils/apiFetch.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all',         label: 'All'          },
  { key: 'arriving',    label: 'Arriving'     },
  { key: 'in_house',    label: 'In House'     },
  { key: 'confirmed',   label: 'Confirmed'    },
  { key: 'checked_out', label: 'Checked Out'  },
  { key: 'cancelled',   label: 'Cancelled'    },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function Bookings() {
  const today = localToday();

  const [bookings,       setBookings]       = useState([]);
  const [rooms,          setRooms]          = useState([]);
  const [guests,         setGuests]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [activeFilter,   setActiveFilter]   = useState('all');
  const [search,         setSearch]         = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showNewModal,   setShowNewModal]   = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiFetch('/api/bookings?property_id=1').then((r) => r.json()),
      apiFetch('/api/rooms?property_id=1').then((r) => r.json()),
      apiFetch('/api/guests').then((r) => r.json()),
    ]).then(([b, r, g]) => {
      setBookings(b);
      setRooms(r);
      setGuests(g);
      setLoading(false);
    });
  }, []);

  const refreshBookings = () =>
    apiFetch('/api/bookings?property_id=1')
      .then((r) => r.json())
      .then(setBookings);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return bookings
      .filter((b) => {
        switch (activeFilter) {
          case 'arriving':    return b.status === 'arriving' && b.check_in_date === today;
          case 'in_house':    return b.status === 'arriving' && b.check_in_date <  today;
          case 'confirmed':   return b.status === 'confirmed';
          case 'checked_out': return b.status === 'checked_out';
          case 'cancelled':   return b.status === 'cancelled';
          default:            return true;
        }
      })
      .filter((b) => {
        if (!search.trim()) return true;
        const name = `${b.guest_first_name} ${b.guest_last_name}`.toLowerCase();
        return name.includes(search.toLowerCase());
      });
  }, [bookings, activeFilter, search, today]);

  // ── Filter counts ──────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    all:         bookings.length,
    arriving:    bookings.filter((b) => b.status === 'arriving' && b.check_in_date === today).length,
    in_house:    bookings.filter((b) => b.status === 'arriving' && b.check_in_date <  today).length,
    confirmed:   bookings.filter((b) => b.status === 'confirmed').length,
    checked_out: bookings.filter((b) => b.status === 'checked_out').length,
    cancelled:   bookings.filter((b) => b.status === 'cancelled').length,
  }), [bookings, today]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleRowClick = (booking) =>
    setSelectedBooking((prev) => (prev?.id === booking.id ? null : booking));

  const handlePanelClose = () => setSelectedBooking(null);

  const handleNewBookingSuccess = () => {
    setShowNewModal(false);
    refreshBookings();
  };

  const handleStatusUpdate = (bookingId, newStatus) => {
    apiFetch(`/api/bookings/${bookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // Merge the new status into the current selected booking fields
      body: JSON.stringify({ ...selectedBooking, status: newStatus }),
    })
      .then((r) => r.json())
      .then((updated) => {
        setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        setSelectedBooking(updated);
      });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="loading-screen">Loading bookings…</div>;

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-toolbar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Bookings</h1>
          <div className="page-date">{bookings.length} total reservations</div>
        </div>
        <button className="btn-primary" onClick={() => setShowNewModal(true)}>
          <span style={{ fontSize: '1.1em', lineHeight: 1 }}>+</span>
          New Booking
        </button>
      </div>

      {/* ── Controls: search + filters ────────────────────────────────────── */}
      <div className="controls-row">
        {/* Search */}
        <div className="search-wrap">
          <SearchIcon />
          <input
            type="text"
            className="search-input"
            placeholder="Search guest name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter pills */}
        <div className="filter-bar">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              className={`filter-btn${activeFilter === key ? ' active' : ''}`}
              onClick={() => setActiveFilter(key)}
            >
              {label}
              <span className="f-count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="table-wrap">
        {filtered.length === 0 ? (
          <div className="table-empty">
            {search ? `No bookings matching "${search}"` : 'No bookings for this filter'}
          </div>
        ) : (
          <table className="bookings-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Room</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th style={{ textAlign: 'center' }}>Guests</th>
                <th>Source</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  isSelected={selectedBooking?.id === b.id}
                  onClick={handleRowClick}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selectedBooking && (
        <BookingPanel
          booking={selectedBooking}
          onClose={handlePanelClose}
          onStatusUpdate={handleStatusUpdate}
        />
      )}

      {/* ── New booking modal ─────────────────────────────────────────────── */}
      {showNewModal && (
        <NewBookingModal
          rooms={rooms}
          guests={guests}
          onClose={() => setShowNewModal(false)}
          onSuccess={handleNewBookingSuccess}
        />
      )}
    </>
  );
}

// ── BookingRow ────────────────────────────────────────────────────────────────

function BookingRow({ booking: b, isSelected, onClick }) {
  return (
    <tr
      className={isSelected ? 'row-selected' : ''}
      onClick={() => onClick(b)}
    >
      {/* Guest */}
      <td>
        <div className="cell-guest-name">{b.guest_first_name} {b.guest_last_name}</div>
        <div className="cell-guest-id">#{b.id}</div>
      </td>

      {/* Room */}
      <td>{b.room_name ?? '—'}</td>

      {/* Check-in */}
      <td>{formatTableDate(b.check_in_date)}</td>

      {/* Check-out */}
      <td>{formatTableDate(b.check_out_date)}</td>

      {/* Guests count */}
      <td style={{ textAlign: 'center' }}>{b.num_guests}</td>

      {/* Source */}
      <td>
        <span className={`source-chip source-${b.source}`}>
          {SOURCE_LABELS[b.source] ?? b.source}
        </span>
      </td>

      {/* Price */}
      <td className="cell-price">
        {b.total_price != null ? `€${Number(b.total_price).toLocaleString('en-GB')}` : <span className="cell-muted">TBC</span>}
      </td>

      {/* Status */}
      <td>
        <span className={BADGE_CLASS[b.status] ?? 'badge'}>
          {BADGE_LABEL[b.status] ?? b.status}
        </span>
      </td>
    </tr>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "30 Mar 2026" for table cells */
function formatTableDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
