import { useT } from '../i18n/LocaleContext.jsx';

const pillBase = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: '0.72rem', fontWeight: 700,
  borderRadius: 4, padding: '2px 8px',
};

export default function DepositPill({ booking, property }) {
  const t = useT();

  if (!property?.require_deposit) return null;

  if (booking.deposit_paid) {
    return (
      <span style={{ ...pillBase, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>
        💰 {t('depositPaidPill')}
      </span>
    );
  }

  if (booking.deposit_requested_at) {
    return (
      <span style={{ ...pillBase, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
        💰 {t('depositRequestedPill')}
      </span>
    );
  }

  return (
    <span style={{ ...pillBase, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
      💰 {t('depositPill')}
    </span>
  );
}
