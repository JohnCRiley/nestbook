import { useState, useEffect } from 'react';
import {
  localToday,
  formatDateLong,
  formatDateShort,
  nightsBetween,
  addDays,
  formatCurrency,
} from '../utils/format.js';

// ── Badge config (duplicated from Bookings so Dashboard has no cross-dep) ─────
const BADGE_CLASS = {
  arriving:    'badge badge-arriving',
  confirmed:   'badge badge-confirmed',
  checked_out: 'badge badge-checked_out',
  cancelled:   'badge badge-cancelled',
};

const BADGE_LABEL = {
  arriving:    'In House',
  confirmed:   'Confirmed',
  checked_out: 'Checked Out',
  cancelled:   'Cancelled',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const today = localToday();

  useEffect(() => {
    fetch('/api/bookings?property_id=1')
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then((data) => { setBookings(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

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

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="loading-screen">Loading dashboard…</div>;
  if (error)   return <div className="loading-screen" style={{ color: '#dc2626' }}>Error: {error}</div>;

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <h1>{greeting}</h1>
        <div className="page-date">{formatDateLong(today)}</div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="stats-grid">
        <StatCard value={occupiedTonight.length}           label="Occupied Tonight" />
        <StatCard value={arrivalsToday.length}             label="Arrivals Today" />
        <StatCard value={departuresToday.length}           label="Departures Today" />
        <StatCard value={formatCurrency(monthRevenue)}     label="Revenue This Month" />
      </div>

      {/* ── Two-column sections ─────────────────────────────────────────── */}
      <div className="dashboard-grid">

        {/* Today's Arrivals */}
        <div className="section-card">
          <div className="section-head">
            <h2>Today's Arrivals</h2>
            <span className="count-pill">{arrivalsToday.length}</span>
          </div>
          {arrivalsToday.length === 0 ? (
            <div className="empty-state">No arrivals scheduled for today</div>
          ) : (
            arrivalsToday.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                right={
                  <span className={BADGE_CLASS[b.status] ?? 'badge'}>
                    {BADGE_LABEL[b.status] ?? b.status}
                  </span>
                }
              />
            ))
          )}
        </div>

        {/* Upcoming — Next 7 Days */}
        <div className="section-card">
          <div className="section-head">
            <h2>Upcoming — Next 7 Days</h2>
            <span className="count-pill">{upcoming.length}</span>
          </div>
          {upcoming.length === 0 ? (
            <div className="empty-state">No confirmed arrivals in the next 7 days</div>
          ) : (
            upcoming.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                right={
                  <>
                    <span className="booking-date">{formatDateShort(b.check_in_date)}</span>
                    <span className={BADGE_CLASS[b.status] ?? 'badge'}>
                      {BADGE_LABEL[b.status] ?? b.status}
                    </span>
                  </>
                }
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

function BookingRow({ booking: b, right }) {
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  return (
    <div className="booking-row">
      <div className="booking-guest">
        <div className="guest-name">{b.guest_first_name} {b.guest_last_name}</div>
        <div className="booking-meta">
          {b.room_name} &middot; {nights} {nights === 1 ? 'night' : 'nights'}
        </div>
      </div>
      <div className="booking-right">{right}</div>
    </div>
  );
}
