import { Link } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan.js';
import { useT } from '../i18n/LocaleContext.jsx';

const RANK = { free: 0, pro: 1, multi: 2 };

export default function PlanGate({ requiredPlan = 'pro', children }) {
  const plan = usePlan();
  const t    = useT();

  if (RANK[plan] >= RANK[requiredPlan]) return children;

  const featureKey = requiredPlan === 'multi' ? 'planGateMultiFeature' : 'planGateProFeature';
  const label      = requiredPlan === 'multi' ? t('planMultiName')      : t('planProName');

  return (
    <div className="plan-gate">
      <div className="plan-gate-badge">{label}</div>
      <h3 className="plan-gate-title">{t(featureKey)}</h3>
      <p className="plan-gate-desc">{t('planGateUpgradePrompt')}</p>
      <Link to="/pricing" className="plan-gate-btn">{t('planGateViewPricing')}</Link>
    </div>
  );
}
