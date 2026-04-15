import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { initials, phoneFlag, phoneCountry } from '../utils/guestHelpers.js';
import GuestPanel    from './guests/GuestPanel.jsx';
import NewGuestModal from './guests/NewGuestModal.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';

// ── Main component ────────────────────────────────────────────────────────────

export default function Guests() {
  const t = useT();
  const { property } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [guests,          setGuests]          = useState([]);
  const [bookings,        setBookings]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState('');
  const [selectedGuest,   setSelectedGuest]   = useState(null);
  const [showNewModal,    setShowNewModal]     = useState(() => searchParams.get('newguest') === 'true');
  const [newGuestCreated, setNewGuestCreated] = useState(null); // triggers "next step" modal

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!property?.id) return;
    Promise.all([
      apiFetch('/api/guests').then((r) => r.ok ? r.json() : []),
      apiFetch(`/api/bookings?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
    ]).then(([g, b]) => {
      setGuests(Array.isArray(g) ? g : []);
      setBookings(Array.isArray(b) ? b : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [property?.id]);

  // ── Booking counts per guest ───────────────────────────────────────────────
  const bookingsByGuest = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (!map[b.guest_id]) map[b.guest_id] = [];
      map[b.guest_id].push(b);
    }
    return map;
  }, [bookings]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today     = new Date();
    const monthStr  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const newThisMonth = guests.filter(
      (g) => g.created_at && g.created_at.startsWith(monthStr)
    ).length;

    // Derive country from phone, tally, pick the top one
    const countryCounts = {};
    for (const g of guests) {
      const c = phoneCountry(g.phone);
      if (c) countryCounts[c] = (countryCounts[c] ?? 0) + 1;
    }
    const topCountry = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

    return { total: guests.length, newThisMonth, topCountry };
  }, [guests]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) =>
      `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
      (g.email ?? '').toLowerCase().includes(q)
    );
  }, [guests, search]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCardClick = (guest) =>
    setSelectedGuest((prev) => (prev?.id === guest.id ? null : guest));

  const handleGuestUpdated = (updated) => {
    setGuests((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setSelectedGuest(updated);
  };

  const handleNewGuestSuccess = (created) => {
    setGuests((prev) => [...prev, created]);
    setShowNewModal(false);
    setNewGuestCreated(created); // show "what next?" modal instead of opening detail panel
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="loading-screen">{t('loadingGuests')}</div>;

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-toolbar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('guests')}</h1>
          <div className="page-date">{guests.length} {t('guestRecords')}</div>
        </div>
        <button className="btn-primary" onClick={() => setShowNewModal(true)}>
          <span style={{ fontSize: '1.1em', lineHeight: 1 }}>+</span>
          {t('newGuest').replace('+ ', '')}
        </button>
      </div>

      {/* ── Stat bar ─────────────────────────────────────────────────────── */}
      <div className="stat-bar">
        <StatBarItem value={stats.total}        label={t('totalGuests')} />
        <StatBarItem value={stats.newThisMonth} label={t('newThisMonth')} />
        <StatBarItem value={stats.topCountry}   label={t('topCountry')} isText />
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="controls-row" style={{ marginBottom: 16 }}>
        <div className="search-wrap">
          <SearchIcon />
          <input
            type="text"
            className="search-input"
            placeholder={t('searchGuests')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Guest card grid ───────────────────────────────────────────────── */}
      <div className="guest-grid">
        {filtered.length === 0 ? (
          <div className="guests-empty">
            {search ? `No guests matching "${search}"` : t('noGuests')}
          </div>
        ) : (
          filtered.map((guest) => (
            <GuestCard
              key={guest.id}
              guest={guest}
              bookingCount={(bookingsByGuest[guest.id] ?? []).length}
              isActive={selectedGuest?.id === guest.id}
              onClick={handleCardClick}
            />
          ))
        )}
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selectedGuest && (
        <GuestPanel
          guest={selectedGuest}
          bookings={bookingsByGuest[selectedGuest.id] ?? []}
          onClose={() => setSelectedGuest(null)}
          onGuestUpdated={handleGuestUpdated}
        />
      )}

      {/* ── New guest modal ───────────────────────────────────────────────── */}
      {showNewModal && (
        <NewGuestModal
          onClose={() => setShowNewModal(false)}
          onSuccess={handleNewGuestSuccess}
        />
      )}

      {/* ── Post-save "what next?" modal ──────────────────────────────────── */}
      {newGuestCreated && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-label="Guest saved" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Guest added</h2>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '28px 32px' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>✓</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>
                {newGuestCreated.first_name} {newGuestCreated.last_name} has been saved.
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
                What would you like to do next?
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
                  onClick={() => navigate('/bookings', {
                    state: { openModal: true, prefillGuestId: newGuestCreated.id },
                  })}
                >
                  Create a booking for this guest
                </button>
                <button
                  className="btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
                  onClick={() => { setNewGuestCreated(null); navigate('/dashboard'); }}
                >
                  Return to dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── GuestCard ─────────────────────────────────────────────────────────────────

function GuestCard({ guest, bookingCount, isActive, onClick }) {
  const flag = phoneFlag(guest.phone);

  return (
    <div
      className={`guest-card${isActive ? ' active' : ''}`}
      onClick={() => onClick(guest)}
    >
      {/* Avatar */}
      <div className="guest-avatar">
        {initials(guest.first_name, guest.last_name)}
      </div>

      {/* Info */}
      <div className="guest-card-info">
        <div className="guest-card-name">
          {guest.first_name} {guest.last_name}
          {flag && <span className="guest-flag">{flag}</span>}
        </div>
        {guest.email
          ? <div className="guest-card-email">{guest.email}</div>
          : <div className="guest-card-email" style={{ fontStyle: 'italic' }}>No email</div>
        }
        {guest.phone && (
          <div className="guest-card-phone">{guest.phone}</div>
        )}
      </div>

      {/* Stay count badge */}
      <div className="guest-card-right">
        <div className="guest-stay-count">
          <span className="sc-num">{bookingCount}</span>
          {bookingCount === 1 ? 'stay' : 'stays'}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBarItem({ value, label, isText }) {
  return (
    <div className="stat-bar-item">
      <div className="sb-value" style={isText ? { fontSize: '1rem', paddingTop: 5 } : {}}>
        {value}
      </div>
      <div className="sb-label">{label}</div>
    </div>
  );
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
