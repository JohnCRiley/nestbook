import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import {
  localToday,
  formatDateLong,
  formatDateShort,
  nightsBetween,
  addDays,
} from '../utils/format.js';

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
  const { fmtCurrency, property } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [bookings, setBookings] = useState([]);
  const [rooms,    setRooms]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [upgradeToast, setUpgradeToast] = useState(false);
  const [showAvailablePopover, setShowAvailablePopover] = useState(false);

  const today = localToday();

  // ── Detect post-upgrade redirect ───────────────────────────────────────────
  useEffect(() => {
    if (searchParams.get('upgraded') !== 'true') return;
    const sessionId = searchParams.get('session_id');

    // Strip query params from URL immediately
    window.history.replaceState({}, '', '/app/dashboard');

    // Call sync-session to ensure plan is updated in DB
    if (sessionId) {
      apiFetch(`/api/stripe/sync-session?session_id=${sessionId}`).catch(() => {});
    }

    // Show upgrade toast
    setUpgradeToast(true);
    setTimeout(() => setUpgradeToast(false), 5000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch bookings + rooms ─────────────────────────────────────────────────
  useEffect(() => {
    if (!property?.id) {
      const timer = setTimeout(() => setLoading(false), 5000);
      return () => clearTimeout(timer);
    }
    Promise.all([
      apiFetch(`/api/bookings?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
      apiFetch(`/api/rooms?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
    ])
      .then(([b, r]) => {
        setBookings(Array.isArray(b) ? b : []);
        setRooms(Array.isArray(r) ? r : []);
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

  // Room stats
  const occupiedRoomIds = new Set(
    bookings
      .filter((b) => b.status !== 'cancelled' && b.check_in_date <= today && b.check_out_date > today)
      .map((b) => b.room_id)
  );
  const maintenanceRooms  = rooms.filter((r) => r.status === 'maintenance');
  const availableRooms    = rooms.filter((r) => r.status !== 'maintenance' && !occupiedRoomIds.has(r.id));
  const activeRooms       = rooms.filter((r) => r.status !== 'maintenance');
  const occupancyRate     = activeRooms.length > 0
    ? Math.round((occupiedRoomIds.size / activeRooms.length) * 100)
    : 0;

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? t('greetingMorning') : hour < 18 ? t('greetingAfternoon') : t('greetingEvening');

  const BADGE_LABEL = {
    arriving:    t('calLegendInHouse'),
    confirmed:   t('confirmed'),
    checked_out: t('checkedOut'),
    cancelled:   t('cancelled'),
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="loading-screen">{t('loadingDashboard')}</div>;
  if (!property) return (
    <div className="db-info-box">
      Could not load property data. Please refresh or contact support.
    </div>
  );
  if (error) return (
    <div className="db-info-box">
      Could not load dashboard data. Please refresh the page.
    </div>
  );

  return (
    <>
      {/* ── Upgrade toast ──────────────────────────────────────────────────── */}
      {upgradeToast && (
        <div className="toast toast-success" style={{ pointerEvents: 'auto' }}>
          Payment successful — your plan has been upgraded!
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>{greeting}</h1>
            <div className="page-date">{formatDateLong(today)}</div>
          </div>
          {/* Quick action buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              className="btn-secondary"
              onClick={() => navigate('/bookings', { state: { openModal: true } })}
              title="New booking for a returning guest"
            >
              + New Booking
            </button>
            <button
              className="btn-primary"
              onClick={() => navigate('/guests?newguest=true')}
              title="Add a new guest first, then create a booking"
            >
              + New Guest
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="stats-grid">
        <StatCard value={occupiedTonight.length}   label={t('occupied')} />
        <StatCard value={arrivalsToday.length}      label={t('arrivals')} />
        <StatCard value={departuresToday.length}    label={t('departures')} />
        <StatCard value={fmtCurrency(monthRevenue)} label={t('revenue')} />
      </div>

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
            <div className="sb-label">Available Tonight</div>
            {showAvailablePopover && availableRooms.length > 0 && (
              <div className="db-room-popover" onClick={(e) => e.stopPropagation()}>
                <div className="db-room-popover-title">Available rooms tonight</div>
                {availableRooms.map((r) => (
                  <div key={r.id} className="db-room-popover-item">{r.name}</div>
                ))}
              </div>
            )}
            {showAvailablePopover && availableRooms.length === 0 && (
              <div className="db-room-popover" onClick={(e) => e.stopPropagation()}>
                <div className="db-room-popover-title">All rooms occupied tonight</div>
              </div>
            )}
          </button>
          {/* Occupancy Rate */}
          <div className="stat-bar-item" style={{ flex: 1 }}>
            <div className="sb-value" style={{ color: occupancyRate > 70 ? '#92400e' : 'var(--accent-dark)' }}>
              {occupancyRate}%
            </div>
            <div className="sb-label">Occupancy Rate</div>
          </div>
          {/* Total rooms */}
          <div className="stat-bar-item" style={{ flex: 1 }}>
            <div className="sb-value" style={{ color: 'var(--accent-dark)' }}>{rooms.length}</div>
            <div className="sb-label">Total Rooms</div>
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

      {/* ── Two-column sections ─────────────────────────────────────────── */}
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
                badgeLabel={BADGE_LABEL}
                right={
                  <span className={BADGE_CLASS[b.status] ?? 'badge'}>
                    {BADGE_LABEL[b.status] ?? b.status}
                  </span>
                }
                nightWord={t('nightWord')}
              />
            ))
          )}
        </div>

        {/* Upcoming — Next 7 Days */}
        <div className="section-card">
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
                badgeLabel={BADGE_LABEL}
                right={
                  <>
                    <span className="booking-date">{formatDateShort(b.check_in_date)}</span>
                    <span className={BADGE_CLASS[b.status] ?? 'badge'}>
                      {BADGE_LABEL[b.status] ?? b.status}
                    </span>
                  </>
                }
                nightWord={t('nightWord')}
              />
            ))
          )}
        </div>

      </div>
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

function BookingRow({ booking: b, right, nightWord }) {
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  return (
    <div className="booking-row">
      <div className="booking-guest">
        <div className="guest-name">{b.guest_first_name} {b.guest_last_name}</div>
        <div className="booking-meta">
          {b.room_name} &middot; {nightWord(nights)}
        </div>
      </div>
      <div className="booking-right">{right}</div>
    </div>
  );
}
