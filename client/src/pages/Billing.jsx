import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../utils/apiFetch.js';
import { useLocale, useT } from '../i18n/LocaleContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

const PLAN_LABELS = { free: 'Free', pro: 'Pro', multi: 'Multi-property' };
const LOCALE_MAP  = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', nl: 'nl-NL' };

function fmtDate(iso, locale = 'en') {
  if (!iso || iso === '0') return null;
  const browserLocale = LOCALE_MAP[locale] || 'en-GB';
  const d = typeof iso === 'number' ? new Date(iso * 1000) : new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() < 2020) return null;
  return d.toLocaleDateString(browserLocale, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Billing() {
  const t = useT();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connect') === 'success' || params.get('connect') === 'refresh') {
      window.history.replaceState({}, '', '/app/billing');
    }
  }, []);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1>{t('nav.billing')}</h1>
        <div className="page-date">{t('billing.subtitle')}</div>
      </div>
      <div className="billing-page">
        <div className="billing-left">
          <AccountSubscriptionCard />
          <InvoicesCard />
        </div>
        <div className="billing-right">
          <GuestPaymentsCard />
          <StripeConnectCard />
        </div>
      </div>
    </div>
  );
}

// ── Account & Subscription card ───────────────────────────────────────────────
function AccountSubscriptionCard() {
  const t = useT();
  const { user, logout, updateUser } = useAuth();
  const { locale } = useLocale();
  const [sub,               setSub]               = useState(null);
  const [billingMessage,    setBillingMessage]     = useState(null);
  const [cancelling,        setCancelling]         = useState(false);
  const [showCancelModal,   setShowCancelModal]    = useState(false);
  const [showDeleteAccount, setShowDeleteAccount]  = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen]  = useState(false);

  const showToast = useCallback((msg, type = 'success') => {
    setBillingMessage({ type: type === 'error' ? 'error' : 'success', text: msg });
    setTimeout(() => setBillingMessage(null), 5000);
  }, []);

  useEffect(() => {
    apiFetch('/api/stripe/subscription')
      .then(r => r.json())
      .then(data => { if (data && !data.error) setSub(data); })
      .catch(() => {});
  }, []);

  // Detect ?billing=success/cancelled redirect back from Stripe promo checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') {
      setBillingMessage({
        type: 'success',
        text: 'Payment details saved — your Pro subscription will continue automatically after your promotional period ends.',
      });
      apiFetch('/api/auth/me')
        .then(r => r.ok ? r.json() : null)
        .then(freshUser => {
          if (freshUser?.id) {
            const stored = JSON.parse(localStorage.getItem('nb_user') || '{}');
            const updated = { ...stored, ...freshUser };
            localStorage.setItem('nb_user', JSON.stringify(updated));
            updateUser(updated);
          }
        })
        .catch(() => {});
      window.history.replaceState({}, '', '/app/billing');
    }
    if (params.get('billing') === 'cancelled') {
      setBillingMessage({
        type: 'info',
        text: 'Checkout cancelled — your promotional access continues unchanged.',
      });
      window.history.replaceState({}, '', '/app/billing');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddPromoPayment() {
    try {
      const res = await apiFetch('/api/stripe/create-promo-checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast('Could not start checkout. Please try again.', 'error');
      }
    } catch {
      showToast('Could not start checkout. Please try again.', 'error');
    }
  }

  async function handleCancelSubscription() {
    setShowCancelModal(false);
    const accessUntil = sub?.current_period_end ? fmtDate(sub.current_period_end, locale) : null;
    setCancelling(true);
    try {
      const res  = await apiFetch('/api/stripe/cancel-subscription', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSub(s => ({ ...s, cancel_at_period_end: 1 }));
        const endDate = data.cancel_at ? fmtDate(data.cancel_at, locale) : accessUntil;
        showToast(endDate
          ? t('cancelledSubToast')(PLAN_LABELS[sub?.plan] ?? 'Pro', endDate)
          : t('cancelledSubNoDtToast')
        );
      } else {
        showToast(data.error || t('cancelSubError'), 'error');
      }
    } catch {
      showToast(t('cancelSubError'), 'error');
    }
    setCancelling(false);
  }

  if (user?.role !== 'owner') return null;

  const isPromoPro = user?.plan === 'pro'
    && user?.trial_ends_at
    && new Date(user.trial_ends_at) > new Date()
    && !user?.stripe_subscription_id;

  return (
    <>
      {/* ── Billing flash message ─────────────────────────────────────────── */}
      {billingMessage && (
        <div style={{
          background: billingMessage.type === 'success' ? '#f0fdf4' : billingMessage.type === 'info' ? '#f8fafc' : '#fef2f2',
          border: `1px solid ${billingMessage.type === 'success' ? '#d9f0cc' : billingMessage.type === 'info' ? '#e2e8f0' : '#fecaca'}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <i className={`ti ${billingMessage.type === 'success' ? 'ti-circle-check' : billingMessage.type === 'info' ? 'ti-info-circle' : 'ti-alert-circle'}`}
             style={{ color: billingMessage.type === 'success' ? '#16a34a' : billingMessage.type === 'info' ? '#64748b' : '#dc2626', marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: '0.875rem', color: billingMessage.type === 'success' ? '#166534' : billingMessage.type === 'info' ? '#475569' : '#991b1b', lineHeight: 1.5 }}>
            {billingMessage.text}
          </span>
          <button onClick={() => setBillingMessage(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: 0, lineHeight: 1 }}>
            ×
          </button>
        </div>
      )}

      {/* ── Promotional Pro panel ─────────────────────────────────────────── */}
      {isPromoPro && (() => {
        const daysLeft = Math.ceil((new Date(user.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24));
        const promoExpiryDate = new Date(user.trial_ends_at).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        const promoExpiryShort = new Date(user.trial_ends_at).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long',
        });
        const headerBg    = daysLeft <= 7 ? '#dc2626' : daysLeft <= 14 ? '#b45309' : '#1a4710';
        const urgencyBg   = daysLeft <= 7 ? '#fef2f2' : daysLeft <= 14 ? '#fef3c7' : '#f0fdf4';
        const urgencyBdr  = daysLeft <= 7 ? '#fca5a5' : daysLeft <= 14 ? '#f59e0b' : '#d9f0cc';
        const urgencyAcct = daysLeft <= 7 ? '#dc2626' : daysLeft <= 14 ? '#f59e0b' : '#1a4710';
        const urgencyText = daysLeft <= 7 ? '#7f1d1d' : daysLeft <= 14 ? '#78350f' : '#166534';
        const btnBg       = daysLeft <= 7 ? '#dc2626' : 'var(--accent)';

        return (
          <div className="billing-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ background: headerBg, padding: '16px 20px' }}>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className={`ti ${daysLeft <= 7 ? 'ti-alert-triangle' : daysLeft <= 14 ? 'ti-clock' : 'ti-star'}`} />
                {daysLeft <= 7  ? 'Pro access expiring very soon' :
                 daysLeft <= 14 ? 'Pro access expiring soon' :
                 'NestBook Pro — Promotional access'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem' }}>
                Your free promotional period ends {promoExpiryDate} ({daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining)
              </div>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{
                background: urgencyBg, border: `1px solid ${urgencyBdr}`,
                borderLeft: `4px solid ${urgencyAcct}`, borderRadius: '0 8px 8px 0',
                padding: '12px 16px', marginBottom: 20, fontSize: '0.85rem',
                color: urgencyText, lineHeight: 1.6,
              }}>
                {daysLeft <= 7 ? (
                  <><strong>Action needed — {daysLeft} day{daysLeft !== 1 ? 's' : ''} left!</strong><br />
                  Add payment details now to avoid losing Pro access on {promoExpiryShort}.</>
                ) : daysLeft <= 14 ? (
                  <><strong>Coming up soon!</strong><br />
                  Add a card now to continue Pro uninterrupted after your promotional period ends.
                  You won't be charged until {promoExpiryDate}.</>
                ) : (
                  <><strong>No action needed yet</strong><br />
                  You have {daysLeft} days of Pro access remaining. Add payment details anytime
                  before your promotional period ends to continue without interruption.</>
                )}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
                  What you keep with Pro
                </div>
                {['Unlimited rooms', '5 photos per room', 'Booking widget for your website', 'Seasonal pricing', 'Revenue reports'].map(feature => (
                  <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <i className="ti ti-circle-check" style={{ color: 'var(--accent)', fontSize: '0.9rem', flexShrink: 0 }} />
                    {feature}
                  </div>
                ))}
              </div>

              <button
                onClick={handleAddPromoPayment}
                style={{
                  background: btnBg, color: 'white', border: 'none', borderRadius: 8,
                  padding: '13px 24px', fontWeight: 700, fontSize: '0.95rem',
                  cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <i className="ti ti-credit-card" />
                Add payment details — continue Pro after {promoExpiryShort}
              </button>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
                Your card will <strong>not be charged</strong> until {promoExpiryDate}.
                Cancel anytime before that date to stay on the free plan.
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Subscription card ─────────────────────────────────────────────── */}
      <div className="billing-card">
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{t('subscriptionTitle')}</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('subscriptionSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{t('currentPlanLabel')}</span>
            <span style={{
              fontWeight: 700, fontSize: '0.85rem',
              color: sub?.plan === 'free' ? '#64748b' : '#166534',
              background: sub?.plan === 'free' ? '#f1f5f9' : '#dcfce7',
              padding: '2px 10px', borderRadius: 20,
            }}>
              {PLAN_LABELS[sub?.plan ?? user?.plan ?? 'free']}
              {sub?.notes === 'Complimentary' ? ` ${t('complimentary')}` : ''}
            </span>
          </div>

          {user?.stripe_subscription_id && sub?.plan !== 'free' && (
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {sub?.cancel_at_period_end
                ? <span style={{ color: '#dc2626' }}>
                    {t('cancelsOn')} {fmtDate(sub?.current_period_end, locale) || t('billingDateUnavailable')}
                  </span>
                : <>{t('nextBillingDate')} <strong style={{ color: '#0f172a' }}>{fmtDate(sub?.current_period_end, locale) || t('billingDateUnavailable')}</strong></>
              }
            </div>
          )}

          {user?.stripe_subscription_id && !!sub?.cancel_at_period_end && (
            <div style={{ fontSize: '0.8rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' }}>
              {t('subCancelScheduled')}
            </div>
          )}

          {!user?.stripe_subscription_id && (sub?.plan === 'free' || !sub?.plan) && (
            <div style={{ marginTop: 4 }}>
              <Link to="/pricing" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.88rem' }}>
                View plans and upgrade →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Manage Subscription accordion ─────────────────────────────────── */}
      <div className="danger-zone-card">
        <button
          className="danger-zone-toggle"
          onClick={() => setDeleteAccountOpen(o => !o)}
          aria-expanded={deleteAccountOpen}
        >
          <span>{t('manageSubscription')}</span>
          <span className="danger-zone-chevron">{deleteAccountOpen ? '▲' : '▼'}</span>
        </button>

        {deleteAccountOpen && (
          <div className="danger-zone-body">
            {sub?.plan && sub.plan !== 'free' && !sub?.cancel_at_period_end && sub?.notes !== 'Complimentary' && (
              <div className="danger-zone-row">
                <div>
                  <div className="danger-zone-row-title">{t('cancelSubOnly')}</div>
                  <div className="danger-zone-row-desc">
                    {fmtDate(sub?.current_period_end, locale)
                      ? t('cancelSubExplain')(fmtDate(sub.current_period_end, locale))
                      : t('cancelSubDesc')}
                  </div>
                </div>
                <button
                  className="btn-danger-outline"
                  disabled={cancelling}
                  onClick={() => setShowCancelModal(true)}
                >
                  {cancelling ? t('cancelling') : t('cancelSubTitle')}
                </button>
              </div>
            )}

            <div className="danger-zone-row">
              <div>
                <div className="danger-zone-row-title">{t('deleteAccountOnly')}</div>
                <div className="danger-zone-row-desc">{t('deleteAccountExplain')}</div>
              </div>
              <button className="btn-danger" onClick={() => setShowDeleteAccount(true)}>
                {t('deleteAccountBtn')}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showCancelModal}
        title={t('cancelSubMoTitle')}
        message={`${t('cancelSubConfirm')} ${fmtDate(sub?.current_period_end, locale) ? t('cancelSubWithDate')(PLAN_LABELS[sub?.plan] ?? 'Pro', fmtDate(sub.current_period_end, locale)) : t('cancelSubNoDate')}`}
        confirmLabel={t('confirmCancelSub')}
        cancelLabel={t('keepSubscription')}
        variant="danger"
        onConfirm={handleCancelSubscription}
        onCancel={() => setShowCancelModal(false)}
      />

      {showDeleteAccount && (
        <DeleteAccountModal
          onClose={() => setShowDeleteAccount(false)}
          onSuccess={() => { logout(); localStorage.clear(); window.location.href = '/?deleted=1'; }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
    </>
  );
}

// ── Invoices card ─────────────────────────────────────────────────────────────
function InvoicesCard() {
  const t = useT();
  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    apiFetch('/api/stripe/invoices')
      .then(r => r.json())
      .then(data => setInvoices(data.invoices || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="billing-card" style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
      Loading invoices…
    </div>
  );
  if (!invoices.length) return null;

  return (
    <div className="billing-card">
      <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700 }}>{t('billing.invoices')}</h3>
      <table className="billing-invoices-table">
        <thead>
          <tr>
            <th>{t('billing.date')}</th>
            <th>{t('billing.total')}</th>
            <th>{t('billing.status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map(inv => (
            <tr key={inv.id}>
              <td>{new Date(inv.date * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
              <td>{inv.currency.toUpperCase()} {inv.total.toFixed(2)}</td>
              <td>
                <span className={`invoice-status invoice-status-${inv.status}`}>
                  {inv.status}
                </span>
              </td>
              <td>
                {inv.hosted_invoice_url && (
                  <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer"
                     style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none' }}>
                    {t('billing.view')}
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Payment status badge ──────────────────────────────────────────────────────
function PaymentBadge({ type, depositPaid, depositRequestedAt, depositAmount, balanceAmount, balancePaid, t }) {
  if (type === 'deposit') {
    if (depositPaid)          return <span className="pay-badge pay-badge--paid">{t('billing.status.paid')}</span>;
    if (depositRequestedAt)   return <span className="pay-badge pay-badge--pending">{t('billing.status.pending')}</span>;
    return <span className="pay-badge pay-badge--none">{t('billing.status.notRequested')}</span>;
  }
  if (balancePaid)            return <span className="pay-badge pay-badge--paid">{t('billing.status.paid')}</span>;
  if (balanceAmount > 0)      return <span className="pay-badge pay-badge--pending">{t('billing.status.pending')}</span>;
  return null;
}

// ── Guest payments card ───────────────────────────────────────────────────────
function GuestPaymentsCard() {
  const t = useT();
  const { locale } = useLocale();
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/bookings/payments-summary')
      .then(r => r.json())
      .then(data => setRows(data.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="billing-card" style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
      {t('billing.loadingPayments')}
    </div>
  );

  return (
    <div className="billing-card">
      <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700 }}>{t('billing.guestPayments')}</h3>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>{t('billing.noPaymentsYet')}</p>
      ) : (
        <table className="billing-invoices-table">
          <thead>
            <tr>
              <th>{t('billing.guest')}</th>
              <th>{t('billing.dates')}</th>
              <th>{t('billing.deposit')}</th>
              <th>{t('billing.balance')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td style={{ fontWeight: 500 }}>
                  {row.guest_first_name} {row.guest_last_name}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {fmtDate(row.check_in_date, locale)}
                  {row.check_out_date ? ` – ${fmtDate(row.check_out_date, locale)}` : ''}
                </td>
                <td>
                  <PaymentBadge
                    type="deposit"
                    depositPaid={row.deposit_paid}
                    depositRequestedAt={row.deposit_requested_at}
                    t={t}
                  />
                </td>
                <td>
                  {(row.deposit_amount != null || row.balance_amount != null) && (
                    <PaymentBadge
                      type="balance"
                      balancePaid={row.balance_paid}
                      balanceAmount={row.balance_amount}
                      t={t}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Stripe Connect card ───────────────────────────────────────────────────────
function StripeConnectCard() {
  const t = useT();
  const [status,        setStatus]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/stripe/connect/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    setActionLoading(true);
    try {
      const r    = await apiFetch('/api/stripe/connect/start', { method: 'POST' });
      const data = await r.json();
      if (data.url) { window.location.href = data.url; return; }
      alert(t('billing.connectError'));
    } catch {
      alert(t('billing.connectError'));
    }
    setActionLoading(false);
  }

  async function handleManage() {
    setActionLoading(true);
    try {
      const r    = await apiFetch('/api/stripe/connect/dashboard-link', { method: 'POST' });
      const data = await r.json();
      if (data.url) window.open(data.url, '_blank');
      else alert(t('billing.connectError'));
    } catch {
      alert(t('billing.connectError'));
    }
    setActionLoading(false);
  }

  if (loading) return (
    <div className="billing-card billing-connect-card">
      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>{t('billing.loadingConnect')}</p>
    </div>
  );

  const isActive  = status?.status === 'active';
  const isPending = status?.connected && !isActive;

  return (
    <div className="billing-card billing-connect-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <i className="ti ti-building-bank" style={{ fontSize: '1.4rem', color: '#635bff' }} />
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{t('billing.stripeConnect')}</h3>
      </div>
      <p style={{ margin: '0 0 4px', fontSize: '0.87rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
        {t('billing.stripeConnectDesc')}
      </p>

      {!status?.connected && (
        <>
          <div className="billing-connect-why">
            <h4>{t('billing.whyTitle')}</h4>
            <ul>
              <li>{t('billing.why1')}</li>
              <li>{t('billing.why2')}</li>
              <li>{t('billing.why3')}</li>
            </ul>
          </div>
          <div className="billing-connect-how">
            <h4>{t('billing.howTitle')}</h4>
            <ol>
              <li>{t('billing.how1')}</li>
              <li>{t('billing.how2')}</li>
              <li>{t('billing.how3')}</li>
            </ol>
          </div>
          <button className="billing-connect-btn" onClick={handleConnect} disabled={actionLoading}>
            {actionLoading ? t('billing.connecting') : t('billing.connectWithStripe')}
          </button>
        </>
      )}

      {isPending && (
        <div style={{ marginTop: 12 }}>
          <span className="billing-status-pill billing-status-pending">{t('billing.connectPending')}</span>
          <button className="billing-connect-btn" onClick={handleConnect} disabled={actionLoading} style={{ display: 'block', marginTop: 10 }}>
            {actionLoading ? t('billing.connecting') : t('billing.finishSetup')}
          </button>
        </div>
      )}

      {isActive && (
        <div style={{ marginTop: 12 }}>
          <span className="billing-status-pill billing-status-active">
            <i className="ti ti-circle-check" /> {t('billing.connectActive')}
          </span>
          <button className="billing-connect-btn billing-connect-btn-secondary" onClick={handleManage} disabled={actionLoading} style={{ display: 'block', marginTop: 10 }}>
            {actionLoading ? t('billing.connecting') : t('billing.manageOnStripe')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Delete account modal (self-contained) ─────────────────────────────────────
function DeleteAccountModal({ onClose, onSuccess, onError }) {
  const t = useT();
  const [confirmText, setConfirmText] = useState('');
  const [loading,     setLoading]     = useState(false);

  async function handleDelete() {
    if (confirmText !== 'DELETE') return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/account', { method: 'DELETE' });
      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        onError(data.error || `Delete failed (${res.status}).`);
        setLoading(false);
      }
    } catch (err) {
      onError(err.message || 'Network error — please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>{t('deleteAccountMoTitle')}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: '0.875rem', color: '#991b1b',
          }}>
            <strong>{t('deleteCannotUndo')}</strong> {t('deleteDataWarning')}
          </div>
          <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: 8 }}>
            {t('typeDeleteConfirm')}
          </p>
          <input
            className="form-control"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoFocus
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-secondary" onClick={onClose} disabled={loading}>{t('cancel')}</button>
            <button
              style={{
                background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6,
                padding: '8px 18px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                opacity: confirmText !== 'DELETE' ? 0.45 : 1,
              }}
              onClick={handleDelete}
              disabled={loading || confirmText !== 'DELETE'}
            >
              {loading ? t('deleting') : t('deletePermanently')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
