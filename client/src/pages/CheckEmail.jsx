import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useT } from '../i18n/LocaleContext.jsx';
import { apiFetch } from '../utils/apiFetch.js';

export default function CheckEmail() {
  const { user } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [resendState, setResendState] = useState('idle'); // 'idle' | 'sending' | 'sent'

  // If already verified, skip ahead
  useEffect(() => {
    if (user?.email_verified) {
      navigate(user.onboarding_completed ? '/dashboard' : '/onboarding', { replace: true });
    }
  }, [user?.email_verified]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResend() {
    if (resendState !== 'idle') return;
    setResendState('sending');
    try {
      await apiFetch('/api/auth/resend-verification', { method: 'POST' });
      setResendState('sent');
    } catch {
      setResendState('idle');
    }
  }

  const email = user?.email || '';
  const bodyText = t('checkEmail.body').replace('{email}', email);

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      height: '100vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '32px 16px',
    }}>
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

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', textAlign: 'center' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <img src="/icon.svg" alt="NestBook" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#405440', letterSpacing: '-0.02em' }}>NestBook</span>
        </div>

        <div style={{ fontSize: '2.8rem', marginBottom: 20 }}>📬</div>

        <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: '#405440', marginBottom: 12 }}>
          {t('checkEmail.heading')}
        </h1>

        <p style={{ color: '#405440', fontSize: '0.95rem', lineHeight: 1.65, marginBottom: 32, maxWidth: 380, margin: '0 auto 32px' }}>
          {bodyText}
        </p>

        <button
          onClick={handleResend}
          disabled={resendState !== 'idle'}
          style={{
            display: 'inline-block',
            background: resendState === 'sent' ? '#f0ede8' : '#405440',
            color: resendState === 'sent' ? '#405440' : 'white',
            border: resendState === 'sent' ? '1.5px solid #405440' : 'none',
            padding: '11px 24px', borderRadius: 8, fontSize: '0.9rem', fontWeight: 700,
            cursor: resendState === 'idle' ? 'pointer' : 'default',
            fontFamily: 'inherit', marginBottom: 24,
          }}
        >
          {resendState === 'sending' ? t('checkEmail.resending')
           : resendState === 'sent'    ? t('checkEmail.resent')
           : t('checkEmail.resend')}
        </button>

        <p style={{ color: '#405440', fontSize: '0.8rem', lineHeight: 1.6 }}>
          {t('checkEmail.spam')}
        </p>

      </div>
    </div>
  );
}
