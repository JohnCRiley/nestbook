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
          // Write to localStorage synchronously first so the value is definitely
          // present before the hard redirect fires (React state updates are async).
          try {
            const stored = JSON.parse(localStorage.getItem('nb_user') || '{}');
            localStorage.setItem('nb_user', JSON.stringify({
              ...stored,
              email_verified: true,
              onboarding_completed: data.onboarding_completed ?? stored.onboarding_completed ?? true,
              plan:          data.plan          ?? stored.plan,
              trial_ends_at: data.trial_ends_at ?? null,
            }));
          } catch (_) {}

          updateUser({
            email_verified: true,
            onboarding_completed: data.onboarding_completed ?? true,
            plan:          data.plan          ?? undefined,
            trial_ends_at: data.trial_ends_at ?? null,
          });
          setStatus('success');
          const dest = data.onboarding_completed === false ? '/app/onboarding' : '/app';
          setTimeout(() => { window.location.href = dest; }, 2500);
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
    <div style={{
      position: 'relative', overflow: 'hidden',
      height: '100vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '32px 16px',
    }}>
      {/* Wave background: white -> wave -> cream gradient, same pattern/values
          as Register.jsx / CheckEmail.jsx (gradient on this shared wrapper,
          not a sub-child) */}
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

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', textAlign: 'center' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <img src="/icon.svg" alt="NestBook" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#405440', letterSpacing: '-0.02em' }}>NestBook</span>
        </div>

        {status === 'verifying' && (
          <>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: '#405440', marginBottom: 12 }}>
              Verifying your email…
            </h1>
            <p style={{ textAlign: 'center', color: '#405440', fontSize: '0.9rem' }}>
              Please wait a moment.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: '#405440', marginBottom: 12 }}>
              Email verified!
            </h1>
            <p style={{ textAlign: 'center', color: '#405440', fontSize: '0.9rem', marginBottom: 24 }}>
              Your email address has been verified. Taking you to your account…
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: '#405440', marginBottom: 12 }}>
              Verification failed
            </h1>
            <div style={{
              background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
              padding: '10px 14px', fontSize: '0.875rem', color: '#991b1b', marginBottom: 16,
            }}>
              {errorMsg}
            </div>
            <p style={{ textAlign: 'center', color: '#405440', fontSize: '0.875rem', marginTop: 16 }}>
              The link may have already been used or expired.{' '}
              <Link to="/dashboard" style={{ color: '#405440', fontWeight: 700 }}>Go to dashboard</Link>
            </p>
          </>
        )}

      </div>
    </div>
  );
}
