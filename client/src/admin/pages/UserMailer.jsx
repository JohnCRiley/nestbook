import { useState, useEffect, useCallback } from 'react';
import { saApiFetch } from '../saApiFetch.js';
import QuillEditor from '../QuillEditor.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';

const PLAN_OPTIONS = [
  { value: 'all',   label: 'All users' },
  { value: 'free',  label: 'Free plan' },
  { value: 'pro',   label: 'Pro plan' },
  { value: 'multi', label: 'Multi plan' },
];

export default function UserMailer() {
  const [tab, setTab] = useState('compose');

  // Compose state
  const [templates, setTemplates]         = useState([]);
  const [subject, setSubject]             = useState('');
  const [html, setHtml]                   = useState('');
  const [filterPlan, setFilterPlan]       = useState('all');
  const [filterVerified, setFilterVerified] = useState(false);
  const [recipientCount, setRecipientCount] = useState(null);
  const [saveName, setSaveName]           = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sending, setSending]             = useState(false);
  const [testSending, setTestSending]     = useState(false);
  const [testMsg, setTestMsg]             = useState('');
  const [sendResult, setSendResult]       = useState(null);
  const [error, setError]                 = useState('');

  // History state
  const [broadcasts, setBroadcasts]       = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load templates on mount
  useEffect(() => {
    saApiFetch('/api/admin/user-mailer/templates')
      .then(r => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {});
  }, []);

  // Live recipient count
  useEffect(() => {
    const params = new URLSearchParams({ plan: filterPlan, verifiedOnly: filterVerified });
    saApiFetch(`/api/admin/user-mailer/preview-count?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setRecipientCount(d?.count ?? null))
      .catch(() => setRecipientCount(null));
  }, [filterPlan, filterVerified]);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    saApiFetch('/api/admin/user-mailer/broadcasts')
      .then(r => r.ok ? r.json() : [])
      .then(rows => { setBroadcasts(rows); setHistoryLoading(false); })
      .catch(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  function loadTemplate(tpl) {
    setSubject(tpl.subject);
    setHtml(tpl.html);
  }

  async function handleSaveTemplate() {
    if (!saveName.trim()) return;
    const res = await saApiFetch('/api/admin/user-mailer/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: saveName.trim(), subject, html }),
    });
    if (res.ok) {
      const tpl = await res.json();
      setTemplates(prev => [tpl, ...prev]);
      setSaveName('');
      setShowSaveModal(false);
    }
  }

  async function handleDeleteTemplate(id) {
    await saApiFetch(`/api/admin/user-mailer/templates/${id}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  async function handleSendTest() {
    if (!subject.trim() || !html.trim()) {
      setTestMsg('Add a subject and body first.');
      return;
    }
    setTestSending(true);
    setTestMsg('');
    const res = await saApiFetch('/api/admin/user-mailer/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, html }),
    });
    const data = await res.json();
    setTestSending(false);
    setTestMsg(res.ok ? `Test sent to ${data.sentTo}` : (data.error || 'Send failed'));
  }

  async function handleSend() {
    setError('');
    setSending(true);
    const res = await saApiFetch('/api/admin/user-mailer/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, html, filterPlan, filterVerified }),
    });
    const data = await res.json();
    setSending(false);
    setShowSendModal(false);
    if (res.ok) {
      setSendResult(data);
    } else {
      setError(data.error || 'Send failed');
    }
  }

  const canSend = subject.trim() && html.replace(/<[^>]*>/g, '').trim();

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">User Mailer</h1>
        <p className="admin-page-subtitle">Send broadcast emails to NestBook users</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['compose', 'history'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 16px', borderRadius: 6, border: '1px solid',
              fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer',
              background: tab === t ? '#1a4710' : '#fff',
              color: tab === t ? '#fff' : '#374151',
              borderColor: tab === t ? '#1a4710' : '#d1d5db',
            }}
          >
            {t === 'compose' ? 'Compose' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start' }}>
          {/* ── Left: templates ──────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#374151', marginBottom: 12 }}>
              Saved Templates
            </div>
            {templates.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No templates yet.</p>
            )}
            {templates.map(tpl => (
              <div
                key={tpl.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 0', borderBottom: '1px solid #f1f5f9',
                }}
              >
                <button
                  onClick={() => loadTemplate(tpl)}
                  style={{
                    flex: 1, textAlign: 'left', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: '0.82rem', color: '#1e3a5f',
                    padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  title={`Load: ${tpl.name}`}
                >
                  {tpl.name}
                </button>
                <button
                  onClick={() => handleDeleteTemplate(tpl.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#ef4444', fontSize: '0.8rem', padding: '0 2px', flexShrink: 0,
                  }}
                  title="Delete template"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* ── Right: composer ──────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Subject */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject…"
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Body */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Body
              </label>
              <QuillEditor value={html} onChange={setHtml} minHeight={240} />
            </div>

            {/* Filters */}
            <div style={{
              background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>Plan:</label>
                <select
                  value={filterPlan}
                  onChange={e => setFilterPlan(e.target.value)}
                  style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem' }}
                >
                  {PLAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filterVerified}
                  onChange={e => setFilterVerified(e.target.checked)}
                />
                Verified email only
              </label>

              <span style={{ fontSize: '0.82rem', color: '#64748b', marginLeft: 'auto' }}>
                {recipientCount === null
                  ? 'Counting…'
                  : <><strong>{recipientCount.toLocaleString()}</strong> recipient{recipientCount !== 1 ? 's' : ''}</>
                }
              </span>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            {sendResult && (
              <div style={{ background: '#f0fdf4', color: '#166534', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
                Broadcast started — sending to {sendResult.recipientCount?.toLocaleString()} users. Check History for progress.
              </div>
            )}

            {/* Action row */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowSaveModal(true)}
                disabled={!canSend}
                style={{
                  padding: '8px 14px', borderRadius: 7, border: '1px solid #d1d5db',
                  background: '#fff', color: '#374151', fontWeight: 500,
                  fontSize: '0.85rem', cursor: canSend ? 'pointer' : 'not-allowed',
                  opacity: canSend ? 1 : 0.5,
                }}
              >
                Save as Template
              </button>

              <button
                onClick={handleSendTest}
                disabled={!canSend || testSending}
                style={{
                  padding: '8px 14px', borderRadius: 7, border: '1px solid #3b82f6',
                  background: '#eff6ff', color: '#1d4ed8', fontWeight: 500,
                  fontSize: '0.85rem', cursor: canSend && !testSending ? 'pointer' : 'not-allowed',
                  opacity: canSend && !testSending ? 1 : 0.5,
                }}
              >
                {testSending ? 'Sending…' : 'Send Test →'}
              </button>

              {testMsg && (
                <span style={{ fontSize: '0.8rem', color: testMsg.startsWith('Test sent') ? '#16a34a' : '#dc2626' }}>
                  {testMsg}
                </span>
              )}

              <button
                onClick={() => { setError(''); setShowSendModal(true); }}
                disabled={!canSend || sending || recipientCount === 0}
                style={{
                  padding: '8px 18px', borderRadius: 7, border: 'none',
                  background: '#1a4710', color: '#fff', fontWeight: 600,
                  fontSize: '0.875rem', cursor: 'pointer', marginLeft: 'auto',
                  opacity: canSend && !sending && recipientCount !== 0 ? 1 : 0.5,
                }}
              >
                {sending ? 'Sending…' : `Send to ${recipientCount?.toLocaleString() ?? '…'} users`}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#374151' }}>Broadcast History</span>
            <button
              onClick={loadHistory}
              style={{ fontSize: '0.8rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Refresh
            </button>
          </div>
          {historyLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : broadcasts.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No broadcasts yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Subject</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Filter</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Recipients</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Sent</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b, i) => (
                  <tr key={b.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {new Date(b.created_at + 'Z').toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#1e293b', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.subject}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b' }}>
                      {b.filter_plan ?? 'all'}{b.filter_verified ? ' · verified' : ''}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#374151' }}>
                      {b.recipient_count.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#374151' }}>
                      {b.sent_count.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Save template modal */}
      {showSaveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700 }}>Save as Template</h3>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Template name…"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTemplate(); }}
              style={{
                width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: 14,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSaveModal(false)}
                style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '0.875rem' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!saveName.trim()}
                style={{
                  padding: '7px 14px', borderRadius: 7, border: 'none',
                  background: '#1a4710', color: '#fff', fontWeight: 600,
                  fontSize: '0.875rem', cursor: saveName.trim() ? 'pointer' : 'not-allowed',
                  opacity: saveName.trim() ? 1 : 0.5,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send confirmation modal */}
      <ConfirmModal
        isOpen={showSendModal}
        title="Send broadcast?"
        message={
          <span>
            Send <strong>"{subject}"</strong> to{' '}
            <strong>{recipientCount?.toLocaleString()} users</strong>
            {filterPlan !== 'all' ? ` on the ${filterPlan} plan` : ''}
            {filterVerified ? ' with verified emails' : ''}?
            <br />
            <span style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: 6, display: 'block' }}>
              This cannot be undone.
            </span>
          </span>
        }
        confirmLabel="Send now"
        busy={sending}
        onConfirm={handleSend}
        onCancel={() => setShowSendModal(false)}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const colours = {
    pending: { bg: '#fef9c3', color: '#92400e', label: 'Pending' },
    sending: { bg: '#dbeafe', color: '#1d4ed8', label: 'Sending…' },
    done:    { bg: '#dcfce7', color: '#15803d', label: 'Done' },
    failed:  { bg: '#fef2f2', color: '#b91c1c', label: 'Failed' },
  };
  const s = colours[status] ?? { bg: '#f1f5f9', color: '#64748b', label: status };
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '2px 8px', borderRadius: 20,
      fontWeight: 600, fontSize: '0.75rem',
    }}>
      {s.label}
    </span>
  );
}
