import { useState, useEffect, useCallback, useRef } from 'react';
import { saApiFetch } from '../saApiFetch.js';
import QuillEditor from '../QuillEditor.jsx';
import TemplateManager from '../TemplateManager.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';
import IconPicker from '../IconPicker.jsx';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const USER_MAILER_FOOTER_PREVIEW = 'You received this email as a NestBook user. Questions? hello@nestbook.io';

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

// Mirror of server/utils/emailWrapper.js for client-side broadcast preview
function buildPreviewHtml(bodyHtml) {
  const raw = (bodyHtml ?? '').trim();
  const htmlContent = raw.startsWith('<')
    ? raw
    : raw.split(/\n{2,}/).map(p => `<p style="margin:0 0 16px 0;line-height:1.7">${p.replace(/\n/g, '<br>')}</p>`).join('\n');
  const footer = USER_MAILER_FOOTER_PREVIEW;

  return `<!DOCTYPE html><html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a4710;padding:28px 32px;">
    <img src="https://nestbook.io/icon-192.png" width="36" height="36" style="border-radius:8px;vertical-align:middle;display:inline-block;">
    <span style="color:#ffffff;font-size:22px;font-weight:bold;margin-left:12px;vertical-align:middle;">NestBook</span>
    <div style="color:#a8d5a2;font-size:13px;margin-top:6px;">Booking software for independent properties</div>
  </td></tr>
  <tr><td style="padding:32px 32px 0px;color:#1a2e14;font-size:15px;line-height:1.6;">
    <div style="color:#1a2e14;">${htmlContent}</div>
    <div style="margin-top:32px;padding:24px;border-top:1px solid #d9f0cc;">
      <img src="https://nestbook.io/icon-192.png" width="28" height="28" style="border-radius:6px;vertical-align:middle;display:inline-block;">
      <strong style="color:#1a4710;margin-left:8px;vertical-align:middle;font-size:15px;">The NestBook Team</strong><br>
      <span style="color:#5a7a52;font-size:13px;line-height:1.8;">
        <a href="mailto:hello@nestbook.io" style="color:#1a4710;text-decoration:none;">hello@nestbook.io</a>
        &nbsp;&middot;&nbsp;
        <a href="https://nestbook.io" style="color:#1a4710;text-decoration:none;">nestbook.io</a>
      </span>
    </div>
  </td></tr>
  <tr><td style="background:#f0f7ed;padding:20px 32px;border-top:1px solid #d9f0cc;">
    <p style="margin:0;font-size:12px;color:#5a7a52;text-align:center;line-height:1.6;">${footer}</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

export default function UserMailer() {
  const [tab, setTab] = useState('compose');

  // Compose
  const [subject, setSubject]               = useState('');
  const [html, setHtml]                     = useState('');
  const [htmlMode, setHtmlMode]             = useState(false);

  // Template manager
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showIconPicker, setShowIconPicker]           = useState(false);

  const editorRef   = useRef(null); // QuillEditor ref
  const textareaRef = useRef(null); // raw-HTML textarea ref

  // Targeting
  const [targetMode, setTargetMode]         = useState('all');
  const [targetPlans, setTargetPlans]       = useState([]);
  const [targetLangs, setTargetLangs]       = useState([]);
  const [targetUsers, setTargetUsers]       = useState([]);
  const [userSearch, setUserSearch]         = useState('');
  const [searchResults, setSearchResults]   = useState([]);
  const [filterVerified, setFilterVerified] = useState(false);

  // Ad-hoc emails
  const [adhocEmails, setAdhocEmails]       = useState('');

  // Preview count
  const [recipientCount, setRecipientCount] = useState(null);

  // Actions
  const [showSendModal, setShowSendModal]   = useState(false);
  const [sending, setSending]               = useState(false);
  const [testSending, setTestSending]       = useState(false);
  const [testMsg, setTestMsg]               = useState('');
  const [sendResult, setSendResult]         = useState(null);
  const [error, setError]                   = useState('');

  // History
  const [broadcasts, setBroadcasts]         = useState([]);
  const [histLoading, setHistLoading]       = useState(false);
  const [viewBroadcast, setViewBroadcast]   = useState(null);

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
    if (targetMode === 'plan' && !targetPlans.length) { setRecipientCount(0); return; }
    if (targetMode === 'language' && !targetLangs.length) { setRecipientCount(0); return; }

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

  // ── Template load callback ────────────────────────────────────────────────
  function loadTemplate(tplSubject, tplHtml) {
    setSubject(tplSubject);
    setHtml(tplHtml);
    setHtmlMode(/<(div|table|td|tr|section|style)\b/i.test(tplHtml));
  }

  // ── Icon insertion ────────────────────────────────────────────────────────
  function handleIconInsert(imgHtml) {
    if (htmlMode) {
      const ta = textareaRef.current;
      if (!ta) { setHtml(h => h + imgHtml); return; }
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const next  = ta.value.slice(0, start) + imgHtml + ta.value.slice(end);
      setHtml(next);
      requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + imgHtml.length; });
    } else {
      editorRef.current?.insertHtml(imgHtml);
    }
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
        plans:   targetMode === 'plan'       ? targetPlans : undefined,
        langs:   targetMode === 'language'   ? targetLangs : undefined,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Template row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={labelStyle}>Template</label>
            <button
              onClick={() => setShowTemplateManager(true)}
              style={{
                fontSize: '0.82rem', padding: '6px 14px', borderRadius: 6,
                border: '1px solid #d1d5db', background: '#f8fafc',
                color: '#374151', cursor: 'pointer', fontWeight: 500,
              }}
            >
              Manage Templates →
            </button>
          </div>

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
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setShowIconPicker(true)}
                  title="Insert icon"
                  style={{
                    fontSize: '0.75rem', padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid #d1d5db', background: '#f8fafc', color: '#64748b',
                    display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600,
                  }}
                >
                  <IconBtnSvg /> Icons
                </button>
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
            </div>
            <div style={{ display: htmlMode ? 'none' : 'block' }}>
              <QuillEditor ref={editorRef} value={html} onChange={setHtml} minHeight={260} />
            </div>
            {htmlMode && (
              <textarea
                ref={textareaRef}
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
            )}
          </div>

          {/* Targeting */}
          <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: 10 }}>Recipients</div>

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
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b, i) => {
                  const userCount  = b.recipient_count - (b.adhoc_count ?? 0);
                  const adhocCnt   = b.adhoc_count ?? 0;
                  return (
                    <tr key={b.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                      <td style={td}>
                        {new Date(b.created_at + 'Z').toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1e293b' }}>
                        {b.subject}
                      </td>
                      <td style={{ ...td, color: '#64748b' }}>
                        {formatFilterDesc(b)}{b.filter_verified ? ' · verified' : ''}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {adhocCnt > 0
                          ? <>{userCount.toLocaleString()} <span style={{ color: '#94a3b8' }}>+{adhocCnt} ad-hoc</span></>
                          : b.recipient_count.toLocaleString()
                        }
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: '#374151' }}>{b.sent_count.toLocaleString()}</td>
                      <td style={td}><StatusBadge status={b.status} /></td>
                      <td style={td}>
                        <button
                          onClick={() => setViewBroadcast(b)}
                          style={{
                            fontSize: '0.78rem', padding: '3px 10px', borderRadius: 5,
                            border: '1px solid #d1d5db', background: '#f8fafc',
                            color: '#374151', cursor: 'pointer',
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Icon Picker modal ───────────────────────────────────────────── */}
      {showIconPicker && (
        <IconPicker onInsert={handleIconInsert} onClose={() => setShowIconPicker(false)} />
      )}

      {/* ── Template Manager modal ──────────────────────────────────────── */}
      {showTemplateManager && (
        <TemplateManager
          apiBase="/api/admin/user-mailer"
          bodyField="html"
          footerNote={USER_MAILER_FOOTER_PREVIEW}
          onClose={() => setShowTemplateManager(false)}
          onChanged={() => {}}
          onLoad={loadTemplate}
        />
      )}

      {/* ── History View modal ───────────────────────────────────────────── */}
      {viewBroadcast && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>{viewBroadcast.subject}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>
                      {new Date(viewBroadcast.created_at + 'Z').toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <span>{formatFilterDesc(viewBroadcast)}{viewBroadcast.filter_verified ? ' · verified' : ''}</span>
                    <span>{viewBroadcast.sent_count.toLocaleString()} / {viewBroadcast.recipient_count.toLocaleString()} sent</span>
                    <StatusBadge status={viewBroadcast.status} />
                  </div>
                </div>
                <button
                  onClick={() => setViewBroadcast(null)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, border: '1px solid #d1d5db',
                    background: '#fff', color: '#374151', cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 500, flexShrink: 0,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            {/* Email preview */}
            <iframe
              srcDoc={buildPreviewHtml(viewBroadcast.html ?? '')}
              title="Email preview"
              sandbox="allow-same-origin"
              style={{ flex: 1, border: 'none', minHeight: 480 }}
            />
          </div>
        </div>
      )}

      {/* ── Send confirmation modal ──────────────────────────────────────── */}
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

function IconBtnSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M20.4 14.5L16 10 4 20" />
    </svg>
  );
}

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
