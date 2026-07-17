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
      height: '100vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      background: '#f8fafc', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '32px 16px',
    }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <img src="/icon.svg" alt="NestBook" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1a2e14', letterSpacing: '-0.02em' }}>NestBook</span>
        </div>

        <div style={{ fontSize: '2.8rem', marginBottom: 20 }}>📬</div>

        <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: '#1a2e14', marginBottom: 12 }}>
          {t('checkEmail.heading')}
        </h1>

        <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.65, marginBottom: 32, maxWidth: 380, margin: '0 auto 32px' }}>
          {bodyText}
        </p>

        <button
          onClick={handleResend}
          disabled={resendState !== 'idle'}
          style={{
            display: 'inline-block',
            background: resendState === 'sent' ? '#f0fdf4' : '#1a4710',
            color: resendState === 'sent' ? '#166534' : 'white',
            border: resendState === 'sent' ? '1.5px solid #d9f0cc' : 'none',
            padding: '11px 24px', borderRadius: 8, fontSize: '0.9rem', fontWeight: 700,
            cursor: resendState === 'idle' ? 'pointer' : 'default',
            fontFamily: 'inherit', marginBottom: 24,
          }}
        >
          {resendState === 'sending' ? t('checkEmail.resending')
           : resendState === 'sent'    ? t('checkEmail.resent')
           : t('checkEmail.resend')}
        </button>

        <p style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.6 }}>
          {t('checkEmail.spam')}
        </p>

      </div>
    </div>
  );
}
