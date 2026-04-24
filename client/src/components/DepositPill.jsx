import { useT } from '../i18n/LocaleContext.jsx';

const pillBase = {
  display: 'inline-flex', alignItems: 'center',
  fontSize: '0.72rem', fontWeight: 700,
  borderRadius: 4, padding: '2px 8px',
};

export default function DepositPill({ booking, property }) {
  const t = useT();

  if (!property?.require_deposit) return null;

  if (booking.deposit_paid) {
    return (
      <span style={{ ...pillBase, background: '#d9f0cc', color: '#1a4710', border: '1px solid #86efac' }}>
        {t('depositPaidPill')}
      </span>
    );
  }

  if (booking.deposit_requested_at) {
    return (
      <span style={{ ...pillBase, background: '#fed7aa', color: '#9a3412', border: '1px solid #fdba74' }}>
        {t('depositRequestedPill')}
      </span>
    );
  }

  return (
    <span style={{ ...pillBase, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
      {t('depositPill')}
    </span>
  );
}
