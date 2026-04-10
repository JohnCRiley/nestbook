import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

const PROPERTY_TYPES = [
  { value: '',            label: 'Select a type…' },
  { value: 'bnb',         label: 'Bed & Breakfast' },
  { value: 'gite',        label: 'Gîte / Holiday Cottage' },
  { value: 'guesthouse',  label: 'Guest House' },
  { value: 'hotel',       label: 'Hotel' },
  { value: 'other',       label: 'Other' },
];

export default function Register() {
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
              <label className="auth-label" htmlFor="reg-email">Email address</label>
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
              <label className="auth-label" htmlFor="confirm">Confirm password</label>
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
                {PROPERTY_TYPES.map(({ value, label }) => (
                  <option key={value} value={value} disabled={value === ''}>{label}</option>
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
          <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
