import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';

// Slice CA-4 — generic, descriptor-driven Channel Manager connect wizard.
// Renders a connect form for WHATEVER adapter the owner picks, driven entirely
// by that adapter's own `params`/`rate_params` descriptor (from
// GET /api/properties/:id/channex/adapters) — no adapter-specific UI code.
//
// Proven end-to-end ONLY against Booking.com this pass (see
// docs/in-progress/channex-channel-api-investigation.md, CA-4 section). The
// generic machinery here (field rendering, rules, connection_details/
// mapping_details fallback, OBP tiers) is built to the documented Channel API
// shape for any adapter, but only Booking.com has actually been clicked
// through against real staging — trying another adapter this pass may hit
// rough edges the CA-7+ per-adapter enablement pass is meant to catch.
//
// White-label: no "Channex" anywhere in this file's copy — every string here
// is a translation key, and every EN/FR/ES/DE/NL value uses "Channel
// Manager"/"channel"/"online travel agent" language, matching the rest of
// ChannelManager.jsx.

const STEPS = ['adapter', 'settings', 'mapping', 'activate'];

const OBP_RULES = ['increase_by_percent', 'decrease_by_percent', 'increase_by_amount', 'decrease_by_amount'];

function fieldDefault(field) {
  if (field.default !== undefined) return field.default;
  if (field.type === 'boolean') return false;
  return '';
}

/** Is this field hidden right now — either type:'hidden' (system-populated,
 *  never shown) or a conditional `rules` entry currently matching. */
function isFieldHidden(field, values) {
  if (field.type === 'hidden') return true;
  return (field.rules ?? []).some((r) => r.apply === 'hidden' && values[r.influence_field] === r.when);
}

/** Build the real settings payload from visible field values — hidden fields
 *  (by type or by a matching rule) are omitted or forced to the rule's
 *  `with_value`, never sent as whatever stale value the form happened to hold. */
function buildSettingsPayload(paramsDescriptor, values) {
  const out = {};
  for (const [key, field] of Object.entries(paramsDescriptor ?? {})) {
    if (field.type === 'hidden') continue; // system-populated, never ours to send
    const hiddenByRule = (field.rules ?? []).find((r) => r.apply === 'hidden' && values[r.influence_field] === r.when);
    out[key] = hiddenByRule ? (hiddenByRule.with_value ?? '') : values[key];
  }
  return out;
}

function AdapterField({ name, field, value, onChange }) {
  const label = field.title ?? name;
  const common = {
    id: `caf-${name}`,
    style: { display: 'block', width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)' },
  };

  let control;
  switch (field.type) {
    case 'boolean':
      control = (
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
      );
      break;
    case 'select':
    case 'switch':
      control = (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
      break;
    case 'integer':
    case 'number':
      control = (
        <input {...common} type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case 'password':
      control = (
        <input {...common} type="password" value={value ?? ''} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" />
      );
      break;
    default: // string, slug
      control = (
        <input {...common} type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      );
  }

  if (field.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: '0.88rem' }}>
        {control}
        {label}
      </label>
    );
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={`caf-${name}`} style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {control}
    </div>
  );
}

