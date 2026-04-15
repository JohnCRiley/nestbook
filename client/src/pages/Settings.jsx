import { useState, useEffect, useCallback } from 'react';
import InviteStaffModal from './settings/InviteStaffModal.jsx';
import PlanGate from '../components/PlanGate.jsx';
import ResetStaffPasswordModal from '../components/ResetStaffPasswordModal.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useLocale, useT } from '../i18n/LocaleContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { useKiosk } from '../hooks/useKiosk.js';

const PLAN_LABELS = { free: 'Free', pro: 'Pro', multi: 'Multi-property' };

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  { value: 'bnb',        label: 'B&B' },
  { value: 'gite',       label: 'Gîte / Holiday Cottage' },
  { value: 'guesthouse', label: 'Guest House' },
  { value: 'hotel',      label: 'Small Hotel' },
  { value: 'other',      label: 'Other' },
];

const CURRENCIES = [
  { value: 'EUR', label: '€ EUR — Euro' },
  { value: 'GBP', label: '£ GBP — British Pound' },
  { value: 'USD', label: '$ USD — US Dollar' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
];

const LOCALES = [
  { value: 'en', label: '🇬🇧 English' },
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'nl', label: '🇳🇱 Nederlands' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function Settings() {
  const t = useT();
  const { setProperty: setContextProperty, properties, addPropertyToList, property: activeProperty } = useLocale();
  const { user, logout } = useAuth();
  const plan = usePlan();
  const { kiosk, setKioskMode } = useKiosk();

  const FEATURES = [
    {
      key:     'widget',
      label:   t('fWidget'),
      desc:    t('fWidgetSub'),
      default: true,
    },
    {
      key:     'email_confirmations',
      label:   t('fEmail'),
      desc:    t('fEmailSub'),
      default: true,
    },
    {
      key:     'breakfast',
      label:   t('fBreakfast'),
      desc:    t('fBreakfastSub'),
      default: false,
    },
    {
      key:     'deposit',
      label:   t('fDeposit'),
      desc:    t('fDepositSub'),
      default: false,
    },
    {
      key:     'offline',
      label:   t('fOffline'),
      desc:    t('fOfflineSub'),
      default: true,
    },
  ];

  const [property,    setProperty]    = useState(null);
  const [users,       setUsers]       = useState([]);
  const [form,        setForm]        = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState(null);   // { msg, type }
  const [showInvite,      setShowInvite]      = useState(false);
  const [resetTarget,     setResetTarget]     = useState(null);   // user object | null
  const [sub,               setSub]               = useState(null);   // subscription info
  const [cancelling,        setCancelling]        = useState(false);
  const [showCancelModal,   setShowCancelModal]   = useState(false);
  const [showAddProperty,   setShowAddProperty]   = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  // Feature toggles live in local state only (no backend yet — persist later)
  const [features, setFeatures] = useState(() =>
    Object.fromEntries(FEATURES.map((f) => [f.key, f.default]))
  );

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProperty?.id) return;
    Promise.all([
      apiFetch(`/api/properties/${activeProperty.id}`).then((r) => r.json()),
      apiFetch(`/api/users?property_id=${activeProperty.id}`).then((r) => r.json()),
      apiFetch('/api/stripe/subscription').then((r) => r.json()).catch(() => null),
    ]).then(([p, u, s]) => {
      setProperty(p);
      setForm({
        name:           p.name           ?? '',
        type:           p.type           ?? 'bnb',
        address:        p.address        ?? '',
        city:           p.city           ?? '',
        country:        p.country        ?? '',
        check_in_time:  p.check_in_time  ?? '15:00',
        check_out_time: p.check_out_time ?? '11:00',
        currency:       p.currency       ?? 'EUR',
        locale:         p.locale         ?? 'en',
      });
      setUsers(u);
      if (s && !s.error) setSub(s);
    });
  }, [activeProperty?.id]);

  // ── Toast helper ───────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFormChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/properties/${activeProperty?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const updated = await res.json();
      setProperty(updated);
      setContextProperty(updated); // update locale/currency in context instantly
      showToast('Property settings saved successfully.');
    } catch (err) {
      showToast('Failed to save settings. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFeatureToggle = (key) =>
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleCancelSubscription = async () => {
    setShowCancelModal(false);
    const accessUntil = sub?.current_period_end ? fmtDate(sub.current_period_end) : null;
    setCancelling(true);
    try {
      const res = await apiFetch('/api/stripe/cancel-subscription', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSub(s => ({ ...s, cancel_at_period_end: 1 }));
        const endDate = data.cancel_at ? fmtDate(data.cancel_at) : accessUntil;
        showToast(endDate
          ? `Subscription cancelled. You'll have ${PLAN_LABELS[sub?.plan] ?? 'Pro'} access until ${endDate}.`
          : 'Subscription will cancel at the end of your billing period.'
        );
      } else {
        showToast(data.error || 'Failed to cancel subscription.', 'error');
      }
    } catch {
      showToast('Network error.', 'error');
    }
    setCancelling(false);
  };

  const handleInviteSuccess = (newUser) => {
    setUsers((prev) => [...prev, newUser]);
    setShowInvite(false);
    showToast(`${newUser.name} has been added as ${newUser.role}.`);
  };

  const handleAddProperty = async (formData) => {
    try {
      const res = await apiFetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        addPropertyToList(data);
        setShowAddProperty(false);
        showToast(`${data.name} has been added.`);
      } else {
        showToast(data.error || 'Failed to add property.', 'error');
      }
    } catch {
      showToast('Network error.', 'error');
    }
  };

  // ── Embed snippet ──────────────────────────────────────────────────────────
  const embedSnippet = `<!-- NestBook Booking Widget -->
<script
  src="https://nestbook.io/widget.js"
  data-property-id="1"
  data-lang="${form?.locale ?? 'en'}"
  data-currency="${form?.currency ?? 'EUR'}"
  async>
</script>
<div id="nestbook-widget"></div>`;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!form) return <div className="loading-screen">Loading settings…</div>;

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <h1>{t('settings')}</h1>
        <div className="page-date">Manage your property configuration and account</div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="settings-layout">

        {/* ── LEFT COLUMN — Property details ────────────────────────────── */}
        <div>
          <div className="settings-card">
            <div className="settings-card-header">
              <h2>{t('propDetails')}</h2>
              <p>Basic information about your property</p>
            </div>
            <div className="settings-card-body">
              <div className="settings-form">

                <FormField label={t('propName')}>
                  <input name="name" className="form-control"
                    value={form.name} onChange={handleFormChange} />
                </FormField>

                <FormField label={t('propType')}>
                  <select name="type" className="form-control"
                    value={form.type} onChange={handleFormChange}>
                    {PROPERTY_TYPES.map((tp) => (
                      <option key={tp.value} value={tp.value}>{tp.label}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label={t('address')}>
                  <input name="address" className="form-control"
                    value={form.address} onChange={handleFormChange}
                    placeholder="47 Route de Gordes" />
                </FormField>

                <div className="settings-form-row">
                  <FormField label="City / Town">
                    <input name="city" className="form-control"
                      value={form.city} onChange={handleFormChange}
                      placeholder="Roussillon" />
                  </FormField>
                  <FormField label="Country">
                    <input name="country" className="form-control"
                      value={form.country} onChange={handleFormChange}
                      placeholder="France" />
                  </FormField>
                </div>

                <div className="settings-form-row">
                  <FormField label={t('checkin')}>
                    <input name="check_in_time" type="time" className="form-control"
                      value={form.check_in_time} onChange={handleFormChange} />
                  </FormField>
                  <FormField label={t('checkout')}>
                    <input name="check_out_time" type="time" className="form-control"
                      value={form.check_out_time} onChange={handleFormChange} />
                  </FormField>
                </div>

                <div className="settings-form-row">
                  <FormField label={t('currency')}>
                    <select name="currency" className="form-control"
                      value={form.currency} onChange={handleFormChange}>
                      {CURRENCIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Language">
                    <select name="locale" className="form-control"
                      value={form.locale} onChange={handleFormChange}>
                      {LOCALES.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="settings-save-row">
                  <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : t('saveChanges')}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN — Features + Access ──────────────────────────── */}
        <div>
          {/* Features */}
          <div className="settings-card">
            <div className="settings-card-header">
              <h2>{t('features')}</h2>
              <p>Enable or disable functionality for your property</p>
            </div>
            <div className="settings-card-body" style={{ padding: '0 20px' }}>
              <div className="toggle-list">
                {FEATURES.map((f) => (
                  <ToggleRow
                    key={f.key}
                    label={f.label}
                    desc={f.desc}
                    checked={features[f.key]}
                    onChange={() => handleFeatureToggle(f.key)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Kiosk mode — owner only */}
          {user?.role === 'owner' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>Reception kiosk mode</h2>
                <p>When enabled, reception staff automatically enter fullscreen on login</p>
              </div>
              <div className="settings-card-body" style={{ padding: '0 20px' }}>
                <div className="toggle-list">
                  <ToggleRow
                    label="Kiosk mode"
                    desc="Locks reception view to Calendar and Bookings in fullscreen"
                    checked={kiosk}
                    onChange={() => setKioskMode(!kiosk)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Subscription */}
          {user?.role === 'owner' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>Subscription</h2>
                <p>Your current plan and billing details</p>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Current plan</span>
                    <span style={{
                      fontWeight: 700, fontSize: '0.85rem',
                      color: sub?.plan === 'free' ? '#64748b' : '#166534',
                      background: sub?.plan === 'free' ? '#f1f5f9' : '#dcfce7',
                      padding: '2px 10px', borderRadius: 20,
                    }}>
                      {PLAN_LABELS[sub?.plan ?? user?.plan ?? 'free']}
                      {sub?.notes === 'Complimentary' ? ' (Complimentary)' : ''}
                    </span>
                  </div>

                  {sub?.current_period_end && sub?.plan !== 'free' && (
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      {sub.cancel_at_period_end
                        ? <span style={{ color: '#dc2626' }}>
                            Cancels on {fmtDate(sub.current_period_end)}
                          </span>
                        : <>Next billing date: <strong style={{ color: '#0f172a' }}>{fmtDate(sub.current_period_end)}</strong></>
                      }
                    </div>
                  )}

                  {sub?.cancel_at_period_end && (
                    <div style={{ fontSize: '0.8rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' }}>
                      Your subscription is scheduled to cancel. You'll keep access until your billing period ends.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Multi-property management — Multi plan only */}
          {user?.role === 'owner' && plan === 'multi' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>Properties</h2>
                <p>{properties.length} of 5 properties used</p>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {properties.map((p) => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0', borderBottom: '1px solid #f1f5f9',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>{p.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'capitalize' }}>{p.type}</div>
                      </div>
                      {p.id === activeProperty?.id && (
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 700, background: '#dcfce7',
                          color: '#166534', padding: '2px 10px', borderRadius: 12,
                        }}>Active</span>
                      )}
                    </div>
                  ))}
                </div>

                {properties.length < 5 && (
                  showAddProperty ? (
                    <AddPropertyForm
                      onSave={handleAddProperty}
                      onCancel={() => setShowAddProperty(false)}
                    />
                  ) : (
                    <button
                      className="btn-secondary"
                      style={{ marginTop: 14 }}
                      onClick={() => setShowAddProperty(true)}
                    >
                      + Add another property
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* Access & Roles */}
          <div className="settings-card">
            <div className="settings-card-header">
              <h2>{t('access')}</h2>
              <p>Staff accounts with access to this property</p>
            </div>
            <div className="settings-card-body">
              <div className="user-list">
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    t={t}
                    isOwner={user?.role === 'owner'}
                    onResetPassword={() => setResetTarget(u)}
                  />
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <PlanGate requiredPlan="pro">
                  <button className="btn-secondary" onClick={() => setShowInvite(true)}>
                    + Invite Staff Member
                  </button>
                </PlanGate>
              </div>
            </div>
          </div>

          {/* Manage Subscription — destructive actions accordion */}
          {user?.role === 'owner' && (
            <div className="danger-zone-card">
              <button
                className="danger-zone-toggle"
                onClick={() => setDeleteAccountOpen((o) => !o)}
                aria-expanded={deleteAccountOpen}
              >
                <span>Manage Subscription</span>
                <span className="danger-zone-chevron">{deleteAccountOpen ? '▲' : '▼'}</span>
              </button>

              {deleteAccountOpen && (
                <div className="danger-zone-body">

                  {/* Cancel subscription */}
                  {sub?.plan && sub.plan !== 'free' && !sub?.cancel_at_period_end && sub?.notes !== 'Complimentary' && (
                    <div className="danger-zone-row">
                      <div>
                        <div className="danger-zone-row-title">Cancel subscription</div>
                        <div className="danger-zone-row-desc">
                          Stop billing at the end of your current period. Your account and data are kept.
                        </div>
                      </div>
                      <button
                        className="btn-danger-outline"
                        disabled={cancelling}
                        onClick={() => setShowCancelModal(true)}
                      >
                        {cancelling ? 'Cancelling…' : 'Cancel subscription'}
                      </button>
                    </div>
                  )}

                  {/* Delete account */}
                  <div className="danger-zone-row">
                    <div>
                      <div className="danger-zone-row-title">Delete account permanently</div>
                      <div className="danger-zone-row-desc">
                        Removes all properties, rooms, bookings, guest records and cancels any active subscription.
                        This <strong>cannot be undone</strong>.
                      </div>
                    </div>
                    <button
                      className="btn-danger"
                      onClick={() => setShowDeleteAccount(true)}
                    >
                      Delete account
                    </button>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Embed widget — full width (Pro feature) ──────────────────────── */}
      <PlanGate requiredPlan="pro">
        <EmbedSection snippet={embedSnippet} t={t} />
      </PlanGate>

      {/* ── Modals & toast ───────────────────────────────────────────────── */}
      {showCancelModal && (
        <CancelSubscriptionModal
          plan={PLAN_LABELS[sub?.plan] ?? 'Pro'}
          renewalDate={sub?.current_period_end ? fmtDate(sub.current_period_end) : null}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancelSubscription}
        />
      )}

      {showInvite && (
        <InviteStaffModal
          onClose={() => setShowInvite(false)}
          onSuccess={handleInviteSuccess}
        />
      )}

      {resetTarget && (
        <ResetStaffPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}

      {showDeleteAccount && (
        <DeleteAccountModal
          onClose={() => setShowDeleteAccount(false)}
          onSuccess={() => { logout(); localStorage.clear(); window.location.href = '/?deleted=1'; }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </>
  );
}

// ── EmbedSection ──────────────────────────────────────────────────────────────

function EmbedSection({ snippet, t }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="embed-section">
      <div className="embed-header">
        <h2>{t('embedTitle')}</h2>
        <p>{t('embedSub')}</p>
      </div>
      <div className="embed-body">
        <p className="embed-desc">
          {t('embedDesc').split('<body>').map((part, i) =>
            i === 0 ? part : <span key={i}><code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, fontSize: '0.85em' }}>&lt;body&gt;</code>{part}</span>
          )}
        </p>

        <div className="embed-code-wrap">
          <button
            className={`embed-copy-btn${copied ? ' copied' : ''}`}
            onClick={handleCopy}
          >
            {copied ? t('embedCopied') : t('embedCopy')}
          </button>
          {snippet}
        </div>

        <div className="embed-steps">
          <div className="embed-step">
            <span className="embed-step-num">1</span>
            <span>{t('embedStep1')}</span>
          </div>
          <div className="embed-step">
            <span className="embed-step-num">2</span>
            <span>{t('embedStep2')}</span>
          </div>
          <div className="embed-step">
            <span className="embed-step-num">3</span>
            <span>{t('embedStep3')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AddPropertyForm ───────────────────────────────────────────────────────────

const PROPERTY_TYPES_LIST = [
  { value: 'bnb',        label: 'B&B' },
  { value: 'gite',       label: 'Gîte / Holiday Cottage' },
  { value: 'guesthouse', label: 'Guest House' },
  { value: 'hotel',      label: 'Small Hotel' },
  { value: 'other',      label: 'Other' },
];

function AddPropertyForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', type: 'bnb' });
  const [saving, setSaving] = useState(false);
  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: '0.82rem' }}>Property name *</label>
        <input
          name="name" className="form-control" autoFocus required
          value={form.name} onChange={handleChange}
          placeholder="e.g. La Maison du Soleil"
          style={{ marginTop: 4 }}
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: '0.82rem' }}>Type</label>
        <select name="type" className="form-control" value={form.type} onChange={handleChange} style={{ marginTop: 4 }}>
          {PROPERTY_TYPES_LIST.map((tp) => (
            <option key={tp.value} value={tp.value}>{tp.label}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={saving} style={{ fontSize: '0.85rem' }}>
          {saving ? 'Saving…' : 'Save property'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} style={{ fontSize: '0.85rem' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── DeleteAccountModal ────────────────────────────────────────────────────────

function DeleteAccountModal({ onClose, onSuccess, onError }) {
  const [confirmText, setConfirmText] = useState('');
  const [loading,     setLoading]     = useState(false);

  async function handleDelete() {
    if (confirmText !== 'DELETE') return;
    setLoading(true);
    try {
      const res  = await apiFetch('/api/auth/account', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else {
        onError(data.error || 'Delete failed.');
        setLoading(false);
      }
    } catch {
      onError('Network error.');
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>Delete account</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: '0.875rem', color: '#991b1b',
          }}>
            <strong>This cannot be undone.</strong> All your property data, bookings, guest
            records and subscription will be permanently deleted.
          </div>
          <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: 8 }}>
            Type <strong>DELETE</strong> to confirm:
          </p>
          <input
            className="form-control"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoFocus
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button
              style={{
                background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6,
                padding: '8px 18px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                opacity: confirmText !== 'DELETE' ? 0.45 : 1,
              }}
              onClick={handleDelete}
              disabled={loading || confirmText !== 'DELETE'}
            >
              {loading ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CancelSubscriptionModal ───────────────────────────────────────────────────

function CancelSubscriptionModal({ plan, renewalDate, onClose, onConfirm }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2>Cancel subscription</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.95rem', color: '#374151', marginBottom: 16 }}>
            Are you sure you want to cancel?
            {renewalDate
              ? <> You'll keep <strong>{plan}</strong> access until <strong>{renewalDate}</strong>. After that you'll move to the free plan.</>
              : <> You'll keep access until the end of your current billing period, then move to the free plan.</>
            }
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onClose}>
              Keep subscription
            </button>
            <button
              style={{
                background: '#dc2626', color: '#fff', border: 'none',
                borderRadius: 6, padding: '8px 18px', fontWeight: 600,
                fontSize: '0.875rem', cursor: 'pointer',
              }}
              onClick={onConfirm}
            >
              Cancel subscription
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function FormField({ label, children }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="toggle-row">
      <div className="toggle-info">
        <div className="toggle-label">{label}</div>
        {desc && <div className="toggle-desc">{desc}</div>}
      </div>
      <label className="toggle-switch" aria-label={label}>
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="toggle-track" />
      </label>
    </div>
  );
}

function UserRow({ user, t, isOwner, onResetPassword }) {
  const initials =
    user.name.split(' ').map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('');
  return (
    <div className="user-row">
      <div className="user-avatar-sm">{initials}</div>
      <div className="user-info">
        <div className="user-name">{user.name}</div>
        <div className="user-email">{user.email}</div>
      </div>
      <span className={`role-badge role-${user.role}`}>
        {user.role === 'owner' ? t('fOwner') : t('fReception')}
      </span>
      {isOwner && (
        <button
          className="btn-ghost-sm"
          onClick={onResetPassword}
          title="Reset password"
        >
          Reset password
        </button>
      )}
    </div>
  );
}
