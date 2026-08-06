import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../i18n/LocaleContext.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import PublicNavbar from '../components/PublicNavbar.jsx';
import { PROPERTY_GROUPS } from '../utils/propertyTypes.js';

const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es', 'nl'];

const labelStyle = {
  display: 'block',
  fontWeight: 600,
  fontSize: '0.82rem',
  marginBottom: 6,
  color: '#557a4a',
};

export default function Register() {
  const t         = useT();
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    propertyName: '', propertyType: '', discountCode: '',
  });
  const [step,    setStep]    = useState(0);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const langParam = params.get('lang');
    if (langParam && SUPPORTED_LANGS.includes(langParam)) {
      try { localStorage.setItem('nb-lang', langParam); } catch (_) {}
    }
  }, []);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function goBack() {
    setStep(s => s - 1);
    setError('');
  }

  function advanceStep() {
    setError('');
    if (step === 0) {
      if (!form.name.trim()) { setError(t('register.errorNameRequired')); return; }
      if (!form.email.trim() || !form.email.includes('@')) { setError(t('register.errorEmailInvalid')); return; }
      setStep(1);
    } else if (step === 1) {
      if (form.password.length < 8) { setError(t('register.passwordLength')); return; }
      if (form.password !== form.confirmPassword) { setError(t('register.passwordMatch')); return; }
      setStep(2);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.propertyType) { setError(t('register.selectType')); return; }

    const SUPPORTED = ['en', 'fr', 'de', 'es', 'nl'];
    let language = 'en';
    try {
      const stored = localStorage.getItem('nb-lang');
      if (stored && SUPPORTED.includes(stored)) {
        language = stored;
      } else {
        const browserLang = (navigator.languages?.[0] || navigator.language || 'en').split('-')[0].toLowerCase();
        if (SUPPORTED.includes(browserLang)) language = browserLang;
      }
    } catch (_) {}

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, language }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('register.failed')); return; }
      login(data.token, data.user);
      navigate('/check-email', { replace: true });
    } catch {
      setError(t('register.noServer'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#f3f7f2', color: '#1a2e14', display: 'flex', flexDirection: 'column' }}>
      <PublicNavbar />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px 60px' }}>
        <div style={{ width: '100%', maxWidth: 520 }}>

          {/* Progress dots */}
          <div className="wizard-steps" style={{ justifyContent: 'center', marginBottom: 20 }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`wizard-step-dot${i === step ? ' current' : ''}${i < step ? ' completed' : ''}`}
                style={{ cursor: i < step ? 'pointer' : 'default' }}
                onClick={() => { if (i < step) { setStep(i); setError(''); } }}
              />
            ))}
          </div>

          {/* Card */}
          <div style={{
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 4px 24px rgba(26,71,16,0.10)',
            border: '1px solid #e0ecdb',
            padding: '36px 40px 32px',
          }}>

            {/* Logo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
              <img src="/icon.svg" alt="NestBook" style={{ width: 40, height: 40, marginBottom: 8 }} />
              <span style={{ fontWeight: 700, fontSize: '1.35rem', color: '#1a4710', letterSpacing: '-0.4px' }}>NestBook</span>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fca5a5',
                borderRadius: 8, padding: '10px 14px', marginBottom: 20,
                fontSize: '0.87rem', color: '#991b1b',
              }}>
                {error}
              </div>
            )}

            {/* ── Step 0: Name + Email ── */}
            {step === 0 && (
              <>
                <p style={{ fontSize: '0.88rem', color: '#557a4a', lineHeight: 1.7, marginBottom: 24, textAlign: 'center' }}>
                  {t('register.reassuranceIntro')}
                </p>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a2e14', marginBottom: 24, textAlign: 'center', letterSpacing: '-0.3px' }}>
                  {t('auth.createAccount')}
                </h2>

                <label style={labelStyle} htmlFor="reg-name">{t('register.fullName')}</label>
                <input
                  id="reg-name"
                  className="wizard-input"
                  value={form.name}
                  onChange={set('name')}
                  placeholder={t('register.namePlaceholder')}
                  style={{ marginBottom: 16 }}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && advanceStep()}
                />

                <label style={labelStyle} htmlFor="reg-email">{t('auth.emailAddress')}</label>
                <input
                  id="reg-email"
                  type="email"
                  className="wizard-input"
                  value={form.email}
                  onChange={set('email')}
                  placeholder={t('register.emailPlaceholder')}
                  onKeyDown={e => e.key === 'Enter' && advanceStep()}
                />

                <button className="btn-wiz" onClick={advanceStep}>{t('register.continueBtn')}</button>
              </>
            )}

            {/* ── Step 1: Password ── */}
            {step === 1 && (
              <>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a2e14', marginBottom: 24, textAlign: 'center', letterSpacing: '-0.3px' }}>
                  {t('register.step1Heading')}
                </h2>

                <label style={labelStyle} htmlFor="reg-password">{t('register.password')}</label>
                <div style={{ marginBottom: 16 }}>
                  <PasswordInput
                    id="reg-password"
                    className="wizard-input"
                    value={form.password}
                    onChange={set('password')}
                    placeholder={t('register.passwordPlaceholder')}
                    autoFocus
                  />
                </div>

                <label style={labelStyle} htmlFor="reg-confirm">{t('auth.confirmPassword')}</label>
                <PasswordInput
                  id="reg-confirm"
                  className="wizard-input"
                  value={form.confirmPassword}
                  onChange={set('confirmPassword')}
                  placeholder={t('register.passwordPlaceholder')}
                  onKeyDown={e => e.key === 'Enter' && advanceStep()}
                />

                <button className="btn-wiz" onClick={advanceStep}>{t('register.continueBtn')}</button>
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button type="button" className="btn-wiz-back" onClick={goBack}>← {t('onboard.backBtn')}</button>
                </div>
              </>
            )}

            {/* ── Step 2: Property ── */}
            {step === 2 && (
              <form onSubmit={handleSubmit}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a2e14', marginBottom: 24, textAlign: 'center', letterSpacing: '-0.3px' }}>
                  {t('register.step2Heading')}
                </h2>

                <label style={labelStyle} htmlFor="propName">{t('register.propertyName')}</label>
                <input
                  id="propName"
                  className="wizard-input"
                  value={form.propertyName}
                  onChange={set('propertyName')}
                  placeholder={t('register.propertyPlaceholder')}
                  style={{ marginBottom: 16 }}
                  autoFocus
                  required
                />

                <label style={labelStyle} htmlFor="propType">{t('register.propertyType')}</label>
                <select
                  id="propType"
                  className="wizard-input wizard-select"
                  value={form.propertyType}
                  onChange={set('propertyType')}
                  required
                >
                  <option value="" disabled>{t('register.typePlaceholder')}</option>
                  {PROPERTY_GROUPS.map((grp) => (
                    <optgroup key={grp.group} label={grp.group}>
                      {grp.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <p style={{ fontSize: '0.83rem', marginTop: 8, marginBottom: 20, color: '#557a4a' }}>
                  {t('register.notSureYet')}{' '}
                  <a href="/compare.html" style={{ color: '#2f771b', fontWeight: 600, textDecoration: 'underline' }}>
                    {t('register.seeWhatsIncluded')}
                  </a>
                </p>

                <label style={labelStyle} htmlFor="discountCode">{t('register.promoCode')}</label>
                <input
                  id="discountCode"
                  className="wizard-input"
                  value={form.discountCode}
                  onChange={set('discountCode')}
                  placeholder={t('register.codePlaceholder')}
                  style={{ textTransform: 'uppercase' }}
                />

                <p style={{ fontSize: '0.85rem', color: '#2f771b', fontWeight: 600, textAlign: 'center', marginTop: 20, marginBottom: 0 }}>
                  {t('register.freePlanForever')}
                </p>

                <button type="submit" className="btn-wiz" disabled={loading}>
                  {loading ? t('register.creating') : t('register.createFree')}
                </button>
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button type="button" className="btn-wiz-back" onClick={goBack}>← {t('onboard.backBtn')}</button>
                </div>
              </form>
            )}

            <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.875rem', color: '#557a4a' }}>
              {t('register.alreadyAccount')}{' '}
              <Link to="/login" style={{ color: '#2f771b', fontWeight: 600 }}>{t('auth.signIn')}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
