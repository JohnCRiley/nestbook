import { Link } from 'react-router-dom';
import { useT } from '../i18n/LocaleContext.jsx';

export default function PaymentCancel() {
  const t = useT();
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>↩</div>
        <h1 className="auth-heading">{t('payCancelTitle')}</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, marginBottom: 24 }}>
          {t('payCancelMsg')}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to="/pricing"   className="auth-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
            {t('payCancelBtnPricing')}
          </Link>
          <Link to="/dashboard" style={{ display: 'inline-block', padding: '12px 20px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {t('payCancelBtnBack')}
          </Link>
        </div>
      </div>
    </div>
  );
}