export default function ChannelConnectWizard({ property, onClose, onConnected, t }) {
  const [step, setStep] = useState(0);
  const [adapters, setAdapters] = useState([]);
  const [adaptersLoading, setAdaptersLoading] = useState(true);
  const [existingChannels, setExistingChannels] = useState([]);

  const [selectedCode, setSelectedCode] = useState('');
  const selectedAdapter = adapters.find((a) => a.code === selectedCode) ?? null;
  const alreadyConnected = selectedAdapter
    ? existingChannels.find((c) => c.attributes?.channel === selectedAdapter.code)
    : null;

  const [fieldValues, setFieldValues] = useState({});
  const [testing, setTesting] = useState(false);
  const [testOutcome, setTestOutcome] = useState(null); // 'success' | 'fail' | 'error' | null
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [mappingDetails, setMappingDetails] = useState(null); // { available, result }
  const [connectionDetails, setConnectionDetails] = useState(null); // { available, result }

  const [roomMappings, setRoomMappings] = useState([]);
  const [ratePlanId, setRatePlanId] = useState('');
  const [otaRoomId, setOtaRoomId] = useState('');
  const [otaRateId, setOtaRateId] = useState('');
  const [manualRoomCode, setManualRoomCode] = useState('');
  const [manualRateCode, setManualRateCode] = useState('');
  const [pricingType, setPricingType] = useState('Standard');
  const [occupancy, setOccupancy] = useState('');
  const [obpTiers, setObpTiers] = useState([{ occupancy: '', rule: 'increase_by_percent', value: '', primary: true }]);
  const [title, setTitle] = useState('');

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createdChannel, setCreatedChannel] = useState(null);

  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [readinessBlockers, setReadinessBlockers] = useState(null); // array or null
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [activateError, setActivateError] = useState(null);

  const base = `/api/properties/${property.id}/channex`;

  useEffect(() => {
    setAdaptersLoading(true);
    Promise.all([
      apiFetch(`${base}/adapters`).then((r) => r.ok ? r.json() : { adapters: [] }),
      apiFetch(`${base}/channels`).then((r) => r.ok ? r.json() : { channels: [] }),
    ]).then(([a, c]) => {
      setAdapters((a.adapters ?? []).slice().sort((x, y) => (x.title ?? x.code).localeCompare(y.title ?? y.code)));
      setExistingChannels(c.channels ?? []);
    }).finally(() => setAdaptersLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pickAdapter(code) {
    setSelectedCode(code);
    const adapter = adapters.find((a) => a.code === code);
    const defaults = {};
    for (const [key, field] of Object.entries(adapter?.params ?? {})) defaults[key] = fieldDefault(field);
    setFieldValues(defaults);
    setTestOutcome(null);
    setMappingDetails(null);
    setConnectionDetails(null);
    setTitle(adapter ? `${property.name} — ${adapter.title}` : '');
  }

  function setField(name, value) {
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  }

  async function runTestConnection() {
    setTesting(true);
    setTestOutcome(null);
    try {
      const settings = buildSettingsPayload(selectedAdapter.params, fieldValues);
      const res = await apiFetch(`${base}/test-connection`, {
        method: 'POST',
        body: JSON.stringify({ channel_code: selectedAdapter.code, settings }),
      });
      const data = await res.json();
      if (!res.ok) { setTestOutcome('error'); return; }
      setTestOutcome(data.result?.success ? 'success' : 'fail');
      if (data.result?.success) {
        // Fetch mapping/connection details right away — both are best-effort;
        // any failure just means the next step falls back to manual entry.
        setFetchingDetails(true);
        const [md, cd] = await Promise.all([
          apiFetch(`${base}/mapping-details`, { method: 'POST', body: JSON.stringify({ channel_code: selectedAdapter.code, settings }) }).then((r) => r.json()).catch(() => ({ available: false })),
          apiFetch(`${base}/connection-details`, { method: 'POST', body: JSON.stringify({ channel_code: selectedAdapter.code, settings }) }).then((r) => r.json()).catch(() => ({ available: false })),
        ]);
        setMappingDetails(md);
        setConnectionDetails(cd);
        if (md?.available && md.result?.pricing_type) setPricingType(md.result.pricing_type);
        setFetchingDetails(false);
      }
    } catch {
      setTestOutcome('error');
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    if (step !== 2 || !property.id) return;
    apiFetch(`${base}/room-mappings`).then((r) => r.json()).then((d) => setRoomMappings(d.mappings ?? [])).catch(() => setRoomMappings([]));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const rateParams = selectedAdapter?.rate_params ?? {};
  const hasRateMapping = Object.keys(rateParams).length > 0;
  const supportsObp = rateParams.pricing_type?.options?.includes('OBP');
  const mappingRooms = mappingDetails?.available ? (mappingDetails.result?.rooms ?? []) : [];
  const selectedOtaRoom = mappingRooms.find((r) => String(r.id) === String(otaRoomId));
  const otaRates = selectedOtaRoom?.rates ?? [];

  function pickOtaRoom(id) {
    setOtaRoomId(id);
    setOtaRateId('');
  }
  function pickOtaRate(id) {
    setOtaRateId(id);
    const rate = otaRates.find((r) => String(r.id) === String(id));
    const occ = rate?.occupancies?.[0] ?? rate?.max_persons;
    if (occ) setOccupancy(String(occ));
  }

  function addObpTier() {
    setObpTiers((prev) => [...prev, { occupancy: '', rule: 'increase_by_percent', value: '', primary: false }]);
  }
  function removeObpTier(idx) {
    setObpTiers((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateObpTier(idx, patch) {
    setObpTiers((prev) => prev.map((tier, i) => {
      if (i !== idx) return patch.primary ? { ...tier, primary: false } : tier;
      return { ...tier, ...patch };
    }));
  }

  const roomCode = mappingDetails?.available ? otaRoomId : manualRoomCode;
  const rateCode = mappingDetails?.available ? otaRateId : manualRateCode;

  const mappingReady = hasRateMapping && ratePlanId && roomCode && rateCode && title.trim() && (
    pricingType === 'OBP'
      ? obpTiers.length > 0 && obpTiers.every((t) => t.occupancy && t.value !== '')
      : !!occupancy
  );

  async function createConnection() {
    setCreating(true);
    setCreateError(null);
    try {
      const rate_plans = pricingType === 'OBP'
        ? obpTiers.map((tier) => ({
            rate_plan_id: ratePlanId,
            room_type_code: roomCode,
            rate_plan_code: rateCode,
            occupancy: Number(tier.occupancy),
            pricing_type: 'OBP',
            primary_occ: tier.primary,
            readonly: false,
            derived_option: { rate: [[tier.rule, String(tier.value)]] },
          }))
        : [{
            rate_plan_id: ratePlanId,
            room_type_code: roomCode,
            rate_plan_code: rateCode,
            occupancy: Number(occupancy),
            pricing_type: rateParams.pricing_type ? pricingType : undefined,
            primary_occ: true,
            readonly: false,
          }];

      const settings = buildSettingsPayload(selectedAdapter.params, fieldValues);
      const res = await apiFetch(`${base}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          channel_code: selectedAdapter.code,
          hotel_id: settings.hotel_id ?? settings.hotel_code ?? '',
          title: title.trim(),
          rate_plans,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.error === 'already_connected') {
        setExistingChannels((prev) => [...prev, data.channel]);
        setCreateError(null);
        setStep(0);
        return;
      }
      if (!res.ok) { setCreateError(t('cmOtaGenericError')); return; }
      setCreatedChannel(data.channel);
      setStep(3);
    } catch {
      setCreateError(t('cmOtaGenericError'));
    } finally {
      setCreating(false);
    }
  }

  async function runCheckReadiness() {
    if (!createdChannel?.id) return;
    setCheckingReadiness(true);
    try {
      const res = await apiFetch(`${base}/channels/${createdChannel.id}/check-readiness`, { method: 'POST' });
      const data = await res.json();
      setReadinessBlockers(Array.isArray(data.result?.data) ? data.result.data : []);
    } catch {
      setReadinessBlockers(null);
    } finally {
      setCheckingReadiness(false);
    }
  }

  async function runActivate() {
    if (!createdChannel?.id) return;
    setActivating(true);
    setActivateError(null);
    try {
      const res = await apiFetch(`${base}/channels/${createdChannel.id}/activate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setActivateError(t('cmOtaGenericError')); return; }
      setActivated(true);
    } catch {
      setActivateError(t('cmOtaGenericError'));
    } finally {
      setActivating(false);
    }
  }

  function handleBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    if (creating || activating) return;
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal" style={{ maxWidth: 640 }} role="dialog" aria-modal="true" aria-label={t('cmOtaWizTitle')}>
        <div className="modal-header">
          <h3>{t('cmOtaWizTitle')}</h3>
          <button className="modal-close-btn" onClick={onClose} disabled={creating || activating}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 24, maxHeight: '70vh', overflowY: 'auto' }}>

          {step === 0 && (
            <>
              <div className="wiz-step-label">{t('cmOtaStepAdapter')}</div>
              {adaptersLoading ? (
                <div className="admin-muted">{t('cmLoading')}</div>
              ) : (
                <select
                  className="wizard-input wizard-select"
                  value={selectedCode}
                  onChange={(e) => pickAdapter(e.target.value)}
                >
                  <option value="">{t('cmOtaAdapterPlaceholder')}</option>
                  {adapters.map((a) => <option key={a.code} value={a.code}>{a.title}</option>)}
                </select>
              )}

              {alreadyConnected && (
                <div style={{ marginTop: 16, padding: 12, borderRadius: 6, background: 'var(--section-bg)', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                  <strong>{t('cmOtaAlreadyConnectedTitle')}</strong>
                  <div style={{ marginTop: 4 }}>{t('cmOtaAlreadyConnectedMsg')(selectedAdapter.title)}</div>
                </div>
              )}
            </>
          )}

          {step === 1 && selectedAdapter && (
            <>
              <div className="wiz-step-label">{t('cmOtaStepSettings')}</div>
              {Object.entries(selectedAdapter.params ?? {})
                .filter(([, field]) => !isFieldHidden(field, fieldValues))
                .sort(([, a], [, b]) => (a.position ?? 0) - (b.position ?? 0))
                .map(([name, field]) => (
                  <AdapterField key={name} name={name} field={field} value={fieldValues[name]} onChange={(v) => setField(name, v)} />
                ))}

              <button className="btn-secondary" onClick={runTestConnection} disabled={testing || fetchingDetails}>
                {testing ? t('cmOtaTestingBtn') : t('cmOtaTestConnectionBtn')}
              </button>

              {testOutcome === 'success' && (
                <div style={{ marginTop: 10, fontSize: '0.85rem', color: '#166534' }}>✓ {t('cmOtaTestSuccess')}</div>
              )}
              {testOutcome === 'fail' && (
                <div style={{ marginTop: 10, fontSize: '0.85rem', color: '#991b1b' }}>{t('cmOtaTestFailed')}</div>
              )}
              {testOutcome === 'error' && (
                <div style={{ marginTop: 10, fontSize: '0.85rem', color: '#991b1b' }}>{t('cmOtaTestError')}</div>
              )}
              {fetchingDetails && <div style={{ marginTop: 10, fontSize: '0.85rem' }} className="admin-muted">{t('cmLoading')}</div>}
            </>
          )}

          {step === 2 && selectedAdapter && (
            <>
              <div className="wiz-step-label">{t('cmOtaStepMapping')}</div>

              {connectionDetails?.available && connectionDetails.result?.attributes?.currency && (
                <div style={{ marginBottom: 14, padding: 10, borderRadius: 6, background: 'var(--section-bg)', fontSize: '0.82rem' }}>
                  {t('cmOtaCurrencyLabel')(connectionDetails.result.attributes.currency)}
                </div>
              )}

              {!hasRateMapping ? (
                <div style={{ fontSize: '0.85rem', color: '#991b1b' }}>{t('cmOtaUnsupportedAdapter')}</div>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{t('cmOtaNestbookRatePlan')}</label>
                    <select className="wizard-input wizard-select" value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)}>
                      <option value="">{t('cmOtaAdapterPlaceholder')}</option>
                      {roomMappings.map((m) => (
                        <option key={m.id} value={m.channex_rate_plan_id}>
                          {m.nestbook_ref_type} #{m.nestbook_ref_id ?? '—'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {mappingDetails?.available ? (
                    <>
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{t('cmOtaOtaRoom')}</label>
                        <select className="wizard-input wizard-select" value={otaRoomId} onChange={(e) => pickOtaRoom(e.target.value)}>
                          <option value="">{t('cmOtaAdapterPlaceholder')}</option>
                          {mappingRooms.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                        </select>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{t('cmOtaOtaRate')}</label>
                        <select className="wizard-input wizard-select" value={otaRateId} onChange={(e) => pickOtaRate(e.target.value)} disabled={!otaRates.length}>
                          <option value="">{t('cmOtaAdapterPlaceholder')}</option>
                          {otaRates.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: 8, fontSize: '0.8rem' }} className="admin-muted">{t('cmOtaManualEntryNote')}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{t('cmOtaRoomCodeLabel')}</label>
                          <input className="wizard-input" value={manualRoomCode} onChange={(e) => setManualRoomCode(e.target.value)} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{t('cmOtaRateCodeLabel')}</label>
                          <input className="wizard-input" value={manualRateCode} onChange={(e) => setManualRateCode(e.target.value)} />
                        </div>
                      </div>
                    </>
                  )}

                  {supportsObp && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{t('cmOtaPricingTypeLabel')}</label>
                      <select className="wizard-input wizard-select" value={pricingType} onChange={(e) => setPricingType(e.target.value)}>
                        <option value="Standard">{t('cmOtaPricingStandard')}</option>
                        <option value="OBP">{t('cmOtaPricingObp')}</option>
                      </select>
                    </div>
                  )}

                  {pricingType === 'OBP' && supportsObp ? (
                    <div style={{ marginBottom: 14, padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.8rem', marginBottom: 10 }} className="admin-muted">{t('cmOtaObpNote')}</div>
                      {obpTiers.map((tier, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px auto auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                          <input
                            type="number" placeholder={t('cmOtaObpTierOccupancy')}
                            value={tier.occupancy}
                            onChange={(e) => updateObpTier(idx, { occupancy: e.target.value })}
                            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                          />
                          <select
                            value={tier.rule}
                            onChange={(e) => updateObpTier(idx, { rule: e.target.value })}
                            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                          >
                            {OBP_RULES.map((r) => <option key={r} value={r}>{t(`cmOtaObpRule_${r}`)}</option>)}
                          </select>
                          <input
                            type="number" placeholder="—"
                            value={tier.value}
                            onChange={(e) => updateObpTier(idx, { value: e.target.value })}
                            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                          />
                          <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="radio" checked={tier.primary} onChange={() => updateObpTier(idx, { primary: true })} />
                            {t('cmOtaObpPrimary')}
                          </label>
                          <button type="button" onClick={() => removeObpTier(idx)} disabled={obpTiers.length === 1}
                            style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '0.8rem' }}>
                            {t('cmOtaObpRemoveTier')}
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn-secondary" onClick={addObpTier} style={{ fontSize: '0.8rem', padding: '5px 10px' }}>
                        {t('cmOtaObpAddTier')}
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{t('cmOtaOccupancyLabel')}</label>
                      <input className="wizard-input" type="number" min="1" value={occupancy} onChange={(e) => setOccupancy(e.target.value)} />
                    </div>
                  )}

                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{t('cmOtaTitleLabel')}</label>
                    <input className="wizard-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('cmOtaTitlePlaceholder')} />
                  </div>

                  {createError && <div style={{ marginTop: 10, fontSize: '0.85rem', color: '#991b1b' }}>{createError}</div>}
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="wiz-step-label">{t('cmOtaStepActivate')}</div>

              {!activated ? (
                <>
                  <button className="btn-secondary" onClick={runCheckReadiness} disabled={checkingReadiness} style={{ marginBottom: 10 }}>
                    {checkingReadiness ? t('cmOtaReadinessChecking') : t('cmOtaReadinessBtn')}
                  </button>
                  {readinessBlockers !== null && (
                    <div style={{ marginBottom: 14, fontSize: '0.85rem', color: readinessBlockers.length ? '#991b1b' : '#166534' }}>
                      {readinessBlockers.length ? t('cmOtaReadinessBlocked') : t('cmOtaReadinessOk')}
                    </div>
                  )}
                  <div>
                    <button className="btn-primary" onClick={runActivate} disabled={activating}>
                      {activating ? t('cmOtaActivating') : t('cmOtaActivateBtn')}
                    </button>
                  </div>
                  {activateError && <div style={{ marginTop: 10, fontSize: '0.85rem', color: '#991b1b' }}>{activateError}</div>}
                </>
              ) : (
                <div style={{ fontSize: '0.9rem', color: '#166534' }}>✓ {t('cmOtaActivatedMsg')}</div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn-secondary" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)} disabled={creating || activating}>
            {step === 0 ? t('cancel') : `← ${t('cmOtaWizBack')}`}
          </button>
          {activated ? (
            <button className="btn-primary" onClick={() => onConnected()}>{t('cmOtaDoneBtn')}</button>
          ) : step === 0 ? (
            <button className="btn-primary" onClick={() => setStep(1)} disabled={!selectedAdapter || !!alreadyConnected}>
              {t('cmOtaWizContinue')}
            </button>
          ) : step === 1 ? (
            <button className="btn-primary" onClick={() => setStep(2)} disabled={testOutcome !== 'success' || fetchingDetails}>
              {t('cmOtaWizContinue')}
            </button>
          ) : step === 2 ? (
            <button className="btn-primary" onClick={createConnection} disabled={!mappingReady || creating}>
              {creating ? t('cmOtaCreating') : t('cmOtaCreateBtn')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
