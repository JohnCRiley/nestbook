import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../i18n/LocaleContext.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { PROPERTY_GROUPS, WHOLE_PROPERTY_TYPES } from '../utils/propertyTypes.js';
import { RentalTypeSelector, UnSubTypeSelector, IrRoomModeSelector } from '../components/RentalTypeStep.jsx';

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

// 0–8 = data steps (6 = units sub-type / IR room-organization choice,
// 7 = IR room categories list — only when rooms+categories was chosen,
// 8 = breakfast), 9 = summary.
const TOTAL_STEPS = 10;

function shouldSkipBreakfast(form) {
  if (!form) return false;
  if (form.rental_type === 'whole_property') return true;
  if (form.rental_type === 'units') return form.un_sub_type !== 'aparthotel';
  return false;
}

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

  // IR room-categories list (step 7) — local drafts only, created via the
  // room-categories endpoint on that step's own "Save and continue".
  // Pre-filled with sensible suggestions rather than a blank list.
  const [categoryDrafts, setCategoryDrafts] = useState(['Double', 'Twin', 'Single', 'Family']);

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
          un_sub_type:          p.un_sub_type          ?? null,
          ir_room_mode:         p.ir_room_mode         ?? 'named',
        });
      })
      .catch(() => {});
  }, [user?.property_id]);

  // Step 6 is shared: units sub-type (units mode) or the new IR
  // room-organization choice (rooms mode) — never both, since rental_type is
  // exclusive. Step 7 (category list) only exists for rooms+categories.
  function isCategoriesFlow() {
    return form?.rental_type === 'rooms' && form?.ir_room_mode === 'categories';
  }

  function getNextStep(s) {
    // Step 5 (rental type) → 6 (units sub-type / IR room-mode choice) for
    // units or rooms, or straight past breakfast for whole_property (which
    // always skips it too).
    if (s === 5) {
      if (form?.rental_type === 'whole_property') return shouldSkipBreakfast(form) ? 9 : 8;
      return 6;
    }
    // Step 6 (units sub-type / IR room-mode choice) → 7 (category list, rooms
    // + categories only) or straight to breakfast/summary.
    if (s === 6) {
      if (isCategoriesFlow()) return 7;
      return shouldSkipBreakfast(form) ? 9 : 8;
    }
    // Step 7 (category list) → 8 (breakfast always applies to rooms mode).
    if (s === 7) return 8;
    return Math.min(s + 1, 9);
  }

  function getPrevStep(s) {
    if (s === 9) { // summary
      if (form?.rental_type === 'whole_property') return 5;
      if (form?.rental_type === 'units') return shouldSkipBreakfast(form) ? 6 : 8;
      return 8; // rooms — breakfast always shown
    }
    if (s === 8) { // breakfast
      if (isCategoriesFlow()) return 7;
      return (form?.rental_type === 'units' || form?.rental_type === 'rooms') ? 6 : 5;
    }
    if (s === 7) return 6; // category list → room-mode choice
    if (s === 6) return 5;
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

  // Step 7 (IR category list) doesn't touch the property form — it creates
  // room_categories rows via the Phase 1 endpoint instead. ir_room_mode
  // itself was already persisted by step 6's own saveStep(), so this only
  // needs to create the categories, matching "each step saves independently."
  async function saveCategoriesStep() {
    if (!user?.property_id) return;
    const names = categoryDrafts.map(n => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const name of names) {
        const res = await apiFetch(`/api/properties/${user.property_id}/room-categories`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to save. Please try again.');
        }
      }
      setSavedSteps(prev => new Set([...prev, step]));
      setStep(getNextStep(step));
    } catch (err) {
      setError(err.message || 'Failed to save. Please try again.');
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

  function handleSkip() {
    setStep(getNextStep(step));
  }

  if (!form) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ color: '#405440', fontSize: '0.9rem' }}>Loading…</div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#405440', marginBottom: 8 }}>
            {t('onboard.successTitle')}
          </h1>
          <p style={{ color: '#405440', fontSize: '0.9rem' }}>{t('onboard.successBody')}</p>
        </div>
      </div>
    );
  }

  // Step 6 (units sub-type / IR room-mode choice) is skipped only for
  // whole-property; step 7 (IR category list) only exists for rooms mode
  // with the "categories" choice; step 8 (breakfast) is skipped for
  // whole-property, and for units unless the sub-type is Aparthotel. All
  // stay non-clickable in the dot row when skipped.
  function isDotSkipped(i) {
    if (i === 6) return form.rental_type === 'whole_property';
    if (i === 7) return !isCategoriesFlow();
    if (i === 8) return shouldSkipBreakfast(form);
    return false;
  }
  function isDotCompleted(i) {
    if (isDotSkipped(i)) return false;
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
            <p style={{ fontSize: '0.78rem', color: '#405440', margin: '4px 0 0', lineHeight: 1.5 }}>
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
            <div className="onboard-rental-step">
              <RentalTypeSelector form={form} setForm={setForm} t={t} />
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

      // ── Step 6: Units sub-type (units) OR IR room-organization choice (rooms) ──
      case 6:
        return (
          <>
            <div className="wiz-step-label">
              {form.rental_type === 'units' ? t('onboard.wizUnSubType') : t('onboard.wizIrRoomMode')}
            </div>
            {form.rental_type === 'units'
              ? <UnSubTypeSelector form={form} setForm={setForm} t={t} />
              : <IrRoomModeSelector form={form} setForm={setForm} t={t} />
            }
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

      // ── Step 7: IR room categories list (rooms + categories only) ──────
      case 7:
        return (
          <>
            <div className="wiz-step-label">{t('onboard.wizRoomCategoriesList')}</div>
            <p style={{ fontSize: '0.8rem', color: '#405440', margin: '0 0 14px', lineHeight: 1.5 }}>
              {t('onboard.roomCategoriesHint')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {categoryDrafts.map((name, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="wizard-input"
                    value={name}
                    onChange={e => {
                      const next = [...categoryDrafts];
                      next[i] = e.target.value;
                      setCategoryDrafts(next);
                    }}
                    placeholder={t('onboard.roomCategoryPlaceholder')}
                    style={{ flex: 1 }}
                    autoFocus={i === 0}
                  />
                  <button
                    type="button"
                    onClick={() => setCategoryDrafts(categoryDrafts.filter((_, idx) => idx !== i))}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#b91c1c', fontSize: '1.1rem', padding: '4px 8px', fontFamily: 'inherit',
                    }}
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCategoryDrafts([...categoryDrafts, ''])}
              style={{
                background: 'none', border: '1px dashed #405440', borderRadius: 6,
                color: '#405440', fontSize: '0.82rem', padding: '8px 14px',
                cursor: 'pointer', fontFamily: 'inherit', marginBottom: 20,
              }}
            >
              + {t('onboard.addCategory')}
            </button>
            <button
              className="btn-wiz"
              disabled={saving || categoryDrafts.every(n => !n.trim())}
              onClick={saveCategoriesStep}
            >
              {saving ? '…' : t('onboard.saveAndContinue')}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" className="btn-wiz-back" onClick={() => setStep(getPrevStep(step))}>
                ← {t('onboard.backBtn')}
              </button>
            </div>
          </>
        );

      // ── Step 8: Breakfast times ────────────────────────────────────────
      case 8:
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

      // ── Step 9: Summary ────────────────────────────────────────────────
      case 9: {
        const currencyLabel = CURRENCIES.find(c => c.value === form.currency)?.label ?? form.currency;
        const localeLabel   = LOCALES.find(l => l.value === form.locale)?.label ?? form.locale;
        const rentalLabel   = form.rental_type === 'whole_property'
          ? t('onboard.rentalTypeWhole')
          : form.rental_type === 'units'
          ? t('onboard.rentalTypeUnits')
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
              {!shouldSkipBreakfast(form) && (
                <div className="wiz-summary-row">
                  <span className="wiz-summary-label">{t('onboard.summaryBreakfast')}</span>
                  <span className="wiz-summary-value">{form.breakfast_start_time} – {form.breakfast_end_time}</span>
                </div>
              )}
            </div>

            {/* What's next */}
            <div style={{
              background: '#f0ede8', border: '1px solid #405440',
              borderRadius: 8, padding: '14px 16px', marginBottom: 24,
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#405440', marginBottom: 8 }}>
                {t('onboard.nextSteps')}
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[t('onboard.step1'), t('onboard.step2'), t('onboard.step3'), t('onboard.step4')].map((s, i) => (
                  <li key={i} style={{ fontSize: '0.8rem', color: '#405440' }}>{s}</li>
                ))}
              </ol>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#405440', fontStyle: 'italic', marginBottom: 20, lineHeight: 1.55 }}>
              {t('onboard.sampleDataNote')}
            </p>

            {error && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.82rem', color: '#991b1b' }}>
                {error}
              </div>
            )}

            <button className="btn-wiz" disabled={saving} onClick={handleFinish}
              style={{ background: '#405440', color: '#fff', borderColor: '#405440' }}
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
    <div style={{ position: 'relative', overflow: 'hidden', height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '40px 20px 60px', background: '#ffffff' }}>
      {/* Wave background: white -> wave -> cream gradient, same pattern/values
          as Register.jsx / index.html's .hero-bg (gradient on this shared
          wrapper, not a sub-child) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, zIndex: 0,
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(240,237,232,1) 57%, rgba(255,255,255,1) 100%)',
        }}
      >
        <div style={{ flex: '1 1 0', background: '#ffffff' }} />
        <div style={{ flex: '0 0 50px', width: '100%', lineHeight: 0 }}>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 50 }}>
            <path d="M0,0 V60 Q300,120 600,60 T1200,60 V0 Z" fill="#ffffff" />
          </svg>
        </div>
        <div style={{ flex: '1 1 0' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <img src="/icon.svg" alt="NestBook" style={{ width: 30, height: 30 }} />
          <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#405440', letterSpacing: '-0.02em' }}>NestBook</span>
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: '1.7rem', fontWeight: 900, color: '#405440', marginBottom: 4, letterSpacing: '-0.5px' }}>
          {t('onboard.title')}
        </h1>
        <p style={{ color: '#405440', fontSize: '0.92rem', marginBottom: 36 }}>
          {t('onboard.subtitle')}
        </p>

        {/* Step progress */}
        <div className="wizard-steps">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const clickable = !isDotSkipped(i) && (isDotCompleted(i) || i < step);
            return (
              <div
                key={i}
                className={`wizard-step-dot${isDotCompleted(i) ? ' completed' : ''}${isDotCurrent(i) ? ' current' : ''}`}
                style={{ cursor: clickable ? 'pointer' : 'default' }}
                onClick={() => { if (clickable) setStep(i); }}
                title={`Step ${i + 1}`}
              />
            );
          })}
        </div>

        {/* Step content */}
        <div>
          {error && step !== 9 && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.82rem', color: '#991b1b' }}>
              {error}
            </div>
          )}
          {renderStepContent()}
        </div>

        {/* Skip link */}
        {step < 9 && (
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <button
              type="button"
              onClick={handleSkip}
              style={{
                background: 'none', border: 'none',
                color: '#405440', fontSize: '0.8rem',
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
  color: '#405440',
};
