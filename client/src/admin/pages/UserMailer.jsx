import { useState, useEffect, useCallback, useRef } from 'react';
import { saApiFetch } from '../saApiFetch.js';
import QuillEditor from '../QuillEditor.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseAdhocEmails(text) {
  return [...new Set(
    text.split(/[\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => EMAIL_RE.test(e))
  )];
}

function formatFilterDesc(b) {
  const mode = b.filter_mode ?? (b.filter_plan ? 'plan' : 'all');
  if (mode === 'plan') {
    try {
      const plans = b.filter_plans ? JSON.parse(b.filter_plans) : [b.filter_plan];
      return `Plan: ${plans.join(', ')}`;
    } catch { return `Plan: ${b.filter_plan ?? '?'}`; }
  }
  if (mode === 'language') {
    try {
      const langs = JSON.parse(b.filter_langs ?? '[]');
      return `Lang: ${langs.map(l => l.toUpperCase()).join(', ')}`;
    } catch { return 'By language'; }
  }
  if (mode === 'individual') return 'Individual';
  return 'All users';
}

export default function UserMailer() {
  const [tab, setTab] = useState('compose');

  // Compose
  const [templates, setTemplates]           = useState([]);
  const [subject, setSubject]               = useState('');
  const [html, setHtml]                     = useState('');
  const [htmlMode, setHtmlMode]             = useState(false);

  // Targeting
  const [targetMode, setTargetMode]         = useState('all');
  const [targetPlans, setTargetPlans]       = useState([]);     // ['free','pro','multi'] subset
  const [targetLangs, setTargetLangs]       = useState([]);     // ['en','fr','es','de','nl'] subset
  const [targetUsers, setTargetUsers]       = useState([]);     // [{id,name,email}]
  const [userSearch, setUserSearch]         = useState('');
  const [searchResults, setSearchResults]   = useState([]);
  const [filterVerified, setFilterVerified] = useState(false);

  // Ad-hoc emails
  const [adhocEmails, setAdhocEmails]       = useState('');

  // Preview
  const [recipientCount, setRecipientCount] = useState(null);

  // Actions
  const [saveName, setSaveName]             = useState('');
  const [showSaveModal, setShowSaveModal]   = useState(false);
  const [showSendModal, setShowSendModal]   = useState(false);
  const [sending, setSending]               = useState(false);
  const [testSending, setTestSending]       = useState(false);
  const [testMsg, setTestMsg]               = useState('');
  const [sendResult, setSendResult]         = useState(null);
  const [error, setError]                   = useState('');

  // History
  const [broadcasts, setBroadcasts]         = useState([]);
  const [histLoading, setHistLoading]       = useState(false);

  const fileInputRef = useRef(null);

  // ── Load templates ────────────────────────────────────────────────────────
  useEffect(() => {
    saApiFetch('/api/admin/user-mailer/templates')
      .then(r => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {});
  }, []);

  // ── User search (debounced) ───────────────────────────────────────────────
  useEffect(() => {
    if (!userSearch.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      saApiFetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}&page=1&limit=8`)
        .then(r => r.ok ? r.json() : { users: [] })
        .then(d => setSearchResults((d.users ?? []).filter(u => !targetUsers.find(x => x.id === u.id))))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch, targetUsers]);

  // ── Live recipient count ──────────────────────────────────────────────────
  const plansKey = targetPlans.join(',');
  const langsKey = targetLangs.join(',');

  useEffect(() => {
    if (targetMode === 'individual') {
      setRecipientCount(targetUsers.length);
      return;
    }
    if (targetMode === 'plan' && !targetPlans.length) {
      setRecipientCount(0);
      return;
    }
    if (targetMode === 'language' && !targetLangs.length) {
      setRecipientCount(0);
      return;
    }

    const params = new URLSearchParams({ mode: targetMode, verifiedOnly: String(filterVerified) });
    if (targetMode === 'plan')     targetPlans.forEach(p => params.append('plans', p));
    if (targetMode === 'language') targetLangs.forEach(l => params.append('langs', l));

    saApiFetch(`/api/admin/user-mailer/preview-count?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setRecipientCount(d?.count ?? null))
      .catch(() => setRecipientCount(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMode, plansKey, langsKey, targetUsers.length, filterVerified]);

  // ── History ───────────────────────────────────────────────────────────────
  const loadHistory = useCallback(() => {
    setHistLoading(true);
    saApiFetch('/api/admin/user-mailer/broadcasts')
      .then(r => r.ok ? r.json() : [])
      .then(rows => { setBroadcasts(rows); setHistLoading(false); })
      .catch(() => setHistLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // ── Template actions ──────────────────────────────────────────────────────
  function loadTemplate(tpl) {
    setSubject(tpl.subject);
    setHtml(tpl.html);
    setHtmlMode(/<(div|table|td|tr|section|style)\b/i.test(tpl.html));
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

  function handleHtmlFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setHtml(ev.target.result);
      setHtmlMode(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Toggle helpers ────────────────────────────────────────────────────────
  function togglePlan(plan) {
    setTargetPlans(prev => prev.includes(plan) ? prev.filter(p => p !== plan) : [...prev, plan]);
  }
  function toggleLang(lang) {
    setTargetLangs(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
  }
  function addUser(user) {
    if (targetUsers.find(u => u.id === user.id)) return;
    setTargetUsers(prev => [...prev, { id: user.id, name: user.name, email: user.email }]);
    setUserSearch('');
    setSearchResults([]);
  }
  function removeUser(id) {
    setTargetUsers(prev => prev.filter(u => u.id !== id));
  }

  // ── Send test ─────────────────────────────────────────────────────────────
  async function handleSendTest() {
    if (!subject.trim() || !html.trim()) { setTestMsg('Add a subject and body first.'); return; }
    setTestSending(true); setTestMsg('');
    const res = await saApiFetch('/api/admin/user-mailer/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, html }),
    });
    const data = await res.json();
    setTestSending(false);
    setTestMsg(res.ok ? `Test sent to ${data.sentTo}` : (data.error || 'Send failed'));
  }

  // ── Send broadcast ────────────────────────────────────────────────────────
  async function handleSend() {
    setError(''); setSending(true);
    const adhocParsed = parseAdhocEmails(adhocEmails);
    const res = await saApiFetch('/api/admin/user-mailer/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject, html,
        mode: targetMode,
        plans: targetMode === 'plan'       ? targetPlans : undefined,
        langs: targetMode === 'language'   ? targetLangs : undefined,
        userIds: targetMode === 'individual' ? targetUsers.map(u => u.id) : undefined,
        filterVerified,
        additionalEmails: adhocParsed,
      }),
    });
    const data = await res.json();
    setSending(false); setShowSendModal(false);
    if (res.ok) { setSendResult(data); } else { setError(data.error || 'Send failed'); }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const adhocParsed = parseAdhocEmails(adhocEmails);
  const adhocCount  = adhocParsed.length;
  const totalCount  = (recipientCount ?? 0) + adhocCount;

  const hasTargets =
    targetMode === 'all' ||
    (targetMode === 'plan'       && targetPlans.length > 0) ||
    (targetMode === 'language'   && targetLangs.length > 0) ||
    (targetMode === 'individual' && targetUsers.length > 0) ||
    adhocCount > 0;

  const bodyHasContent = html.replace(/<[^>]*>/g, '').trim().length > 0;
  const canSend = subject.trim() && bodyHasContent && hasTargets;

  function recipientSummary() {
    if (recipientCount === null && targetMode !== 'individual') return 'Counting…';
    if (adhocCount === 0) {
      return `${(recipientCount ?? 0).toLocaleString()} recipient${(recipientCount ?? 0) !== 1 ? 's' : ''}`;
    }
    return `${(recipientCount ?? 0).toLocaleString()} users + ${adhocCount} additional = ${totalCount.toLocaleString()} total`;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">User Mailer</h1>
        <p className="admin-page-subtitle">Send broadcast emails to NestBook users</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['compose', 'history'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 16px', borderRadius: 6, border: '1px solid',
              fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer',
              background: tab === t ? '#1a4710' : '#fff',
              color:      tab === t ? '#fff' : '#374151',
              borderColor: tab === t ? '#1a4710' : '#d1d5db',
            }}
          >
            {t === 'compose' ? 'Compose' : 'History'}
          </button>
        ))}
      </div>

      {/* ── Compose tab ──────────────────────────────────────────────────── */}
      {tab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

          {/* Left: templates panel */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>Templates</span>
              <button
                onClick={() => setShowSaveModal(true)}
                disabled={!canSend}
                style={{
                  fontSize: '0.75rem', padding: '3px 8px', borderRadius: 5,
                  border: '1px solid #d1d5db', background: canSend ? '#f8fafc' : '#f1f5f9',
                  color: canSend ? '#374151' : '#94a3b8', cursor: canSend ? 'pointer' : 'not-allowed',
                  fontWeight: 500,
                }}
                title="Save current email as a template"
              >
                + New
              </button>
            </div>

            {templates.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 10 }}>No templates yet.</p>
            )}
            {templates.map(tpl => (
              <div
                key={tpl.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.8rem', padding: '0 2px', flexShrink: 0 }}
                  title="Delete template"
                >
                  ✕
                </button>
              </div>
            ))}

            {/* Upload HTML file */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
              <input type="file" accept=".html,.htm" ref={fileInputRef} style={{ display: 'none' }} onChange={handleHtmlFileUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%', padding: '6px 0', borderRadius: 6,
                  border: '1px dashed #d1d5db', background: '#f8fafc',
                  color: '#64748b', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 500,
                }}
              >
                ↑ Upload HTML file
              </button>
            </div>
          </div>

          {/* Right: composer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Subject */}
            <div>
              <label style={labelStyle}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject…"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>

            {/* Body editor */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={labelStyle}>Body</label>
                <button
                  onClick={() => setHtmlMode(m => !m)}
                  title={htmlMode ? 'Switch to visual editor' : 'Edit raw HTML'}
                  style={{
                    fontSize: '0.75rem', padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                    fontFamily: 'monospace', fontWeight: 600,
                    border: `1px solid ${htmlMode ? '#1a4710' : '#d1d5db'}`,
                    background: htmlMode ? '#d9f0cc' : '#f8fafc',
                    color: htmlMode ? '#1a4710' : '#64748b',
                  }}
                >&lt;&gt; {htmlMode ? 'HTML mode' : 'HTML'}</button>
              </div>
              {htmlMode ? (
                <textarea
                  value={html}
                  onChange={e => setHtml(e.target.value)}
                  placeholder="Paste raw HTML here — rendered as-is in the email"
                  style={{
                    width: '100%', height: 300, fontFamily: 'monospace', fontSize: '0.78rem',
                    border: '1px solid #1a4710', borderRadius: 8, padding: '10px 12px',
                    resize: 'vertical', lineHeight: 1.5, color: '#1e293b', background: '#f8fff6',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <QuillEditor value={html} onChange={setHtml} minHeight={260} />
              )}
            </div>

            {/* Targeting */}
            <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: 10 }}>Recipients</div>

              {/* Radio buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { value: 'all',        label: 'All Users' },
                  { value: 'plan',       label: 'By Plan' },
                  { value: 'language',   label: 'By Language' },
                  { value: 'individual', label: 'Individual Users' },
                ].map(({ value, label }) => (
                  <label key={value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: '#374151' }}>
                    <input
                      type="radio"
                      name="targetMode"
                      value={value}
                      checked={targetMode === value}
                      onChange={() => { setTargetMode(value); setTargetPlans([]); setTargetLangs([]); }}
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <div>
                      {label}
                      {/* Plan checkboxes */}
                      {value === 'plan' && targetMode === 'plan' && (
                        <div style={{ display: 'flex', gap: 16, marginTop: 6, marginLeft: 2 }}>
                          {['free', 'pro', 'multi'].map(p => (
                            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', cursor: 'pointer', fontWeight: targetPlans.includes(p) ? 600 : 400 }}>
                              <input type="checkbox" checked={targetPlans.includes(p)} onChange={() => togglePlan(p)} />
                              {p.charAt(0).toUpperCase() + p.slice(1)}
                            </label>
                          ))}
                        </div>
                      )}
                      {/* Language checkboxes */}
                      {value === 'language' && targetMode === 'language' && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 6, marginLeft: 2, flexWrap: 'wrap' }}>
                          {['en', 'fr', 'es', 'de', 'nl'].map(l => (
                            <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', cursor: 'pointer', fontWeight: targetLangs.includes(l) ? 600 : 400 }}>
                              <input type="checkbox" checked={targetLangs.includes(l)} onChange={() => toggleLang(l)} />
                              {l.toUpperCase()}
                            </label>
                          ))}
                        </div>
                      )}
                      {/* Individual user search */}
                      {value === 'individual' && targetMode === 'individual' && (
                        <div style={{ marginTop: 8, marginLeft: 2 }}>
                          <input
                            type="text"
                            value={userSearch}
                            onChange={e => setUserSearch(e.target.value)}
                            placeholder="Search by name, email or property…"
                            style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.8rem', boxSizing: 'border-box' }}
                          />
                          {searchResults.length > 0 && (
                            <div style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', marginTop: 2, maxHeight: 180, overflowY: 'auto' }}>
                              {searchResults.map(u => (
                                <button
                                  key={u.id}
                                  onClick={() => addUser(u)}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9' }}
                                >
                                  <span style={{ fontWeight: 500 }}>{u.name}</span>
                                  <span style={{ color: '#64748b', marginLeft: 6 }}>{u.email}</span>
                                  <span style={{ float: 'right', color: '#94a3b8', fontSize: '0.72rem' }}>{u.plan}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Selected user chips */}
                          {targetUsers.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                              {targetUsers.map(u => (
                                <span
                                  key={u.id}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    background: '#e0f0d8', color: '#1a4710',
                                    borderRadius: 20, padding: '2px 8px',
                                    fontSize: '0.75rem', fontWeight: 500,
                                  }}
                                >
                                  {u.name || u.email}
                                  <button
                                    onClick={() => removeUser(u.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a4710', padding: 0, fontSize: '0.7rem', lineHeight: 1 }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {/* Verified filter */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={filterVerified} onChange={e => setFilterVerified(e.target.checked)} />
                Verified email only
              </label>
            </div>

            {/* Ad-hoc recipients */}
            <div>
              <label style={labelStyle}>
                Additional recipients
                <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>— added on top of the selection above</span>
              </label>
              <textarea
                value={adhocEmails}
                onChange={e => setAdhocEmails(e.target.value)}
                placeholder="Paste email addresses here, one per line or comma-separated"
                rows={3}
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: 8, fontSize: '0.82rem', resize: 'vertical',
                  fontFamily: 'monospace', boxSizing: 'border-box', color: '#1e293b',
                }}
              />
              {adhocCount > 0 && (
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '3px 0 0' }}>
                  {adhocCount} valid address{adhocCount !== 1 ? 'es' : ''} detected
                </p>
              )}
            </div>

            {/* Recipient count summary */}
            <div style={{ fontSize: '0.85rem', color: '#374151', padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #d1fae5' }}>
              <strong>Send to:</strong> {recipientSummary()}
            </div>

            {error && (
              <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
                {error}
              </div>
            )}
            {sendResult && (
              <div style={{ background: '#f0fdf4', color: '#166534', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
                Broadcast started — sending to {sendResult.recipientCount?.toLocaleString()} recipients
                {sendResult.adhocCount > 0 ? ` (${sendResult.adhocCount} ad-hoc)` : ''}. Check History for progress.
              </div>
            )}

            {/* Action row */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
                disabled={!canSend || sending || totalCount === 0}
                style={{
                  padding: '8px 18px', borderRadius: 7, border: 'none',
                  background: '#1a4710', color: '#fff', fontWeight: 600,
                  fontSize: '0.875rem', cursor: 'pointer', marginLeft: 'auto',
                  opacity: canSend && !sending && totalCount > 0 ? 1 : 0.5,
                }}
              >
                {sending ? 'Sending…' : `Send to ${totalCount.toLocaleString()} recipients`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History tab ──────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#374151' }}>Broadcast History</span>
            <button onClick={loadHistory} style={{ fontSize: '0.8rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
          {histLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : broadcasts.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No broadcasts yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                  <th style={th}>Date</th>
                  <th style={th}>Subject</th>
                  <th style={th}>Filter</th>
                  <th style={{ ...th, textAlign: 'right' }}>Recipients</th>
                  <th style={{ ...th, textAlign: 'right' }}>Sent</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b, i) => {
                  const userCount  = b.recipient_count - (b.adhoc_count ?? 0);
                  const adhocCount = b.adhoc_count ?? 0;
                  return (
                    <tr key={b.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                      <td style={td}>
                        {new Date(b.created_at + 'Z').toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td style={{ ...td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1e293b' }}>
                        {b.subject}
                      </td>
                      <td style={{ ...td, color: '#64748b' }}>
                        {formatFilterDesc(b)}{b.filter_verified ? ' · verified' : ''}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {adhocCount > 0
                          ? <>{userCount.toLocaleString()} <span style={{ color: '#94a3b8' }}>+{adhocCount} ad-hoc</span></>
                          : b.recipient_count.toLocaleString()
                        }
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: '#374151' }}>{b.sent_count.toLocaleString()}</td>
                      <td style={td}><StatusBadge status={b.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Save template modal */}
      {showSaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700 }}>Save as Template</h3>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Template name…"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTemplate(); }}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSaveModal(false)} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '0.875rem' }}>
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!saveName.trim()}
                style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#1a4710', color: '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: saveName.trim() ? 'pointer' : 'not-allowed', opacity: saveName.trim() ? 1 : 0.5 }}
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
            <strong>{totalCount.toLocaleString()} recipient{totalCount !== 1 ? 's' : ''}</strong>
            {adhocCount > 0 ? ` (including ${adhocCount} ad-hoc)` : ''}?
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

// ── Shared inline styles ──────────────────────────────────────────────────────

const labelStyle = { display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 4 };
const th = { padding: '10px 16px', fontWeight: 600 };
const td = { padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' };

function StatusBadge({ status }) {
  const map = {
    pending: { bg: '#fef9c3', color: '#92400e', label: 'Pending' },
    sending: { bg: '#dbeafe', color: '#1d4ed8', label: 'Sending…' },
    done:    { bg: '#dcfce7', color: '#15803d', label: 'Done' },
    failed:  { bg: '#fef2f2', color: '#b91c1c', label: 'Failed' },
  };
  const s = map[status] ?? { bg: '#f1f5f9', color: '#64748b', label: status };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 20, fontWeight: 600, fontSize: '0.75rem' }}>
      {s.label}
    </span>
  );
}
