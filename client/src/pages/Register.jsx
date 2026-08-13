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
  color: '#405440',
};

const taglineStyle = {
  fontSize: '0.9rem',
  color: '#405440',
  fontStyle: 'italic',
  textAlign: 'center',
  lineHeight: 1.6,
  marginBottom: 28,
};

const subNoteStyle = {
  fontSize: '0.8rem',
  color: '#405440',
  fontStyle: 'italic',
  marginTop: 6,
  marginBottom: 20,
};

const badgesStyle = {
  fontSize: '0.78rem',
  color: '#405440',
  textAlign: 'center',
  marginTop: 14,
  marginBottom: 0,
};

export default function Register() {
  const t         = useT();
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [step,    setStep]    = useState(0);
  const [form,    setForm]    = useState({
    name: '', email: '', password: '', confirmPassword: '',
    propertyName: '', propertyType: '', discountCode: '',
  });
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

  function advanceStep() {
    setError('');
    if (!form.name.trim())                                           { setError(t('register.errorNameRequired')); return; }
    if (!form.email.trim() || !form.email.includes('@'))             { setError(t('register.errorEmailInvalid')); return; }
    if (form.password.length < 8)                                    { setError(t('register.passwordLength'));    return; }
    if (form.password !== form.confirmPassword)                      { setError(t('register.passwordMatch'));     return; }
    setStep(1);
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

  const logo = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
      <img src="/icon.svg" alt="NestBook" style={{ width: 40, height: 40, marginBottom: 8 }} />
      <span style={{ fontWeight: 700, fontSize: '1.35rem', color: '#405440', letterSpacing: '-0.4px' }}>NestBook</span>
    </div>
  );

  const alreadyHave = (
    <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.875rem', color: '#405440' }}>
      {t('register.alreadyAccount')}{' '}
      <Link to="/login" style={{ color: '#405440', fontWeight: 600 }}>{t('auth.signIn')}</Link>
    </p>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#ffffff', color: '#405440', display: 'flex', flexDirection: 'column' }}>
      <PublicNavbar />

      <div style={{ position: 'relative', overflow: 'hidden', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px 60px' }}>
        {/* Wave background: white -> wave -> cream gradient, same pattern/values
            as index.html's .hero-bg (gradient on this shared wrapper, not on a
            sub-child, which is what made earlier attempts elsewhere render flat) */}
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

        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 680 }}>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fca5a5',
              borderRadius: 8, padding: '10px 14px', marginBottom: 20,
              fontSize: '0.87rem', color: '#991b1b',
            }}>
              {error}
            </div>
          )}

          {/* ── Page 1: Account details ── */}
          {step === 0 && (
            <>
              {logo}
              <p style={taglineStyle}>{t('register.reassuranceIntro')}</p>

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
              <p style={subNoteStyle}>{t('register.emailVerifyNote')}</p>

              <div className="wiz-pw-row">
                <div>
                  <label style={labelStyle} htmlFor="reg-password">{t('register.password')}</label>
                  <PasswordInput
                    id="reg-password"
                    className="wizard-input"
                    value={form.password}
                    onChange={set('password')}
                    placeholder={t('register.passwordPlaceholder')}
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="reg-confirm">{t('auth.confirmPassword')}</label>
                  <PasswordInput
                    id="reg-confirm"
                    className="wizard-input"
                    value={form.confirmPassword}
                    onChange={set('confirmPassword')}
                    placeholder={t('register.passwordPlaceholder')}
                    onKeyDown={e => e.key === 'Enter' && advanceStep()}
                  />
                </div>
              </div>

              <button className="btn-wiz" onClick={advanceStep}>{t('register.continueBtn')}</button>
              <p style={badgesStyle}>{t('register.freePlanBadges')}</p>
              {alreadyHave}
            </>
          )}

          {/* ── Page 2: Property details ── */}
          {step === 1 && (
            <form onSubmit={handleSubmit}>
              {logo}
              <p style={taglineStyle}>{t('register.taglinePage2')}</p>

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
              <p style={subNoteStyle}>{t('register.propertyTypeNote')}</p>

              <p style={{ fontSize: '0.83rem', marginBottom: 20, color: '#405440' }}>
                {t('register.notSureYet')}{' '}
                <a href="/compare.html" style={{ color: '#405440', fontWeight: 600, textDecoration: 'underline' }}>
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
                style={{ textTransform: 'uppercase', marginBottom: 0 }}
              />

              <button type="submit" className="btn-wiz" disabled={loading}>
                {loading ? t('register.creating') : t('register.createFree')}
              </button>
              <p style={badgesStyle}>{t('register.freePlanBadges')}</p>

              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button type="button" className="btn-wiz-back" onClick={() => { setStep(0); setError(''); }}>
                  ← {t('onboard.backBtn')}
                </button>
              </div>
              {alreadyHave}
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
