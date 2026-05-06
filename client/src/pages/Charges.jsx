import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AddChargeModal from './charges/AddChargeModal.jsx';
import ChargesDetailModal from './charges/ChargesDetailModal.jsx';

// ── Upgrade gate ──────────────────────────────────────────────────────────────
function UpgradeGate() {
  const t = useT();
  return (
    <div style={{ padding: '40px 24px', maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>🏨</div>
      <div style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: 10, color: '#1a2e14' }}>
        {t('chargesUpgradeTitle')}
      </div>
      <div style={{ color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
        {t('chargesUpgradeMsg')}
      </div>
      <a href="/app/pricing" style={{
        display: 'inline-block', padding: '10px 24px', borderRadius: 8,
        background: '#1a4710', color: '#fff', fontWeight: 700, fontSize: '0.95rem',
        textDecoration: 'none',
      }}>
        View Plans
      </a>
    </div>
  );
}

// ── Room tile ─────────────────────────────────────────────────────────────────
function RoomTile({ room, onAddCharge, onViewCharges, canAdd, fmtCurrency }) {
  const t = useT();
  const chargeCount = room.charges_count ?? 0;
  return (
    <div style={{
      background: '#fff', borderRadius: 10, border: '1.5px solid #e2e8f0',
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a2e14' }}>
            {room.room_name}
            <span style={{ marginLeft: 6, fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8' }}>
              {room.room_type}
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#374151', marginTop: 3 }}>
            {room.guest_first_name} {room.guest_last_name}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
            {room.check_in_date} → {room.check_out_date}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: chargeCount > 0 ? '#1a4710' : '#94a3b8' }}>
            {fmtCurrency(room.charges_total ?? 0)}
          </div>
          {chargeCount > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              {chargeCount} charge{chargeCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {canAdd && (
          <button
            onClick={() => onAddCharge(room)}
            style={{
              width: '100%', padding: '7px 12px', borderRadius: 7,
              background: '#1a4710', border: 'none',
              color: '#fff', fontWeight: 600, fontSize: '0.85rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('chargesAddCharge')}
          </button>
        )}
        <button
          onClick={() => onViewCharges(room)}
          style={{
            width: '100%', padding: '7px 12px', borderRadius: 7,
            background: '#fff', border: '1.5px solid #e2e8f0',
            color: '#374151', fontWeight: 600, fontSize: '0.85rem',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {chargeCount > 0 ? t('chargesViewBtnCount')(chargeCount) : t('chargesViewBtn')}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Charges() {
  const t = useT();
  const { fmtCurrency, property } = useLocale();
  const { user } = useAuth();
  const plan = usePlan();

  const [rooms, setRooms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addChargeFor, setAddChargeFor] = useState(null);
  const [viewChargeFor, setViewChargeFor] = useState(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  const isChargesStaff = user?.role === 'charges_staff';
  const canAdd = user?.role === 'charges_staff' || user?.role === 'reception' || user?.role === 'owner';
  const canAddFromDetail = user?.role === 'owner' || user?.role === 'reception';

  useEffect(() => {
    if (plan !== 'multi' && !isChargesStaff) { setLoading(false); return; }
    if (!property?.id) return;
    setLoading(true);
    Promise.all([
      apiFetch(`/api/charges/rooms-today?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
      apiFetch(`/api/charges/categories?property_id=${property.id}`).then((r) => r.ok ? r.json() : []),
    ]).then(([r, c]) => {
      setRooms(Array.isArray(r) ? r : []);
      setCategories(Array.isArray(c) ? c : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [property?.id, plan, isChargesStaff]);

  if (plan !== 'multi' && !isChargesStaff) return <UpgradeGate />;

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#64748b', fontSize: '0.9rem' }}>
        {t('chargesLoading')}
      </div>
    );
  }

  const handleChargeSaved = (charge) => {
    setAddChargeFor(null);
    setDetailRefreshKey((k) => k + 1);
    setRooms((prev) =>
      prev.map((r) =>
        r.booking_id === charge.booking_id
          ? { ...r, charges_total: (r.charges_total ?? 0) + parseFloat(charge.amount), charges_count: (r.charges_count ?? 0) + 1 }
          : r
      )
    );
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">{t('charges')}</h1>
          <div style={{ color: '#64748b', fontSize: '0.88rem', marginTop: 4 }}>{t('chargesSubtitle')}</div>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div style={{
          background: '#f8fafc', borderRadius: 10, padding: '32px 24px',
          textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem',
          border: '1.5px dashed #e2e8f0',
        }}>
          {t('chargesNoRooms')}
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12 }}>
            {t('chargesRoomsToday')} — {rooms.length}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}>
            {rooms.map((room) => (
              <RoomTile
                key={room.booking_id}
                room={room}
                onAddCharge={setAddChargeFor}
                onViewCharges={setViewChargeFor}
                canAdd={canAdd}
                fmtCurrency={fmtCurrency}
              />
            ))}
          </div>
        </>
      )}

      {addChargeFor && categories.length > 0 && (
        <AddChargeModal
          booking={addChargeFor}
          categories={categories}
          onSaved={handleChargeSaved}
          onClose={() => setAddChargeFor(null)}
        />
      )}

      {viewChargeFor && (
        <ChargesDetailModal
          room={viewChargeFor}
          onClose={() => setViewChargeFor(null)}
          onAddCharge={setAddChargeFor}
          canAddFromDetail={canAddFromDetail}
          refreshKey={detailRefreshKey}
        />
      )}
    </div>
  );
}
