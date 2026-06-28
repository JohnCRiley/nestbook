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

function statusBadge(status) {
  if (status === 'email_found') return { bg: '#dcfce7', color: '#15803d', label: 'Email found' };
  if (status === 'no_email')    return { bg: '#f1f5f9', color: '#64748b', label: 'No email' };
  return { bg: '#f8f8f8', color: '#94a3b8', label: 'No website' };
}

const labelStyle   = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 };
const inputStyle   = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: '0.875rem', color: '#1e293b', boxSizing: 'border-box', fontFamily: 'inherit' };
const selectStyle  = { width: '100%', padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: '0.875rem', color: '#1e293b', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' };
const thStyle      = { padding: '10px 12px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' };

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7"/>
      <line x1="21" y1="21" x2="15" y2="15"/>
    </svg>
  );
}

export default function ProspectFinder() {
  const [area, setArea]               = useState('');
  const [types, setTypes]             = useState(new Set(PROPERTY_TYPES));
  const [radius, setRadius]           = useState(10000);
  const [language, setLanguage]       = useState('en');
  const [minReviews, setMinReviews]   = useState(0);

  const [phase, setPhase]             = useState('idle'); // idle | searching | done
  const [statusMsg, setStatusMsg]     = useState('');
  const [progress, setProgress]       = useState(null);   // { current, total } | null
  const [results, setResults]         = useState([]);
  const [selected, setSelected]       = useState(new Set());
  const [error, setError]             = useState(null);
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState(null);

  function toggleType(t) {
    setTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  const selectableIndices = results
    .map((r, i) => r.status === 'email_found' ? i : -1)
    .filter(i => i >= 0);

  function toggleSelect(i) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === selectableIndices.length && selectableIndices.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIndices));
    }
  }

  async function runSearch() {
    if (!area.trim() || types.size === 0) return;

    setPhase('searching');
    setError(null);
    setResults([]);
    setSelected(new Set());
    setImportResult(null);
    setProgress(null);
    setStatusMsg('Starting search…');

    try {
      const res = await saApiFetch('/api/admin/prospect-finder/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area: area.trim(),
          propertyTypes: [...types],
          radius,
          language,
          minReviews,
        }),
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

        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep last incomplete chunk

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'status') {
              setStatusMsg(event.message);
            } else if (event.type === 'progress') {
              setStatusMsg(event.message);
              setProgress({ current: event.current, total: event.total });
            } else if (event.type === 'done') {
              const r = event.results || [];
              setResults(r);
              setStatusMsg(event.message || 'Done.');
              setProgress({ current: r.length, total: r.length });
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

  async function runImport() {
    const toImport = [...selected].map(i => results[i]).filter(Boolean);
    if (toImport.length === 0) return;

    setImporting(true);
    setError(null);
    try {
      const res = await saApiFetch('/api/admin/prospect-finder/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects: toImport, language }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Import failed'); return; }
      setImportResult(data);
      setSelected(new Set());
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const isSearching = phase === 'searching';
  const pct = progress ? Math.round((progress.current / Math.max(progress.total, 1)) * 100) : 0;
  const emailsFound = results.filter(r => r.email).length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1020, margin: '0 auto' }}>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Prospect Finder</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.9rem' }}>
          Find hospitality properties via Google Places, scrape emails, and import to Outreach CRM.
        </p>
      </div>

      {/* ── Search form ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Area input */}
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
          {/* Radius / Language / Min reviews */}
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

        {/* Property types checkboxes */}
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

        {/* Search button */}
        <button
          onClick={runSearch}
          disabled={isSearching || !area.trim() || types.size === 0}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', fontWeight: 700,
            fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: (isSearching || !area.trim() || types.size === 0) ? '#a3bfa3' : '#1a4710',
            color: '#fff',
            cursor: (isSearching || !area.trim() || types.size === 0) ? 'not-allowed' : 'pointer',
          }}
        >
          <SearchIcon />
          {isSearching ? 'Searching…' : 'Find Properties'}
        </button>
      </div>

      {/* ── Error message ────────────────────────────────────────────────────── */}
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
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 6 }}>
                {progress.current} of {progress.total}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Results table ────────────────────────────────────────────────────── */}
      {phase === 'done' && results.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          {/* Results header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>
              {results.length} properties found
              <span style={{ color: '#15803d', fontWeight: 700 }}> · {emailsFound} emails</span>
              {selected.size > 0 && <span style={{ color: '#1a4710' }}> · {selected.size} selected</span>}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {importResult && (
                <span style={{ fontSize: '0.8rem', color: '#15803d', background: '#dcfce7', padding: '4px 12px', borderRadius: 6, fontWeight: 600 }}>
                  ✓ {importResult.imported} imported
                  {importResult.skipped > 0 && ` · ${importResult.skipped} already in CRM`}
                </span>
              )}
              <button
                onClick={runImport}
                disabled={selected.size === 0 || importing}
                style={{
                  padding: '7px 18px', borderRadius: 7, border: 'none', fontWeight: 600, fontSize: '0.85rem',
                  background: selected.size === 0 ? '#e2e8f0' : '#1a4710',
                  color: selected.size === 0 ? '#94a3b8' : '#fff',
                  cursor: (selected.size === 0 || importing) ? 'not-allowed' : 'pointer',
                }}
              >
                {importing ? 'Importing…' : `Import${selected.size > 0 ? ` ${selected.size}` : ''} to CRM`}
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
                      checked={selectableIndices.length > 0 && selected.size === selectableIndices.length}
                      onChange={toggleSelectAll}
                      style={{ accentColor: '#1a4710' }}
                      title="Select / deselect all with emails"
                    />
                  </th>
                  <th style={thStyle}>Property name</th>
                  <th style={thStyle}>Address</th>
                  <th style={thStyle}>Website</th>
                  <th style={thStyle}>Email found</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const badge      = statusBadge(r.status);
                  const canSelect  = r.status === 'email_found';
                  const isSelected = selected.has(i);
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid #f1f5f9', background: isSelected ? '#f0fdf4' : 'transparent', cursor: canSelect ? 'pointer' : 'default' }}
                      onClick={() => canSelect && toggleSelect(i)}
                    >
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {canSelect && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(i)}
                            onClick={e => e.stopPropagation()}
                            style={{ accentColor: '#1a4710' }}
                          />
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 500, color: '#1e293b', maxWidth: 200 }}>
                        {r.name}
                        {r.ratings > 0 && (
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>
                            ★ {r.ratings.toLocaleString()} reviews
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '0.78rem', maxWidth: 200 }}>
                        {r.address || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: 180 }}>
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
