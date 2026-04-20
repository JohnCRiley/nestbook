import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { initials, phoneFlag } from '../utils/guestHelpers.js';
import GuestPanel    from './guests/GuestPanel.jsx';
import NewGuestModal from './guests/NewGuestModal.jsx';
import Pagination    from '../components/Pagination.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';

const LIMIT = 20;

export default function Guests() {
  const t = useT();
  const { property } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [guests,          setGuests]          = useState([]);
  const [bookings,        setBookings]        = useState([]); // full list for panel
  const [counts,          setCounts]          = useState({ total: 0, newThisMonth: 0 });
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState('');
  const [page,            setPage]            = useState(1);
  const [total,           setTotal]           = useState(0);
  const [totalPages,      setTotalPages]      = useState(0);
  const [selectedGuest,   setSelectedGuest]   = useState(null);
  const [showNewModal,    setShowNewModal]     = useState(() => searchParams.get('newguest') === 'true');
  const [newGuestCreated, setNewGuestCreated] = useState(null);

  // Debounced search
  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(searchDebounceRef.current);
  }, [search]);

  // ── Fetch stats via /counts endpoint ────────────────────────────────────────
  const fetchCounts = useCallback(() => {
    apiFetch('/api/guests/counts')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setCounts(data); })
      .catch(() => {});
  }, []);

  // ── Fetch paginated guests ────────────────────────────────────────────────────
  const fetchGuests = useCallback(() => {
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

    setLoading(true);
    apiFetch(`/api/guests?${params}`)
      .then((r) => r.ok ? r.json() : { guests: [], total: 0, page: 1, totalPages: 0 })
      .then(({ guests: rows, total: tot, totalPages: tp }) => {
        setGuests(rows);
        setTotal(tot);
        setTotalPages(tp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, debouncedSearch]);

  // ── Fetch all bookings (plain array, for the guest detail panel) ─────────────
  useEffect(() => {
    if (!property?.id) return;
    apiFetch(`/api/bookings?property_id=${property.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows) => setBookings(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [property?.id]);

  // ── Fetch guests + counts whenever deps change ───────────────────────────────
  useEffect(() => { fetchGuests(); fetchCounts(); }, [fetchGuests, fetchCounts]);

  // ── Booking counts per guest (for card badges) ────────────────────────────────
  const bookingsByGuest = {};
  for (const b of bookings) {
    if (!bookingsByGuest[b.guest_id]) bookingsByGuest[b.guest_id] = [];
    bookingsByGuest[b.guest_id].push(b);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCardClick = (guest) =>
    setSelectedGuest((prev) => (prev?.id === guest.id ? null : guest));

  const handleGuestUpdated = (updated) => {
    setGuests((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setSelectedGuest(updated);
  };

  const handleGuestDeleted = (id) => {
    setGuests((prev) => prev.filter((g) => g.id !== id));
    setSelectedGuest(null);
    fetchCounts();
  };

  const handleNewGuestSuccess = (created) => {
    setShowNewModal(false);
    setNewGuestCreated(created);
    // Refresh to show the new guest + updated counts
    fetchGuests();
    fetchCounts();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-toolbar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('guests')}</h1>
          <div className="page-date">{counts.total} {t('guestRecords')}</div>
        </div>
        <button className="btn-primary" onClick={() => setShowNewModal(true)}>
          <span style={{ fontSize: '1.1em', lineHeight: 1 }}>+</span>
          {t('newGuest').replace('+ ', '')}
        </button>
      </div>

      {/* ── Stat bar ─────────────────────────────────────────────────────── */}
      <div className="stat-bar">
        <StatBarItem value={counts.total}        label={t('totalGuests')} />
        <StatBarItem value={counts.newThisMonth} label={t('newThisMonth')} />
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
        {search && !loading && (
          <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            {t('searchResults')(total)}
          </span>
        )}
      </div>

      {/* ── Guest card grid ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="loading-screen">{t('loadingGuests')}</div>
      ) : guests.length === 0 ? (
        <div className="guests-empty">
          {search ? t('noGuestsSearch')(search) : t('noGuests')}
        </div>
      ) : (
        <>
          <div className="guest-grid">
            {guests.map((guest) => (
              <GuestCard
                key={guest.id}
                guest={guest}
                bookingCount={(bookingsByGuest[guest.id] ?? []).length}
                isActive={selectedGuest?.id === guest.id}
                onClick={handleCardClick}
              />
            ))}
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
      {selectedGuest && (
        <GuestPanel
          guest={selectedGuest}
          bookings={bookingsByGuest[selectedGuest.id] ?? []}
          onClose={() => setSelectedGuest(null)}
          onGuestUpdated={handleGuestUpdated}
          onGuestDeleted={handleGuestDeleted}
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
              <h2>{t('guestAdded')}</h2>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '28px 32px' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>✓</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>
                {newGuestCreated.first_name} {newGuestCreated.last_name} has been saved.
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
                {t('whatNext')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
                  onClick={() => navigate('/bookings', {
                    state: { openModal: true, prefillGuestId: newGuestCreated.id },
                  })}
                >
                  {t('createBookingGuest')}
                </button>
                <button
                  className="btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
                  onClick={() => { setNewGuestCreated(null); setShowNewModal(true); }}
                >
                  {t('addAnotherGuest')}
                </button>
                <button
                  className="btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
                  onClick={() => { setNewGuestCreated(null); navigate('/dashboard'); }}
                >
                  {t('returnDashboard')}
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
  const t = useT();
  const flag = phoneFlag(guest.phone);

  return (
    <div
      className={`guest-card${isActive ? ' active' : ''}`}
      onClick={() => onClick(guest)}
    >
      <div className="guest-avatar">
        {initials(guest.first_name, guest.last_name)}
      </div>
      <div className="guest-card-info">
        <div className="guest-card-name">
          {guest.first_name} {guest.last_name}
          {flag && <span className="guest-flag">{flag}</span>}
          {guest.blacklisted ? (
            <span style={{
              marginLeft: 6, fontSize: '0.68rem', fontWeight: 700, color: '#dc2626',
              background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '1px 5px',
            }}>
              ⚠️ {t('blacklistedBadge')}
            </span>
          ) : null}
        </div>
        {guest.email
          ? <div className="guest-card-email">{guest.email}</div>
          : <div className="guest-card-email" style={{ fontStyle: 'italic' }}>{t('noEmail')}</div>
        }
        {guest.phone && (
          <div className="guest-card-phone">{guest.phone}</div>
        )}
      </div>
      <div className="guest-card-right">
        <div className="guest-stay-count">
          <span className="sc-num">{bookingCount}</span>
          {t('stayWord')(bookingCount).replace(/^\d+\s*/, '')}
        </div>
      </div>
    </div>
  );
}

function StatBarItem({ value, label }) {
  return (
    <div className="stat-bar-item">
      <div className="sb-value">{value}</div>
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
