import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function VerifyEmail() {
  const [searchParams]   = useSearchParams();
  const { updateUser }   = useAuth();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setErrorMsg('No verification token found in this link.');
      setStatus('error');
      return;
    }

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          // Always set all fields — including trial_ends_at: null for permanent Pro
          // so stale values don't linger in localStorage.
          updateUser({
            email_verified: true,
            plan:           data.plan          ?? undefined,
            trial_ends_at:  data.trial_ends_at ?? null,
          });
          setStatus('success');
          // Full page reload so dashboard picks up fresh localStorage state.
          setTimeout(() => { window.location.href = '/app'; }, 2500);
        } else {
          setErrorMsg(data.error || 'Verification failed.');
          setStatus('error');
        }
      })
      .catch(() => {
        setErrorMsg('Could not connect to the server. Please try again.');
        setStatus('error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-logo">
          <img src="/icon.svg" alt="NestBook" className="auth-leaf-icon" />
          <span className="auth-logo-name">NestBook</span>
        </div>
        <p className="auth-tagline">Property Management</p>

        {status === 'verifying' && (
          <>
            <h1 className="auth-heading">Verifying your email…</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Please wait a moment.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 className="auth-heading" style={{ color: 'var(--accent)' }}>Email verified!</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 24 }}>
              Your email address has been verified. Taking you to your dashboard…
            </p>
            <a href="/app" className="auth-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Go to dashboard →
            </a>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="auth-heading">Verification failed</h1>
            <div className="auth-error">{errorMsg}</div>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 16 }}>
              The link may have already been used or expired.{' '}
              <Link to="/dashboard">Go to dashboard</Link>
            </p>
          </>
        )}

      </div>
    </div>
  );
}
