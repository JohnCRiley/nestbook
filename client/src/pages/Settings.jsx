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

const THEMES = [
  { id: 'forest',   label: 'Forest',    primary: '#1a4710', bg: '#f3f7f2' },
  { id: 'royal',    label: 'Navy',      primary: '#1F3A55', bg: '#F0EDE8' },
  { id: 'ember',    label: 'Warm Gold', primary: '#1A2535', bg: '#F5F2EC' },
  { id: 'ruby',     label: 'Ruby',      primary: '#490403', bg: '#F0EDE8' },
  { id: 'sky',      label: 'Sky Blue',  primary: '#4B779B', bg: '#E9EEF1' },
  { id: 'lavender', label: 'Lavender',  primary: '#62598F', bg: '#F0EDE8' },
  { id: 'charcoal', label: 'Charcoal',  primary: '#292929', bg: '#FCFCFC', accent: '#8A0505' },
];

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPERTY_GROUPS = [
  { group: 'Hospitality', options: [
    { value: 'bnb',        label: 'B&B (Bed & Breakfast)' },
    { value: 'guesthouse', label: 'Guest House' },
    { value: 'inn',        label: 'Inn / Pub with rooms' },
    { value: 'hotel',      label: 'Small Hotel' },
    { value: 'hostel',     label: 'Hostel' },
  ]},
  { group: 'Self-catering', options: [
    { value: 'gite',         label: 'Gîte' },
    { value: 'cottage',      label: 'Holiday Cottage' },
    { value: 'villa',        label: 'Villa' },
    { value: 'apartment',    label: 'Holiday Apartment' },
    { value: 'lodge',        label: 'Lodge' },
    { value: 'caravan',      label: 'Static Caravan / Chalet' },
    { value: 'glamping',     label: 'Glamping (Pod / Bell Tent / Yurt)' },
    { value: 'shepherds_hut',label: "Shepherd's Hut" },
    { value: 'treehouse',    label: 'Treehouse' },
    { value: 'narrowboat',   label: 'Narrowboat / Houseboat' },
    { value: 'farmhouse',    label: 'Farmhouse' },
    { value: 'chateau',      label: 'Château / Manor House' },
  ]},
  { group: 'Asian accommodation', options: [
    { value: 'ryokan',      label: 'Ryokan (Japan)' },
    { value: 'minsu',       label: '民宿 Minsu (China/Taiwan)' },
    { value: 'homestay',    label: 'Homestay' },
    { value: 'resort_villa',label: 'Resort Villa' },
  ]},
  { group: 'Other', options: [
    { value: 'other', label: 'Other' },
  ]},
];

