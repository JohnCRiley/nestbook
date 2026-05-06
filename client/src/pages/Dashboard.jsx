import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  localToday,
  formatDateLong,
  formatDateShort,
  formatDateMedium,
  nightsBetween,
  addDays,
} from '../utils/format.js';
import { isEligibleForBreakfast } from '../utils/breakfast.js';
import BookingPanel from './bookings/BookingPanel.jsx';
import NewBookingModal from './bookings/NewBookingModal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import DepositPill from '../components/DepositPill.jsx';

// ── Badge config (duplicated from Bookings so Dashboard has no cross-dep) ─────
const BADGE_CLASS = {
  arriving:    'badge badge-arriving',
  confirmed:   'badge badge-confirmed',
  checked_out: 'badge badge-checked_out',
  cancelled:   'badge badge-cancelled',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const t = useT();
  const { fmtCurrency, property, locale } = useLocale();
  const { user, refreshPlan } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [bookings,       setBookings]       = useState([]);
  const [rooms,          setRooms]          = useState([]);
  const [guests,         setGuests]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [upgradeToast,   setUpgradeToast]   = useState(false);
  const [pageToast,      setPageToast]      = useState(null);
  const [showAvailablePopover, setShowAvailablePopover] = useState(false);
  const [selectedBooking,      setSelectedBooking]      = useState(null);
  const [bookingRoomFilter,    setBookingRoomFilter]    = useState(null);
  const [pendingConfirm,       setPendingConfirm]       = useState(null);
  const [depositGate,          setDepositGate]          = useState(null); // { bookingId }

  const today = localToday();

  // ── Detect post-upgrade redirect ───────────────────────────────────────────
  useEffect(() => {
    if (searchParams.get('upgraded') !== 'true') return;
    const sessionId = searchParams.get('session_id');

    // Strip query params from URL immediately
    window.history.replaceState({}, '', '/app/dashboard');

    // Call sync-session to ensure plan is updated in DB, then refresh local state
    if (sessionId) {
      apiFetch('/api/stripe/sync-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.plan) refreshPlan(); })
        .catch(() => {});
    }

    // Show upgrade toast
    setUpgradeToast(true);
    setTimeout(() => setUpgradeToast(false), 5000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch bookings + rooms + guests ───────────────────────────────────────
  useEffect(() => {
    if (!property?.id) {
      const timer = setTimeout(() => setLoading(false), 5000);
      return () => clearTimeout(timer);
    }
    Promise.all([
      apiFetch(`/api/bookings?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
      apiFetch(`/api/rooms?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
      apiFetch(`/api/guests?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
    ])
      .then(([b, r, g]) => {
        setBookings(Array.isArray(b) ? b : []);
        setRooms(Array.isArray(r) ? r : []);
        setGuests(Array.isArray(g) ? g : []);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [property?.id]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const occupiedTonight = bookings.filter((b) => b.status === 'arriving');

  const arrivalsToday = bookings.filter((b) => b.check_in_date === today);

  const departuresToday = bookings.filter(
    (b) => b.check_out_date === today && b.status !== 'cancelled'
  );

  const monthStart   = today.slice(0, 7) + '-01';
  const monthRevenue = bookings
    .filter((b) => b.status !== 'cancelled' && b.check_in_date >= monthStart && b.check_in_date <= today)
    .reduce((sum, b) => sum + (b.total_price || 0), 0);

  const in7Days = addDays(today, 7);
  const upcoming = bookings.filter(
    (b) => b.status === 'confirmed' && b.check_in_date > today && b.check_in_date <= in7Days
  );

  // Room stats — only confirmed/arriving bookings occupy a room
  const occupiedRoomIds = new Set(
    bookings
      .filter((b) =>
        b.status !== 'cancelled' &&
        b.status !== 'checked_out' &&
        b.check_in_date <= today &&
        b.check_out_date > today
      )
      .map((b) => b.room_id)
  );
  const maintenanceRooms  = rooms.filter((r) => r.status === 'maintenance');
  const availableRooms    = rooms.filter((r) => r.status !== 'maintenance' && !occupiedRoomIds.has(r.id));
  const activeRooms       = rooms.filter((r) => r.status !== 'maintenance');
  const occupancyRate     = activeRooms.length > 0
    ? Math.round((occupiedRoomIds.size / activeRooms.length) * 100)
    : 0;

  const flaggedBookings = bookings.filter((b) => b.flagged && b.status !== 'cancelled');

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? t('greetingMorning') : hour < 18 ? t('greetingAfternoon') : t('greetingEvening');

  const BADGE_LABEL = {
    arriving:    t('calLegendInHouse'),
    confirmed:   t('confirmed'),
    checked_out: t('checkedOut'),
    cancelled:   t('cancelled'),
  };

  const showPageToast = (msg) => {
    setPageToast(msg);
    setTimeout(() => setPageToast(null), 3000);
  };

  // ── Status update handler (mirrors Bookings.jsx pattern) ──────────────────
  function handleStatusUpdate(bookingId, newStatus) {
    const existing = bookings.find((b) => b.id === bookingId);
    if (!existing) return;

    const updated = { ...existing, status: newStatus };

    apiFetch(`/api/bookings/${bookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
      .then((r) => r.json())
      .then((saved) => {
        setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, ...saved } : b)));
        if (newStatus === 'arriving') {
          setSelectedBooking(null);
          showPageToast(t('checkedInToast'));
        } else if (newStatus === 'cancelled') {
          setSelectedBooking(null);
          showPageToast(t('bookingCancelledToast'));
        } else {
          setSelectedBooking((prev) => (prev?.id === bookingId ? { ...prev, ...saved } : prev));
        }
      })
      .catch(() => {});
  }

  async function handleMarkDepositPaid(bookingId) {
    try {
      const res = await apiFetch(`/api/bookings/${bookingId}/mark-deposit-paid`, { method: 'POST' });
      if (!res.ok) return;
      const updated = await res.json();
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, ...updated } : b)));
      setSelectedBooking((prev) => (prev?.id === bookingId ? { ...prev, ...updated } : prev));
    } catch { /* silent */ }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="loading-screen">{t('loadingDashboard')}</div>;
  if (!property) return (
    <div className="db-info-box">{t('propLoadError')}</div>
  );
  if (error) return (
    <div className="db-info-box">{t('dashboardLoadError')}</div>
  );

  return (
    <>
      {/* ── Upgrade toast ──────────────────────────────────────────────────── */}
      {upgradeToast && (
        <div className="toast toast-success" style={{ pointerEvents: 'auto' }}>
          {t('upgradeSuccess')}
        </div>
      )}

      {pageToast && (
        <div className="toast toast-success">{pageToast}</div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>{greeting}</h1>
            <div className="page-date">{formatDateLong(today, locale)}</div>
          </div>
          {/* Quick action buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              className="btn-secondary"
              onClick={() => navigate('/bookings', { state: { openModal: true } })}
              title={t('newBookingTooltip')}
            >
              {t('newBooking')}
            </button>
            <button
              className="btn-primary"
              onClick={() => navigate('/guests?newguest=true')}
              title={t('newGuestTooltip')}
            >
              {t('newGuest')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="stats-grid">
        <StatCard value={occupiedTonight.length}   label={t('occupied')} />
        <StatCard value={arrivalsToday.length}      label={t('arrivals')} />
        <StatCard value={departuresToday.length}    label={t('departures')} />
        {user?.role === 'owner' && (
          <StatCard value={fmtCurrency(monthRevenue)} label={t('revenue')} />
        )}
      </div>

      {/* ── Action banners ─────────────────────────────────────────────── */}
      {arrivalsToday.filter((b) => b.status === 'confirmed').length > 0 && (
        <div style={{
          background: '#d9f0cc', border: '1.5px solid #4ade80', borderRadius: 10,
          padding: '12px 18px', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontWeight: 600, color: '#1a4710', fontSize: '0.95rem' }}>
            {t('arrivalsBanner')(arrivalsToday.filter((b) => b.status === 'confirmed').length)}
          </span>
          <span style={{ color: '#1a4710', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
            {t('checkThemIn')}
          </span>
        </div>
      )}
      {departuresToday.filter((b) => b.status === 'arriving').length > 0 && (
        <div style={{
          background: '#fef9c3', border: '1.5px solid #fbbf24', borderRadius: 10,
          padding: '12px 18px', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontWeight: 600, color: '#92400e', fontSize: '0.95rem' }}>
            {t('departuresBanner')(departuresToday.filter((b) => b.status === 'arriving').length)}
          </span>
          <span style={{ color: '#92400e', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
            {t('checkThemOut')}
          </span>
        </div>
      )}

      {/* ── Flagged bookings warning ───────────────────────────────────── */}
      {flaggedBookings.length > 0 && (
        <div style={{
          background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10,
          padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
              {t('flaggedBookingsTitle')} ({flaggedBookings.length})
            </div>
            {flaggedBookings.map((b) => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>
                  #{b.id} — {b.guest_first_name} {b.guest_last_name} · {b.check_in_date}
                </span>
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                  onClick={() => setSelectedBooking(b)}
                >
                  {t('reviewBooking')}
                </button>
              </div>
            ))}
            <div style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: 4 }}>
              {t('flaggedBookingWarning')}
            </div>
          </div>
        </div>
      )}

      {/* ── Room availability bar ───────────────────────────────────────── */}
      {rooms.length > 0 && (
        <div className="stat-bar" style={{ marginBottom: 24 }}>
          {/* Available Tonight — clickable */}
          <button
            className="stat-bar-item db-available-btn"
            onClick={() => setShowAvailablePopover((v) => !v)}
            style={{ position: 'relative', cursor: 'pointer', textAlign: 'left', border: 'none', fontFamily: 'inherit' }}
            title="Click to see available room names"
          >
            <div className="sb-value" style={{ color: 'var(--accent-dark)' }}>{availableRooms.length}</div>
            <div className="sb-label">{t('availableTonight')}</div>
            {showAvailablePopover && availableRooms.length > 0 && (
              <div className="db-room-popover" onClick={(e) => e.stopPropagation()}>
                <div className="db-room-popover-title">{t('availableRoomsTonight')}</div>
                {availableRooms.map((r) => (
                  <div key={r.id} className="db-room-popover-item">
                    <div className="db-room-popover-info">
                      <span className="db-room-popover-name">{r.name}</span>
                      <span className="db-room-popover-meta">
                        {r.type}{r.capacity ? ` · ${t('guestWord')(r.capacity)}` : ''}
                      </span>
                    </div>
                    <button
                      className="btn-primary db-room-book-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAvailablePopover(false);
                        setBookingRoomFilter(r);
                      }}
                    >
                      {t('newBooking')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {showAvailablePopover && availableRooms.length === 0 && (
              <div className="db-room-popover" onClick={(e) => e.stopPropagation()}>
                <div className="db-room-popover-title">{t('allRoomsOccupied')}</div>
              </div>
            )}
          </button>
          {/* Occupancy Rate */}
          <div className="stat-bar-item" style={{ flex: 1 }}>
            <div className="sb-value" style={{ color: occupancyRate > 70 ? '#92400e' : 'var(--accent-dark)' }}>
              {occupancyRate}%
            </div>
            <div className="sb-label">{t('occupancyRate')}</div>
          </div>
          {/* Total rooms */}
          <div className="stat-bar-item" style={{ flex: 1 }}>
            <div className="sb-value" style={{ color: 'var(--accent-dark)' }}>{rooms.length}</div>
            <div className="sb-label">{t('totalRooms')}</div>
          </div>
        </div>
      )}

      {/* ── Close popover on outside click ─────────────────────────────── */}
      {showAvailablePopover && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => setShowAvailablePopover(false)}
        />
      )}

      {/* ── Arrivals + Departures ───────────────────────────────────────── */}
      <div className="dashboard-grid">

        {/* Today's Arrivals */}
        <div className="section-card">
          <div className="section-head">
            <h2>{t('todayArrivalsTitle')}</h2>
            <span className="count-pill">{arrivalsToday.length}</span>
          </div>
          {arrivalsToday.length === 0 ? (
            <div className="empty-state">{t('noArrivalsToday')}</div>
          ) : (
            arrivalsToday.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                property={property}
                right={
                  b.status === 'confirmed' ? (
                    <button
                      className="btn-checkin"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (property?.require_deposit && !b.deposit_paid) {
                          setDepositGate({ bookingId: b.id });
                        } else {
                          setPendingConfirm({
                            title: t('checkInBtn'),
                            message: t('checkInConfirm')(`${b.guest_first_name} ${b.guest_last_name}`),
                            confirmLabel: t('checkInBtn'),
                            variant: 'success',
                            action: () => handleStatusUpdate(b.id, 'arriving'),
                          });
                        }
                      }}
                    >
                      {t('checkInBtn')}
                    </button>
                  ) : (
                    <span className={BADGE_CLASS[b.status] ?? 'badge'}>
                      {BADGE_LABEL[b.status] ?? b.status}
                    </span>
                  )
                }
                nightWord={t('nightWord')}
                onClick={() => setSelectedBooking(b)}
              />
            ))
          )}
        </div>

        {/* Today's Departures */}
        <div className="section-card">
          <div className="section-head">
            <h2>{t('todayDeparturesTitle')}</h2>
            <span className="count-pill">{departuresToday.length}</span>
          </div>
          {departuresToday.length === 0 ? (
            <div className="empty-state">{t('noDeparturesToday')}</div>
          ) : (
            departuresToday.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                property={property}
                right={
                  b.status === 'arriving' ? (
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, color: '#92400e',
                      background: '#fef3c7', border: '1px solid #fcd34d',
                      borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap',
                    }}>
                      {t('dueToCheckOut')}
                    </span>
                  ) : (
                    <span className={BADGE_CLASS[b.status] ?? 'badge'}>
                      {BADGE_LABEL[b.status] ?? b.status}
                    </span>
                  )
                }
                nightWord={t('nightWord')}
                showDue
                showBreakfast
                onClick={() => setSelectedBooking(b)}
              />
            ))
          )}
        </div>

      </div>

      {/* ── Breakfast service list ─────────────────────────────────────── */}
      <BreakfastServiceList bookings={bookings} property={property} t={t} />

      {/* ── Upcoming ───────────────────────────────────────────────────── */}
      <div className="section-card" style={{ marginTop: 20 }}>
        <div className="section-head">
          <h2>{t('upcomingTitle')}</h2>
          <span className="count-pill">{upcoming.length}</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="empty-state">{t('noUpcoming7Days')}</div>
        ) : (
          upcoming.map((b) => (
            <BookingRow
              key={b.id}
              booking={b}
              property={property}
              right={
                <>
                  <span className="booking-date">{formatDateShort(b.check_in_date, locale)}</span>
                  <DepositPill booking={b} property={property} />
                  <span className={BADGE_CLASS[b.status] ?? 'badge'}>
                    {BADGE_LABEL[b.status] ?? b.status}
                  </span>
                </>
              }
              nightWord={t('nightWord')}
              onClick={() => setSelectedBooking(b)}
            />
          ))
        )}
      </div>

      {/* ── Booking detail panel ────────────────────────────────────────── */}
      {selectedBooking && (
        <BookingPanel
          booking={selectedBooking}
          rooms={rooms}
          guests={guests}
          onClose={() => setSelectedBooking(null)}
          onStatusUpdate={handleStatusUpdate}
          onSave={(updated) => {
            setBookings((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
            if (updated.status === 'checked_out') {
              setSelectedBooking(null);
              showPageToast(t('coCheckedOutToast'));
            } else {
              setSelectedBooking(updated);
            }
          }}
        />
      )}

      {/* ── New booking modal (from Available Tonight room) ─────────────── */}
      {bookingRoomFilter && (
        <NewBookingModal
          rooms={rooms}
          guests={guests}
          initialValues={{ room_id: String(bookingRoomFilter.id) }}
          onClose={() => setBookingRoomFilter(null)}
          onSuccess={(newBooking) => {
            setBookings((prev) => [...prev, newBooking]);
            setBookingRoomFilter(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!pendingConfirm}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel ?? ''}
        cancelLabel={t('cancel')}
        variant={pendingConfirm?.variant ?? 'warning'}
        onConfirm={() => { pendingConfirm.action(); setPendingConfirm(null); }}
        onCancel={() => setPendingConfirm(null)}
      />

      {/* ── Deposit gate modal ─────────────────────────────────────────────── */}
      {depositGate && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '28px 28px 24px',
            maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 10, color: '#111827' }}>
              {t('depositGateTitle')}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#374151', marginBottom: 22, lineHeight: 1.55 }}>
              {t('depositGateMsg')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn-primary"
                onClick={() => {
                  const id = depositGate.bookingId;
                  setDepositGate(null);
                  handleMarkDepositPaid(id).then(() => handleStatusUpdate(id, 'arriving'));
                }}
              >
                {t('markPaidAndCheckIn')}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  const id = depositGate.bookingId;
                  setDepositGate(null);
                  handleStatusUpdate(id, 'arriving');
                }}
              >
                {t('checkInWithoutDeposit')}
              </button>
              <button
                className="btn-secondary"
                style={{ border: '1.5px solid var(--border)', marginTop: 2 }}
                onClick={() => setDepositGate(null)}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function calcDue(b, property) {
  const nights     = nightsBetween(b.check_in_date, b.check_out_date);
  const rate       = b.price_per_night ?? 0;
  const room       = nights * rate;
  const bfFree     = !!(property?.breakfast_included || b.room_breakfast_included);
  const bfCharged  = !!b.breakfast_added && !bfFree;
  const bfPrice    = parseFloat(property?.breakfast_price) || 0;
  const bfStart    = b.breakfast_start_date || b.check_in_date;
  const bfDays     = bfCharged ? Math.max(1, nightsBetween(bfStart, b.check_out_date)) : 0;
  const bfGuests   = b.breakfast_start_date ? (b.breakfast_guests || 1) : (b.num_guests || 1);
  const bfSub      = bfCharged ? bfGuests * bfDays * bfPrice : 0;
  const depDeduct  = b.deposit_paid ? (parseFloat(property?.deposit_amount) || 0) : 0;
  return Math.max(0, room + bfSub - depDeduct);
}

function bfStatusBadge(b, property, t, locale) {
  if (property?.breakfast_included || b.room_breakfast_included) {
    return { text: t('bfStatusIncluded'), color: '#1a4710', bg: '#d9f0cc', border: '#86efac' };
  }
  if (b.breakfast_added && b.breakfast_start_date) {
    const morningDate = formatDateMedium(addDays(b.breakfast_start_date, 1), locale);
    return { text: t('bfStatusFrom')(morningDate), color: '#1a4710', bg: '#d9f0cc', border: '#86efac' };
  }
  if (b.breakfast_added) {
    return { text: t('bfStatusIncluded'), color: '#1a4710', bg: '#d9f0cc', border: '#86efac' };
  }
  return null;
}

function BookingRow({ booking: b, property, right, nightWord, onClick, showDue, showBreakfast }) {
  const { fmtCurrency, locale } = useLocale();
  const t = useT();
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  const due = showDue ? calcDue(b, property) : null;
  const bfBadge = showBreakfast ? bfStatusBadge(b, property, t, locale) : null;
  return (
    <div
      className={`booking-row${onClick ? ' booking-row--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <div className="booking-guest">
        <div className="guest-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {b.guest_first_name} {b.guest_last_name}
          {bfBadge && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, color: bfBadge.color,
              background: bfBadge.bg, border: `1px solid ${bfBadge.border}`,
              borderRadius: 3, padding: '1px 5px',
            }}>{bfBadge.text}</span>
          )}
        </div>
        <div className="booking-meta">
          {b.room_name} &middot; {nightWord(nights)}
        </div>
        {due != null && (
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1a4710', marginTop: 2 }}>
            {t('coTotalDue')}: {fmtCurrency(due)}
          </div>
        )}
      </div>
      <div className="booking-right">{right}</div>
    </div>
  );
}

function BreakfastServiceList({ bookings, property, t }) {
  const { locale } = useLocale();
  const today    = localToday();
  const tomorrow = addDays(today, 1);

  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const serviceFinishedToday = nowHHMM > (property?.breakfast_end_time ?? '11:00');

  function getCovers(b) {
    const bfFree = !!(property?.breakfast_included || b.room_breakfast_included);
    return bfFree ? (b.num_guests || 1) : (b.breakfast_guests || b.num_guests || 1);
  }

  const inHouseToday    = bookings.filter(b =>
    b.status !== 'cancelled' && b.status !== 'checked_out' &&
    b.check_in_date <= today    && b.check_out_date >= today);
  const inHouseTomorrow = bookings.filter(b =>
    b.status !== 'cancelled' && b.status !== 'checked_out' &&
    b.check_in_date <= tomorrow && b.check_out_date >= tomorrow);

  const todayGuests    = inHouseToday.filter(b    => isEligibleForBreakfast(b, null, property, today));
  const tomorrowGuests = inHouseTomorrow.filter(b => isEligibleForBreakfast(b, null, property, tomorrow));
  const todayCovers    = todayGuests.reduce((s, b)    => s + getCovers(b), 0);
  const tomorrowCovers = tomorrowGuests.reduce((s, b) => s + getCovers(b), 0);

  if (inHouseToday.length === 0 && inHouseTomorrow.length === 0) return null;

  function BfRow({ b }) {
    const num = getCovers(b);
    const bfFree = !!(property?.breakfast_included || b.room_breakfast_included);
    const status = bfFree
      ? t('bfStatusIncluded')
      : b.breakfast_start_date
        ? t('bfStatusFrom')(formatDateMedium(addDays(b.breakfast_start_date, 1), locale))
        : t('bfStatusIncluded');
    return (
      <div className="booking-row" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="booking-guest">
          <div className="guest-name">{b.guest_first_name} {b.guest_last_name}</div>
          <div className="booking-meta">{b.room_name}</div>
        </div>
        <div className="booking-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {num > 0 && (
            <span style={{
              fontSize: '0.78rem', fontWeight: 700, color: '#1a4710',
              background: '#d9f0cc', border: '1px solid #86efac',
              borderRadius: 3, padding: '2px 7px',
            }}>{num}x</span>
          )}
          <span style={{
            fontSize: '0.78rem', color: '#166534', fontWeight: 600,
          }}>{status}</span>
        </div>
      </div>
    );
  }

  function BfPanel({ title, guests, covers, emptyKey, coversKey, serviceFinished }) {
    return (
      <div className="section-card">
        <div className="section-head">
          <h2>{title}</h2>
          <span className="count-pill">{covers}</span>
        </div>
        {serviceFinished && (
          <div style={{ padding: '6px 16px', fontSize: '0.78rem', color: '#92400e', background: '#fef3c7', borderBottom: '1px solid var(--border)' }}>
            {t('bfServiceFinished')}
          </div>
        )}
        {guests.length === 0 ? (
          <div className="empty-state">{t(emptyKey)}</div>
        ) : (
          <>
            {guests.map(b => <BfRow key={b.id} b={b} />)}
            <div style={{ padding: '10px 16px', fontSize: '0.85rem', fontWeight: 700, color: '#1a4710', borderTop: '1.5px solid #d9f0cc' }}>
              {t(coversKey)(covers)}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard-grid" style={{ marginTop: 20 }}>
      <BfPanel
        title={t('bfServiceTitle')}
        guests={todayGuests} covers={todayCovers}
        emptyKey="bfNoCoversToday" coversKey="bfCovers"
        serviceFinished={serviceFinishedToday}
      />
      <BfPanel
        title={t('bfTomorrowTitle')}
        guests={tomorrowGuests} covers={tomorrowCovers}
        emptyKey="bfNoTomorrowCovers" coversKey="bfCoversTomorrow"
        serviceFinished={false}
      />
    </div>
  );
}
