import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan.js';
import { apiFetch } from '../utils/apiFetch.js';

const PLANS = [
  {
    key:    'free',
    name:   'Starter',
    price:  'Free',
    period: 'forever',
    desc:   'Everything you need to get started.',
    features: [
      '1 property',
      'Up to 10 rooms',
      'Booking calendar',
      'Guest records',
      'Basic reporting',
      'Email support',
    ],
    cta: 'Your current plan',
  },
  {
    key:      'pro',
    name:     'Pro',
    price:    '£19',
    period:   'per month',
    desc:     'For growing properties that need more.',
    popular:  true,
    features: [
      '1 property',
      'Unlimited rooms',
      'Everything in Starter',
      'Booking widget for your website',
      'Staff accounts',
      'Email confirmations',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
  },
  {
    key:    'multi',
    name:   'Multi-property',
    price:  '£39',
    period: 'per month',
    desc:   'For owners managing several properties.',
    features: [
      'Up to 5 properties',
      'Unlimited rooms',
      'Everything in Pro',
      'Multi-property dashboard',
      'Dedicated onboarding call',
      'Priority phone support',
    ],
    cta: 'Upgrade to Multi',
  },
];

export default function Pricing() {
  const currentPlan = usePlan();
  const navigate    = useNavigate();
  const [loading, setLoading] = useState(null); // which plan button is loading
  const [error,   setError]   = useState('');

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
        setError(data.error || 'Could not start checkout. Please try again.');
        return;
      }

      // Redirect to Stripe's hosted checkout page
      window.location.href = data.url;
    } catch {
      setError('Could not connect to server. Is it running?');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pricing</h1>
          <p className="page-subtitle">Simple, transparent plans. No hidden fees.</p>
        </div>
      </div>

      {error && (
        <div className="pricing-error">{error}</div>
      )}

      <div className="pricing-grid">
        {PLANS.map((plan) => {
          const isCurrent  = currentPlan === plan.key;
          const isUpgrade  = plan.key !== 'free' && !isCurrent;
          const isDisabled = isCurrent || loading !== null;

          return (
            <div
              key={plan.key}
              className={`pricing-card${plan.popular ? ' pricing-card-popular' : ''}${isCurrent ? ' pricing-card-current' : ''}`}
            >
              {plan.popular && <div className="pricing-badge">Most popular</div>}
              {isCurrent    && <div className="pricing-badge pricing-badge-current">Current plan</div>}

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
                {loading === plan.key ? 'Redirecting…' : isCurrent ? 'Current plan' : plan.cta}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
