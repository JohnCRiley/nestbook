import { useState } from 'react';
import { usePlan } from '../hooks/usePlan.js';
import { apiFetch } from '../utils/apiFetch.js';
import { useT } from '../i18n/LocaleContext.jsx';

const PLAN_RANK = { free: 0, pro: 1, multi: 2 };

export default function Pricing() {
  const currentPlan = usePlan();
  const t           = useT();
  const [loading, setLoading] = useState(null);
  const [error,   setError]   = useState('');

  const PLANS = [
    {
      key:      'free',
      name:     t('planStarterName'),
      price:    'Free',
      period:   t('planForever'),
      desc:     t('planStarterDesc'),
      features: t('planStarterFeatures'),
      cta:      t('planStarterCta'),
    },
    {
      key:      'pro',
      name:     t('planProName'),
      price:    '£19',
      priceEur: '€22',
      period:   t('planPerMonth'),
      desc:     t('planProDesc'),
      popular:  true,
      features: t('planProFeatures'),
      cta:      t('planProCta'),
    },
    {
      key:      'multi',
      name:     t('planMultiName'),
      price:    '£39',
      priceEur: '€45',
      period:   t('planPerMonth'),
      desc:     t('planMultiDesc'),
      features: t('planMultiFeatures'),
      cta:      t('planMultiCta'),
    },
  ];

  function getPlanStatus(tilePlan) {
    if (tilePlan === currentPlan) return 'current';
    if ((PLAN_RANK[tilePlan] ?? 0) < (PLAN_RANK[currentPlan] ?? 0)) return 'downgrade';
    return 'upgrade';
  }

  async function handleUpgrade(planKey) {
    setError('');
    setLoading(planKey);

    try {
      const res  = await apiFetch('/api/stripe/create-checkout-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan: planKey }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('checkoutError'));
        return;
      }

      window.location.href = data.url;
    } catch {
      setError(t('serverConnectError'));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('pricing')}</h1>
          <p className="page-subtitle">{t('pricingSubtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="pricing-error">{error}</div>
      )}

      <div className="pricing-grid">
        {PLANS.map((plan) => {
          const status    = getPlanStatus(plan.key);
          const isCurrent = status === 'current';

          return (
            <div
              key={plan.key}
              className={`pricing-card${plan.popular ? ' pricing-card-popular' : ''}${isCurrent ? ' pricing-card-current' : ''}`}
            >
              {plan.popular && !isCurrent && <div className="pricing-badge">{t('planMostPopular')}</div>}
              {isCurrent                   && <div className="pricing-badge pricing-badge-current">{t('planCurrentBadge')}</div>}

              <div className="pricing-name">{plan.name}</div>
              <div className="pricing-price">
                {plan.price}
                {plan.priceEur && <span className="pricing-eur"> / {plan.priceEur}</span>}
                <span className="pricing-period">/{plan.period}</span>
              </div>
              {plan.key === 'pro' && (
                <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: 4 }}>{t('planProAddonLine')}</div>
              )}
              <p className="pricing-desc">{plan.desc}</p>

              <ul className="pricing-features">
                {plan.features.map((f) => (
                  <li key={f} className="pricing-feature">
                    <span className="pricing-check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {status === 'current' && (
                <button className="pricing-btn" disabled>
                  {t('planCtaCurrent')}
                </button>
              )}
              {status === 'upgrade' && (
                <button
                  className={`pricing-btn${plan.popular ? ' pricing-btn-primary' : ''}`}
                  onClick={() => handleUpgrade(plan.key)}
                  disabled={loading !== null}
                >
                  {loading === plan.key ? t('planCtaRedirecting') : plan.cta}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="pricing-adaptive-note">{t('planAdaptivePricingNote')}</p>
      <p style={{ textAlign: 'center', marginTop: 20 }}>
        <a
          href="/compare.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-muted)', textDecoration: 'underline' }}
        >
          {t('planCompareLink')}
        </a>
      </p>
    </div>
  );
}
