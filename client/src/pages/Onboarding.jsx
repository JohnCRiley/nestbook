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

const TOTAL_STEPS = 8; // 0–6 = data steps, 7 = summary

function getPropertyTypeLabel(value) {
  for (const grp of PROPERTY_GROUPS) {
    const opt = grp.options.find(o => o.value === value);
    if (opt) return opt.label;
  }
  return value;
}

export default function Onboarding() {
  const { user, updateUser } = useAuth();
  const t = useT();
  const navigate = useNavigate();

  const [form, setForm]           = useState(null);
  const [step, setStep]           = useState(0);
  const [savedSteps, setSavedSteps] = useState(new Set());
  const [saving, setSaving]       = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState(null);

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
          name:                 p.name                ?? '',
          type:                 p.type                ?? 'bnb',
          address:              p.address             ?? '',
          city:                 p.city                ?? '',
          country:              p.country             ?? '',
          check_in_time:        p.check_in_time       ?? '15:00',
          check_out_time:       p.check_out_time      ?? '11:00',
          currency:             p.currency            ?? 'EUR',
          locale:               p.locale              ?? 'en',
          rental_type:          p.rental_type         ?? (WHOLE_PROPERTY_TYPES.has(p.type) ? 'whole_property' : 'rooms'),
          breakfast_start_time: p.breakfast_start_time ?? '07:00',
          breakfast_end_time:   p.breakfast_end_time   ?? '11:00',
        });
      })
      .catch(() => {});
  }, [user?.property_id]);

  function getNextStep(s) {
    // Skip breakfast step (6) for whole-property rental types
    if (s === 5 && form?.rental_type === 'whole_property') return 7;
    return Math.min(s + 1, 7);
  }

  function getPrevStep(s) {
    if (s === 7 && form?.rental_type === 'whole_property') return 5;
    return Math.max(s - 1, 0);
  }

  async function saveStep() {
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
        return;
      }
      setSavedSteps(prev => new Set([...prev, step]));
      setStep(getNextStep(step));
    } catch (_) {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

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

  async function handleFinish() {
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
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Loading…</div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
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

  // Step 6 (breakfast) is always index 6 in the dot row, but skipped in navigation for whole-property
  function isDotCompleted(i) {
    if (i === 6 && isWhole) return false; // whole-property users never do breakfast step
    return savedSteps.has(i);
  }
  function isDotCurrent(i) {
    return i === step;
  }

  function renderStepContent() {
    switch (step) {

      // ── Step 0: Property name ──────────────────────────────────────────
      case 0:
        return (
          <>
            <div className="wiz-step-label">{t('onboard.wizCheckName')}</div>
            <input
              className="wizard-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            <button className="btn-wiz" disabled={saving || !form.name.trim()} onClick={saveStep}>
              {saving ? '…' : t('onboard.saveAndContinue')}
            </button>
          </>
        );

      // ── Step 1: Property type ──────────────────────────────────────────
      case 1:
        return (
          <>
            <div className="wiz-step-label">{t('onboard.wizCheckType')}</div>
            <select
              className="wizard-input wizard-select"
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
            <button className="btn-wiz" disabled={saving} onClick={saveStep}>
              {saving ? '…' : t('onboard.saveAndContinue')}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" className="btn-wiz-back" onClick={() => setStep(getPrevStep(step))}>
                ← {t('onboard.backBtn')}
              </button>
            </div>
          </>
        );

      // ── Step 2: Address ────────────────────────────────────────────────
      case 2:
        return (
          <>
            <div className="wiz-step-label">{t('onboard.wizAddress')}</div>
            <input
              className="wizard-input"
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
              placeholder="47 Route de Gordes"
              style={{ marginBottom: 12 }}
              autoFocus
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input
                className="wizard-input"
                value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
                placeholder={t('cityLabel')}
              />
              <input
                className="wizard-input"
                value={form.country}
                onChange={e => setForm({ ...form, country: e.target.value })}
                placeholder={t('countryLabel')}
              />
            </div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '4px 0 0', lineHeight: 1.5 }}>
              {t('onboard.addressHint')}
            </p>
            <button className="btn-wiz" disabled={saving} onClick={saveStep}>
              {saving ? '…' : t('onboard.saveAndContinue')}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" className="btn-wiz-back" onClick={() => setStep(getPrevStep(step))}>
                ← {t('onboard.backBtn')}
              </button>
            </div>
          </>
        );

      // ── Step 3: Check-in / check-out ──────────────────────────────────
      case 3:
        return (
          <>
            <div className="wiz-step-label">{t('onboard.wizTimes')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>{t('onboard.checkin')}</label>
                <input
                  type="time"
                  className="wizard-input"
                  value={form.check_in_time}
                  onChange={e => setForm({ ...form, check_in_time: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>{t('onboard.checkout')}</label>
                <input
                  type="time"
                  className="wizard-input"
                  value={form.check_out_time}
                  onChange={e => setForm({ ...form, check_out_time: e.target.value })}
                />
              </div>
            </div>
            <button className="btn-wiz" disabled={saving} onClick={saveStep}>
              {saving ? '…' : t('onboard.saveAndContinue')}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" className="btn-wiz-back" onClick={() => setStep(getPrevStep(step))}>
                ← {t('onboard.backBtn')}
              </button>
            </div>
          </>
        );

      // ── Step 4: Currency & language ────────────────────────────────────
      case 4:
        return (
          <>
            <div className="wiz-step-label">{t('onboard.wizCurrency')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>{t('onboard.currency')}</label>
                <select
                  className="wizard-input wizard-select"
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
                  className="wizard-input wizard-select"
                  value={form.locale}
                  onChange={e => setForm({ ...form, locale: e.target.value })}
                >
                  {LOCALES.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button className="btn-wiz" disabled={saving} onClick={saveStep}>
              {saving ? '…' : t('onboard.saveAndContinue')}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" className="btn-wiz-back" onClick={() => setStep(getPrevStep(step))}>
                ← {t('onboard.backBtn')}
              </button>
            </div>
          </>
        );

      // ── Step 5: Rental type ────────────────────────────────────────────
      case 5:
        return (
          <>
            <div className="wiz-step-label">{t('onboard.wizRentalType')}</div>
            <div style={{ display: 'flex', gap: 14 }}>
              <button
                type="button"
                onClick={() => setForm({ ...form, rental_type: 'rooms' })}
                className={`rental-type-btn${form.rental_type === 'rooms' ? ' active' : ''}`}
                style={{ flex: 1, padding: '16px 18px', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
                  <i className="ti ti-bed" /> {t('onboard.rentalTypeRooms')}
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.4, marginBottom: 8 }}>
                  {t('onboard.rentalTypeRoomsDesc')}
                </div>
                <span className="wiz-inn-tag">
                  ✦ {t('onboard.rentalTypeInn')} — {t('onboard.rentalTypeInnDesc')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, rental_type: 'whole_property' })}
                className={`rental-type-btn${form.rental_type === 'whole_property' ? ' active' : ''}`}
                style={{ flex: 1, padding: '16px 18px', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
                  <i className="ti ti-home" /> {t('onboard.rentalTypeWhole')}
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.4 }}>
                  {t('onboard.rentalTypeWholeDesc')}
                </div>
              </button>
            </div>
            <div style={{
              marginTop: 14, padding: '8px 14px',
              background: '#fefce8', border: '1px solid #fbbf24',
              borderRadius: 7, fontSize: '0.78rem', color: '#92400e',
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
            <button className="btn-wiz" disabled={saving} onClick={saveStep}>
              {saving ? '…' : t('onboard.saveAndContinue')}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" className="btn-wiz-back" onClick={() => setStep(getPrevStep(step))}>
                ← {t('onboard.backBtn')}
              </button>
            </div>
          </>
        );

      // ── Step 6: Breakfast times ────────────────────────────────────────
      case 6:
        return (
          <>
            <div className="wiz-step-label">{t('onboard.wizBreakfast')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>{t('onboard.breakfastStart')}</label>
                <input
                  type="time"
                  className="wizard-input"
                  value={form.breakfast_start_time}
                  onChange={e => setForm({ ...form, breakfast_start_time: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>{t('onboard.breakfastEnd')}</label>
                <input
                  type="time"
                  className="wizard-input"
                  value={form.breakfast_end_time}
                  onChange={e => setForm({ ...form, breakfast_end_time: e.target.value })}
                />
              </div>
            </div>
            <button className="btn-wiz" disabled={saving} onClick={saveStep}>
              {saving ? '…' : t('onboard.saveAndContinue')}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" className="btn-wiz-back" onClick={() => setStep(getPrevStep(step))}>
                ← {t('onboard.backBtn')}
              </button>
            </div>
          </>
        );

      // ── Step 7: Summary ────────────────────────────────────────────────
      case 7: {
        const currencyLabel = CURRENCIES.find(c => c.value === form.currency)?.label ?? form.currency;
        const localeLabel   = LOCALES.find(l => l.value === form.locale)?.label ?? form.locale;
        const rentalLabel   = form.rental_type === 'whole_property'
          ? t('onboard.rentalTypeWhole')
          : t('onboard.rentalTypeRooms');

        return (
          <>
            <div className="wiz-step-label">{t('onboard.wizSummary')}</div>
            <div style={{ marginBottom: 28 }}>
              <div className="wiz-summary-row">
                <span className="wiz-summary-label">{t('onboard.summaryName')}</span>
                <span className="wiz-summary-value">{form.name || '—'}</span>
              </div>
              <div className="wiz-summary-row">
                <span className="wiz-summary-label">{t('onboard.summaryType')}</span>
                <span className="wiz-summary-value">{getPropertyTypeLabel(form.type)}</span>
              </div>
              <div className="wiz-summary-row">
                <span className="wiz-summary-label">{t('onboard.summaryAddress')}</span>
                <span className="wiz-summary-value">
                  {[form.address, form.city, form.country].filter(Boolean).join(', ') || '—'}
                </span>
              </div>
              <div className="wiz-summary-row">
                <span className="wiz-summary-label">{t('onboard.summaryTimes')}</span>
                <span className="wiz-summary-value">{form.check_in_time} / {form.check_out_time}</span>
              </div>
              <div className="wiz-summary-row">
                <span className="wiz-summary-label">{t('onboard.summaryCurrency')}</span>
                <span className="wiz-summary-value">{currencyLabel} · {localeLabel}</span>
              </div>
              <div className="wiz-summary-row">
                <span className="wiz-summary-label">{t('onboard.summaryRentalType')}</span>
                <span className="wiz-summary-value">{rentalLabel}</span>
              </div>
              {!isWhole && (
                <div className="wiz-summary-row">
                  <span className="wiz-summary-label">{t('onboard.summaryBreakfast')}</span>
                  <span className="wiz-summary-value">{form.breakfast_start_time} – {form.breakfast_end_time}</span>
                </div>
              )}
            </div>

            {/* What's next */}
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 8, padding: '14px 16px', marginBottom: 24,
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1a2e14', marginBottom: 8 }}>
                {t('onboard.nextSteps')}
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[t('onboard.step1'), t('onboard.step2'), t('onboard.step3'), t('onboard.step4')].map((s, i) => (
                  <li key={i} style={{ fontSize: '0.8rem', color: '#374151' }}>{s}</li>
                ))}
              </ol>
            </div>

            {error && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.82rem', color: '#991b1b' }}>
                {error}
              </div>
            )}

            <button className="btn-wiz" disabled={saving} onClick={handleFinish}
              style={{ background: '#1a4710', color: '#fff', borderColor: '#1a4710' }}
            >
              {saving ? '…' : t('onboard.save')}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" className="btn-wiz-back" onClick={() => setStep(getPrevStep(step))}>
                ← {t('onboard.backBtn')}
              </button>
            </div>
          </>
        );
      }

      default:
        return null;
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#fff', padding: '40px 20px 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <img src="/icon.svg" alt="NestBook" style={{ width: 30, height: 30 }} />
          <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#1a2e14', letterSpacing: '-0.02em' }}>NestBook</span>
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: '1.7rem', fontWeight: 900, color: '#1a2e14', marginBottom: 4, letterSpacing: '-0.5px' }}>
          {t('onboard.title')}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.92rem', marginBottom: 36 }}>
          {t('onboard.subtitle')}
        </p>

        {/* Step progress */}
        <div className="wizard-steps">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`wizard-step-dot${isDotCompleted(i) ? ' completed' : ''}${isDotCurrent(i) ? ' current' : ''}`}
              style={{ cursor: (isDotCompleted(i) || i < step) ? 'pointer' : 'default' }}
              onClick={() => { if (isDotCompleted(i) || i < step) setStep(i); }}
              title={`Step ${i + 1}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div>
          {error && step !== 7 && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.82rem', color: '#991b1b' }}>
              {error}
            </div>
          )}
          {renderStepContent()}
        </div>

        {/* Skip link */}
        {step < 7 && (
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <button
              type="button"
              onClick={handleSkip}
              style={{
                background: 'none', border: 'none',
                color: '#9ca3af', fontSize: '0.8rem',
                cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: 'underline',
              }}
            >
              {t('onboard.skip')}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontWeight: 600,
  fontSize: '0.82rem',
  marginBottom: 6,
  color: '#557a4a',
};
