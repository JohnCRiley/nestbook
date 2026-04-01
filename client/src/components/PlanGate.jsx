import { Link } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan.js';

// Plan hierarchy: free < pro < multi
const RANK = { free: 0, pro: 1, multi: 2 };

/**
 * Wraps a Pro (or Multi) feature.
 * Shows an upgrade prompt instead of children if the user's plan is too low.
 *
 * Usage:
 *   <PlanGate requiredPlan="pro">
 *     <FeatureContent />
 *   </PlanGate>
 */
export default function PlanGate({ requiredPlan = 'pro', children }) {
  const plan = usePlan();

  if (RANK[plan] >= RANK[requiredPlan]) return children;

  const label = requiredPlan === 'multi' ? 'Multi-property' : 'Pro';

  return (
    <div className="plan-gate">
      <div className="plan-gate-badge">{label}</div>
      <h3 className="plan-gate-title">This is a {label} feature</h3>
      <p className="plan-gate-desc">
        Upgrade your plan to unlock this feature and everything else in the {label} tier.
      </p>
      <Link to="/pricing" className="plan-gate-btn">View pricing →</Link>
    </div>
  );
}
