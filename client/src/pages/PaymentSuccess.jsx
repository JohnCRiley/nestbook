import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../utils/apiFetch.js';
import { useT } from '../i18n/LocaleContext.jsx';
import { CircleCheckIcon } from '../components/TablerIcons.jsx';

export default function PaymentSuccess() {
  const t = useT();
  const [plan, setPlan] = useState('');
  // The payment itself already succeeded (Stripe redirected here) — this
  // only tracks whether *syncing* that result into our own DB worked. A
  // failure here previously vanished silently, leaving the guest with no
  // way to know their plan might not be updated yet.
  const [syncError, setSyncError] = useState(null);

  function syncPlan() {
    setSyncError(null);
    const sessionId = new URLSearchParams(window.location.search).get('session_id');

    if (sessionId) {
      // Sync the session directly — updates the DB without needing a webhook.
      // This works in local dev and acts as a webhook fallback in production.
      apiFetch('/api/stripe/sync-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId }),
      })
        .then((r) => (r.ok ? r.json() : r.json().then((body) => Promise.reject(new Error(body?.error || `Server returned ${r.status}`)))))
        .then((data) => setPlan(data.plan ?? ''))
        .catch((err) => setSyncError(err.message || 'Failed to sync your plan.'));
    } else {
      // No session_id in URL — just read whatever plan is current.
      apiFetch('/api/stripe/subscription')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Server returned ${r.status}`))))
        .then((data) => setPlan(data.plan ?? ''))
        .catch((err) => setSyncError(err.message || 'Failed to load your plan.'));
    }
  }

  useEffect(() => {
    syncPlan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const planLabel = { pro: t('planProName'), multi: t('planMultiName') }[plan] ?? plan;

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 16, color: 'var(--accent)' }}><CircleCheckIcon size={48} /></div>
        <h1 className="auth-heading">{t('paySuccessTitle')}</h1>
        {syncError ? (
          <>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8, marginBottom: 12 }}>
              Your payment was successful, but we couldn't confirm your plan update just now.
            </p>
            <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 24 }}>
              {syncError}
            </p>
            <button onClick={syncPlan} className="btn-primary" style={{ marginBottom: 12 }}>
              Try again
            </button>
          </>
        ) : (
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, marginBottom: 24 }}>
            {t('paySuccessMsg')(planLabel)}
          </p>
        )}
        <Link to="/dashboard" className="auth-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
          {t('paySuccessBtn')}
        </Link>
      </div>
    </div>
  );
}
