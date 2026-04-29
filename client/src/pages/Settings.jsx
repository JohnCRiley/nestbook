import { useState, useEffect, useCallback } from 'react';
import InviteStaffModal from './settings/InviteStaffModal.jsx';
import PlanGate from '../components/PlanGate.jsx';
import ResetStaffPasswordModal from '../components/ResetStaffPasswordModal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useLocale, useT } from '../i18n/LocaleContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePlan } from '../hooks/usePlan.js';

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
  const { setProperty: setContextProperty, properties, addPropertyToList, updatePropertyInList, removePropertyFromList, property: activeProperty, locale, currencySymbol } = useLocale();
  const { user, logout } = useAuth();
  const plan = usePlan();
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
  const [showAddProperty,      setShowAddProperty]      = useState(false);
  const [showDeleteAccount,    setShowDeleteAccount]    = useState(false);
  const [deleteAccountOpen,    setDeleteAccountOpen]    = useState(false);
  const [removePropertyTarget, setRemovePropertyTarget] = useState(null); // property object | null
  const [categories,    setCategories]    = useState([]);
  const [newCatForm,    setNewCatForm]    = useState({ name: '', color: '#64748b', icon: '' });
  const [catSaving,     setCatSaving]     = useState(false);

  // Non-persisted feature toggles (widget, email_confirmations, offline)
  const [features, setFeatures] = useState(() =>
    Object.fromEntries(FEATURES.map((f) => [f.key, f.default]))
  );

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProperty?.id) return;
    const catFetch = plan === 'multi'
      ? apiFetch(`/api/charges/categories`).then((r) => r.ok ? r.json() : []).catch(() => [])
      : Promise.resolve([]);
    Promise.all([
      apiFetch(`/api/properties/${activeProperty.id}`).then((r) => r.json()),
      apiFetch(`/api/users?property_id=${activeProperty.id}`).then((r) => r.json()),
      apiFetch('/api/stripe/subscription').then((r) => r.json()).catch(() => null),
      catFetch,
    ]).then(([p, u, s, cats]) => {
      setProperty(p);
      setForm({
        name:               p.name               ?? '',
        type:               p.type               ?? 'bnb',
        address:            p.address            ?? '',
        city:               p.city               ?? '',
        country:            p.country            ?? '',
        check_in_time:      p.check_in_time      ?? '15:00',
        check_out_time:     p.check_out_time     ?? '11:00',
        currency:           p.currency           ?? 'EUR',
        locale:             p.locale             ?? 'en',
        breakfast_included: p.breakfast_included ? 1 : 0,
        require_deposit:    p.require_deposit    ? 1 : 0,
        deposit_amount:     p.deposit_amount     ?? 0,
        breakfast_price:    p.breakfast_price    ?? 0,
      });
      setUsers(u);
      if (s && !s.error) setSub(s);
      setCategories(Array.isArray(cats) ? cats : []);
    });
  }, [activeProperty?.id, plan]);

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
      updatePropertyInList(updated); // keep properties list in sync (fixes NL multi-prop)
      showToast(t('saved'));
    } catch (err) {
      showToast(t('saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFeatureToggle = (key) =>
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleCancelSubscription = async () => {
    setShowCancelModal(false);
    const accessUntil = sub?.current_period_end ? fmtDate(sub.current_period_end, locale) : null;
    setCancelling(true);
    try {
      const res = await apiFetch('/api/stripe/cancel-subscription', { method: 'POST' });
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
      showToast(t('networkError'), 'error');
    }
    setCancelling(false);
  };

  const handleInviteSuccess = (newUser) => {
    setUsers((prev) => [...prev, newUser]);
    setShowInvite(false);
    showToast(t('staffAddedToast')(newUser.name, newUser.role));
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
        showToast(t('propAddedToast')(data.name));
      } else {
        showToast(data.error || t('propAddError'), 'error');
      }
    } catch {
      showToast(t('networkError'), 'error');
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
  if (!form) return <div className="loading-screen">{t('loadingDashboard')}</div>;

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <h1>{t('settings')}</h1>
        <div className="page-date">{t('settingsSubtitle')}</div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="settings-layout">

        {/* ── LEFT COLUMN — Property details ────────────────────────────── */}
        <div>
          <div className="settings-card">
            <div className="settings-card-header">
              <h2>{t('propDetails')}</h2>
              <p>{t('propBasicInfo')}</p>
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
                  <FormField label={t('cityLabel')}>
                    <input name="city" className="form-control"
                      value={form.city} onChange={handleFormChange}
                      placeholder="Roussillon" />
                  </FormField>
                  <FormField label={t('countryLabel')}>
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
                  <FormField label={t('languageLabel')}>
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
                    {saving ? t('saving') : t('saveChanges')}
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
              <p>{t('featuresSubtitle')}</p>
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
                {form && (
                  <>
                    <ToggleRow
                      label={t('fBreakfast')}
                      desc={t('fBreakfastSub')}
                      checked={!!form.breakfast_included}
                      onChange={() => setForm((p) => ({ ...p, breakfast_included: p.breakfast_included ? 0 : 1 }))}
                    />
                    {!!form.breakfast_included && (
                      <div style={{ padding: '4px 0 14px 0' }}>
                        <label className="form-label" style={{ fontSize: '0.82rem' }}>
                          {t('breakfastPriceLabel')} ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          className="form-control"
                          min="0"
                          step="0.01"
                          value={form.breakfast_price}
                          onChange={(e) => setForm((p) => ({ ...p, breakfast_price: e.target.value }))}
                          style={{ marginTop: 4, maxWidth: 160 }}
                        />
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          {t('breakfastPriceHint')}
                        </div>
                      </div>
                    )}
                    <ToggleRow
                      label={t('fDeposit')}
                      desc={t('fDepositSub')}
                      checked={!!form.require_deposit}
                      onChange={() => setForm((p) => ({ ...p, require_deposit: p.require_deposit ? 0 : 1 }))}
                    />
                    {!!form.require_deposit && (
                      <div style={{ padding: '4px 0 14px 0' }}>
                        <label className="form-label" style={{ fontSize: '0.82rem' }}>
                          Deposit amount ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          className="form-control"
                          min="0"
                          step="0.01"
                          value={form.deposit_amount}
                          onChange={(e) => setForm((p) => ({ ...p, deposit_amount: e.target.value }))}
                          style={{ marginTop: 4, maxWidth: 160 }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Subscription */}
          {user?.role === 'owner' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>{t('subscriptionTitle')}</h2>
                <p>{t('subscriptionSubtitle')}</p>
              </div>
              <div className="settings-card-body">
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

                  {sub?.current_period_end && sub?.plan !== 'free' && (
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      {sub.cancel_at_period_end
                        ? <span style={{ color: '#dc2626' }}>
                            {t('cancelsOn')} {fmtDate(sub.current_period_end, locale)}
                          </span>
                        : <>{t('nextBillingDate')} <strong style={{ color: '#0f172a' }}>{fmtDate(sub.current_period_end, locale)}</strong></>
                      }
                    </div>
                  )}

                  {sub?.cancel_at_period_end && (
                    <div style={{ fontSize: '0.8rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' }}>
                      {t('subCancelScheduled')}
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
                <h2>{t('propertiesTitle')}</h2>
                <p>{t('propertiesOf5')(properties.length)}</p>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {properties.map((p) => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0', borderBottom: '1px solid #f1f5f9',
                      gap: 12,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>{p.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'capitalize' }}>{p.type}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {p.id === activeProperty?.id && (
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 700, background: '#dcfce7',
                            color: '#166534', padding: '2px 10px', borderRadius: 12,
                          }}>{t('activeLabel')}</span>
                        )}
                        {properties.length > 1 && (
                          <button
                            className="prop-remove-btn"
                            onClick={() => setRemovePropertyTarget(p)}
                            title={`${t('removeBtn')} ${p.name}`}
                          >
                            {t('removeBtn')}
                          </button>
                        )}
                      </div>
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
                      {t('addAnotherProperty')}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* Service Categories — Multi plan, owner only */}
          {plan === 'multi' && user?.role === 'owner' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>{t('chargesCatTitle')}</h2>
                <p>{t('chargesSubtitle')}</p>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 14 }}>
                  {categories.length === 0 && (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', padding: '8px 0' }}>{t('chargesCatEmpty')}</div>
                  )}
                  {categories.map((cat) => (
                    <div key={cat.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                          background: cat.color, flexShrink: 0,
                        }} />
                        <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{cat.name}</span>
                      </div>
                      <button
                        onClick={async () => {
                          const res = await apiFetch(`/api/charges/categories/${cat.id}`, { method: 'DELETE' });
                          if (res.ok) setCategories((prev) => prev.filter((c) => c.id !== cat.id));
                        }}
                        style={{
                          background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                          fontSize: '0.8rem', fontFamily: 'inherit', padding: '2px 6px', borderRadius: 4,
                        }}
                      >
                        {t('chargesCatDelete')}
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: 120 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                      {t('chargesCatName')}
                    </label>
                    <input
                      value={newCatForm.name}
                      onChange={(e) => setNewCatForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Room Service"
                      className="form-control"
                      style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                    />
                  </div>
                  <div style={{ width: 60 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                      {t('chargesCatColor')}
                    </label>
                    <input
                      type="color"
                      value={newCatForm.color}
                      onChange={(e) => setNewCatForm((f) => ({ ...f, color: e.target.value }))}
                      style={{ width: 40, height: 34, border: 'none', cursor: 'pointer', padding: 0, borderRadius: 6 }}
                    />
                  </div>
                  <button
                    disabled={catSaving || !newCatForm.name.trim()}
                    onClick={async () => {
                      if (!newCatForm.name.trim()) return;
                      setCatSaving(true);
                      const res = await apiFetch('/api/charges/categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newCatForm),
                      });
                      if (res.ok) {
                        const cat = await res.json();
                        setCategories((prev) => [...prev, cat]);
                        setNewCatForm({ name: '', color: '#64748b', icon: '' });
                      }
                      setCatSaving(false);
                    }}
                    className="btn-primary"
                    style={{ alignSelf: 'flex-end', padding: '7px 14px', fontSize: '0.85rem' }}
                  >
                    {catSaving ? '…' : t('chargesCatSave')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Access & Roles */}
          <div className="settings-card">
            <div className="settings-card-header">
              <h2>{t('access')}</h2>
              <p>{t('staffSubtitle')}</p>
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
                    {t('inviteStaff')}
                  </button>
                </PlanGate>
              </div>
              {plan !== 'free' && (
                <div style={{
                  marginTop: 16, padding: '10px 14px',
                  background: '#f0f9ff', border: '1px solid #bae6fd',
                  borderRadius: 8, fontSize: '0.82rem', color: '#0c4a6e', lineHeight: 1.55,
                }}>
                  ℹ️ {t('staffAccessInfo')}
                </div>
              )}
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
                <span>{t('manageSubscription')}</span>
                <span className="danger-zone-chevron">{deleteAccountOpen ? '▲' : '▼'}</span>
              </button>

              {deleteAccountOpen && (
                <div className="danger-zone-body">

                  {/* Cancel subscription */}
                  {sub?.plan && sub.plan !== 'free' && !sub?.cancel_at_period_end && sub?.notes !== 'Complimentary' && (
                    <div className="danger-zone-row">
                      <div>
                        <div className="danger-zone-row-title">{t('cancelSubTitle')}</div>
                        <div className="danger-zone-row-desc">
                          {t('cancelSubDesc')}
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

                  {/* Delete account */}
                  <div className="danger-zone-row">
                    <div>
                      <div className="danger-zone-row-title">{t('deleteAccountTitle')}</div>
                      <div className="danger-zone-row-desc">
                        {t('deleteAccountDesc')}
                      </div>
                    </div>
                    <button
                      className="btn-danger"
                      onClick={() => setShowDeleteAccount(true)}
                    >
                      {t('deleteAccountBtn')}
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
      <ConfirmModal
        isOpen={showCancelModal}
        title={t('cancelSubMoTitle')}
        message={`${t('cancelSubConfirm')} ${sub?.current_period_end ? t('cancelSubWithDate')(PLAN_LABELS[sub?.plan] ?? 'Pro', fmtDate(sub.current_period_end, locale)) : t('cancelSubNoDate')}`}
        confirmLabel={t('confirmCancelSub')}
        cancelLabel={t('keepSubscription')}
        variant="danger"
        onConfirm={handleCancelSubscription}
        onCancel={() => setShowCancelModal(false)}
      />

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

      {removePropertyTarget && (
        <RemovePropertyModal
          property={removePropertyTarget}
          onClose={() => setRemovePropertyTarget(null)}
          onSuccess={(deletedId, remaining) => {
            removePropertyFromList(deletedId, remaining);
            setRemovePropertyTarget(null);
            showToast(t('propRemovedToast')(removePropertyTarget.name));
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
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
  const t = useT();
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
        <label className="form-label" style={{ fontSize: '0.82rem' }}>{t('propNameLabel')} *</label>
        <input
          name="name" className="form-control" autoFocus required
          value={form.name} onChange={handleChange}
          placeholder="e.g. La Maison du Soleil"
          style={{ marginTop: 4 }}
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: '0.82rem' }}>{t('typeLabel')}</label>
        <select name="type" className="form-control" value={form.type} onChange={handleChange} style={{ marginTop: 4 }}>
          {PROPERTY_TYPES_LIST.map((tp) => (
            <option key={tp.value} value={tp.value}>{tp.label}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={saving} style={{ fontSize: '0.85rem' }}>
          {saving ? t('saving') : t('saveProperty')}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} style={{ fontSize: '0.85rem' }}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}

// ── DeleteAccountModal ────────────────────────────────────────────────────────

function DeleteAccountModal({ onClose, onSuccess, onError }) {
  const t = useT();
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

// ── RemovePropertyModal ───────────────────────────────────────────────────────

function RemovePropertyModal({ property: prop, onClose, onSuccess, onError }) {
  const t = useT();
  const [confirmText, setConfirmText] = useState('');
  const [loading,     setLoading]     = useState(false);

  const confirmed = confirmText.trim() === prop.name.trim();

  async function handleRemove() {
    if (!confirmed) return;
    setLoading(true);
    try {
      const res  = await apiFetch(`/api/properties/${prop.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        onSuccess(data.deleted_id, data.properties);
      } else {
        onError(data.error || 'Could not remove property.');
        setLoading(false);
      }
    } catch {
      onError('Network error.');
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2>{t('removePropertyTitle')}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: '0.875rem', color: '#991b1b', lineHeight: 1.55,
          }}>
            <strong>{prop.name}</strong>
            {' — '}{t('deleteDataWarning')}
          </div>
          <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: 8 }}>
            {t('typeDeleteConfirm').replace('DELETE', prop.name)}
          </p>
          <input
            className="form-control"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={prop.name}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-secondary" onClick={onClose} disabled={loading}>{t('cancel')}</button>
            <button
              style={{
                background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6,
                padding: '8px 18px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                opacity: confirmed ? 1 : 0.4,
                transition: 'opacity 0.15s',
              }}
              onClick={handleRemove}
              disabled={loading || !confirmed}
            >
              {loading ? t('removing') : t('removePropertyBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const LOCALE_MAP = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', nl: 'nl-NL' };

function fmtDate(iso, locale = 'en') {
  if (!iso) return '—';
  const browserLocale = LOCALE_MAP[locale] || 'en-GB';
  return new Date(iso).toLocaleDateString(browserLocale, { day: 'numeric', month: 'short', year: 'numeric' });
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
          title={t('resetPasswordBtn')}
        >
          {t('resetPasswordBtn')}
        </button>
      )}
    </div>
  );
}
