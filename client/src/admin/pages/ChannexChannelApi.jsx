import { useEffect, useState, useCallback } from 'react';
import { saApiFetch as apiFetch } from '../saApiFetch.js';

// Slice CA-1 — Channel API groundwork, Super Admin debug view. Read-only:
// lists Channex's available Channel API adapters and any channels already
// connected for a selected property. No connect/disconnect/activate here —
// that's CA-2. See docs/in-progress/channex-channel-api-investigation.md.
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

  const filteredAdapters = adapterSearch
    ? adapters.filter((a) =>
        a.code?.toLowerCase().includes(adapterSearch.toLowerCase()) ||
        a.title?.toLowerCase().includes(adapterSearch.toLowerCase()))
    : adapters;

  const selectedProperty = properties.find((p) => String(p.id) === String(propertyId));

  return (
    <>
      <div className="page-header">
        <h1>Channex Channel API</h1>
        <div className="page-date">Slice CA-1 — read-only groundwork, no connect flow yet</div>
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

      <div className="admin-card">
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
            ({channelsTotal} total) — expected, since CA-2 (the actual connect flow) hasn't been built.
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
    </>
  );
}
