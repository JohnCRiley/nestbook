import { useState } from 'react';
import { usePlan } from '../hooks/usePlan.js';
import { useT } from '../i18n/LocaleContext.jsx';
import UpgradeModal from './UpgradeModal.jsx';

export default function UpgradeBanner() {
  const plan = usePlan();
  const t    = useT();
  const [showModal,  setShowModal]  = useState(false);
  const [dismissed,  setDismissed]  = useState(false);

  if (plan !== 'free' || dismissed) return null;

  return (
    <>
      <div className="upgrade-banner">
        <span className="upgrade-banner-text">
          🌿 {t('upgradeBannerText')}
        </span>
        <button
          className="upgrade-banner-cta"
          onClick={() => setShowModal(true)}
        >
          {t('upgradeBannerCta')}
        </button>
        <button
          className="upgrade-banner-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >✕</button>
      </div>

      {showModal && <UpgradeModal onClose={() => setShowModal(false)} />}
    </>
  );
}
