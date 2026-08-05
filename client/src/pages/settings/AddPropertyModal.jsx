import { useState } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale } from '../../i18n/LocaleContext.jsx';
import { PROPERTY_GROUPS, WHOLE_PROPERTY_TYPES } from '../../utils/propertyTypes.js';
import RentalTypeStep from '../../components/RentalTypeStep.jsx';

const STEPS = ['name', 'type', 'rentalType', 'details'];

const labelStyle = {
  display: 'block',
  fontWeight: 600,
  fontSize: '0.82rem',
  marginBottom: 6,
  color: '#557a4a',
};

// Short Add Property flow for Multi accounts — name, type, rental type
// (+ Un sub-type when applicable), address & check-in/out, reusing the
// same step components as the onboarding wizard. On completion: create
// the property, then lock its rental_type immediately (matching every
// other property's protection).
export default function AddPropertyModal({ onClose, onSuccess, t }) {
  const { property: activeProperty } = useLocale();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    type: 'bnb',
    address: '',
    city: '',
    country: '',
    check_in_time: '15:00',
    check_out_time: '11:00',
    currency: activeProperty?.currency ?? 'EUR',
    locale: activeProperty?.locale ?? 'en',
    rental_type: 'rooms',
    un_sub_type: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const hasData = !!(form.name || form.address || form.city);

  function handleBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    if (hasData || saving) return;
    onClose();
  }

  function next() { setError(null); setStep(s => Math.min(s + 1, STEPS.length - 1)); }
  function back() { setError(null); setStep(s => Math.max(s - 1, 0)); }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const postRes = await apiFetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const created = await postRes.json();
      if (!postRes.ok) {
        setError(created.error || t('propAddError'));
        setSaving(false);
        return;
      }

      // Lock rental_type immediately — matches the protection every other
      // property already has once it's past initial setup. PUT replaces the
      // full row, so re-send the same form (already reflected in `created`).
      const lockRes = await apiFetch(`/api/properties/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, lock_rental_type: true }),
      });
      const locked = await lockRes.json();
      if (!lockRes.ok) {
        // Property exists but the lock call failed — surface it, but still
        // hand the created property back so it shows up in the list.
        setError(locked.error || t('propAddError'));
        onSuccess(created);
        setSaving(false);
        return;
      }

      onSuccess(locked);
    } catch {
      setError(t('networkError'));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal" style={{ maxWidth: 640 }} role="dialog" aria-modal="true" aria-label={t('addAnotherProperty')}>
        <div className="modal-header">
          <h3>{t('addAnotherProperty')}</h3>
          <button className="modal-close-btn" onClick={onClose} disabled={saving}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 24 }}>
          {error && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.82rem', color: '#991b1b' }}>
              {error}
            </div>
          )}

          {step === 0 && (
            <>
              <div className="wiz-step-label">{t('onboard.wizCheckName')}</div>
              <input
                className="wizard-input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </>
          )}

          {step === 1 && (
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
            </>
          )}

          {step === 2 && (
            <>
              <div className="wiz-step-label">{t('onboard.wizRentalType')}</div>
              <RentalTypeStep form={form} setForm={setForm} t={t} />
            </>
          )}

          {step === 3 && (
            <>
              <div className="wiz-step-label">{t('onboard.wizAddress')}</div>
              <input
                className="wizard-input"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="47 Route de Gordes"
                style={{ marginBottom: 12 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
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
            </>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn-secondary" onClick={step === 0 ? onClose : back} disabled={saving}>
            {step === 0 ? t('cancel') : `← ${t('onboard.backBtn')}`}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              className="btn-primary"
              onClick={next}
              disabled={saving || (step === 0 && !form.name.trim())}
            >
              {t('onboard.saveAndContinue')}
            </button>
          ) : (
            <button className="btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? t('saving') : t('saveProperty')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
