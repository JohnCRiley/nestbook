import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { localToday, LOCALE_MAP } from '../utils/format.js';
import { BADGE_CLASS, SOURCE_LABELS } from '../utils/bookingConstants.js';
import BookingPanel    from './bookings/BookingPanel.jsx';
import NewBookingModal from './bookings/NewBookingModal.jsx';
import Pagination      from '../components/Pagination.jsx';
import { apiFetch }    from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';

const LIMIT = 20;

export default function Bookings() {
  const today = localToday();
  const t = useT();
  const { property, locale } = useLocale();
  const location = useLocation();

  const FILTERS = [
    { key: 'all',         label: t('filters')[0] },
    { key: 'arriving',    label: t('filters')[1] },
    { key: 'in_house',    label: t('filters')[2] },
    { key: 'confirmed',   label: t('filters')[3] },
    { key: 'checked_out', label: t('filters')[4] },
    { key: 'cancelled',   label: t('filters')[5] },
  ];

  // If we arrived via "New Booking" on the dashboard, remember the intent but
  // don't open the modal yet — wait until guests have loaded so the dropdown
  // is populated when the modal first renders.
  const autoOpenPending = useRef(!!location.state?.openModal);

  const [bookings,        setBookings]        = useState([]);
  const [rooms,           setRooms]           = useState([]);
  const [guests,          setGuests]          = useState([]);
  const [guestsLoaded,    setGuestsLoaded]    = useState(false);
  const [counts,          setCounts]          = useState({ all: 0, arriving: 0, in_house: 0, confirmed: 0, checked_out: 0, cancelled: 0 });
  const [loading,         setLoading]         = useState(true);
  const [activeFilter,    setActiveFilter]    = useState('all');
  const [search,          setSearch]          = useState('');
  const [page,            setPage]            = useState(1);
  const [total,           setTotal]           = useState(0);
  const [totalPages,      setTotalPages]      = useState(0);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showNewModal,    setShowNewModal]    = useState(false);

  // Debounced search — only fires 350 ms after typing stops
  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on new search
    }, 350);
    return () => clearTimeout(searchDebounceRef.current);
  }, [search]);

  // ── Fetch filter counts (separate from paginated data) ──────────────────────
  const fetchCounts = useCallback(() => {
    if (!property?.id) return;
    apiFetch(`/api/bookings/counts?property_id=${property.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setCounts(data); })
      .catch(() => {});
  }, [property?.id]);

  // ── Fetch paginated bookings ─────────────────────────────────────────────────
  const fetchBookings = useCallback(() => {
    if (!property?.id) return;
    const params = new URLSearchParams({
      property_id: property.id,
      page,
      limit: LIMIT,
    });
    if (activeFilter !== 'all') params.set('filter', activeFilter);
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

    setLoading(true);
    apiFetch(`/api/bookings?${params}`)
      .then((r) => r.ok ? r.json() : { bookings: [], total: 0, page: 1, totalPages: 0 })
      .then(({ bookings: rows, total: tot, totalPages: tp }) => {
        setBookings(rows);
        setTotal(tot);
        setTotalPages(tp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [property?.id, page, activeFilter, debouncedSearch]);

  // ── Initial load: rooms + guests (for modal) ─────────────────────────────────
  useEffect(() => {
    if (!property?.id) return;
    Promise.all([
      apiFetch(`/api/rooms?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
      apiFetch('/api/guests').then((r) => r.ok ? r.json() : []),
    ]).then(([r, g]) => {
      setRooms(Array.isArray(r) ? r : []);
      setGuests(Array.isArray(g) ? g : []);
      setGuestsLoaded(true);
    }).catch(() => {
      setGuestsLoaded(true); // unblock auto-open even on error
    });
  }, [property?.id]);

  // ── Auto-open modal once guests are loaded (dashboard "New Booking" flow) ─────
  useEffect(() => {
    if (guestsLoaded && autoOpenPending.current) {
      autoOpenPending.current = false;
      setShowNewModal(true);
    }
  }, [guestsLoaded]);

  // ── Fetch bookings + counts whenever deps change ─────────────────────────────
  useEffect(() => { fetchBookings(); fetchCounts(); }, [fetchBookings, fetchCounts]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleFilterChange = (key) => {
    setActiveFilter(key);
    setPage(1);
  };

  const handleRowClick = (booking) =>
    setSelectedBooking((prev) => (prev?.id === booking.id ? null : booking));

  const handlePanelClose = () => setSelectedBooking(null);

  const handleNewBookingSuccess = () => {
    setShowNewModal(false);
    fetchBookings();
    fetchCounts();
  };

  const handleBookingSaved = (updated) => {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setSelectedBooking(updated);
    fetchCounts();
  };

  const handleStatusUpdate = (bookingId, newStatus) => {
    apiFetch(`/api/bookings/${bookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...selectedBooking, status: newStatus }),
    })
      .then((r) => r.json())
      .then((updated) => {
        setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        setSelectedBooking(updated);
        fetchCounts();
      });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-toolbar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('bookings')}</h1>
          <div className="page-date">{total} {t('totalReservations')}</div>
        </div>
        <button className="btn-primary" onClick={() => setShowNewModal(true)}>
          <span style={{ fontSize: '1.1em', lineHeight: 1 }}>+</span>
          {t('newBooking').replace('+ ', '')}
        </button>
      </div>

      {/* ── Controls: search + filters ────────────────────────────────────── */}
      <div className="controls-row">
        <div className="search-wrap">
          <SearchIcon />
          <input
            type="text"
            className="search-input"
            placeholder={t('searchBooking')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-bar">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              className={`filter-btn${activeFilter === key ? ' active' : ''}`}
              onClick={() => handleFilterChange(key)}
            >
              {label}
              <span className="f-count">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading / empty ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="loading-screen">{t('loadingBookings')}</div>
      ) : bookings.length === 0 ? (
        <div className="table-empty">
          {search.trim() ? t('noBookingsMatching')(search.trim()) : t('noBookingsFilter')}
        </div>
      ) : (
        <>
          {/* ── Mobile card list ─────────────────────────────────────────── */}
          <div className="booking-cards">
            {bookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                isSelected={selectedBooking?.id === b.id}
                onClick={handleRowClick}
              />
            ))}
          </div>

          {/* ── Desktop table ────────────────────────────────────────────── */}
          <div className="table-wrap">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>{t('thGuest')}</th>
                  <th>{t('thRoom')}</th>
                  <th>{t('thCheckIn')}</th>
                  <th>{t('thCheckOut')}</th>
                  <th style={{ textAlign: 'center' }}>{t('thGuests')}</th>
                  <th>{t('thSource')}</th>
                  <th>{t('thTotal')}</th>
                  <th>{t('thStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    isSelected={selectedBooking?.id === b.id}
                    onClick={handleRowClick}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIMIT}
            onPage={setPage}
          />
        </>
      )}

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selectedBooking && (
        <BookingPanel
          booking={selectedBooking}
          rooms={rooms}
          guests={guests}
          onClose={handlePanelClose}
          onStatusUpdate={handleStatusUpdate}
          onSave={handleBookingSaved}
        />
      )}

      {/* ── New booking modal ─────────────────────────────────────────────── */}
      {showNewModal && (
        <NewBookingModal
          rooms={rooms}
          guests={guests}
          initialValues={location.state?.prefillGuestId
            ? { guest_id: String(location.state.prefillGuestId) }
            : undefined}
          onClose={() => setShowNewModal(false)}
          onSuccess={handleNewBookingSuccess}
        />
      )}
    </>
  );
}

// ── BookingRow ────────────────────────────────────────────────────────────────

function BookingRow({ booking: b, isSelected, onClick }) {
  const { fmtCurrency, locale } = useLocale();
  const t = useT();
  const statusLabel = { arriving: t('calLegendInHouse'), confirmed: t('confirmed'), checked_out: t('checkedOut'), cancelled: t('cancelled') }[b.status] ?? b.status;
  return (
    <tr
      className={isSelected ? 'row-selected' : ''}
      onClick={() => onClick(b)}
    >
      <td>
        <div className="cell-guest-name">{b.guest_first_name} {b.guest_last_name}</div>
        <div className="cell-guest-id">#{b.id}</div>
      </td>
      <td>{b.room_name ?? '—'}</td>
      <td>{formatTableDate(b.check_in_date, locale)}</td>
      <td>{formatTableDate(b.check_out_date, locale)}</td>
      <td style={{ textAlign: 'center' }}>{b.num_guests}</td>
      <td>
        <span className={`source-chip source-${b.source}`}>
          {SOURCE_LABELS[b.source] ?? b.source}
        </span>
      </td>
      <td className="cell-price">
        {b.total_price != null ? fmtCurrency(b.total_price) : <span className="cell-muted">{t('tbc')}</span>}
      </td>
      <td>
        <span className={BADGE_CLASS[b.status] ?? 'badge'}>
          {statusLabel}
        </span>
      </td>
    </tr>
  );
}

// ── BookingCard (mobile) ──────────────────────────────────────────────────────

function BookingCard({ booking: b, isSelected, onClick }) {
  const { fmtCurrency, locale } = useLocale();
  const t = useT();
  const statusLabel = { arriving: t('calLegendInHouse'), confirmed: t('confirmed'), checked_out: t('checkedOut'), cancelled: t('cancelled') }[b.status] ?? b.status;
  return (
    <div
      className={`booking-card${isSelected ? ' booking-card--selected' : ''}`}
      onClick={() => onClick(b)}
    >
      <div className="bc-header">
        <span className="bc-name">{b.guest_first_name} {b.guest_last_name}</span>
        <span className={BADGE_CLASS[b.status] ?? 'badge'}>{statusLabel}</span>
      </div>
      <div className="bc-room">{b.room_name ?? '—'}</div>
      <div className="bc-dates">
        {formatTableDate(b.check_in_date, locale)} → {formatTableDate(b.check_out_date, locale)}
      </div>
      {b.total_price != null && (
        <div className="bc-price">{fmtCurrency(b.total_price)}</div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTableDate(dateStr, locale = 'en') {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', {
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
