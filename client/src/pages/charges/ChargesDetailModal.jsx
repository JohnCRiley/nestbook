import { useState, useEffect } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { useT, useLocale } from '../../i18n/LocaleContext.jsx';
import { formatDateShort } from '../../utils/format.js';

export default function ChargesDetailModal({ room, onClose, onAddCharge, canAddFromDetail, refreshKey }) {
  const t = useT();
  const { fmtCurrency, locale } = useLocale();
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!room?.booking_id) return;
    setLoading(true);
    apiFetch(`/api/charges/booking/${room.booking_id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setCharges(Array.isArray(data) ? data.filter((c) => !c.voided) : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [room?.booking_id, refreshKey]);

  const total = charges.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520,
        boxShadow: '0 8px 40px rgba(0,0,0,0.22)', overflow: 'hidden',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ background: '#1a4710', color: '#fff', padding: '16px 24px', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
            {t('chargesFor')(room.room_name)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
            {room.guest_first_name} {room.guest_last_name}
            {' · '}
            {formatDateShort(room.check_in_date, locale)} → {formatDateShort(room.check_out_date, locale)}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
              {t('chargesLoading')}
            </div>
          ) : charges.length === 0 ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {t('chargesViewNone')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                  <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {t('addChargeDate')}
                  </th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.78rem' }}>
                    {t('addChargeCategory')}
                  </th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.78rem' }}>
                    {t('chargesColDesc')}
                  </th>
                  <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.78rem' }}>
                    {t('addChargeAmount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '9px 16px', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {formatDateShort(c.charge_date, locale)}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#374151', fontSize: '0.82rem' }}>
                      {c.category_name ?? '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {c.description ?? '—'}
                    </td>
                    <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 600, color: '#1a4710', whiteSpace: 'nowrap' }}>
                      {fmtCurrency(c.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Total footer */}
        {charges.length > 0 && (
          <div style={{
            padding: '11px 24px',
            background: '#f0faf0', borderTop: '1.5px solid #d9f0cc',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1a2e14' }}>
              {t('chargesViewTotal')}
            </span>
            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1a4710' }}>
              {fmtCurrency(total)}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div style={{
          padding: '12px 24px', borderTop: '1px solid #f1f5f9',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 7,
              background: '#f8fafc', border: '1.5px solid #e2e8f0',
              color: '#64748b', fontWeight: 600, fontSize: '0.88rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('chargesViewClose')}
          </button>
          {canAddFromDetail && (
            <button
              onClick={() => { onClose(); onAddCharge(room); }}
              style={{
                padding: '9px 18px', borderRadius: 7, border: 'none',
                background: '#1a4710', color: '#fff', fontWeight: 700, fontSize: '0.88rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t('chargesAddCharge')} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
