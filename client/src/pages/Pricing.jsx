import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan.js';
import { apiFetch } from '../utils/apiFetch.js';
import { useT } from '../i18n/LocaleContext.jsx';

export default function Pricing() {
  const currentPlan = usePlan();
  const navigate    = useNavigate();
  const t           = useT();
  const [loading, setLoading] = useState(null);
  const [error,   setError]   = useState('');

  // Build plan data from translated strings
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
      price:    '€19',
      period:   t('planPerMonth'),
      desc:     t('planProDesc'),
      popular:  true,
      features: t('planProFeatures'),
      cta:      t('planProCta'),
    },
    {
      key:      'multi',
      name:     t('planMultiName'),
      price:    '€39',
      period:   t('planPerMonth'),
      desc:     t('planMultiDesc'),
      features: t('planMultiFeatures'),
      cta:      t('planMultiCta'),
    },
  ];

  async function handleUpgrade(planKey) {
    if (planKey === 'free') return;
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
          const isCurrent  = currentPlan === plan.key;
          const isDisabled = isCurrent || loading !== null;

          return (
            <div
              key={plan.key}
              className={`pricing-card${plan.popular ? ' pricing-card-popular' : ''}${isCurrent ? ' pricing-card-current' : ''}`}
            >
              {plan.popular && <div className="pricing-badge">{t('planMostPopular')}</div>}
              {isCurrent    && <div className="pricing-badge pricing-badge-current">{t('planCurrentBadge')}</div>}

              <div className="pricing-name">{plan.name}</div>
              <div className="pricing-price">
                {plan.price}
                <span className="pricing-period">/{plan.period}</span>
              </div>
              <p className="pricing-desc">{plan.desc}</p>

              <ul className="pricing-features">
                {plan.features.map((f) => (
                  <li key={f} className="pricing-feature">
                    <span className="pricing-check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                className={`pricing-btn${plan.popular && !isCurrent ? ' pricing-btn-primary' : ''}`}
                onClick={() => handleUpgrade(plan.key)}
                disabled={isDisabled}
              >
                {loading === plan.key ? t('planCtaRedirecting') : isCurrent ? t('planCtaCurrent') : plan.cta}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
