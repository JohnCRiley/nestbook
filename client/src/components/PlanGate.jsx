import { useState } from 'react';
import { usePlan } from '../hooks/usePlan.js';
import { useT } from '../i18n/LocaleContext.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import UpgradeModal from './UpgradeModal.jsx';

const RANK = { free: 0, pro: 1, multi: 2 };

export default function PlanGate({ requiredPlan = 'pro', children }) {
  const plan = usePlan();
  const t    = useT();
  const [showModal, setShowModal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  if (RANK[plan] >= RANK[requiredPlan]) return children;

  const isMulti  = requiredPlan === 'multi';
  const badgeKey = isMulti ? 'planGateMultiFeature' : 'planGateProFeature';

  async function handleUpgradeNow() {
    setLoadingCheckout(true);
    try {
      const res  = await apiFetch('/api/stripe/create-checkout-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan: requiredPlan }),
      });
      const data = await res.json();
      if (res.ok && data.url) { window.location.href = data.url; return; }
    } catch {}
    setLoadingCheckout(false);
  }

  return (
    <>
      <div className="plan-gate">
        <div className="plan-gate-lock">🔒</div>
        <h3 className="plan-gate-title">{t(badgeKey)}</h3>

        <div className="plan-gate-actions">
          <button
            className="plan-gate-btn-secondary"
            onClick={() => setShowModal(true)}
          >
            {t('planGateWhatIncluded')}
          </button>
          <button
            className="plan-gate-btn-primary"
            onClick={handleUpgradeNow}
            disabled={loadingCheckout}
          >
            {loadingCheckout ? '…' : t('planGateUpgradeNow')}
          </button>
        </div>
      </div>

      {showModal && (
        <UpgradeModal
          defaultTab={requiredPlan === 'multi' ? 'multi' : 'pro'}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
