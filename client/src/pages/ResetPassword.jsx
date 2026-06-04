import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useT } from '../i18n/LocaleContext.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function ResetPassword() {
  const t                      = useT();
  const [searchParams]         = useSearchParams();
  const navigate               = useNavigate();
  const token                  = searchParams.get('token') ?? '';

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <img src="/icon.svg" alt="NestBook" className="auth-leaf-icon" />
            <span className="auth-logo-name">NestBook</span>
          </div>
          <p className="auth-tagline">Property Management</p>
          <h1 className="auth-heading">Invalid link</h1>
          <div className="auth-error">This reset link is missing a token. Please request a new one.</div>
          <p style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/forgot-password">Request a new reset link</Link>
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        navigate('/login', { state: { resetSuccess: true } });
      } else {
        setError(data.error || 'This link has expired. Please request a new one.');
      }
    } catch {
      setError('Could not connect to server. Is it running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-logo">
          <img src="/icon.svg" alt="NestBook" className="auth-leaf-icon" />
          <span className="auth-logo-name">NestBook</span>
        </div>
        <p className="auth-tagline">Property Management</p>

        <h1 className="auth-heading">Set a new password</h1>

        {error && (
          <div className="auth-error">
            {error}{' '}
            {error.includes('expired') && (
              <Link to="/forgot-password" style={{ color: 'inherit', fontWeight: 700 }}>
                Request a new link
              </Link>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="new-password">{t('auth.newPassword')}</label>
            <PasswordInput
              id="new-password"
              className="auth-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="confirm-password">{t('auth.confirmPassword')}</label>
            <PasswordInput
              id="confirm-password"
              className="auth-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your new password"
              required
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Saving…' : 'Set new password'}
          </button>
        </form>

      </div>
    </div>
  );
}
