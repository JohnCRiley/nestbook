import { useEffect, useState, useCallback } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

// Slice CA-1 — Channel API groundwork, Super Admin debug view. Read-only:
// lists Channex's available Channel API adapters and any channels already
// connected for a selected property.
//
// Slice CA-2 — adds the Booking.com connect flow below, against Channex's
// shared public staging test hotels (5868189 OBP, 6519420 Standard). Deliberately
// one button per step (not one "just connect it" click) so a failure at any
// step is visible in isolation, per the doc's step order:
// docs/in-progress/channex-channel-api-investigation.md.
const TEST_HOTELS = [
  { id: '5868189', label: '5868189 — occupancy-based pricing (OBP)' },
  { id: '6519420', label: '6519420 — per-room pricing (Standard)' },
];
const CHANNEL_CODE = 'BookingCom';

function StepResult({ result }) {
  if (!result) return null;
  return (
    <pre style={{
      marginTop: 8, padding: 10, borderRadius: 6, fontSize: '0.75rem',
      maxHeight: 260, overflow: 'auto',
      background: result.ok ? 'var(--section-bg)' : '#fef2f2',
      border: `1px solid ${result.ok ? 'var(--border)' : '#fca5a5'}`,
      color: result.ok ? 'var(--text-secondary)' : '#991b1b',
    }}>
      {`HTTP ${result.status}\n` + JSON.stringify(result.data, null, 2)}
    </pre>
  );
}

function stepButtonStyle(disabled) {
  return {
    background: 'var(--card-bg)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', padding: '7px 14px', borderRadius: 6,
    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
  };
}

