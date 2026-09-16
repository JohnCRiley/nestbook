import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { formatRelativeTime } from '../utils/format.js';
import ChannelConnectWizard from '../components/ChannelConnectWizard.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

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

  // ── Online Travel Agents — Slice CA-4 ──────────────────────────────────
  const [otaChannels, setOtaChannels] = useState([]);
  const [otaLoading,  setOtaLoading]  = useState(false);
  const [showWizard,  setShowWizard]  = useState(false);

  // ── Airbnb OAuth connect — Slice CA-5 ──────────────────────────────────
  const [airbnbConnecting, setAirbnbConnecting] = useState(false);

  // ── Connection management — Slice CA-6 ─────────────────────────────────
  const [channelActionBusyId, setChannelActionBusyId] = useState(null);
  const [channelDeleteTarget, setChannelDeleteTarget] = useState(null);

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

  const fetchOtaChannels = useCallback(() => {
    if (!allowed || !property?.id || !property?.channex_property_id) { setOtaChannels([]); return; }
    setOtaLoading(true);
    apiFetch(`/api/properties/${property.id}/channex/channels`)
      .then((r) => (r.ok ? r.json() : { channels: [] }))
      .then((data) => setOtaChannels(data.channels ?? []))
      .catch(() => setOtaChannels([]))
      .finally(() => setOtaLoading(false));
  }, [allowed, property?.id, property?.channex_property_id]);

  useEffect(() => { fetchOtaChannels(); }, [fetchOtaChannels]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // The public callback (server/routes/channex.js) redirects the browser
  // back here with ?airbnb=success|failed once the two-hop OAuth round-trip
  // lands — read once on mount, then scrub the query string so a later
  // refresh doesn't re-show the toast. Denial/failure partway through the
  // Airbnb flow (or the owner just closing that tab) lands here too, as
  // ?airbnb=failed — never a silent dead end.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const airbnb = params.get('airbnb');
    if (!airbnb) return;
    if (airbnb === 'success') {
      showToast(t('cmOtaAirbnbSuccessToast'));
      fetchOtaChannels();
    } else {
      showToast(t('cmOtaAirbnbFailedToast'), 'error');
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnectAirbnb() {
    if (!property?.id) return;
    setAirbnbConnecting(true);
    try {
      const res = await apiFetch(`/api/properties/${property.id}/channex/airbnb/connection-link`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(t('cmOtaAirbnbGenericError'));
      // Full-page navigation, not a new tab — this is the first hop of a
      // real two-hop OAuth redirect (Airbnb, then Channex's own callback,
      // then back here), not a popup flow.
      window.location.href = data.url;
    } catch (err) {
      showToast(err.message, 'error');
      setAirbnbConnecting(false);
    }
  }

  // Only offered while a channel is still active — the server re-confirms
  // via a real GET that Channex's own side actually stopped syncing before
  // this resolves, never trusting the 200 alone. No confirmation dialog:
  // pausing sync is reversible (the channel can be reactivated), unlike
  // Delete below, which permanently removes the connection.
  async function handleDeactivateChannel(channel) {
    if (!property?.id) return;
    setChannelActionBusyId(channel.id);
    try {
      const res = await apiFetch(
        `/api/properties/${property.id}/channex/channels/${channel.id}/deactivate`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error(t('cmOtaChannelActionError'));
      showToast(t('cmOtaDeactivatedToast'));
      fetchOtaChannels();
    } catch (err) {
      showToast(err.message, 'error');
    }
    setChannelActionBusyId(null);
  }

  // Only offered once a channel is already inactive (Channex itself requires
  // deactivation before it will allow a delete — confirmed live). Permanent
  // and irreversible, so it goes through the same ConfirmModal pattern used
  // for delete elsewhere in the app, unlike the reversible Deactivate above.
  async function handleDeleteChannel() {
    if (!property?.id || !channelDeleteTarget) return;
    const channel = channelDeleteTarget;
    setChannelActionBusyId(channel.id);
    try {
      const res = await apiFetch(
        `/api/properties/${property.id}/channex/channels/${channel.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(t('cmOtaChannelActionError'));
      showToast(t('cmOtaDeletedToast'));
      fetchOtaChannels();
    } catch (err) {
      showToast(err.message, 'error');
    }
    setChannelActionBusyId(null);
    setChannelDeleteTarget(null);
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
  const hasAirbnbChannel = otaChannels.some((c) => c.attributes?.channel === 'AirBNB');

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

          {/* ── Online Travel Agents ──────────────────────────────────────── */}
          <div className="settings-card">
            <div className="settings-card-header">
              <h2>{t('cmOtaTitle')}</h2>
              <p>{t('cmOtaSubtitle')}</p>
            </div>
            <div className="settings-card-body">
              {otaLoading ? (
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('cmLoading')}</p>
              ) : otaChannels.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', margin: '0 0 14px' }}>{t('cmOtaNoConnections')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {otaChannels.map((c) => {
                    const isActive = !!c.attributes?.is_active;
                    const rowBusy = channelActionBusyId === c.id;
                    return (
                      <div
                        key={c.id}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 8,
                          padding: '9px 14px', borderRadius: 8, background: 'var(--section-bg)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.9rem' }}>{c.attributes?.title ?? c.attributes?.channel}</span>
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                            background: isActive ? '#dcfce7' : '#f1f5f9',
                            color:      isActive ? '#166534' : '#64748b',
                          }}>
                            {isActive ? t('cmOtaConnectedBadgeActive') : t('cmOtaConnectedBadgeInactive')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          {isActive ? (
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                              disabled={rowBusy}
                              onClick={() => handleDeactivateChannel(c)}
                            >
                              {rowBusy ? t('cmOtaDeactivating') : t('cmOtaDeactivateBtn')}
                            </button>
                          ) : (
                            <button
                              className="btn-danger-outline"
                              style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                              disabled={rowBusy}
                              onClick={() => setChannelDeleteTarget(c)}
                            >
                              {t('cmOtaDeleteBtn')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setShowWizard(true)}>
                {t('cmOtaConnectBtn')}
              </button>

              {!hasAirbnbChannel && (
                <>
                  <button
                    className="btn-secondary"
                    style={{ width: '100%', marginTop: 10 }}
                    disabled={airbnbConnecting}
                    onClick={handleConnectAirbnb}
                  >
                    {airbnbConnecting ? t('cmOtaAirbnbConnecting') : t('cmOtaAirbnbConnectBtn')}
                  </button>
                  <p className="form-hint" style={{ marginTop: 6, marginBottom: 0 }}>
                    {t('cmOtaAirbnbConsentNote')}
                  </p>
                </>
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

      {showWizard && property?.id && (
        <ChannelConnectWizard
          property={property}
          t={t}
          onClose={() => setShowWizard(false)}
          onConnected={() => { setShowWizard(false); fetchOtaChannels(); showToast(t('cmOtaActivatedMsg')); }}
        />
      )}

      <ConfirmModal
        isOpen={!!channelDeleteTarget}
        title={t('cmOtaDeleteConfirmTitle')}
        message={t('cmOtaDeleteConfirmMsg')(channelDeleteTarget?.attributes?.title ?? channelDeleteTarget?.attributes?.channel ?? '')}
        confirmLabel={t('cmOtaDeleteBtn')}
        cancelLabel={t('cancel')}
        variant="danger"
        busy={channelActionBusyId === channelDeleteTarget?.id}
        onConfirm={handleDeleteChannel}
        onCancel={() => setChannelDeleteTarget(null)}
      />
    </div>
  );
}
