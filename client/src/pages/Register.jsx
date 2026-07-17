import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../i18n/LocaleContext.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

const PROPERTY_GROUPS = [
  { group: 'Hospitality', options: [
    { value: 'bnb',         label: 'B&B (Bed & Breakfast)' },
    { value: 'guesthouse',  label: 'Guest House' },
    { value: 'inn',         label: 'Inn / Pub with rooms' },
    { value: 'hotel',       label: 'Small Hotel' },
    { value: 'hostel',      label: 'Hostel' },
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
    { value: 'ryokan',      label: 'Ryokan (Japan)' },
    { value: 'minsu',       label: '民宿 Minsu (China/Taiwan)' },
    { value: 'homestay',    label: 'Homestay' },
    { value: 'resort_villa', label: 'Resort Villa' },
  ]},
  { group: 'Other', options: [{ value: 'other', label: 'Other' }] },
];

const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es', 'nl'];

export default function Register() {
  const t          = useT();
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    propertyName: '', propertyType: '', discountCode: '',
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Capture ?lang= from URL (e.g. when arriving via outreach email link)
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError(t('register.passwordMatch'));
      return;
    }
    if (form.password.length < 8) {
      setError(t('register.passwordLength'));
      return;
    }
    if (!form.propertyType) {
      setError(t('register.selectType'));
      return;
    }

    // Detect language: manual choice in localStorage → browser language → English
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, language }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('register.failed'));
        return;
      }

      login(data.token, data.user);
      navigate('/check-email', { replace: true });
    } catch {
      setError(t('register.noServer'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">

        {/* Logo */}
        <div className="auth-logo">
          <img src="/icon.svg" alt="NestBook" className="auth-leaf-icon" />
          <span className="auth-logo-name">NestBook</span>
        </div>
        <p className="auth-tagline">{t('tagline')}</p>

        <h1 className="auth-heading">{t('auth.createAccount')}</h1>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">

          <div className="auth-field-row">
            <div className="auth-field">
              <label className="auth-label" htmlFor="name">{t('register.fullName')}</label>
              <input id="name" type="text" className="auth-input" value={form.name}
                onChange={set('name')} placeholder={t('register.namePlaceholder')} required autoFocus />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="reg-email">{t('auth.emailAddress')}</label>
              <input id="reg-email" type="email" className="auth-input" value={form.email}
                onChange={set('email')} placeholder={t('register.emailPlaceholder')} required />
            </div>
          </div>

          <div className="auth-field-row">
            <div className="auth-field">
              <label className="auth-label" htmlFor="reg-password">{t('register.password')}</label>
              <PasswordInput id="reg-password" className="auth-input" value={form.password}
                onChange={set('password')} placeholder={t('register.passwordPlaceholder')} required />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="confirm">{t('auth.confirmPassword')}</label>
              <PasswordInput id="confirm" className="auth-input" value={form.confirmPassword}
                onChange={set('confirmPassword')} placeholder={t('register.passwordPlaceholder')} required />
            </div>
          </div>

          <div className="auth-field-row">
            <div className="auth-field">
              <label className="auth-label" htmlFor="propName">{t('register.propertyName')}</label>
              <input id="propName" type="text" className="auth-input" value={form.propertyName}
                onChange={set('propertyName')} placeholder={t('register.propertyPlaceholder')} required />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="propType">{t('register.propertyType')}</label>
              <select id="propType" className="auth-input auth-select" value={form.propertyType}
                onChange={set('propertyType')} required>
                <option value="" disabled>{t('register.typePlaceholder')}</option>
                {PROPERTY_GROUPS.map((grp) => (
                  <optgroup key={grp.group} label={grp.group}>
                    {grp.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="discountCode">
              {t('register.promoCode')}
            </label>
            <input id="discountCode" type="text" className="auth-input" value={form.discountCode}
              onChange={set('discountCode')} placeholder={t('register.codePlaceholder')}
              style={{ textTransform: 'uppercase' }} />
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>
              {t('register.promoHint')}
            </p>
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? t('register.creating') : t('register.createFree')}
          </button>
        </form>

        <p className="auth-switch">
          {t('register.alreadyAccount')}{' '}
          <Link to="/login">{t('auth.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
