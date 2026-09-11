import { useState, useEffect, useCallback } from 'react';
import { saApiFetch } from '../saApiFetch.js';

const TABS = [
  { key: 'landing_chat', label: 'Front-facing (Landing)' },
  { key: 'help_chat',    label: 'In-app (Help Chat)' },
];

const LIMIT = 50;

const PLAN_LABEL = { free: 'Free', pro: 'Pro', multi: 'Multi' };

export default function AiAssistant() {
  const [tab,        setTab]        = useState('landing_chat');
  const [logs,       setLogs]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [last7,      setLast7]      = useState(0);
  const [last30,     setLast30]     = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ source: tab, page, limit: LIMIT });
    saApiFetch(`/api/admin/ai-assistant/logs?${params}`)
      .then((r) => r.ok ? r.json() : { logs: [], total: 0, last7: 0, last30: 0, totalPages: 1 })
      .then(({ logs: rows, total: tot, last7: l7, last30: l30, totalPages: tp }) => {
        setLogs(rows);
        setTotal(tot);
        setLast7(l7);
        setLast30(l30);
        setTotalPages(tp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tab, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const tabStyle = (active) => ({
    padding: '8px 20px', border: 'none', background: active ? '#405440' : 'transparent',
    color: active ? '#fff' : '#64748b', borderRadius: 7, fontWeight: active ? 600 : 400,
    fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  });

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 700 }}>AI Assistant</h2>
        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
          Questions asked to the two AI assistants. Answers are never logged.
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 9,
        marginBottom: 16, width: 'fit-content', flexWrap: 'wrap',
      }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            style={tabStyle(tab === key)}
            onClick={() => { setTab(key); setPage(1); }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16,
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#475569',
      }}>
        <span><strong>{total.toLocaleString()}</strong> total</span>
        <span style={{ color: '#cbd5e1' }}>·</span>
        <span><strong>{last7.toLocaleString()}</strong> last 7 days</span>
        <span style={{ color: '#cbd5e1' }}>·</span>
        <span><strong>{last30.toLocaleString()}</strong> last 30 days</span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No questions logged yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {logs.map((log) => (
            <div key={log.id} style={{
              border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', background: '#fff',
            }}>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                marginBottom: 6, fontSize: '0.75rem', color: '#94a3b8',
              }}>
                <span style={{ fontWeight: 600, color: '#64748b' }}>{formatTs(log.created_at)}</span>
                {log.language && (
                  <span style={{
                    background: '#f1f5f9', padding: '1px 7px', borderRadius: 4,
                    fontWeight: 600, textTransform: 'uppercase',
                  }}>
                    {log.language}
                  </span>
                )}
                {tab === 'help_chat' && log.plan && (
                  <span style={{
                    background: '#dcfce7', color: '#166534', padding: '1px 7px', borderRadius: 4, fontWeight: 600,
                  }}>
                    {PLAN_LABEL[log.plan] ?? log.plan}
                  </span>
                )}
                {tab === 'help_chat' && log.mode && (
                  <span style={{
                    background: '#f3e8ff', color: '#6b21a8', padding: '1px 7px', borderRadius: 4, fontWeight: 600,
                  }}>
                    {log.mode}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: '0.88rem', color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {log.question}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'center' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: '0.83rem', color: '#64748b' }}>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
