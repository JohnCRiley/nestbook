import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../utils/apiFetch.js';

export default function PaymentSuccess() {
  const [plan, setPlan] = useState('');

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id');

    if (sessionId) {
      // Sync the session directly — updates the DB without needing a webhook.
      // This works in local dev and acts as a webhook fallback in production.
      apiFetch('/api/stripe/sync-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId }),
      })
        .then((r) => r.json())
        .then((data) => setPlan(data.plan ?? ''))
        .catch(() => {});
    } else {
      // No session_id in URL — just read whatever plan is current.
      apiFetch('/api/stripe/subscription')
        .then((r) => r.json())
        .then((data) => setPlan(data.plan ?? ''))
        .catch(() => {});
    }
  }, []);

  const planLabel = { pro: 'Pro', multi: 'Multi-property' }[plan] ?? 'new';

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
        <h1 className="auth-heading">You're all set!</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, marginBottom: 24 }}>
          Welcome to the <strong>{planLabel} plan</strong>. Your new features are active now.
        </p>
        <Link to="/dashboard" className="auth-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
          Go to dashboard →
        </Link>
      </div>
    </div>
  );
}
