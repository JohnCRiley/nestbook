import { useState, useEffect, useCallback } from 'react';
import InviteStaffModal from './settings/InviteStaffModal.jsx';
import PlanGate from '../components/PlanGate.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useT } from '../i18n/LocaleContext.jsx';

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
  const [showInvite,  setShowInvite]  = useState(false);

  // Feature toggles live in local state only (no backend yet — persist later)
  const [features, setFeatures] = useState(() =>
    Object.fromEntries(FEATURES.map((f) => [f.key, f.default]))
  );

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiFetch('/api/properties/1').then((r) => r.json()),
      apiFetch('/api/users?property_id=1').then((r) => r.json()),
    ]).then(([p, u]) => {
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
    });
  }, []);

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
      const res = await apiFetch('/api/properties/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const updated = await res.json();
      setProperty(updated);
      showToast('Property settings saved successfully.');
    } catch (err) {
      showToast('Failed to save settings. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFeatureToggle = (key) =>
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleInviteSuccess = (newUser) => {
    setUsers((prev) => [...prev, newUser]);
    setShowInvite(false);
    showToast(`${newUser.name} has been added as ${newUser.role}.`);
  };

  // ── Embed snippet ──────────────────────────────────────────────────────────
  const embedSnippet = `<!-- NestBook Booking Widget -->
<script
  src="https://widget.nestbook.app/embed.js"
  data-property="1"
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

          {/* Access & Roles */}
          <div className="settings-card">
            <div className="settings-card-header">
              <h2>{t('access')}</h2>
              <p>Staff accounts with access to this property</p>
            </div>
            <div className="settings-card-body">
              <div className="user-list">
                {users.map((u) => (
                  <UserRow key={u.id} user={u} t={t} />
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
        </div>

      </div>

      {/* ── Embed widget — full width (Pro feature) ──────────────────────── */}
      <PlanGate requiredPlan="pro">
        <EmbedSection snippet={embedSnippet} />
      </PlanGate>

      {/* ── Modals & toast ───────────────────────────────────────────────── */}
      {showInvite && (
        <InviteStaffModal
          onClose={() => setShowInvite(false)}
          onSuccess={handleInviteSuccess}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </>
  );
}

// ── EmbedSection ──────────────────────────────────────────────────────────────

function EmbedSection({ snippet }) {
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
        <h2>Embed Your Booking Widget</h2>
        <p>Let guests book directly from your own website</p>
      </div>
      <div className="embed-body">
        <p className="embed-desc">
          Copy the snippet below and paste it into the <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, fontSize: '0.85em' }}>&lt;body&gt;</code> of any page on your website
          where you want the booking calendar to appear — your homepage, a "Book Now" page, etc.
        </p>

        <div className="embed-code-wrap">
          <button
            className={`embed-copy-btn${copied ? ' copied' : ''}`}
            onClick={handleCopy}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
          {snippet}
        </div>

        <div className="embed-steps">
          <div className="embed-step">
            <span className="embed-step-num">1</span>
            <span>Copy the snippet above using the Copy button.</span>
          </div>
          <div className="embed-step">
            <span className="embed-step-num">2</span>
            <span>Open your website editor (WordPress, Wix, Squarespace, etc.) and navigate to the page where you want the widget.</span>
          </div>
          <div className="embed-step">
            <span className="embed-step-num">3</span>
            <span>Paste the snippet into the HTML of that page. The widget will appear automatically and match the language and currency set above.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function UserRow({ user, t }) {
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
    </div>
  );
}
