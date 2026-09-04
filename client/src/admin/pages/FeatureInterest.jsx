import { useState, useEffect } from 'react';
import { saApiFetch } from '../saApiFetch.js';

export default function FeatureInterest() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [expanded, setExpanded] = useState({});

  useEffect(() => { fetchResults(); }, []);

  async function fetchResults() {
    setLoading(true);
    setError(null);
    try {
      const res  = await saApiFetch('/api/admin/feature-interest');
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      setError('Failed to load feature interest results');
    }
    setLoading(false);
  }

  function toggle(slug) {
    setExpanded(prev => ({ ...prev, [slug]: !prev[slug] }));
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Feature Interest
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Results from the "Would you use this?" widget embedded on blog posts and other pages.
          Each row is one feature slug — expand to see the emails collected for it.
        </p>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
          padding: '10px 16px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Loading results...
        </div>
      ) : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No feature-interest votes recorded yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map(r => (
            <div
              key={r.slug}
              style={{
                background: 'var(--card-bg)',
                border: '1.5px solid var(--border)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => toggle(r.slug)}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16,
                  fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {r.slug}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {r.emails.length} email{r.emails.length === 1 ? '' : 's'} collected
                  </div>
                </div>
                <div style={{
                  fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)',
                  flexShrink: 0,
                }}>
                  {r.count}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  vote{r.count === 1 ? '' : 's'}
                </div>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '0.8rem' }}>
                  {expanded[r.slug] ? '▲' : '▼'}
                </span>
              </button>

              {expanded[r.slug] && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', background: 'var(--page-bg)' }}>
                  {r.emails.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      No emails left for this feature yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {r.emails.map((e, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', gap: 12,
                          fontSize: '0.82rem', color: 'var(--text-primary)',
                        }}>
                          <span>{e.email}</span>
                          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                            {new Date(e.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
