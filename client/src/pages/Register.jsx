import { useState } from 'react';
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

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!form.propertyType) {
      setError('Please select a property type.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed. Please try again.');
        return;
      }

      login(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Could not connect to server. Is it running?');
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
        <p className="auth-tagline">Property Management</p>

        <h1 className="auth-heading">Create your account</h1>
        <p className="auth-subheading">Free forever on the Starter plan. No card needed.</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">

          <div className="auth-field-row">
            <div className="auth-field">
              <label className="auth-label" htmlFor="name">Full name</label>
              <input id="name" type="text" className="auth-input" value={form.name}
                onChange={set('name')} placeholder="Jane Smith" required autoFocus />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="reg-email">{t('auth.emailAddress')}</label>
              <input id="reg-email" type="email" className="auth-input" value={form.email}
                onChange={set('email')} placeholder="you@example.com" required />
            </div>
          </div>

          <div className="auth-field-row">
            <div className="auth-field">
              <label className="auth-label" htmlFor="reg-password">Password</label>
              <PasswordInput id="reg-password" className="auth-input" value={form.password}
                onChange={set('password')} placeholder="At least 8 characters" required />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="confirm">{t('auth.confirmPassword')}</label>
              <PasswordInput id="confirm" className="auth-input" value={form.confirmPassword}
                onChange={set('confirmPassword')} placeholder="••••••••" required />
            </div>
          </div>

          <div className="auth-field-row">
            <div className="auth-field">
              <label className="auth-label" htmlFor="propName">Property name</label>
              <input id="propName" type="text" className="auth-input" value={form.propertyName}
                onChange={set('propertyName')} placeholder="e.g. The Old Mill B&B" required />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="propType">Property type</label>
              <select id="propType" className="auth-input auth-select" value={form.propertyType}
                onChange={set('propertyType')} required>
                <option value="" disabled>Select a type…</option>
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
              Discount code <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
            </label>
            <input id="discountCode" type="text" className="auth-input" value={form.discountCode}
              onChange={set('discountCode')} placeholder="e.g. BETA50"
              style={{ textTransform: 'uppercase' }} />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Creating account…' : 'Create free account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/login">{t('auth.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
