import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { formatRelativeTime } from '../utils/format.js';

export default function ChannelManager() {
  const t = useT();
  const { property, setProperty, updatePropertyInList, locale } = useLocale();
  const { user } = useAuth();
  const plan = usePlan();

  const [status,    setStatus]    = useState(null); // { units, last_availability_sync_at, last_rate_sync_at, last_photos_sync_at, last_description_sync_at, last_facilities_sync_at, last_contact_sync_at }
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [toast,     setToast]     = useState(null);

  // Gate mirrors Sidebar.jsx's canSeeChannelManager() — the nav item is hidden
  // when this is false, but a direct URL visit must not render the page either.
  const allowed = user?.role === 'owner' && (plan === 'pro' || plan === 'multi') && !!user?.has_channel_manager_addon;

  const fetchStatus = useCallback(() => {
    if (!allowed || !property?.id) { setLoading(false); return; }
    setLoading(true);
    apiFetch(`/api/properties/${property.id}/channex-status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [allowed, property?.id]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleConnectToggle() {
    if (!property?.id) return;
    const connected = !!property.channex_property_id;
    setBusy(true);
    try {
      const res = await apiFetch(
        `/api/properties/${property.id}/channex-${connected ? 'disconnect' : 'connect'}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('cmRequestFailed'));
      const fresh = await apiFetch(`/api/properties/${property.id}`).then((r) => r.json());
      setProperty(fresh);
      updatePropertyInList(fresh);
      showToast(connected ? t('cmDisconnectedToast') : t('cmConnectedToast'));
      fetchStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
    setBusy(false);
  }

  // Re-sends the property's CURRENT title/currency/property_type/timezone/
  // country — for correcting details that changed (or weren't set yet) after
  // the initial connect, without disconnecting first (which would delete
  // every room mapping below).
  async function handleResync() {
    if (!property?.id) return;
    setResyncing(true);
    try {
      const res = await apiFetch(`/api/properties/${property.id}/channex-resync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('cmRequestFailed'));
      showToast(t('cmResyncedToast'));
      fetchStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
    setResyncing(false);
  }

  if (!allowed) return null;

  const connected = !!property?.channex_property_id;
  const units = status?.units ?? [];
  const allUnmapped = connected && !loading && units.length > 0 && units.every((u) => !u.mapped);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 720, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1>{t('channelManager')}</h1>
        <div className="page-date">{t('cmSubtitle')}</div>
      </div>

      {/* ── Connection status ─────────────────────────────────────────────── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2>{t('cmConnectionStatus')}</h2>
        </div>
        <div className="settings-card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{
              display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
              background: connected ? '#16a34a' : '#94a3b8', flexShrink: 0,
            }} />
            <span style={{ fontWeight: 700 }}>
              {connected ? t('cmConnected') : t('cmNotConnected')}
            </span>
          </div>

          {connected ? (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              {t('cmConnectionId')(property.channex_property_id)}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, marginTop: 0 }}>
              {t('cmNotConnectedExplainer')}
            </p>
          )}

          <button
            className={connected ? 'btn-danger-outline' : 'btn-primary'}
            style={{ width: '100%' }}
            disabled={busy}
            onClick={handleConnectToggle}
          >
            {busy
              ? '…'
              : connected ? t('cmDisconnectBtn') : t('cmConnectBtn')}
          </button>

          {connected && (
            <>
              <button
                className="btn-secondary"
                style={{ width: '100%', marginTop: 10 }}
                disabled={resyncing}
                onClick={handleResync}
              >
                {resyncing ? '…' : t('cmResyncBtn')}
              </button>
              <p className="form-hint" style={{ marginTop: 6, marginBottom: 0 }}>
                {t('cmResyncHint')}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Timezone nudge ────────────────────────────────────────────────── */}
      {!property?.timezone && (
        <div className="settings-card" style={{ borderLeft: '3px solid #b45309' }}>
          <div className="settings-card-body">
            <p style={{ color: '#b45309', margin: '0 0 8px' }}>
              {t('settings.timezoneChannexNudge')}
            </p>
            <a href="/app/settings" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {t('cmTimezoneCta')}
            </a>
          </div>
        </div>
      )}

      {/* ── Contact-details nudge ─────────────────────────────────────────── */}
      {!property?.email && !property?.phone && (
        <div className="settings-card" style={{ borderLeft: '3px solid #b45309' }}>
          <div className="settings-card-body">
            <p style={{ color: '#b45309', margin: '0 0 8px' }}>
              {t('cmContactNudge')}
            </p>
            <a href="/app/settings" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {t('cmTimezoneCta')}
            </a>
          </div>
        </div>
      )}

      {connected && (
        <>
          {/* ── Room mapping ──────────────────────────────────────────────── */}
          <div className="settings-card">
            <div className="settings-card-header">
              <h2>{t('cmMappingTitle')}</h2>
              <p>{t('cmMappingSubtitle')}</p>
            </div>
            <div className="settings-card-body">
              {loading ? (
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('cmLoading')}</p>
              ) : units.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('cmNoUnits')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {units.map((u) => (
                    <div
                      key={`${u.ref_type}:${u.ref_id ?? ''}`}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 14px', borderRadius: 8, background: 'var(--section-bg)',
                      }}
                    >
                      <span style={{ fontSize: '0.9rem' }}>{u.title}</span>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                        background: u.orphaned ? '#fee2e2' : u.mapped ? '#dcfce7' : '#f1f5f9',
                        color:      u.orphaned ? '#991b1b' : u.mapped ? '#166534' : '#64748b',
                      }}>
                        {u.orphaned ? t('cmOrphaned') : u.mapped ? t('cmMapped') : t('cmNotMapped')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Recent activity ───────────────────────────────────────────── */}
          <div className="settings-card">
            <div className="settings-card-header">
              <h2>{t('cmActivityTitle')}</h2>
            </div>
            <div className="settings-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                {t('cmAvailabilityUpdated')(formatRelativeTime(status?.last_availability_sync_at, locale))}
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                {t('cmRatesUpdated')(formatRelativeTime(status?.last_rate_sync_at, locale))}
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                {t('cmPhotosUpdated')(formatRelativeTime(status?.last_photos_sync_at, locale))}
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                {t('cmDescriptionUpdated')(formatRelativeTime(status?.last_description_sync_at, locale))}
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                {t('cmFacilitiesUpdated')(formatRelativeTime(status?.last_facilities_sync_at, locale))}
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                {t('cmContactUpdated')(formatRelativeTime(status?.last_contact_sync_at, locale))}
              </p>
            </div>
          </div>

          {/* ── Basic troubleshooting ─────────────────────────────────────── */}
          {allUnmapped && (
            <div className="settings-card" style={{ borderLeft: '3px solid #b45309' }}>
              <div className="settings-card-header">
                <h2>{t('cmTroubleshootTitle')}</h2>
              </div>
              <div className="settings-card-body">
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{t('cmTroubleshootMsg')}</p>
              </div>
            </div>
          )}
        </>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