export default function ChannexChannelApi() {
  const [properties,     setProperties]     = useState([]);
  const [propertyId,     setPropertyId]     = useState('');

  const [adapters,       setAdapters]       = useState([]);
  const [adaptersLoading, setAdaptersLoading] = useState(true);
  const [adaptersError,  setAdaptersError]  = useState(null);
  const [adapterSearch,  setAdapterSearch]  = useState('');

  const [channels,       setChannels]       = useState([]);
  const [channelsTotal,  setChannelsTotal]  = useState(0);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError,  setChannelsError]  = useState(null);
  const [notConnected,   setNotConnected]   = useState(false);

  // ── CA-2 state ──────────────────────────────────────────────────────────
  const [caHotelId,        setCaHotelId]        = useState(TEST_HOTELS[0].id);
  const [caTitle,          setCaTitle]          = useState('CA-2 Debug — BookingCom');
  const [caBusyStep,       setCaBusyStep]       = useState(null);
  const [caResults,        setCaResults]        = useState({}); // { testConnection, mappingDetails, connectionDetails, create, readiness, activate }
  const [caRoomMappings,   setCaRoomMappings]   = useState([]);
  const [caRatePlanId,     setCaRatePlanId]     = useState('');
  const [caOtaRoomId,      setCaOtaRoomId]      = useState('');
  const [caOtaRateId,      setCaOtaRateId]      = useState('');
  const [caOccupancy,      setCaOccupancy]      = useState('');
  const [caPricingType,    setCaPricingType]    = useState('');
  const [caCreatedChannel, setCaCreatedChannel] = useState(null); // { id, title, ... } from Channex

  useEffect(() => {
    apiFetch('/api/admin/properties')
      .then((r) => r.ok ? r.json() : [])
      .then((rows) => {
        setProperties(rows);
        if (rows.length > 0) setPropertyId(String(rows[0].id));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setAdaptersLoading(true);
    apiFetch('/api/admin/channex/adapters')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setAdapters(data.adapters ?? []);
        setAdaptersError(null);
      })
      .catch((err) => setAdaptersError(err.message))
      .finally(() => setAdaptersLoading(false));
  }, []);

  const fetchChannels = useCallback(() => {
    if (!propertyId) return;
    setChannelsLoading(true);
    setNotConnected(false);
    apiFetch(`/api/admin/channex/channels?property_id=${propertyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setChannels(data.channels ?? []);
        setChannelsTotal(data.total ?? 0);
        setNotConnected(!!data.notConnected);
        setChannelsError(null);
      })
      .catch((err) => setChannelsError(err.message))
      .finally(() => setChannelsLoading(false));
  }, [propertyId]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  // Reset the whole CA-2 walkthrough whenever the property or test hotel
  // changes — a channel created against one property/hotel makes no sense to
  // carry over.
  useEffect(() => {
    setCaResults({});
    setCaCreatedChannel(null);
    setCaRatePlanId('');
    setCaOtaRoomId('');
    setCaOtaRateId('');
    setCaOccupancy('');
    setCaPricingType('');
    if (!propertyId) { setCaRoomMappings([]); return; }
    apiFetch(`/api/admin/channex/room-mappings?property_id=${propertyId}`)
      .then((r) => r.json())
      .then((d) => setCaRoomMappings(d.mappings ?? []))
      .catch(() => setCaRoomMappings([]));
  }, [propertyId, caHotelId]);

  const filteredAdapters = adapterSearch
    ? adapters.filter((a) =>
        a.code?.toLowerCase().includes(adapterSearch.toLowerCase()) ||
        a.title?.toLowerCase().includes(adapterSearch.toLowerCase()))
    : adapters;

  const selectedProperty = properties.find((p) => String(p.id) === String(propertyId));

  async function runStep(key, path, body) {
    setCaBusyStep(key);
    try {
      const res = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setCaResults((prev) => ({ ...prev, [key]: { ok: res.ok, status: res.status, data } }));
      return { ok: res.ok, data };
    } catch (err) {
      setCaResults((prev) => ({ ...prev, [key]: { ok: false, status: 0, data: { error: err.message } } }));
      return { ok: false, data: null };
    } finally {
      setCaBusyStep(null);
    }
  }

  function testConnection() {
    return runStep('testConnection', '/api/admin/channex/channels/test-connection',
      { channel_code: CHANNEL_CODE, hotel_id: caHotelId });
  }

  async function mappingDetails() {
    const { ok, data } = await runStep('mappingDetails', '/api/admin/channex/channels/mapping-details',
      { channel_code: CHANNEL_CODE, hotel_id: caHotelId });
    const pricingType = data?.result?.pricing_type;
    if (ok && pricingType) setCaPricingType(pricingType);
  }

  function connectionDetails() {
    return runStep('connectionDetails', '/api/admin/channex/channels/connection-details',
      { channel_code: CHANNEL_CODE, hotel_id: caHotelId });
  }

  async function createChannelStep() {
    const { ok, data } = await runStep('create', '/api/admin/channex/channels/create', {
      property_id: propertyId, channel_code: CHANNEL_CODE, hotel_id: caHotelId, title: caTitle,
      rate_plan_id: caRatePlanId, room_type_code: caOtaRoomId, rate_plan_code: caOtaRateId,
      occupancy: caOccupancy, pricing_type: caPricingType,
    });
    if (ok && data?.channel?.id) setCaCreatedChannel(data.channel);
  }

  function checkReadiness() {
    if (!caCreatedChannel?.id) return;
    return runStep('readiness', `/api/admin/channex/channels/${caCreatedChannel.id}/check-readiness`, {});
  }

  async function activate() {
    if (!caCreatedChannel?.id) return;
    const { ok } = await runStep('activate', `/api/admin/channex/channels/${caCreatedChannel.id}/activate`, {});
    if (ok) fetchChannels();
  }

  const mappingRooms = caResults.mappingDetails?.data?.result?.rooms ?? [];
  const selectedRoom = mappingRooms.find((r) => String(r.id) === String(caOtaRoomId));
  const availableRates = selectedRoom?.rates ?? [];

  function pickRoom(roomId) {
    setCaOtaRoomId(roomId);
    setCaOtaRateId('');
    setCaOccupancy('');
  }

  function pickRate(rateId) {
    setCaOtaRateId(rateId);
    const rate = availableRates.find((r) => String(r.id) === String(rateId));
    if (rate?.occupancies?.length) setCaOccupancy(String(rate.occupancies[0]));
    else if (rate?.max_persons) setCaOccupancy(String(rate.max_persons));
  }

  const createDisabled = !propertyId || !caRatePlanId || !caOtaRoomId || !caOtaRateId ||
    !caOccupancy || !caPricingType || !caTitle || caBusyStep === 'create';

  return (
    <>
      <div className="page-header">
        <h1>Channex Channel API</h1>
        <div className="page-date">Slices CA-1/CA-2 — groundwork + Booking.com debug connect flow</div>
      </div>

      <div className="admin-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Available Adapters</h2>
        {adaptersError ? (
          <div style={{ color: '#991b1b' }}>Error: {adaptersError}</div>
        ) : adaptersLoading ? (
          <div className="admin-muted">Loading adapters from Channex staging…</div>
        ) : (
          <>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <input
                type="text"
                placeholder="Filter by code or title…"
                value={adapterSearch}
                onChange={(e) => setAdapterSearch(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
                         fontSize: '0.875rem', width: 280 }}
              />
              <span className="admin-muted" style={{ fontSize: '0.85rem' }}>
                {filteredAdapters.length} of {adapters.length} adapters
              </span>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Kind</th>
                    <th>Mapping mode</th>
                    <th>Property mapping</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdapters.map((a) => (
                    <tr key={a.code}>
                      <td><code style={{ fontSize: '0.8rem' }}>{a.code}</code></td>
                      <td>{a.title}</td>
                      <td className="admin-muted">{a.kind}</td>
                      <td className="admin-muted">{a.mapping_mode}</td>
                      <td className="admin-muted">{a.property_mapping}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="admin-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Connected Channels</h2>
        <div style={{ marginBottom: 12 }}>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
                     fontSize: '0.875rem', minWidth: 260 }}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.channex_property_id ? '' : ' (not connected to Channex)'}
              </option>
            ))}
          </select>
        </div>

        {channelsError ? (
          <div style={{ color: '#991b1b' }}>Error: {channelsError}</div>
        ) : channelsLoading ? (
          <div className="admin-muted">Loading…</div>
        ) : notConnected ? (
          <div className="admin-muted">
            {selectedProperty?.name ?? 'This property'} is not connected to Channex yet — connect it
            first (Properties page) before it can have any Channel API connections.
          </div>
        ) : channels.length === 0 ? (
          <div className="admin-muted">
            No Channel API connections for {selectedProperty?.name ?? 'this property'} yet
            ({channelsTotal} total).
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Channel ID</th>
                <th>Code</th>
                <th>Title</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id}>
                  <td><code style={{ fontSize: '0.8rem' }}>{c.id}</code></td>
                  <td>{c.attributes?.channel ?? '—'}</td>
                  <td>{c.attributes?.title ?? '—'}</td>
                  <td>{c.attributes?.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-card">
        <h2 style={{ marginTop: 0 }}>Booking.com Connect (CA-2 debug)</h2>
        <p className="admin-muted" style={{ marginTop: -6, fontSize: '0.85rem' }}>
          Uses Channex's shared public staging test hotels — no real OTA credentials involved.
          Property selected above (<strong>{selectedProperty?.name ?? '—'}</strong>) is used for the create step.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <label style={{ fontSize: '0.85rem' }}>
            Test hotel:{' '}
            <select
              value={caHotelId}
              onChange={(e) => setCaHotelId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
            >
              {TEST_HOTELS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
            </select>
          </label>
        </div>

        {/* Step 1 */}
        <div style={{ marginBottom: 18 }}>
          <button onClick={testConnection} disabled={caBusyStep === 'testConnection'} style={stepButtonStyle(caBusyStep === 'testConnection')}>
            {caBusyStep === 'testConnection' ? '1. Testing…' : '1. Test Connection'}
          </button>
          <StepResult result={caResults.testConnection} />
        </div>

        {/* Step 2 */}
        <div style={{ marginBottom: 18 }}>
          <button onClick={mappingDetails} disabled={caBusyStep === 'mappingDetails'} style={stepButtonStyle(caBusyStep === 'mappingDetails')}>
            {caBusyStep === 'mappingDetails' ? '2. Fetching…' : '2. Mapping Details'}
          </button>
          <StepResult result={caResults.mappingDetails} />
        </div>

        {/* Step 3 */}
        <div style={{ marginBottom: 18 }}>
          <button onClick={connectionDetails} disabled={caBusyStep === 'connectionDetails'} style={stepButtonStyle(caBusyStep === 'connectionDetails')}>
            {caBusyStep === 'connectionDetails' ? '3. Fetching…' : '3. Connection Details'}
          </button>
          <StepResult result={caResults.connectionDetails} />
        </div>

        {/* Step 4 — create, with manual mapping inputs */}
        <div style={{ marginBottom: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>4. Create Channel</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: '0.8rem' }}>
              Title
              <input type="text" value={caTitle} onChange={(e) => setCaTitle(e.target.value)}
                style={{ display: 'block', width: '100%', padding: '6px 8px', marginTop: 2, borderRadius: 6, border: '1px solid #e2e8f0' }} />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              NestBook rate plan (channex_room_mappings)
              <select value={caRatePlanId} onChange={(e) => setCaRatePlanId(e.target.value)}
                style={{ display: 'block', width: '100%', padding: '6px 8px', marginTop: 2, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <option value="">— select —</option>
                {caRoomMappings.map((m) => (
                  <option key={m.id} value={m.channex_rate_plan_id}>
                    {m.nestbook_ref_type} #{m.nestbook_ref_id ?? '—'} → {m.channex_rate_plan_id.slice(0, 8)}…
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Booking.com room (from step 2)
              <select value={caOtaRoomId} onChange={(e) => pickRoom(e.target.value)} disabled={!mappingRooms.length}
                style={{ display: 'block', width: '100%', padding: '6px 8px', marginTop: 2, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <option value="">{mappingRooms.length ? '— select —' : 'run step 2 first'}</option>
                {mappingRooms.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.id})</option>)}
              </select>
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Booking.com rate (from selected room)
              <select value={caOtaRateId} onChange={(e) => pickRate(e.target.value)} disabled={!availableRates.length}
                style={{ display: 'block', width: '100%', padding: '6px 8px', marginTop: 2, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <option value="">{availableRates.length ? '— select —' : 'pick a room first'}</option>
                {availableRates.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.id})</option>)}
              </select>
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Occupancy
              <input type="number" min="1" value={caOccupancy} onChange={(e) => setCaOccupancy(e.target.value)}
                style={{ display: 'block', width: '100%', padding: '6px 8px', marginTop: 2, borderRadius: 6, border: '1px solid #e2e8f0' }} />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Pricing type
              <select value={caPricingType} onChange={(e) => setCaPricingType(e.target.value)}
                style={{ display: 'block', width: '100%', padding: '6px 8px', marginTop: 2, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <option value="">— select —</option>
                <option value="OBP">OBP</option>
                <option value="Standard">Standard</option>
              </select>
            </label>
          </div>
          <button onClick={createChannelStep} disabled={createDisabled} style={stepButtonStyle(createDisabled)}>
            {caBusyStep === 'create' ? 'Creating…' : 'Create Channel'}
          </button>
          <StepResult result={caResults.create} />
          {caCreatedChannel?.id ? (
            <div className="admin-muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>
              Created channel id: <code>{caCreatedChannel.id}</code>
            </div>
          ) : null}
        </div>

        {/* Step 5 */}
        <div style={{ marginBottom: 18 }}>
          <button onClick={checkReadiness} disabled={!caCreatedChannel?.id || caBusyStep === 'readiness'}
            style={stepButtonStyle(!caCreatedChannel?.id || caBusyStep === 'readiness')}>
            {caBusyStep === 'readiness' ? '5. Checking…' : '5. Check Readiness'}
          </button>
          <StepResult result={caResults.readiness} />
        </div>

        {/* Step 6 */}
        <div>
          <button onClick={activate} disabled={!caCreatedChannel?.id || caBusyStep === 'activate'}
            style={stepButtonStyle(!caCreatedChannel?.id || caBusyStep === 'activate')}>
            {caBusyStep === 'activate' ? '6. Activating…' : '6. Activate'}
          </button>
          <StepResult result={caResults.activate} />
        </div>
      </div>
    </>
  );
}