const WHOLE_PROPERTY_TYPES = new Set([
  'gite', 'cottage', 'villa', 'apartment', 'lodge',
  'caravan', 'glamping', 'shepherds_hut', 'treehouse',
  'narrowboat', 'farmhouse', 'chateau',
  'ryokan', 'minsu', 'homestay', 'resort_villa',
]);

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
  const [calendarSyncOpen,     setCalendarSyncOpen]     = useState(false);
  const [removePropertyTarget, setRemovePropertyTarget] = useState(null); // property object | null
  const [theme,            setTheme]            = useState('forest');
  const [categories,       setCategories]       = useState([]);
  const [newCatForm,       setNewCatForm]       = useState({ name: '', color: '#64748b', icon: '' });
  const [catSaving,        setCatSaving]        = useState(false);
  const [editingCatId,     setEditingCatId]     = useState(null);
  const [editCatForm,      setEditCatForm]      = useState({ name: '', color: '#64748b' });
  const [catDeleteTarget,  setCatDeleteTarget]  = useState(null);
  const [catTaxInputs,     setCatTaxInputs]     = useState({});
  const [rooms,            setRooms]            = useState([]);
  const [copiedRoomId,     setCopiedRoomId]     = useState(null);
  const [ratePeriods,      setRatePeriods]      = useState([]);
  const [showRatePeriodModal, setShowRatePeriodModal] = useState(false);
  const [editingRatePeriod,   setEditingRatePeriod]   = useState(null); // period object | null
  const [ratePeriodDeleteTarget, setRatePeriodDeleteTarget] = useState(null);

  const [rentalTypeHint, setRentalTypeHint] = useState(null);

  // Bug report form
  const [bugReportingEnabled, setBugReportingEnabled] = useState(false);
  const [reportCategory,    setReportCategory]    = useState('calculation');
  const [reportDescription, setReportDescription] = useState('');
  const [reportStatus,      setReportStatus]      = useState(null); // null | 'success' | 'error'
  const [reportSubmitting,  setReportSubmitting]  = useState(false);

  // Non-persisted feature toggles (widget, email_confirmations, offline)
  const [features, setFeatures] = useState(() =>
    Object.fromEntries(FEATURES.map((f) => [f.key, f.default]))
  );

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProperty?.id) return;
    const catFetch = plan === 'multi'
      ? apiFetch(`/api/charges/categories?property_id=${activeProperty.id}`).then((r) => r.ok ? r.json() : []).catch(() => [])
      : Promise.resolve([]);
    const rpFetch = plan !== 'free'
      ? apiFetch(`/api/rate-periods?property_id=${activeProperty.id}`).then((r) => r.ok ? r.json() : []).catch(() => [])
      : Promise.resolve([]);
    Promise.all([
      apiFetch(`/api/properties/${activeProperty.id}`).then((r) => r.json()),
      apiFetch(`/api/users?property_id=${activeProperty.id}`).then((r) => r.json()),
      apiFetch('/api/stripe/subscription').then((r) => r.json()).catch(() => null),
      catFetch,
      apiFetch(`/api/rooms?property_id=${activeProperty.id}`).then((r) => r.ok ? r.json() : []).catch(() => []),
      rpFetch,
    ]).then(([p, u, s, cats, rms, rp]) => {
      setProperty(p);
      setTheme(p.theme ?? 'forest');
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
        breakfast_included:   p.breakfast_included ? 1 : 0,
        require_deposit:      p.require_deposit    ? 1 : 0,
        deposit_amount:       p.deposit_amount     ?? 0,
        breakfast_price:      p.breakfast_price    ?? 0,
        breakfast_start_time: p.breakfast_start_time ?? '07:00',
        breakfast_end_time:   p.breakfast_end_time   ?? '11:00',
        description:          p.description          ?? '',
        rental_type:          p.rental_type          ?? 'rooms',
        total_capacity:       p.total_capacity       ?? '',
        bedroom_count:        p.bedroom_count        ?? '',
        bathroom_count:       p.bathroom_count       ?? '',
        whole_property_rate:  p.whole_property_rate  ?? '',
        access_method:        p.access_method        ?? '',
        access_code:          p.access_code          ?? '',
        arrival_instructions: p.arrival_instructions ?? '',
        send_access_hours:    p.send_access_hours    ?? 24,
      });
      setUsers(u);
      if (s && !s.error) setSub(s);
      const catArr = Array.isArray(cats) ? cats : [];
      setCategories(catArr);
      setCatTaxInputs(Object.fromEntries(catArr.map(c => [c.id, String(c.tax_rate ?? 0)])));
      setRooms(Array.isArray(rms) ? rms : (rms?.rooms ?? []));
      setRatePeriods(Array.isArray(rp) ? rp : []);
    });
  }, [activeProperty?.id, plan]);

  useEffect(() => {
    apiFetch('/api/error-reports/enabled')
      .then((r) => r.ok ? r.json() : { enabled: false })
      .then(({ enabled }) => setBugReportingEnabled(enabled))
      .catch(() => {});
  }, []);

  // ── Bug report handler ────────────────────────────────────────────────────
  async function handleSubmitReport() {
    setReportSubmitting(true);
    setReportStatus(null);
    try {
      const res = await apiFetch('/api/error-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category:    reportCategory,
          description: reportDescription,
          page_url:    window.location.href,
        }),
      });
      if (res.ok) {
        setReportStatus('success');
        setReportDescription('');
        setReportCategory('calculation');
      } else {
        setReportStatus('error');
      }
    } catch {
      setReportStatus('error');
    } finally {
      setReportSubmitting(false);
    }
  }

  // ── Toast helper ───────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFormChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handlePropertyTypeChange = (type) => {
    const suggestWhole = WHOLE_PROPERTY_TYPES.has(type);
    setForm((f) => ({
      ...f,
      type,
      rental_type: suggestWhole ? 'whole_property' : 'rooms',
    }));
    if (suggestWhole) {
      setRentalTypeHint('We\'ve set this to "Whole property" for this property type. Change it if needed.');
    } else {
      setRentalTypeHint(null);
    }
  };

  const handleThemeChange = async (newTheme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    if (!form || !activeProperty?.id) return;
    try {
      const res = await apiFetch(`/api/properties/${activeProperty.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, theme: newTheme }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProperty(updated);
        setContextProperty(updated);
        updatePropertyInList(updated);
        showToast('Theme updated');
      }
    } catch {}
  };

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
  data-property-id="${activeProperty?.id ?? ''}"
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
                    value={form.type}
                    onChange={e => handlePropertyTypeChange(e.target.value)}>
                    {PROPERTY_GROUPS.map((grp) => (
                      <optgroup key={grp.group} label={grp.group}>
                        {grp.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </FormField>

                <div style={{ marginTop: 16 }}>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    {t('settings.rentalType')}
                  </label>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, rental_type: 'rooms' })}
                      className={`rental-type-btn${form.rental_type === 'rooms' ? ' active' : ''}`}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        <i className="ti ti-bed" /> {t('settings.rentalTypeRooms')}
                      </div>
                      <div style={{ fontSize: '0.78rem', marginTop: 4, opacity: 0.75 }}>
                        {t('settings.rentalTypeRoomsHint')}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, rental_type: 'whole_property' })}
                      className={`rental-type-btn${form.rental_type === 'whole_property' ? ' active' : ''}`}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        <i className="ti ti-home" /> {t('settings.rentalTypeWhole')}
                      </div>
                      <div style={{ fontSize: '0.78rem', marginTop: 4, opacity: 0.75 }}>
                        {t('settings.rentalTypeWholeHint')}
                      </div>
                    </button>
                  </div>

                  {rentalTypeHint && (
                    <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '6px 10px', background: 'var(--tint-bg)', borderRadius: 6 }}>
                      {rentalTypeHint}
                    </div>
                  )}

                  {form.rental_type === 'whole_property' && (
                    <div className="wp-inputs-container">
                      <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          {t('settings.totalCapacity')}
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="form-control"
                          value={form.total_capacity}
                          onChange={e => setForm({ ...form, total_capacity: e.target.value })}
                          placeholder="12"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          {t('settings.bedroomCount')}
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="form-control"
                          value={form.bedroom_count}
                          onChange={e => setForm({ ...form, bedroom_count: e.target.value })}
                          placeholder="6"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          {t('settings.bathroomCount')}
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="form-control"
                          value={form.bathroom_count}
                          onChange={e => setForm({ ...form, bathroom_count: e.target.value })}
                          placeholder="4"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          {t('settings.wholePropertyRate')}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-control"
                          value={form.whole_property_rate}
                          onChange={e => setForm({ ...form, whole_property_rate: e.target.value })}
                          placeholder="450"
                        />
                      </div>
                    </div>
                  )}
                </div>

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

                <FormField label={t('settings.aboutProperty')}>
                  <textarea
                    name="description"
                    className="form-control"
                    rows={3}
                    value={form.description}
                    onChange={handleFormChange}
                    placeholder={t('settings.aboutPropertyHint')}
                    style={{ resize: 'vertical' }}
                  />
                </FormField>

                {property && (
                  <PropertyHeroPhoto
                    property={property}
                    onUpdated={(updated) => {
                      setProperty(updated);
                      setContextProperty(updated);
                      updatePropertyInList(updated);
                    }}
                  />
                )}

                <div className="settings-save-row">
                  <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? t('saving') : t('saveChanges')}
                  </button>
                </div>

              </div>
            </div>
          </div>

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

          {/* Breakfast service hours */}
          {form && activeProperty?.rental_type !== 'whole_property' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>{t('bfTimesLabel')}</h2>
                <p>{t('bfTimesHint')}</p>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>{t('bfStartTimeLabel')}</label>
                    <input
                      type="time"
                      className="form-control"
                      name="breakfast_start_time"
                      value={form.breakfast_start_time}
                      onChange={handleFormChange}
                      style={{ marginTop: 4, maxWidth: 130 }}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>{t('bfEndTimeLabel')}</label>
                    <input
                      type="time"
                      className="form-control"
                      name="breakfast_end_time"
                      value={form.breakfast_end_time}
                      onChange={handleFormChange}
                      style={{ marginTop: 4, maxWidth: 130 }}
                    />
                  </div>
                </div>
                <div className="settings-save-row" style={{ marginTop: 16 }}>
                  <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? t('saving') : t('saveChanges')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Appearance — theme picker */}
          {user?.role === 'owner' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>{t('settings.appearance')}</h2>
                <p>{t('settings.appearanceHint')}</p>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {THEMES.map(th => (
                    <button
                      key={th.id}
                      onClick={() => handleThemeChange(th.id)}
                      title={th.label}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        gap: 6, background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, fontFamily: 'inherit',
                      }}
                    >
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${th.primary} 55%, ${th.accent ?? th.bg} 55%)`,
                        border: theme === th.id
                          ? `3px solid ${th.primary}`
                          : '3px solid transparent',
                        outline: theme === th.id ? `2px solid #fff` : 'none',
                        outlineOffset: -5,
                        boxShadow: theme === th.id
                          ? `0 0 0 2px ${th.primary}`
                          : '0 1px 3px rgba(0,0,0,0.15)',
                        transition: 'box-shadow 0.15s',
                        position: 'relative',
                      }}>
                        {theme === th.id && (
                          <span style={{
                            position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 18, fontWeight: 700,
                            textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                          }}>✓</span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '0.72rem', color: '#475569', fontWeight: theme === th.id ? 700 : 400,
                      }}>{th.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Report an issue */}
          {bugReportingEnabled && (
            <div className="settings-card" style={{ marginTop: 0 }}>
              <div className="settings-card-header">
                <h2><i className="ti ti-bug" /> {t('settings.reportIssue')}</h2>
                <p>{t('settings.reportIssueHint')}</p>
              </div>
              <div className="settings-card-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.55 }}>
                  {t('settings.reportDescription')}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.55 }}>
                  {t('settings.reportExamples')}
                </p>

                <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>
                  {t('settings.reportCategory')}
                </label>
                <select
                  className="form-control"
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value)}
                  style={{ width: '100%', marginBottom: 12 }}
                >
                  <option value="calculation">{t('settings.reportCatCalculation')}</option>
                  <option value="booking">{t('settings.reportCatBooking')}</option>
                  <option value="payment">{t('settings.reportCatPayment')}</option>
                  <option value="display">{t('settings.reportCatDisplay')}</option>
                  <option value="email">{t('settings.reportCatEmail')}</option>
                  <option value="performance">{t('settings.reportCatPerformance')}</option>
                  <option value="other">{t('settings.reportCatOther')}</option>
                </select>

                <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>
                  {t('settings.reportDescriptionLabel')}
                </label>
                <textarea
                  className="form-control"
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  rows={4}
                  placeholder={t('settings.reportPlaceholder')}
                  style={{ width: '100%', marginBottom: 12, resize: 'vertical' }}
                />

                {reportStatus === 'success' && (
                  <div style={{
                    background: 'var(--tint-bg)', color: 'var(--tint-text)',
                    padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 12,
                  }}>
                    <i className="ti ti-check" /> {t('settings.reportSuccess')}
                  </div>
                )}
                {reportStatus === 'error' && (
                  <div style={{
                    background: '#fef2f2', color: '#dc2626',
                    padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 12,
                  }}>
                    <i className="ti ti-x" /> {t('settings.reportError')}
                  </div>
                )}

                <button
                  onClick={handleSubmitReport}
                  disabled={reportSubmitting || reportDescription.trim().length < 10}
                  style={{
                    width: '100%', padding: '10px',
                    background: reportDescription.trim().length < 10 ? 'var(--border)' : 'var(--accent)',
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontWeight: 600, fontFamily: 'inherit',
                    cursor: reportDescription.trim().length < 10 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {reportSubmitting ? t('settings.reportSending') : t('settings.reportSend')}
                </button>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
                  {t('settings.reportContact')}
                </p>
              </div>
            </div>
          )}
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
                {form && activeProperty?.rental_type !== 'whole_property' && (
                  <>
                    <ToggleRow
                      label={t('bfPropertyToggleLabel')}
                      checked={!!form.breakfast_included}
                      onChange={() => setForm((p) => ({ ...p, breakfast_included: p.breakfast_included ? 0 : 1 }))}
                    />
                    <div style={{
                      margin: '2px 0 10px 0', padding: '8px 12px',
                      background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6,
                      fontSize: '0.78rem', color: '#92400e', lineHeight: 1.5,
                    }}>
                      <i className="ti ti-alert-triangle" /> {t('bfPropertyToggleWarn')}
                    </div>
                    <ToggleRow
                      label={t('fDeposit')}
                      desc={t('fDepositSub')}
                      checked={!!form.require_deposit}
                      onChange={() => setForm((p) => ({ ...p, require_deposit: p.require_deposit ? 0 : 1 }))}
                    />
                    {!!form.require_deposit && (
                      <div style={{ padding: '4px 0 14px 0' }}>
                        <label className="form-label" style={{ fontSize: '0.82rem' }}>
                          {t('depositAmount')} ({currencySymbol})
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

          {/* Widget embed code (Pro) */}
          <div style={{ marginTop: 16 }}>
            <PlanGate requiredPlan="pro" title={t('settings.widgetEmbed')} detail={t('settings.widgetEmbedHint')}>
              <EmbedSection snippet={embedSnippet} t={t} propertyId={activeProperty?.id} />
            </PlanGate>
          </div>

          {/* Facebook Booking Button & slug editor — available on all plans */}
          <div style={{ marginTop: 16 }}>
            <FacebookBookingSection
              property={property}
              onSaved={(updated) => { setProperty(updated); setContextProperty(updated); updatePropertyInList(updated); }}
            />
          </div>

          {/* Guest Access — WP mode only */}
          {form && activeProperty?.rental_type === 'whole_property' && (
            <div style={{ marginTop: 16 }}>
              <AccessCodeSection form={form} onChange={handleFormChange} t={t} />
            </div>
          )}

          {/* Seasonal Pricing — rate periods (Pro+) */}
          <div style={{ marginTop: 16 }}>
            <PlanGate requiredPlan="pro" title={t('settings.seasonalPricing')} detail={t('settings.seasonalPricingHint')}>
              <SeasonalPricingSection
                t={t}
                ratePeriods={ratePeriods}
                currencySymbol={currencySymbol}
                onAdd={() => { setEditingRatePeriod(null); setShowRatePeriodModal(true); }}
                onEdit={(p) => { setEditingRatePeriod(p); setShowRatePeriodModal(true); }}
                onDelete={(p) => setRatePeriodDeleteTarget(p)}
                rooms={rooms}
              />
            </PlanGate>
          </div>

          {/* Calendar Sync — iCal export (collapsible) */}
          {(rooms.length > 0 || activeProperty?.rental_type === 'whole_property') && (
            <div className="danger-zone-card" style={{ marginTop: 16 }}>
              <button
                className="danger-zone-toggle"
                onClick={() => setCalendarSyncOpen((o) => !o)}
                aria-expanded={calendarSyncOpen}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span>{t('settings.calendarSync')}</span>
                  {!calendarSyncOpen && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--accent)', opacity: 0.8 }}>
                      {t('settings.calendarSyncHint')}
                    </span>
                  )}
                </div>
                <span className="danger-zone-chevron">{calendarSyncOpen ? '▲' : '▼'}</span>
              </button>

              {calendarSyncOpen && (
                <div className="danger-zone-body" style={{ padding: '16px 20px' }}>
                  {activeProperty?.rental_type === 'whole_property' ? (
                    /* ── Whole property: single iCal feed ── */
                    <>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16, lineHeight: 1.55 }}>
                        {t('settings.icalWholeHint')}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a', marginBottom: 6 }}>
                            {t('settings.icalPropertyLabel')}
                          </div>
                          {property?.ical_token ? (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <input
                                readOnly
                                value={`${window.location.origin}/api/ical/${activeProperty.id}/property/${property.ical_token}`}
                                onClick={(e) => e.target.select()}
                                className="form-control"
                                style={{ flex: 1, minWidth: 220, fontSize: '0.78rem', color: '#475569', fontFamily: 'monospace' }}
                              />
                              <button
                                className="btn-secondary"
                                style={{ flexShrink: 0, fontSize: '0.8rem', padding: '6px 14px' }}
                                onClick={() => {
                                  const url = `${window.location.origin}/api/ical/${activeProperty.id}/property/${property.ical_token}`;
                                  navigator.clipboard.writeText(url).then(() => {
                                    setCopiedRoomId('property');
                                    setTimeout(() => setCopiedRoomId(null), 2000);
                                  });
                                }}
                              >
                                {copiedRoomId === 'property' ? t('settings.copied') : t('settings.copyUrl')}
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Token not yet generated — reload the page to create one.</span>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    /* ── B&B / rooms mode: one URL per room ── */
                    <>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16, lineHeight: 1.55 }}>
                        {t('settings.calendarSyncInstructions')}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {rooms.map((room) => {
                          const icalUrl = room.ical_token
                            ? `${window.location.origin}/api/ical/${room.property_id}/${room.id}/${room.ical_token}`
                            : null;
                          return (
                            <div key={room.id} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a', marginBottom: 6 }}>
                                {room.name}
                              </div>
                              {icalUrl ? (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <input
                                    readOnly
                                    value={icalUrl}
                                    onFocus={(e) => e.target.select()}
                                    className="form-control"
                                    style={{ flex: 1, minWidth: 220, fontSize: '0.78rem', color: '#475569', fontFamily: 'monospace' }}
                                  />
                                  <button
                                    className="btn-secondary"
                                    style={{ flexShrink: 0, fontSize: '0.8rem', padding: '6px 14px' }}
                                    onClick={() => {
                                      navigator.clipboard.writeText(icalUrl).then(() => {
                                        setCopiedRoomId(room.id);
                                        setTimeout(() => setCopiedRoomId(null), 2000);
                                      });
                                    }}
                                  >
                                    {copiedRoomId === room.id ? t('settings.copied') : t('settings.copyUrl')}
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Token not yet generated — save the room to create one.</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '14px 0 0' }}>
                    Paste a URL into <strong>Booking.com → Calendar → Import calendar</strong> or <strong>Airbnb → Availability → Sync calendars</strong>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Subscription */}
          {user?.role === 'owner' && (
            <div className="settings-card" style={{ marginTop: 16 }}>
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

                  {sub?.plan !== 'free' && (
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      {sub?.cancel_at_period_end
                        ? <span style={{ color: '#dc2626' }}>
                            {t('cancelsOn')} {fmtDate(sub?.current_period_end, locale) || t('billingDateUnavailable')}
                          </span>
                        : <>{t('nextBillingDate')} <strong style={{ color: '#0f172a' }}>{fmtDate(sub?.current_period_end, locale) || t('billingDateUnavailable')}</strong></>
                      }
                    </div>
                  )}

                  {!!sub?.cancel_at_period_end && (
                    <div style={{ fontSize: '0.8rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' }}>
                      {t('subCancelScheduled')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Service Categories — Multi plan, owner only */}
          {plan === 'multi' && user?.role === 'owner' && (
            <div className="settings-card" style={{ marginTop: 16 }}>
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
                      padding: '8px 0', borderBottom: '1px solid #f1f5f9',
                    }}>
                      {editingCatId === cat.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            value={editCatForm.name}
                            onChange={(e) => setEditCatForm((f) => ({ ...f, name: e.target.value }))}
                            className="form-control"
                            style={{ flex: 2, minWidth: 100, fontSize: '0.85rem', padding: '4px 8px' }}
                          />
                          <input
                            type="color"
                            value={editCatForm.color}
                            onChange={(e) => setEditCatForm((f) => ({ ...f, color: e.target.value }))}
                            style={{ width: 36, height: 30, border: 'none', cursor: 'pointer', padding: 0, borderRadius: 4 }}
                          />
                          <button
                            className="btn-primary"
                            style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                            disabled={!editCatForm.name.trim()}
                            onClick={async () => {
                              console.log('[categories/edit] Saving:', cat.id, editCatForm.name);
                              const res = await apiFetch(`/api/charges/categories/${cat.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ...editCatForm, property_id: activeProperty?.id }),
                              });
                              if (res.ok) {
                                const updated = await res.json();
                                setCategories((prev) => prev.map((c) => c.id === cat.id ? updated : c));
                                setEditingCatId(null);
                              } else {
                                const body = await res.json().catch(() => ({}));
                                showToast(body.error ?? 'Failed to save category.', 'error');
                              }
                            }}
                          >
                            {t('saveChanges')}
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '0.8rem', padding: '4px 10px', border: '1px solid var(--border)' }}
                            onClick={() => setEditingCatId(null)}
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                            <span style={{
                              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                              background: cat.color, flexShrink: 0,
                            }} />
                            <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{cat.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: '#64748b' }}>
                              {t('chargesCatTaxRate')}
                              <input
                                type="number"
                                min="0" max="100" step="0.1"
                                value={catTaxInputs[cat.id] ?? '0'}
                                onChange={e => setCatTaxInputs(prev => ({ ...prev, [cat.id]: e.target.value }))}
                                onBlur={async () => {
                                  const newRate = Math.max(0, Math.min(100, parseFloat(catTaxInputs[cat.id]) || 0));
                                  if (newRate === (cat.tax_rate ?? 0)) return;
                                  const res = await apiFetch(`/api/charges/categories/${cat.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: cat.name, color: cat.color, tax_rate: newRate, property_id: activeProperty?.id }),
                                  });
                                  if (res.ok) {
                                    const updated = await res.json();
                                    setCategories(prev => prev.map(c => c.id === cat.id ? updated : c));
                                    setCatTaxInputs(prev => ({ ...prev, [cat.id]: String(updated.tax_rate ?? 0) }));
                                  } else {
                                    setCatTaxInputs(prev => ({ ...prev, [cat.id]: String(cat.tax_rate ?? 0) }));
                                  }
                                }}
                                style={{
                                  width: 58, padding: '2px 6px', fontSize: '0.82rem',
                                  border: '1px solid #e2e8f0', borderRadius: 4,
                                  fontFamily: 'inherit', textAlign: 'right',
                                }}
                              />
                            </label>
                            <button
                              onClick={() => { setEditingCatId(cat.id); setEditCatForm({ name: cat.name, color: cat.color }); }}
                              style={{
                                background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                                fontSize: '0.8rem', fontFamily: 'inherit', padding: '2px 6px', borderRadius: 4,
                              }}
                            >
                              {t('edit')}
                            </button>
                            <button
                              onClick={() => setCatDeleteTarget(cat)}
                              style={{
                                background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                                fontSize: '0.8rem', fontFamily: 'inherit', padding: '2px 6px', borderRadius: 4,
                              }}
                            >
                              {t('chargesCatDelete')}
                            </button>
                          </div>
                        </div>
                      )}
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
                        body: JSON.stringify({ ...newCatForm, property_id: activeProperty?.id }),
                      });
                      if (res.ok) {
                        const cat = await res.json();
                        setCategories((prev) => [...prev, cat]);
                        setCatTaxInputs((prev) => ({ ...prev, [cat.id]: String(cat.tax_rate ?? 0) }));
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
          <div className="settings-card" style={{ marginTop: 16 }}>
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
                <PlanGate requiredPlan="pro" title={t('settings.accessRolesHint')} detail={t('settings.staffHint')}>
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
                  ℹ️ {t('settings.staffHint')}
                </div>
              )}
            </div>
          </div>

          {/* Manage Subscription — destructive actions accordion */}
          {user?.role === 'owner' && (
            <div className="danger-zone-card" style={{ marginTop: 16 }}>
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

                  {/* Cancel subscription — only shown for active paid plans */}
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

                  {/* Delete account */}
                  <div className="danger-zone-row">
                    <div>
                      <div className="danger-zone-row-title">{t('deleteAccountOnly')}</div>
                      <div className="danger-zone-row-desc">
                        {t('deleteAccountExplain')}
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

      {/* ── Modals & toast ───────────────────────────────────────────────── */}
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

      {showRatePeriodModal && (
        <RatePeriodModal
          t={t}
          currencySymbol={currencySymbol}
          period={editingRatePeriod}
          propertyId={activeProperty?.id}
          rooms={rooms}
          onClose={() => setShowRatePeriodModal(false)}
          onSave={(saved) => {
            setRatePeriods((prev) =>
              editingRatePeriod
                ? prev.map((p) => (p.id === saved.id ? saved : p))
                : [...prev, saved]
            );
            setShowRatePeriodModal(false);
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!ratePeriodDeleteTarget}
        title={t('seasonalPricingTitle')}
        message={t('ratePeriodDeleteConfirm')(ratePeriodDeleteTarget?.name ?? '')}
        confirmLabel={t('ratePeriodDelete')}
        cancelLabel={t('cancel')}
        variant="danger"
        onConfirm={async () => {
          const res = await apiFetch(`/api/rate-periods/${ratePeriodDeleteTarget.id}`, { method: 'DELETE' });
          if (res.ok || res.status === 204) {
            setRatePeriods((prev) => prev.filter((p) => p.id !== ratePeriodDeleteTarget.id));
          }
          setRatePeriodDeleteTarget(null);
        }}
        onCancel={() => setRatePeriodDeleteTarget(null)}
      />

      <ConfirmModal
        isOpen={!!catDeleteTarget}
        title={t('chargesCatTitle')}
        message={t('chargesCatDeleteConfirm')(catDeleteTarget?.name ?? '')}
        confirmLabel={t('chargesCatDelete')}
        cancelLabel={t('cancel')}
        variant="danger"
        onConfirm={async () => {
          console.log('[categories/delete] id:', catDeleteTarget.id);
          const res = await apiFetch(
            `/api/charges/categories/${catDeleteTarget.id}?property_id=${activeProperty?.id}`,
            { method: 'DELETE' },
          );
          if (res.ok) {
            setCategories((prev) => prev.filter((c) => c.id !== catDeleteTarget.id));
            setCatDeleteTarget(null);
          } else {
            const body = await res.json().catch(() => ({}));
            showToast(body.error ?? 'Failed to delete category.', 'error');
            setCatDeleteTarget(null);
          }
        }}
        onCancel={() => setCatDeleteTarget(null)}
      />
    </>
  );
}

// ── AccessCodeSection ─────────────────────────────────────────────────────────

const ACCESS_METHOD_OPTIONS = ['code', 'keybox', 'keyed', 'app', 'other'];

function AccessCodeSection({ form, onChange, t }) {
  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <h2>{t('settings.accessTitle')}</h2>
      </div>
      <div className="settings-card-body">
        <div className="settings-field">
          <label className="settings-label">{t('settings.accessMethodLabel')}</label>
          <select
            name="access_method"
            className="settings-input"
            value={form.access_method ?? ''}
            onChange={onChange}
          >
            <option value="">—</option>
            {ACCESS_METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="settings-field">
          <label className="settings-label">{t('settings.accessCodeLabel')}</label>
          <input
            type="text"
            name="access_code"
            className="settings-input"
            value={form.access_code ?? ''}
            onChange={onChange}
            placeholder="e.g. 1234"
          />
        </div>
        <div className="settings-field">
          <label className="settings-label">{t('settings.accessInstructionsLabel')}</label>
          <textarea
            name="arrival_instructions"
            className="settings-input"
            value={form.arrival_instructions ?? ''}
            onChange={onChange}
            rows={4}
            placeholder={t('settings.accessInstructionsHint')}
            style={{ resize: 'vertical' }}
          />
        </div>
        <div className="settings-field">
          <label className="settings-label">{t('settings.accessSendHoursLabel')}</label>
          <input
            type="number"
            name="send_access_hours"
            className="settings-input"
            value={form.send_access_hours ?? 24}
            onChange={onChange}
            min={1}
            max={168}
            style={{ maxWidth: 120 }}
          />
        </div>
      </div>
    </div>
  );
}

// ── EmbedSection ──────────────────────────────────────────────────────────────

function EmbedSection({ snippet, t, propertyId }) {
  const [copied,   setCopied]   = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(String(propertyId)).then(() => {
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 2000);
    });
  };

  return (
    <div className="embed-section">
      <div className="embed-header">
        <h2>{t('embedTitle')}</h2>
        <p>{t('embedSub')}</p>
      </div>
      <div className="embed-body">
        {propertyId != null && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14, fontSize: '0.82rem', color: '#6b7280' }}>
            <span>{t('propIdLabel')}:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#374151' }}>{propertyId}</span>
            <button
              onClick={handleCopyId}
              style={{
                padding: '2px 9px', borderRadius: 4,
                border: '1px solid #e2e8f0', background: '#f8fafc',
                cursor: 'pointer', fontSize: '0.75rem',
                color: idCopied ? '#16a34a' : '#64748b', fontWeight: 600,
              }}
            >
              {idCopied ? t('embedCopied') : t('embedCopy')}
            </button>
            <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{t('propIdHint')}</span>
          </div>
        )}
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

// ── FacebookBookingSection ────────────────────────────────────────────────────

function FacebookBookingSection({ property, onSaved }) {
  const t = useT();
  const [slug,       setSlug]       = useState(property?.booking_slug ?? '');
  const [slugError,  setSlugError]  = useState('');
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugSaved,  setSlugSaved]  = useState(false);
  const [urlCopied,  setUrlCopied]  = useState(false);

  // Sync slug from property when it changes (e.g. after parent re-loads)
  useEffect(() => {
    setSlug(property?.booking_slug ?? '');
  }, [property?.booking_slug]);

  const bookingUrl  = `https://nestbook.io/book/${slug || property?.booking_slug || property?.id}`;
  const slugChanged = slug !== (property?.booking_slug ?? '');

  const handleSlugChange = (e) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(raw);
    setSlugError('');
    setSlugSaved(false);
  };

  const handleSaveSlug = async () => {
    if (!slug) { setSlugError('URL cannot be empty.'); return; }
    if (!/^[a-z0-9-]+$/.test(slug)) { setSlugError('Use lowercase letters, numbers and hyphens only.'); return; }
    if (slug.length > 60) { setSlugError('Maximum 60 characters.'); return; }
    setSlugSaving(true);
    setSlugError('');
    try {
      const res = await apiFetch(`/api/properties/${property.id}/slug`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_slug: slug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSlugError(data.error ?? 'Could not save. Please try again.');
      } else {
        const updated = await res.json();
        setSlugSaved(true);
        setTimeout(() => setSlugSaved(false), 3000);
        onSaved && onSaved(updated);
      }
    } catch {
      setSlugError('Network error. Please try again.');
    }
    setSlugSaving(false);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(bookingUrl).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  };

  return (
    <div className="embed-section">
      <div className="embed-header">
        <h2>{t('settings.facebookBtn')}</h2>
        <p>{t('settings.facebookBtnHint')}</p>
      </div>
      <div className="embed-body">

        {/* ── Slug editor ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {t('settings.bookingPageUrl')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
            <span style={{
              padding: '8px 11px', background: '#f1f5f9', border: '1px solid #e2e8f0',
              borderRight: 'none', borderRadius: '7px 0 0 7px',
              fontSize: '0.82rem', color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              nestbook.io/book/
            </span>
            <input
              value={slug}
              onChange={handleSlugChange}
              maxLength={60}
              placeholder="your-property-name"
              style={{
                flex: '1 1 120px', minWidth: 80, padding: '8px 10px',
                border: `1px solid ${slugError ? '#fca5a5' : '#e2e8f0'}`,
                borderRight: 'none', fontSize: '0.82rem', fontFamily: 'monospace',
                outline: 'none', background: '#fff', color: '#1e293b',
              }}
            />
            <button
              onClick={handleSaveSlug}
              disabled={slugSaving || !slugChanged}
              style={{
                padding: '8px 16px', border: '1px solid',
                borderColor: slugSaved ? 'var(--accent)' : slugChanged ? 'var(--accent)' : '#e2e8f0',
                background: slugSaved ? 'var(--tint-bg)' : slugChanged ? 'var(--accent)' : '#f8fafc',
                color: slugSaved ? 'var(--tint-text)' : slugChanged ? '#fff' : '#94a3b8',
                fontWeight: 600, fontSize: '0.82rem',
                cursor: (slugSaving || !slugChanged) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', borderRadius: '0 7px 7px 0',
                transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {slugSaving ? 'Saving…' : slugSaved ? '✓ Saved' : t('settings.slugSave')}
            </button>
          </div>
          {slugError && (
            <div style={{ marginTop: 5, fontSize: '0.77rem', color: '#dc2626' }}>{slugError}</div>
          )}
        </div>

        {/* ── Copy URL row ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <code style={{
            flex: '1 1 200px', padding: '8px 12px', borderRadius: 7,
            background: '#f8fafc', border: '1px solid #e2e8f0',
            fontSize: '0.8rem', fontFamily: 'monospace',
            color: '#334155', wordBreak: 'break-all',
          }}>
            {bookingUrl}
          </code>
          <button
            onClick={handleCopyUrl}
            style={{
              padding: '8px 14px', borderRadius: 7, border: '1px solid #e2e8f0',
              background: urlCopied ? 'var(--tint-bg)' : '#fff',
              color: urlCopied ? 'var(--tint-text)' : '#64748b',
              fontWeight: 600, fontSize: '0.82rem',
              cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {urlCopied ? t('settings.slugCopied') : t('settings.slugCopy')}
          </button>
        </div>

        {property?.plan === 'free' && (
          <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '8px 0 0', lineHeight: 1.5 }}>
            {t('settings.webpageFreeTip')}
          </p>
        )}

        {/* ── Facebook instructions ── */}
        <div className="embed-steps">
          {[
            t('settings.facebookStep1'),
            t('settings.facebookStep2'),
            t('settings.facebookStep3'),
            t('settings.facebookStep4'),
            t('settings.facebookStep5'),
          ].map((step, i) => (
            <div key={i} className="embed-step">
              <span className="embed-step-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ── AddPropertyForm ───────────────────────────────────────────────────────────

// Reuse the same groups defined at top of file

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
          {PROPERTY_GROUPS.map((grp) => (
            <optgroup key={grp.group} label={grp.group}>
              {grp.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </optgroup>
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
        onError(data.error || t('propRemoveError'));
        setLoading(false);
      }
    } catch {
      onError(t('networkError'));
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
  if (!iso || iso === '0') return null;
  const browserLocale = LOCALE_MAP[locale] || 'en-GB';
  // Stripe returns Unix timestamps (seconds); multiply by 1000 for JS Date
  const d = typeof iso === 'number' ? new Date(iso * 1000) : new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() < 2020) return null;
  return d.toLocaleDateString(browserLocale, { day: 'numeric', month: 'short', year: 'numeric' });
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

// ── SeasonalPricingSection ────────────────────────────────────────────────────

function isRatePeriodActive(p) {
  const today = new Date();
  const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const iso  = today.toISOString().slice(0, 10);
  const annual = p.date_from.length === 5;
  if (annual) {
    if (p.date_from <= p.date_to) return mmdd >= p.date_from && mmdd <= p.date_to;
    return mmdd >= p.date_from || mmdd <= p.date_to;
  }
  return iso >= p.date_from && iso <= p.date_to;
}

function SeasonalPricingSection({ t, ratePeriods, currencySymbol, onAdd, onEdit, onDelete }) {
  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <h2>{t('seasonalPricingTitle')}</h2>
        <p>{t('seasonalPricingSubtitle')}</p>
      </div>
      <div className="settings-card-body">
        {ratePeriods.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 14px' }}>
            {t('ratePeriodNone')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {ratePeriods.map((p) => {
              const active = isRatePeriodActive(p);
              const roomRates = p.roomRates ?? [];
              const preview = roomRates.slice(0, 3).map(
                rr => `${rr.room_name}: ${currencySymbol}${Number(rr.amount).toFixed(0)}`
              ).join(' · ');
              const extra = roomRates.length > 3 ? ` · +${roomRates.length - 3} more` : '';
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8,
                  background: active ? '#fefce8' : '#f8fafc',
                  border: `1px solid ${active ? '#fcd34d' : 'var(--border)'}`,
                  gap: 10, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{p.name}</span>
                      {active && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, background: '#fef08a',
                          color: '#854d0e', padding: '2px 8px', borderRadius: 12,
                        }}>
                          {t('ratePeriodActiveNow')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                      {p.date_from} → {p.date_to}
                      {p.priority > 0 && ` · priority ${p.priority}`}
                    </div>
                    {(preview || p.rate_value > 0) && (
                      <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 3 }}>
                        {preview}{extra}
                        {p.rate_value > 0 && (
                          <span style={{ color: '#94a3b8' }}>
                            {preview ? ' · ' : ''}default: {currencySymbol}{Number(p.rate_value).toFixed(0)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn-ghost-sm" onClick={() => onEdit(p)}>
                      {t('ratePeriodEdit')}
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.8rem', padding: '2px 6px', borderRadius: 4 }}
                      onClick={() => onDelete(p)}
                    >
                      {t('ratePeriodDelete')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button className="btn-secondary" style={{ fontSize: '0.85rem' }} onClick={onAdd}>
          {t('ratePeriodAdd')}
        </button>
      </div>
    </div>
  );
}

// ── RatePeriodModal ───────────────────────────────────────────────────────────

function RatePeriodModal({ t, currencySymbol, period, propertyId, rooms, onClose, onSave }) {
  const initialRoomRates = {};
  for (const rr of (period?.roomRates ?? [])) {
    initialRoomRates[rr.room_id] = String(rr.amount);
  }

  const [form, setForm] = useState(period ? {
    name:        period.name,
    date_from:   period.date_from,
    date_to:     period.date_to,
    priority:    String(period.priority),
    defaultRate: String(period.rate_value),
    roomRates:   initialRoomRates,
  } : {
    name: '', date_from: '', date_to: '', priority: '0', defaultRate: '0', roomRates: {},
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const isEdit = !!period;

  const hasData = !!(
    form.name || form.date_from || form.date_to ||
    Object.values(form.roomRates).some(v => parseFloat(v) > 0)
  );

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (hasData) return;
      onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [hasData, onClose]);

  function handleBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    if (hasData) return;
    onClose();
  }

  function setRoomRate(roomId, value) {
    setForm(prev => ({ ...prev, roomRates: { ...prev.roomRates, [roomId]: value } }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.date_from || !form.date_to) {
      setError(t('requiredFields'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const roomRatesPayload = (rooms ?? [])
        .filter(r => parseFloat(form.roomRates[r.id]) > 0)
        .map(r => ({ roomId: r.id, amount: parseFloat(form.roomRates[r.id]) }));

      const res = await apiFetch(
        isEdit ? `/api/rate-periods/${period.id}` : '/api/rate-periods',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: propertyId,
            name:        form.name.trim(),
            date_from:   form.date_from.trim(),
            date_to:     form.date_to.trim(),
            rate_type:   'flat',
            rate_value:  parseFloat(form.defaultRate) || 0,
            priority:    Number(form.priority ?? 0),
            roomRates:   roomRatesPayload,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return; }
      onSave(data);
    } catch (err) {
      setError(err.message || t('networkError'));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>{isEdit ? t('ratePeriodEdit') : t('ratePeriodAdd')}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Name + dates + priority */}
            <div className="form-group">
              <label className="form-label">{t('ratePeriodName')} *</label>
              <input className="form-control" value={form.name} autoFocus
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder={t('ratePeriodNamePlaceholder')} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">{t('ratePeriodFrom')} *</label>
                <input className="form-control" value={form.date_from}
                  onChange={e => setForm(p => ({ ...p, date_from: e.target.value }))}
                  placeholder="MM-DD or YYYY-MM-DD" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('ratePeriodTo')} *</label>
                <input className="form-control" value={form.date_to}
                  onChange={e => setForm(p => ({ ...p, date_to: e.target.value }))}
                  placeholder="MM-DD or YYYY-MM-DD" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('ratePeriodPriority')}</label>
                <input type="number" className="form-control" value={form.priority} min="0" step="1"
                  onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                  placeholder="0" />
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: -8 }}>
              {t('ratePeriodFormatHint')}
            </div>

            {/* Per-room pricing table */}
            {(rooms ?? []).length > 0 && (
              <div>
                <div style={{
                  fontSize: '0.78rem', fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  marginBottom: 8, paddingBottom: 6,
                  borderBottom: '2px solid var(--border)',
                }}>
                  Room Pricing
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* Header row */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 90px 130px',
                    padding: '4px 6px', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8',
                  }}>
                    <span>Room</span>
                    <span>Default</span>
                    <span>Seasonal rate</span>
                  </div>
                  {(rooms ?? []).map(room => (
                    <div key={room.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 90px 130px',
                      alignItems: 'center', padding: '5px 6px',
                      borderBottom: '1px solid #f1f5f9',
                    }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>
                        {room.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        {currencySymbol}{room.price_per_night}/nt
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{currencySymbol}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={form.roomRates[room.id] ?? ''}
                          onChange={e => setRoomRate(room.id, e.target.value)}
                          style={{
                            width: 80, padding: '4px 8px', fontSize: '0.85rem',
                            border: '1.5px solid #e2e8f0', borderRadius: 5,
                            fontFamily: 'inherit', outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Default fallback rate */}
                <div style={{
                  marginTop: 10, paddingTop: 10,
                  borderTop: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                    Default rate for unlisted rooms ({currencySymbol}):
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={form.defaultRate}
                    onChange={e => setForm(p => ({ ...p, defaultRate: e.target.value }))}
                    style={{
                      width: 90, padding: '4px 8px', fontSize: '0.85rem',
                      border: '1.5px solid #e2e8f0', borderRadius: 5,
                      fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>0 = use room's default price</span>
                </div>
              </div>
            )}

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t('saving') : t('ratePeriodSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PropertyHeroPhoto ─────────────────────────────────────────────────────────

function PropertyHeroPhoto({ property, onUpdated }) {
  const t = useT();
  const [uploading, setUploading] = useState(false);
  const [removing,  setRemoving]  = useState(false);
  const [error,     setError]     = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const res = await apiFetch(`/api/properties/${property.id}/hero-photo`, { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Upload failed.');
        return;
      }
      onUpdated(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/properties/${property.id}/hero-photo`, { method: 'DELETE' });
      if (res.ok) onUpdated(await res.json());
    } catch {}
    setRemoving(false);
  };

  return (
    <div className="form-group">
      <label className="form-label">{t('settings.heroPhoto')}</label>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 8px' }}>{t('settings.heroPhotoHint')}</p>
      {error && <div style={{ color: '#dc2626', fontSize: '0.78rem', marginBottom: 6 }}>{error}</div>}

      {property.hero_photo ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <img
            src={`/uploads/properties/${property.hero_photo}`}
            alt="Property hero"
            style={{
              width: 160, height: 90, objectFit: 'cover',
              borderRadius: 6, border: '1px solid var(--border)',
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
              fontSize: '0.82rem', cursor: uploading ? 'wait' : 'pointer',
              background: '#fff', color: '#374151', fontWeight: 500,
            }}>
              <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
              {uploading ? 'Uploading…' : 'Change photo'}
            </label>
            <button
              onClick={handleRemove}
              disabled={removing}
              style={{
                background: 'none', border: 'none', color: '#dc2626',
                fontSize: '0.82rem', cursor: 'pointer', padding: '6px 4px',
                fontFamily: 'inherit',
              }}
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      ) : (
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 6,
          border: '1.5px dashed var(--border)',
          fontSize: '0.82rem', cursor: uploading ? 'wait' : 'pointer',
          color: 'var(--text-muted)', background: '#f8fafc', fontWeight: 500,
        }}>
          <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
          <i className="ti ti-camera-plus" />
          {uploading ? 'Uploading…' : t('settings.uploadPhoto')}
        </label>
      )}
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
        {t('settings.uploadPhotoHint')}
      </div>
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
