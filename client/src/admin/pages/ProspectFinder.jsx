import { useState } from 'react';
import { saApiFetch } from '../saApiFetch.js';

const PROPERTY_TYPES = [
  'Bed and breakfast',
  'Guesthouse',
  'Guest house',
  'Inn',
  'Lodge',
  'Holiday cottage',
  "Chambre d'hôtes",
];

const RADIUS_OPTIONS = [
  { label: '5 km',  value: 5000 },
  { label: '10 km', value: 10000 },
  { label: '25 km', value: 25000 },
  { label: '50 km', value: 50000 },
];

const LANGUAGE_OPTIONS = [
  { label: 'EN', value: 'en' },
  { label: 'FR', value: 'fr' },
  { label: 'DE', value: 'de' },
  { label: 'ES', value: 'es' },
  { label: 'NL', value: 'nl' },
];

const MIN_REVIEWS_OPTIONS = [
  { label: 'Any', value: 0 },
  { label: '3+',  value: 3 },
  { label: '5+',  value: 5 },
  { label: '10+', value: 10 },
];

const COUNTRY_OPTIONS = [
  { value: 'uk', label: 'United Kingdom' },
  { value: 'fr', label: 'France' },
  { value: 'es', label: 'Spain' },
  { value: 'de', label: 'Germany' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'be', label: 'Belgium' },
  { value: 'ch', label: 'Switzerland' },
];

const CHAIN_KEYWORDS = [
  'premierinn', 'travelodge', 'hilton', 'marriott', 'ihg',
  'bestwestern', 'holidayinn', 'accor', 'radisson', 'novotel',
  'ibis', 'mercure', 'whitbread', 'greeneking', 'marstons',
];

function isChain(website) {
  if (!website) return false;
  const url = website.toLowerCase().replace(/[^a-z]/g, '');
  return CHAIN_KEYWORDS.some(k => url.includes(k));
}

function statusBadge(status) {
  if (status === 'email_found') return { bg: '#dcfce7', color: '#15803d', label: 'Email found' };
  if (status === 'no_email')    return { bg: '#f1f5f9', color: '#64748b', label: 'No email' };
  return { bg: '#f8f8f8', color: '#94a3b8', label: 'No website' };
}

