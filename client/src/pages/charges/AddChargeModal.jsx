import { useState } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { useT, useLocale } from '../../i18n/LocaleContext.jsx';

export default function AddChargeModal({ booking, categories, onSaved, onClose }) {
  const t = useT();
  const { currencySymbol } = useLocale();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    category_id: categories[0]?.id ?? '',
    description: '',
    amount: '',
    charge_date: today,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      setError('Enter a valid amount greater than 0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: booking.booking_id,
          property_id: booking.property_id || undefined,
          category_id: form.category_id || null,
          description: form.description || null,
          amount,
          charge_date: form.charge_date,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      onSaved(await res.json());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const selectedCat = categories.find((c) => c.id === Number(form.category_id));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440,
        boxShadow: '0 8px 40px rgba(0,0,0,0.22)', overflow: 'hidden',
      }}>
        <div style={{ background: '#1a4710', color: '#fff', padding: '16px 24px' }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('addChargeTitle')}</div>
          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
            {booking.guest_first_name} {booking.guest_last_name} — {booking.room_name}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#991b1b', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                {t('addChargeCategory')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category_id: cat.id }))}
                    style={{
                      padding: '5px 12px', borderRadius: 16, fontSize: '0.82rem', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                      background: form.category_id === cat.id ? cat.color : '#f1f5f9',
                      color: form.category_id === cat.id ? '#fff' : '#374151',
                      border: form.category_id === cat.id ? `2px solid ${cat.color}` : '2px solid #e2e8f0',
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                {t('addChargeDesc')}
              </label>
              <input
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder={selectedCat ? selectedCat.name : ''}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 6,
                  border: '1.5px solid #e2e8f0', fontSize: '0.88rem',
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                  {t('addChargeAmount')} ({currencySymbol})
                </label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  required
                  autoFocus
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 6,
                    border: '1.5px solid #e2e8f0', fontSize: '0.88rem',
                    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                  {t('addChargeDate')}
                </label>
                <input
                  name="charge_date"
                  type="date"
                  value={form.charge_date}
                  onChange={handleChange}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 6,
                    border: '1.5px solid #e2e8f0', fontSize: '0.88rem',
                    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{
              background: '#fffbeb', border: '1px solid #fcd34d',
              borderRadius: 6, padding: '8px 12px',
              fontSize: '0.78rem', color: '#92400e',
            }}>
              ⚠ {t('addChargeReceiptNote')}
            </div>
          </div>

          <div style={{
            padding: '12px 24px', borderTop: '1px solid #f1f5f9',
            display: 'flex', gap: 8, justifyContent: 'flex-end',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px', borderRadius: 7,
                background: '#f8fafc', border: '1.5px solid #e2e8f0',
                color: '#64748b', fontWeight: 600, fontSize: '0.88rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !form.amount}
              style={{
                padding: '9px 18px', borderRadius: 7, border: 'none',
                background: saving || !form.amount ? '#d1d5db' : '#1a4710',
                color: '#fff', fontWeight: 700, fontSize: '0.88rem',
                cursor: saving || !form.amount ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {saving ? t('addChargeSaving') : t('addChargeSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
