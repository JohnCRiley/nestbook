import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../i18n/LocaleContext.jsx';
import { apiFetch } from '../utils/apiFetch.js';

const PROPERTY_GROUPS = [
  { group: 'Hospitality', options: [
    { value: 'bnb',        label: 'B&B (Bed & Breakfast)' },
    { value: 'guesthouse', label: 'Guest House' },
    { value: 'inn',        label: 'Inn / Pub with rooms' },
    { value: 'hotel',      label: 'Small Hotel' },
    { value: 'hostel',     label: 'Hostel' },
  ]},
  { group: 'Self-catering', options: [
    { value: 'gite',          label: 'Gîte' },
    { value: 'cottage',       label: 'Holiday Cottage' },
    { value: 'villa',         label: 'Villa' },
    { value: 'apartment',     label: 'Holiday Apartment' },
    { value: 'lodge',         label: 'Lodge' },
    { value: 'caravan',       label: 'Static Caravan / Chalet' },
    { value: 'glamping',      label: 'Glamping (Pod / Bell Tent / Yurt)' },
    { value: 'shepherds_hut', label: "Shepherd's Hut" },
    { value: 'treehouse',     label: 'Treehouse' },
    { value: 'narrowboat',    label: 'Narrowboat / Houseboat' },
    { value: 'farmhouse',     label: 'Farmhouse' },
    { value: 'chateau',       label: 'Château / Manor House' },
  ]},
  { group: 'Asian accommodation', options: [
    { value: 'ryokan',       label: 'Ryokan (Japan)' },
    { value: 'minsu',        label: '民宿 Minsu (China/Taiwan)' },
    { value: 'homestay',     label: 'Homestay' },
    { value: 'resort_villa', label: 'Resort Villa' },
  ]},
  { group: 'Other', options: [
    { value: 'other', label: 'Other' },
  ]},
];

const CURRENCIES = [
  { value: 'EUR', label: '€ EUR — Euro' },
  { value: 'GBP', label: '£ GBP — British Pound' },
  { value: 'USD', label: '$ USD — US Dollar' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
];

const LOCALES = [
  { value: 'en', label: '🇬🇧 English' },
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'nl', label: '🇳🇱 Nederlands' },
];

const WHOLE_PROPERTY_TYPES = new Set([
  'gite', 'cottage', 'villa', 'apartment', 'lodge',
  'caravan', 'glamping', 'shepherds_hut', 'treehouse',
  'narrowboat', 'farmhouse', 'chateau',
  'ryokan', 'minsu', 'homestay', 'resort_villa',
]);