const labelStyle  = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 };
const inputStyle  = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: '0.875rem', color: '#1e293b', boxSizing: 'border-box', fontFamily: 'inherit' };
const selectStyle = { width: '100%', padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: '0.875rem', color: '#1e293b', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' };
const thStyle     = { padding: '10px 12px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' };

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7"/>
      <line x1="21" y1="21" x2="15" y2="15"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

export default function ProspectFinder() {
  const [mode, setMode]             = useState('search'); // search | sweep

  const [area, setArea]             = useState('');
  const [types, setTypes]           = useState(new Set(PROPERTY_TYPES));
  const [radius, setRadius]         = useState(10000);
  const [language, setLanguage]     = useState('en');
  const [minReviews, setMinReviews] = useState(0);

  // Sweep-only fields
  const [country, setCountry]           = useState('uk');
  const [spacingKm, setSpacingKm]       = useState(35);
  const [radiusMeters, setRadiusMeters] = useState(20000);
  const [maxPoints, setMaxPoints]       = useState('50'); // string so blank = full sweep

  const [phase, setPhase]           = useState('idle'); // idle | searching | done
  const [statusMsg, setStatusMsg]   = useState('');
  const [progress, setProgress]     = useState(null);
  const [results, setResults]       = useState([]);
  const [selected, setSelected]     = useState(new Set());
  const [error, setError]           = useState(null);
  const [gridPoints, setGridPoints]         = useState(null);
  const [detailCallsUsed, setDetailCallsUsed] = useState(null);

  function toggleType(t) {
    setTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  const selectableIndices = results.map((_, i) => i);

  const chainCount  = results.filter(r => isChain(r.website)).length;
  const emailsFound = results.filter(r => r.email).length;

  function toggleSelect(i) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(selectableIndices));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function runSearch() {
    if (mode === 'search') {
      if (!area.trim() || types.size === 0) return;
    } else if (types.size === 0) {
      return;
    }

    setPhase('searching');
    setError(null);
    setResults([]);
    setSelected(new Set());
    setProgress(null);
    setGridPoints(null);
    setDetailCallsUsed(null);
    setStatusMsg('Starting search…');

    const endpoint = mode === 'search'
      ? '/api/admin/prospect-finder/search'
      : '/api/admin/prospect-finder/sweep';

    const body = mode === 'search'
      ? { area: area.trim(), propertyTypes: [...types], radius, language, minReviews }
      : {
          country, propertyTypes: [...types], spacingKm: Number(spacingKm), radiusMeters: Number(radiusMeters),
          language, minReviews,
          ...(maxPoints.trim() !== '' ? { maxPoints: Number(maxPoints) } : {}),
        };

    try {
      const res = await saApiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        try {
          const err = await res.json();
          setError(err.error || 'Search failed');
        } catch {
          setError(`Search failed (${res.status})`);
        }
        setPhase('idle');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'status') {
              setStatusMsg(event.message);
            } else if (event.type === 'progress') {
              // Sweep progress events report grid points, not a message string
              setStatusMsg(event.message || `Grid point ${event.current} of ${event.total} — ${event.foundSoFar ?? 0} found so far, ${event.emailsSoFar ?? 0} emails`);
              setProgress({ current: event.current, total: event.total });
            } else if (event.type === 'done') {
              const r = event.results || [];
              setResults(r);
              setStatusMsg(event.message || 'Done.');
              setProgress({ current: r.length, total: r.length });
              if (event.gridPoints != null) setGridPoints(event.gridPoints);
              if (event.detailCallsUsed != null) setDetailCallsUsed(event.detailCallsUsed);
              // Auto-select all rows that aren't flagged as chains
              setSelected(new Set(
                r.map((item, i) => !isChain(item.website) ? i : -1)
                 .filter(i => i >= 0)
              ));
              setPhase('done');
            } else if (event.type === 'error') {
              setError(event.message);
              setPhase('idle');
            }
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Search failed');
      setPhase('idle');
    }
  }

  function handleDownloadCSV() {
    const toExport = [...selected].sort((a, b) => a - b).map(i => results[i]).filter(Boolean);
    if (toExport.length === 0) return;

    const headers = ['name', 'email', 'phone', 'company', 'website', 'town', 'region', 'country', 'language', 'source', 'notes'];

    const rows = toExport.map(r => [
      '',                // name — contact name unknown
      r.email,
      '',                // phone — not available from Places
      r.name,            // company = property name
      r.website || '',
      '',                // town — parsed from address manually after download
      '',                // region
      mode === 'sweep' ? country : '', // country — known for a sweep (dropdown), not for a free-text area search
      language,
      'google_places',
      r.address || '',   // full Places address goes in notes for reference
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    const label = mode === 'search' ? area : COUNTRY_OPTIONS.find(c => c.value === country)?.label || country;
    link.download = `prospects-${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(blobUrl);
  }

  const isSearching = phase === 'searching';
  const pct = progress ? Math.round((progress.current / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1060, margin: '0 auto' }}>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Prospect Finder</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.9rem' }}>
          Find hospitality properties via Google Places, scrape emails, review results, and download a CSV for import to Outreach CRM.
        </p>
      </div>

      {/* ── Mode tabs ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f1f5f9', borderRadius: 9, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'search', label: 'Single Area' },
          { key: 'sweep',  label: 'Country Sweep' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => !isSearching && setMode(t.key)}
            disabled={isSearching}
            style={{
              padding: '7px 18px', borderRadius: 6, border: 'none', fontWeight: 600, fontSize: '0.85rem',
              cursor: isSearching ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              background: mode === t.key ? '#fff' : 'transparent',
              color: mode === t.key ? '#1a4710' : '#64748b',
              boxShadow: mode === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Search form ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, marginBottom: 20 }}>
        {mode === 'search' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Area</label>
              <input
                value={area}
                onChange={e => setArea(e.target.value)}
                placeholder="e.g. Cornwall, UK"
                disabled={isSearching}
                style={inputStyle}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Radius</label>
                <select value={radius} onChange={e => setRadius(Number(e.target.value))} disabled={isSearching} style={selectStyle}>
                  {RADIUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)} disabled={isSearching} style={selectStyle}>
                  {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Min reviews</label>
                <select value={minReviews} onChange={e => setMinReviews(Number(e.target.value))} disabled={isSearching} style={selectStyle}>
                  {MIN_REVIEWS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Country</label>
              <select value={country} onChange={e => setCountry(e.target.value)} disabled={isSearching} style={selectStyle}>
                {COUNTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' , gap: 12 }}>
              <div>
                <label style={labelStyle}>Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)} disabled={isSearching} style={selectStyle}>
                  {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Min reviews</label>
                <select value={minReviews} onChange={e => setMinReviews(Number(e.target.value))} disabled={isSearching} style={selectStyle}>
                  {MIN_REVIEWS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Grid spacing (km)</label>
              <input
                type="number" min="5" step="5"
                value={spacingKm}
                onChange={e => setSpacingKm(e.target.value)}
                disabled={isSearching}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Radius per point (m)</label>
                <input
                  type="number" min="1000" max="50000" step="1000"
                  value={radiusMeters}
                  onChange={e => setRadiusMeters(e.target.value)}
                  disabled={isSearching}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Test run (max grid points) — leave blank for full sweep</label>
                <input
                  type="number" min="1" step="1"
                  value={maxPoints}
                  onChange={e => setMaxPoints(e.target.value)}
                  placeholder="Full sweep"
                  disabled={isSearching}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Property types</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', marginTop: 6 }}>
            {PROPERTY_TYPES.map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.875rem', color: '#374151', cursor: isSearching ? 'default' : 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={types.has(t)}
                  onChange={() => toggleType(t)}
                  disabled={isSearching}
                  style={{ accentColor: '#1a4710', width: 14, height: 14, cursor: isSearching ? 'default' : 'pointer' }}
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={runSearch}
          disabled={isSearching || (mode === 'search' && !area.trim()) || types.size === 0}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', fontWeight: 700,
            fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: (isSearching || (mode === 'search' && !area.trim()) || types.size === 0) ? '#a3bfa3' : '#1a4710',
            color: '#fff',
            cursor: (isSearching || (mode === 'search' && !area.trim()) || types.size === 0) ? 'not-allowed' : 'pointer',
          }}
        >
          <SearchIcon />
          {isSearching ? (mode === 'search' ? 'Searching…' : 'Sweeping…') : (mode === 'search' ? 'Find Properties' : 'Run Sweep')}
        </button>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#dc2626', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* ── Progress bar ─────────────────────────────────────────────────────── */}
      {(isSearching || (phase === 'done' && progress)) && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: '0.875rem', color: '#475569', marginBottom: progress ? 10 : 0 }}>{statusMsg}</div>
          {progress && (
            <>
              <div style={{ background: '#f1f5f9', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, background: '#1a4710', width: `${pct}%`, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 6 }}>{progress.current} of {progress.total}</div>
            </>
          )}
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────────── */}
      {phase === 'done' && results.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          {/* Summary + action bar */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: '0.9rem', color: '#1e293b' }}>
              <span style={{ fontWeight: 600 }}>{results.length} properties</span>
              <span style={{ color: '#15803d', fontWeight: 700 }}> · {emailsFound} emails found</span>
              {chainCount > 0 && <span style={{ color: '#b45309' }}> · {chainCount} possible chain{chainCount !== 1 ? 's' : ''} flagged</span>}
              {selected.size > 0 && <span style={{ color: '#1a4710' }}> · {selected.size} selected</span>}
              {gridPoints != null && <span style={{ color: '#64748b' }}> · {gridPoints} grid points</span>}
              {detailCallsUsed != null && (
                <span style={{ color: '#64748b' }} title="Places Details API calls used by this sweep — check spend in Google Cloud Console">
                  {' '}· {detailCallsUsed} detail lookups used
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={selectAll}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f8fafc', color: '#374151', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Select all
              </button>
              <button
                onClick={deselectAll}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f8fafc', color: '#374151', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Deselect all
              </button>
              <button
                onClick={handleDownloadCSV}
                disabled={selected.size === 0}
                style={{
                  padding: '7px 16px', borderRadius: 7, border: 'none', fontWeight: 600, fontSize: '0.85rem',
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: selected.size === 0 ? '#e2e8f0' : '#1a4710',
                  color: selected.size === 0 ? '#94a3b8' : '#fff',
                  cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <DownloadIcon />
                Download CSV{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'center', width: 44 }}>
                    <input
                      type="checkbox"
                      checked={results.length > 0 && selected.size === results.length}
                      onChange={() => selected.size === results.length ? deselectAll() : selectAll()}
                      style={{ accentColor: '#1a4710' }}
                      title="Select / deselect all"
                    />
                  </th>
                  <th style={thStyle}>Property name</th>
                  <th style={thStyle}>Website</th>
                  <th style={thStyle}>Email found</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const badge      = statusBadge(r.status);
                  const chain      = isChain(r.website);
                  const isSelected = selected.has(i);
                  const rowBg      = isSelected ? '#f0fdf4' : chain ? '#fffbeb' : 'transparent';
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid #f1f5f9', background: rowBg, cursor: 'pointer' }}
                      onClick={() => toggleSelect(i)}
                    >
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(i)}
                          onClick={e => e.stopPropagation()}
                          style={{ accentColor: '#1a4710' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 500, color: '#1e293b', maxWidth: 200 }}>
                        {r.name}
                        {r.ratings > 0 && (
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>
                            ★ {r.ratings.toLocaleString()} reviews
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: 200 }}>
                        {r.website ? (
                          <a
                            href={r.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ color: '#1a4710', fontSize: '0.78rem', wordBreak: 'break-all' }}
                          >
                            {r.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#1e293b', maxWidth: 220 }}>
                        {r.email || <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 99,
                          background: badge.bg, color: badge.color,
                          fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
                        }}>
                          {badge.label}
                        </span>
                        {chain && (
                          <span style={{
                            display: 'inline-block', marginLeft: 6, padding: '2px 8px', borderRadius: 99,
                            background: '#fef3c7', color: '#b45309',
                            fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
                          }}>
                            Chain?
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {phase === 'done' && results.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          No properties found. Try a broader area or different property types.
        </div>
      )}
    </div>
  );
}
