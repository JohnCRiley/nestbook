import { Link } from 'react-router-dom';

export default function PaymentCancel() {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>↩</div>
        <h1 className="auth-heading">Payment cancelled</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, marginBottom: 24 }}>
          No charge was made. You can upgrade any time from the Pricing page.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to="/pricing"   className="auth-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
            View pricing
          </Link>
          <Link to="/dashboard" style={{ display: 'inline-block', padding: '12px 20px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