export default function Onboarding() {
  const { user, updateUser } = useAuth();
  const t = useT();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  // Redirect immediately if onboarding already completed
  useEffect(() => {
    if (user?.onboarding_completed) {
      navigate('/dashboard', { replace: true });
    }
  }, [user?.onboarding_completed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user?.property_id) return;
    apiFetch(`/api/properties/${user.property_id}`)
      .then(r => r.json())
      .then(p => {
        setForm({
          name:                p.name               ?? '',
          type:                p.type               ?? 'bnb',
          address:             p.address            ?? '',
          city:                p.city               ?? '',
          country:             p.country            ?? '',
          check_in_time:       p.check_in_time      ?? '15:00',
          check_out_time:      p.check_out_time     ?? '11:00',
          currency:            p.currency           ?? 'EUR',
          locale:              p.locale             ?? 'en',
          rental_type:         p.rental_type        ?? (WHOLE_PROPERTY_TYPES.has(p.type) ? 'whole_property' : 'rooms'),
          breakfast_start_time: p.breakfast_start_time ?? '07:00',
          breakfast_end_time:   p.breakfast_end_time   ?? '11:00',
        });
      })
      .catch(() => {});
  }, [user?.property_id]);

  async function completeOnboarding() {
    try {
      await apiFetch('/api/auth/complete-onboarding', { method: 'PATCH' });
      updateUser({ onboarding_completed: true });
      try {
        const stored = JSON.parse(localStorage.getItem('nb_user') || '{}');
        localStorage.setItem('nb_user', JSON.stringify({ ...stored, onboarding_completed: true }));
      } catch (_) {}
    } catch (_) {}
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form || !user?.property_id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/properties/${user.property_id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to save. Please try again.');
        setSaving(false);
        return;
      }
      await completeOnboarding();
      setDone(true);
      setTimeout(() => { window.location.href = '/app/dashboard'; }, 2500);
    } catch (_) {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  async function handleSkip() {
    await completeOnboarding();
    window.location.href = '/app/dashboard';
  }

  if (!form) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Loading…</div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a2e14', marginBottom: 8 }}>
            {t('onboard.successTitle')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>{t('onboard.successBody')}</p>
        </div>
      </div>
    );
  }

  const isWhole = form.rental_type === 'whole_property';

  return (
    <div style={{ height: '100vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#f8fafc', padding: '32px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <img src="/icon.svg" alt="NestBook" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1a2e14', letterSpacing: '-0.02em' }}>NestBook</span>
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: '#1a2e14', marginBottom: 4 }}>
          {t('onboard.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 28 }}>
          {t('onboard.subtitle')}
        </p>

        <form onSubmit={handleSave}>

          {/* Property Name */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t('onboard.propertyName')}</label>
            <input
              className="form-control"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          {/* Property Type */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t('onboard.propertyType')}</label>
            <select
              className="form-control"
              value={form.type}
              onChange={e => {
                const newType = e.target.value;
                setForm(f => ({
                  ...f,
                  type: newType,
                  rental_type: WHOLE_PROPERTY_TYPES.has(newType) ? 'whole_property' : f.rental_type,
                }));
              }}
            >
              {PROPERTY_GROUPS.map(grp => (
                <optgroup key={grp.group} label={grp.group}>
                  {grp.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Address */}
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>{t('address')}</label>
            <input
              className="form-control"
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
              placeholder="47 Route de Gordes"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
            <div>
              <label style={labelStyle}>{t('cityLabel')}</label>
              <input
                className="form-control"
                value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
                placeholder="Roussillon"
              />
            </div>
            <div>
              <label style={labelStyle}>{t('countryLabel')}</label>
              <input
                className="form-control"
                value={form.country}
                onChange={e => setForm({ ...form, country: e.target.value })}
                placeholder="France"
              />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 16, marginTop: 4 }}>
            {t('onboard.addressHint')}
          </p>

          {/* Check-in / Check-out */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>{t('onboard.checkin')}</label>
              <input
                type="time"
                className="form-control"
                value={form.check_in_time}
                onChange={e => setForm({ ...form, check_in_time: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('onboard.checkout')}</label>
              <input
                type="time"
                className="form-control"
                value={form.check_out_time}
                onChange={e => setForm({ ...form, check_out_time: e.target.value })}
              />
            </div>
          </div>

          {/* Currency / Language */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div>
              <label style={labelStyle}>{t('onboard.currency')}</label>
              <select
                className="form-control"
                value={form.currency}
                onChange={e => setForm({ ...form, currency: e.target.value })}
              >
                {CURRENCIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('onboard.language')}</label>
              <select
                className="form-control"
                value={form.locale}
                onChange={e => setForm({ ...form, locale: e.target.value })}
              >
                {LOCALES.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Rental Type */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>{t('onboard.rentalType')}</label>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setForm({ ...form, rental_type: 'rooms' })}
                className={`rental-type-btn${form.rental_type === 'rooms' ? ' active' : ''}`}
              >
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  <i className="ti ti-bed" /> {t('onboard.rentalTypeRooms')}
                </div>
                <div style={{ fontSize: '0.78rem', marginTop: 4, opacity: 0.75 }}>
                  {t('onboard.rentalTypeRoomsDesc')}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, rental_type: 'whole_property' })}
                className={`rental-type-btn${form.rental_type === 'whole_property' ? ' active' : ''}`}
              >
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  <i className="ti ti-home" /> {t('onboard.rentalTypeWhole')}
                </div>
                <div style={{ fontSize: '0.78rem', marginTop: 4, opacity: 0.75 }}>
                  {t('onboard.rentalTypeWholeDesc')}
                </div>
              </button>
            </div>
            <div style={{
              marginTop: 10, padding: '8px 12px',
              background: '#fefce8', border: '1px solid #fbbf24',
              borderRadius: 6, fontSize: '0.78rem', color: '#92400e',
            }}>
              <i className="ti ti-lock" style={{ marginRight: 5 }} />
              {t('onboard.rentalTypeLockNote')}{' '}
              <a
                href="https://nestbook.io/help.html#getting-started"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#92400e', textDecoration: 'underline' }}
              >
                {t('onboard.rentalTypeLockLink')}
              </a>
            </div>
          </div>

          {/* Breakfast times — only for rooms rental type */}
          {!isWhole && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              <div>
                <label style={labelStyle}>{t('onboard.breakfastStart')}</label>
                <input
                  type="time"
                  className="form-control"
                  value={form.breakfast_start_time}
                  onChange={e => setForm({ ...form, breakfast_start_time: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>{t('onboard.breakfastEnd')}</label>
                <input
                  type="time"
                  className="form-control"
                  value={form.breakfast_end_time}
                  onChange={e => setForm({ ...form, breakfast_end_time: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* What's next */}
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 8, padding: '14px 16px', marginBottom: 24,
          }}>
            <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1a2e14', marginBottom: 8 }}>
              {t('onboard.nextSteps')}
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[t('onboard.step1'), t('onboard.step2'), t('onboard.step3')].map((step, i) => (
                <li key={i} style={{ fontSize: '0.8rem', color: '#374151' }}>{step}</li>
              ))}
            </ol>
          </div>

          {error && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.82rem', color: '#991b1b' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%', padding: '12px 0',
              background: '#1a4710', color: '#fff',
              border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: '0.95rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
              marginBottom: 12,
            }}
          >
            {saving ? '…' : t('onboard.save')}
          </button>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleSkip}
              style={{
                background: 'none', border: 'none',
                color: '#6b7280', fontSize: '0.82rem',
                cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: 'underline',
              }}
            >
              {t('onboard.skip')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontWeight: 600,
  fontSize: '0.85rem',
  marginBottom: 4,
  color: '#374151',
};
