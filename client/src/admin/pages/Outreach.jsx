import { useState, useEffect, useCallback, useRef } from 'react';
import { saApiFetch } from '../saApiFetch.js';
import QuillEditor from '../QuillEditor.jsx';
import TemplateManager from '../TemplateManager.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { return (n ?? 0).toLocaleString(); }

const BLOCKED_STATUSES = new Set(['unsubscribed', 'complained', 'converted']);

function StatusBadge({ status }) {
  const colours = {
    new:                  { bg: '#eff6ff', color: '#1d4ed8', label: 'New' },
    '1st_contact_sent':   { bg: '#fef9c3', color: '#92400e', label: '1 Sent' },
    '1st_followup_sent':  { bg: '#fff7ed', color: '#c2410c', label: '2 Sent' },
    '2nd_followup_sent':  { bg: '#fef2f2', color: '#b91c1c', label: '3 Sent' },
    '3rd_followup_sent':  { bg: '#fce7f3', color: '#9d174d', label: '4 Sent' },
    replied:              { bg: '#f0fdf4', color: '#166534', label: 'Replied' },
    converted:            { bg: '#dcfce7', color: '#15803d', label: 'Converted' },
    unsubscribed:         { bg: '#f1f5f9', color: '#64748b', label: 'Unsubscribed' },
    complained:           { bg: '#fee2e2', color: '#991b1b', label: 'Complained' },
  };
  const s = colours[status] || colours.new;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  );
}

function SourceBadge({ source }) {
  const labels = {
    manual: 'Manual', csv: 'CSV', auto_signup: 'Signed up', website: 'Website',
    facebook: 'Facebook', google: 'Google', booking_com: 'Booking.com',
    airbnb: 'Airbnb', referral: 'Referral', other: 'Other',
  };
  return (
    <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
      {labels[source] ?? source}
    </span>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 24 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{title}</h3>
        {action}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function Btn({ children, onClick, variant = 'primary', small, disabled, style }) {
  const styles = {
    primary:   { background: '#1a4710', color: '#fff', border: 'none' },
    secondary: { background: '#fff', color: '#374151', border: '1px solid #d1d5db' },
    danger:    { background: '#fff', color: '#dc2626', border: '1px solid #fca5a5' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '4px 10px' : '7px 14px',
        borderRadius: 6, fontSize: small ? '0.8rem' : '0.85rem', fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit', ...styles[variant], ...style,
      }}
    >{children}</button>
  );
}

function Input({ value, onChange, placeholder, style, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit', ...style }}
    />
  );
}

function Textarea({ value, onChange, rows = 5, placeholder, style }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit', width: '100%', resize: 'vertical', ...style }}
    />
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ stats }) {
  if (!stats) return null;
  const cards = [
    { label: 'Total Prospects',  value: fmt(stats.total) },
    { label: 'New',              value: fmt(stats.byStatus?.new) },
    { label: 'Contacted',        value: fmt(stats.byStatus?.contacted) },
    { label: 'Converted',        value: fmt(stats.byStatus?.converted), highlight: true },
    { label: 'Sent Today',       value: fmt(stats.sentToday) },
    { label: 'Emails Sent',      value: fmt(stats.sentTotal) },
    { label: 'Campaigns',        value: fmt(stats.campaigns) },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: c.highlight ? '#f0fdf4' : '#fff',
          border: `1px solid ${c.highlight ? '#bbf7d0' : '#e2e8f0'}`,
          borderRadius: 8, padding: '12px 16px',
        }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: c.highlight ? '#166534' : '#0f172a' }}>{c.value}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Add Prospect modal ────────────────────────────────────────────────────────
function AddProspectModal({ onClose, onSaved }) {
  const [name, setName]         = useState('');
  const [company, setCompany]   = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [country, setCountry]   = useState('');
  const [region, setRegion]     = useState('');
  const [town, setTown]         = useState('');
  const [language, setLanguage] = useState('');
  const [website, setWebsite]   = useState('');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  async function save() {
    if (!name.trim() || !email.trim()) { setErr('Name and email are required.'); return; }
    setSaving(true); setErr('');
    const res = await saApiFetch('/api/admin/outreach/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, company, email, phone: phone || null, country, region, town: town || null, language, website, notes }),
    });
    setSaving(false);
    if (res.ok) { onSaved(); onClose(); }
    else { const d = await res.json(); setErr(d.error || 'Failed to save'); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: '1rem' }}>Add Prospect</h3>
        {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>{err}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input value={name}    onChange={setName}    placeholder="Full name *" style={{ width: '100%' }} />
          <Input value={company} onChange={setCompany} placeholder="Company / property name" style={{ width: '100%' }} />
          <Input value={email}   onChange={setEmail}   placeholder="Email address *" type="email" style={{ width: '100%' }} />
          <Input value={phone}   onChange={setPhone}   placeholder="Phone (e.g. 01539 432156)" type="tel" style={{ width: '100%' }} />
          <Input value={website} onChange={setWebsite} placeholder="Website / Facebook URL" style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={country}  onChange={setCountry}  placeholder="Country (e.g. uk)" style={{ flex: 1 }} />
            <Input value={language} onChange={setLanguage} placeholder="Language (e.g. en)" style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={region} onChange={setRegion} placeholder="Region (e.g. Lake District)" style={{ flex: 1 }} />
            <Input value={town}   onChange={setTown}   placeholder="Town / village" style={{ flex: 1 }} />
          </div>
          <Textarea value={notes} onChange={setNotes} rows={3} placeholder="Notes (optional)" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Prospect'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Edit Prospect modal ───────────────────────────────────────────────────────
function EditProspectModal({ prospect, onClose, onSaved }) {
  const [name, setName]             = useState(prospect.name ?? '');
  const [company, setCompany]       = useState(prospect.company ?? '');
  const [email, setEmail]           = useState(prospect.email);
  const [status, setStatus]         = useState(prospect.status);
  const [country, setCountry]       = useState(prospect.country ?? '');
  const [language, setLanguage]     = useState(prospect.language ?? '');
  const [website, setWebsite]       = useState(prospect.website ?? '');
  const [notes, setNotes]           = useState(prospect.notes ?? '');
  const [followUp, setFollowUp]     = useState(prospect.follow_up_date ?? '');
  const [saving, setSaving]         = useState(false);

  async function save() {
    setSaving(true);
    await saApiFetch(`/api/admin/outreach/prospects/${prospect.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, company, email, status, country, language, website, notes, follow_up_date: followUp || null }),
    });
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 480 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: '1rem' }}>Edit Prospect</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input value={name}    onChange={setName}    placeholder="Full name" style={{ width: '100%' }} />
          <Input value={company} onChange={setCompany} placeholder="Company / property" style={{ width: '100%' }} />
          <Input value={email}   onChange={setEmail}   placeholder="Email" type="email" style={{ width: '100%' }} />
          <Input value={website} onChange={setWebsite} placeholder="Website / Facebook URL" style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={country}  onChange={setCountry}  placeholder="Country" style={{ flex: 1 }} />
            <Input value={language} onChange={setLanguage} placeholder="Language" style={{ flex: 1 }} />
          </div>
          <div>
            <select
              value={status} onChange={e => setStatus(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit', width: '100%' }}
            >
              <option value="new">New</option>
              <option value="1st_contact_sent">1 Sent</option>
              <option value="1st_followup_sent">2 Sent</option>
              <option value="2nd_followup_sent">3 Sent</option>
              <option value="3rd_followup_sent">4 Sent</option>
              <option value="replied">Replied</option>
              <option value="converted">Converted</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="complained">Complained</option>
            </select>
            {prospect.emails_sent_count > 0 && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                <i className="ti ti-send" style={{ marginRight: 4 }} />
                {prospect.emails_sent_count} email{prospect.emails_sent_count !== 1 ? 's' : ''} sent to this prospect
              </div>
            )}
          </div>
          <Textarea value={notes} onChange={setNotes} rows={3} placeholder="Notes" />
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Follow-up date</label>
            <Input value={followUp} onChange={setFollowUp} type="date" style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Email Composer modal ──────────────────────────────────────────────────────
function ComposeModal({ selectedIds, prospects, templates, campaigns, dailyCount = 0, limitEnabled = true, onClose, onSent }) {
  const selected = prospects
    .filter(p => selectedIds.includes(p.id) && !BLOCKED_STATUSES.has(p.status))
    .filter((p, i, self) => self.findIndex(t => t.email === p.email) === i);
  const blockedCount = selectedIds.filter(id => {
    const p = prospects.find(q => q.id === id);
    return p && BLOCKED_STATUSES.has(p.status);
  }).length;
  const [subject, setSubject]       = useState('');
  const [body, setBody]             = useState('');
  const [htmlMode, setHtmlMode]     = useState(false);
  const [tmplId, setTmplId]         = useState('');
  const [campId, setCampId]         = useState('');
  const [followUpDays, setFollowUpDays] = useState(7);
  const [sendLimit, setSendLimit]   = useState(limitEnabled ? 100 : null);
  const [sending, setSending]       = useState(false);
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0 });
  const [sendError, setSendError]   = useState(null);
  const [result, setResult]         = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const sendingRef                  = useRef(false); // synchronous guard against double-click

  function loadTemplate(id) {
    const t = templates.find(t => t.id === Number(id));
    if (t) {
      setSubject(t.subject); setBody(t.body); setTmplId(id);
      // Auto-switch to HTML mode if template was saved as raw HTML
      setHtmlMode(/<(div|table|td|tr|section|style)\b/i.test(t.body));
    }
  }

  async function send() {
    if (sendingRef.current || !subject.trim() || !body.trim()) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      // Fresh daily capacity check before sending
      const dcRes = await saApiFetch('/api/admin/outreach/daily-count');
      const freshData = await dcRes.json();
      const freshRemaining = freshData.limitEnabled ? (freshData.remaining ?? Infinity) : Infinity;
      if (freshData.limitEnabled && freshData.count >= 100) {
        setSendError('Daily email limit reached (100/day on Resend free plan). Try again tomorrow.');
        sendingRef.current = false;
        setSending(false);
        return;
      }
      // Cap by both the selector limit and fresh remaining capacity
      const cap = sendLimit === null ? (freshData.limitEnabled ? freshRemaining : selected.length) : Math.min(sendLimit, freshRemaining);
      const toSend = selected.slice(0, cap);

      // Chunk into batches of 50 — large single requests can exceed nginx's
      // proxy_read_timeout before the server finishes writing the response
      const CHUNK = 50;
      let totalSent = 0, totalSkipped = 0, allResults = [], allSkippedReasons = [];
      setSendProgress({ done: 0, total: toSend.length });
      for (let i = 0; i < toSend.length; i += CHUNK) {
        const chunk = toSend.slice(i, i + CHUNK);
        const res = await saApiFetch('/api/admin/outreach/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospect_ids: chunk.map(p => p.id), subject, body, template_id: tmplId || null, campaign_id: campId || null, followUpDays }),
        });
        const data = await res.json();
        totalSent += data.sent ?? 0;
        totalSkipped += data.skipped ?? 0;
        if (data.results) allResults.push(...data.results);
        if (data.skippedReasons) allSkippedReasons.push(...data.skippedReasons);
        setSendProgress({ done: Math.min(i + CHUNK, toSend.length), total: toSend.length });
      }
      setResult({ sent: totalSent, skipped: totalSkipped, results: allResults, skippedReasons: allSkippedReasons });
      onSent();
    } catch {
      // Only re-enable on network error so the user can retry
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (result) {
    const ok      = result.sent  ?? (result.results?.filter(r => r.ok).length ?? 0);
    const fail    = result.results?.filter(r => !r.ok && result.skippedReasons?.every(sr => !sr.startsWith(String(r.id) + ':'))).length ?? 0;
    const skipped = result.skipped ?? 0;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 28, maxWidth: 400 }}>
          <h3 style={{ margin: '0 0 12px' }}>Email sent</h3>
          <p style={{ color: '#166534', margin: '0 0 8px' }}>✓ {ok} sent successfully</p>
          {skipped > 0 && <p style={{ color: '#92400e', margin: '0 0 8px' }}>⏭ {skipped} skipped (unsubscribed / complained / converted)</p>}
          {fail > 0 && <p style={{ color: '#dc2626', margin: '0 0 8px' }}>✗ {fail} failed to send</p>}
          <Btn onClick={onClose} style={{ marginTop: 12 }}>Close</Btn>
        </div>
      </div>
    );
  }

  return (
    <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>

        {/* ── Header — always visible ── */}
        <div style={{ padding: '18px 24px 14px', flexShrink: 0, borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Compose Email</h3>
          <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 6 }}>
            Sending to {selected.length} prospect{selected.length !== 1 ? 's' : ''}
          </div>
          <div style={{ maxHeight: 80, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', background: '#f8fafc', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {selected.map(p => (
              <span key={p.id} style={{ background: '#e8f5e2', color: '#1a4710', padding: '2px 10px', borderRadius: 20, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                {p.name || p.email}
              </span>
            ))}
          </div>
          {blockedCount > 0 && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, fontSize: '0.8rem', color: '#92400e' }}>
              {blockedCount} prospect{blockedCount !== 1 ? 's' : ''} excluded — already unsubscribed, complained, or converted
            </div>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {limitEnabled && selected.length > 100 && sendLimit === null && (
            <div style={{
              background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
              padding: '10px 14px', fontSize: '0.82rem', color: '#92400e',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <i className="ti ti-alert-triangle" /> <strong>Resend daily limit:</strong> Sending more than 100 emails per day may trigger account suspension. Use the send limit selector below or upgrade your Resend plan.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={tmplId} onChange={e => loadTemplate(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem', fontFamily: 'inherit' }}
            >
              <option value="">— Load a template —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select
              value={campId} onChange={e => setCampId(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem', fontFamily: 'inherit' }}
            >
              <option value="">— Campaign (optional) —</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
            Merge fields: {'{{name}}'} {'{{first_name}}'} {'{{company}}'} {'{{source}}'} {'{{website}}'} {'{{country}}'}
          </p>

          <Input value={subject} onChange={setSubject} placeholder="Subject *" style={{ width: '100%' }} />

          {/* ── Editor mode toggle ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
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
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Paste raw HTML here — rendered as-is in the email"
              style={{
                width: '100%', height: 260, fontFamily: 'monospace', fontSize: '0.78rem',
                border: '1px solid #1a4710', borderRadius: 8, padding: '10px 12px',
                resize: 'vertical', lineHeight: 1.5, color: '#1e293b', background: '#f8fff6',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <QuillEditor
              value={body}
              onChange={setBody}
              placeholder="Write your email here… use {{name}}, {{company}}"
              style={{ height: 240, overflowY: 'auto', minHeight: 0 }}
            />
          )}

          <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.8rem', color: '#475569' }}>Follow-up reminder in:&nbsp;</span>
            {[7, 14, 21].map(d => (
              <button
                key={d}
                onClick={() => setFollowUpDays(d)}
                style={{
                  marginRight: 6, padding: '3px 10px', borderRadius: 4, border: '1px solid',
                  borderColor: followUpDays === d ? '#1a4710' : '#d1d5db',
                  background: followUpDays === d ? '#d9f0cc' : '#fff',
                  color: followUpDays === d ? '#1a4710' : '#475569',
                  fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{d} days</button>
            ))}
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>— sets follow-up date after sending</span>
          </div>

          {/* ── Send limit selector ── */}
          {(() => {
            const remaining = limitEnabled ? Math.max(0, 100 - dailyCount) : null;
            return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
              Send limit:
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { label: '60',  value: 60  },
                { label: '80',  value: 80  },
                { label: '100', value: 100 },
                { label: 'All', value: null },
              ].map(opt => {
                const overLimit = limitEnabled && opt.value !== null && opt.value > (remaining ?? Infinity);
                return (
                  <button
                    key={opt.label}
                    onClick={() => !overLimit && setSendLimit(opt.value)}
                    disabled={overLimit}
                    style={{
                      padding: '5px 12px', borderRadius: 6, border: '1px solid #d1d5db',
                      background: sendLimit === opt.value ? '#1a4710' : '#fff',
                      color:      sendLimit === opt.value ? '#fff'    : '#374151',
                      fontWeight: sendLimit === opt.value ? 600       : 400,
                      cursor: overLimit ? 'not-allowed' : 'pointer',
                      opacity: overLimit ? 0.4 : 1,
                      fontSize: '0.85rem', fontFamily: 'inherit',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {limitEnabled && (
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: remaining === 0 ? '#dc2626' : remaining < 20 ? '#92400e' : '#64748b' }}>
                {remaining === 0
                  ? '⛔ Daily limit reached — try again tomorrow'
                  : `${remaining} emails remaining today`}
              </div>
            )}
          </div>
            );
          })()}
          {sendLimit !== null && (
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: -8 }}>
              Will send to {Math.min(sendLimit, limitEnabled ? Math.max(0, 100 - dailyCount) : selected.length, selected.length)} of {selected.length} prospects
            </div>
          )}
          {limitEnabled && (
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '-4px 0 4px' }}>
              Resend free plan: 100 emails/day.{' '}
              <a href="https://resend.com/pricing" target="_blank" rel="noopener noreferrer" style={{ color: '#1a4710' }}>
                Upgrade Resend ($20/mo)
              </a>{' '}for unlimited sending.
            </p>
          )}

        </div>

        {/* ── Footer — always visible ── */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0, flexWrap: 'wrap' }}>
          {sendError && (
            <div style={{ width: '100%', fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 }}>
              ⛔ {sendError}
            </div>
          )}
          {sending && sendProgress.total > 0 && (
            <div style={{ width: '100%' }}>
              <div style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 600, marginBottom: 6 }}>
                Sending {Math.min(sendProgress.done + 50, sendProgress.total)} of {sendProgress.total}…
              </div>
              <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, background: '#1a4710',
                  width: `${Math.round((sendProgress.done / sendProgress.total) * 100)}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}
          <Btn variant="secondary" onClick={onClose} disabled={sending}>Cancel</Btn>
          <Btn variant="secondary" onClick={() => setShowPreview(true)} disabled={sending || !body.trim() || body === '<p><br></p>'}>Preview</Btn>
          <Btn
            onClick={send}
            disabled={sending || !subject.trim() || !body.trim() || body === '<p><br></p>' || (limitEnabled && dailyCount >= 100)}
          >
            {sending ? `Sending… (${sendProgress.done}/${sendProgress.total})` : `Send to ${Math.min(sendLimit ?? selected.length, limitEnabled ? Math.max(0, 100 - dailyCount) : selected.length, selected.length)}`}
          </Btn>
        </div>

      </div>
    </div>
    {showPreview && <PreviewModal body={body} subject={subject} onClose={() => setShowPreview(false)} />}
    </>
  );
}

// ── Email Preview modal ───────────────────────────────────────────────────────
function PreviewModal({ body, subject, onClose }) {
  const samples = {
    '{{name}}':       'Jane Smith',
    '{{first_name}}': 'Jane',
    '{{company}}':    'The Old Mill B&B',
    '{{email}}':      'jane@example.com',
    '{{source}}':     'Google',
    '{{website}}':    'theoldmill.co.uk',
    '{{country}}':    'UK',
  };

  let previewBody = body || '';
  Object.entries(samples).forEach(([k, v]) => {
    previewBody = previewBody.split(k).join(v);
  });

  // Mirror the server-side bodyHtml logic exactly
  const bodyHtml = previewBody.trim().startsWith('<')
    ? previewBody
    : previewBody.split(/\n{2,}/)
        .map(p => `<p style="margin:0 0 16px 0;line-height:1.7">${p.replace(/\n/g, '<br>')}</p>`)
        .join('\n');

  const fullHtml = `<!DOCTYPE html>
<html>
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
    <div style="color:#1a2e14;">${bodyHtml}</div>
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
    <p style="margin:0;font-size:12px;color:#5a7a52;text-align:center;line-height:1.6;">
      You received this email because you manage a hospitality property and we thought NestBook might be useful to you.<br>
      <a href="#" style="color:#5a7a52;text-decoration:underline;">Unsubscribe</a>
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 700, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Email Preview</div>
            {subject && <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 2 }}>Subject: {subject}</div>}
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>Merge fields shown with sample values · Jane Smith · The Old Mill B&amp;B</div>
          </div>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
        <iframe
          srcDoc={fullHtml}
          title="Email preview"
          sandbox="allow-same-origin"
          style={{ flex: 1, border: 'none', minHeight: 480 }}
        />
      </div>
    </div>
  );
}

// ── Campaign Manager modal ────────────────────────────────────────────────────
function CampaignManager({ campaigns, onClose, onChanged }) {
  const [name, setName]           = useState('');
  const [desc, setDesc]           = useState('');
  const [saving, setSaving]       = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    await saApiFetch('/api/admin/outreach/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc }),
    });
    setSaving(false); setName(''); setDesc(''); onChanged();
  }

  async function del(id) {
    if (!window.confirm('Delete this campaign?')) return;
    await saApiFetch(`/api/admin/outreach/campaigns/${id}`, { method: 'DELETE' });
    onChanged();
  }

  const statusLabel = { draft: 'Draft', active: 'Active', completed: 'Done' };
  const statusColour = { draft: '#94a3b8', active: '#1a4710', completed: '#64748b' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1rem' }}>Campaigns</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Input value={name} onChange={setName} placeholder="Campaign name" style={{ flex: 1 }} />
          <Input value={desc} onChange={setDesc} placeholder="Description (optional)" style={{ flex: 1 }} />
          <Btn onClick={create} disabled={saving || !name.trim()}>Add</Btn>
        </div>

        {campaigns.map(c => (
          <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name}</div>
              {c.description && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{c.description}</div>}
              <div style={{ fontSize: '0.75rem', color: statusColour[c.status], marginTop: 2, fontWeight: 600 }}>
                {statusLabel[c.status]} · {c.sent_count} sent
              </div>
            </div>
            <Btn small variant="danger" onClick={() => del(c.id)}>Delete</Btn>
          </div>
        ))}

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}

// ── CSV Import modal ──────────────────────────────────────────────────────────
function CsvImportModal({ onClose, onImported }) {
  const [raw, setRaw]       = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);

  function parseRows(text) {
    // Strip UTF-8 BOM (added by Excel / our template) and normalise line endings
    const cleaned = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleaned.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      return {
        name:          obj.name          || obj['full name']   || '',
        company:       obj.property_name || obj.company        || obj.property || '',
        email:         obj.email                               || '',
        phone:         obj.phone         || obj.telephone      || obj['phone number'] || '',
        property_type: obj.property_type || obj.type           || '',
        country:       obj.country                             || '',
        region:        obj.region                              || '',
        town:          obj.town          || obj.city           || '',
        language:      obj.language                            || '',
        website:       obj.website                             || '',
        notes:         obj.notes                               || '',
      };
    }).filter(r => r.email);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setRaw(ev.target.result);
      setPreview(parseRows(ev.target.result).slice(0, 5));
    };
    reader.readAsText(file);
  }

  async function doImport() {
    const rows = parseRows(raw);
    if (rows.length === 0) {
      setResult({ imported: 0, skipped: 0, errors: ['No valid rows found — check the file has an email column.'] });
      return;
    }
    setSaving(true);
    try {
      const res = await saApiFetch('/api/admin/outreach/prospects/bulk-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      setResult(res.ok ? data : { imported: 0, skipped: 0, errors: [data.error || 'Server error'] });
      onImported();
    } catch (err) {
      setResult({ imported: 0, skipped: 0, errors: [err.message || 'Network error'] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 500 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Bulk Import from CSV</h3>
        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 12px' }}>
          Required columns: <code>name</code>, <code>email</code>. Optional: <code>company</code>, <code>phone</code>, <code>property_type</code>, <code>region</code>, <code>town</code>, <code>country</code>, <code>language</code>, <code>website</code>, <code>source</code>, <code>notes</code>. Use ↓ CSV template for the full format.
        </p>

        {result ? (
          <div>
            {result.imported > 0 && <div style={{ color: '#166534', marginBottom: 6 }}><i className="ti ti-check" /> {result.imported} prospect{result.imported !== 1 ? 's' : ''} imported successfully.</div>}
            {result.skipped  > 0 && <div style={{ color: '#92400e', marginBottom: 6 }}>⚠ {result.skipped} skipped (duplicates or missing name/email).</div>}
            {result.errors?.map((e, i) => <div key={i} style={{ color: '#dc2626', marginBottom: 6 }}>✗ {e}</div>)}
            {result.imported === 0 && !result.errors?.length && <div style={{ color: '#64748b', marginBottom: 6 }}>No new prospects added.</div>}
            <Btn onClick={onClose} style={{ marginTop: 14 }}>Close</Btn>
          </div>
        ) : (
          <>
            <input type="file" accept=".csv" onChange={handleFileChange} style={{ marginBottom: 12 }} />

            {preview && preview.length > 0 && (
              <div style={{ background: '#f8fafc', borderRadius: 6, padding: 12, marginBottom: 12, fontSize: '0.8rem' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Preview ({preview.length} rows):</div>
                {preview.map((r, i) => (
                  <div key={i} style={{ marginBottom: 2 }}>{r.name} — {r.email} {r.company ? `(${r.company})` : ''}</div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
              <Btn onClick={doImport} disabled={saving || !raw.trim()}>{saving ? 'Importing…' : 'Import'}</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Bulk Edit modal ───────────────────────────────────────────────────────────
function BulkEditModal({ selectedIds, onClose, onSaved }) {
  const [fields, setFields] = useState({
    name: false, website: false, source: false, country: false,
    language: false, status: false, notes: false,
  });
  const [name, setName]         = useState('');
  const [website, setWebsite]   = useState('');
  const [source, setSource]     = useState('csv');
  const [country, setCountry]   = useState('');
  const [language, setLanguage] = useState('');
  const [status, setStatus]     = useState('new');
  const [notes, setNotes]       = useState('');
  const [notesMode, setNotesMode] = useState('replace'); // replace | append
  const [saving, setSaving]     = useState(false);
  const [progress, setProgress] = useState(0);

  function toggleField(f) {
    setFields(prev => ({ ...prev, [f]: !prev[f] }));
  }

  const activeFields = Object.keys(fields).filter(f => fields[f]);

  async function save() {
    if (activeFields.length === 0) return;
    setSaving(true);
    const body = {};
    if (fields.name)     body.name     = name.trim();
    if (fields.website)  body.website  = website.trim()  || null;
    if (fields.source)   body.source   = source;
    if (fields.country)  body.country  = country.trim()  || null;
    if (fields.language) body.language = language.trim() || null;
    if (fields.status)   body.status   = status;
    if (fields.notes)    body.notes    = notes.trim()    || null;
    if (fields.notes && notesMode === 'append') body._notesAppend = true;

    let done = 0;
    for (const id of selectedIds) {
      const payload = { ...body };
      if (fields.notes && notesMode === 'append') {
        // fetch current notes and append
        const res = await saApiFetch(`/api/admin/outreach/prospects/${id}`);
        if (res.ok) {
          const p = await res.json();
          const existing = p.notes ? p.notes.trim() : '';
          payload.notes = existing ? `${existing}\n${notes.trim()}` : notes.trim();
        }
        delete payload._notesAppend;
      }
      await saApiFetch(`/api/admin/outreach/prospects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      done++;
      setProgress(done);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  const selStyle = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit', width: '100%' };
  const rowStyle = (active) => ({
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
    borderBottom: '1px solid #f1f5f9', opacity: active ? 1 : 0.45,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Bulk Edit</h3>
        <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: '#64748b' }}>
          Check a field to update it across all {selectedIds.length} selected prospect{selectedIds.length !== 1 ? 's' : ''}. Unchecked fields are left unchanged.
        </p>

        {/* Name */}
        <div style={rowStyle(fields.name)}>
          <input type="checkbox" checked={fields.name} onChange={() => toggleField('name')} style={{ marginTop: 9, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>Name</div>
            <Input value={name} onChange={setName} placeholder="e.g. Sir, Madam, or full name" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Website */}
        <div style={rowStyle(fields.website)}>
          <input type="checkbox" checked={fields.website} onChange={() => toggleField('website')} style={{ marginTop: 9, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>Website / Facebook URL</div>
            <Input value={website} onChange={setWebsite} placeholder="e.g. https://facebook.com/myguesthouse" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Source */}
        <div style={rowStyle(fields.source)}>
          <input type="checkbox" checked={fields.source} onChange={() => toggleField('source')} style={{ marginTop: 9, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>Source</div>
            <select value={source} onChange={e => setSource(e.target.value)} style={selStyle}>
              <option value="manual">Manual</option>
              <option value="csv">CSV</option>
              <option value="facebook">Facebook</option>
              <option value="google">Google</option>
              <option value="booking_com">Booking.com</option>
              <option value="airbnb">Airbnb</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Country */}
        <div style={rowStyle(fields.country)}>
          <input type="checkbox" checked={fields.country} onChange={() => toggleField('country')} style={{ marginTop: 9, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>Country</div>
            <Input value={country} onChange={setCountry} placeholder="e.g. UK" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Language */}
        <div style={rowStyle(fields.language)}>
          <input type="checkbox" checked={fields.language} onChange={() => toggleField('language')} style={{ marginTop: 9, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>Language</div>
            <Input value={language} onChange={setLanguage} placeholder="e.g. en" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Status */}
        <div style={rowStyle(fields.status)}>
          <input type="checkbox" checked={fields.status} onChange={() => toggleField('status')} style={{ marginTop: 9, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>Status</div>
            <select value={status} onChange={e => setStatus(e.target.value)} style={selStyle}>
              <option value="new">New</option>
              <option value="1st_contact_sent">1 Sent</option>
              <option value="1st_followup_sent">2 Sent</option>
              <option value="2nd_followup_sent">3 Sent</option>
              <option value="3rd_followup_sent">4 Sent</option>
              <option value="replied">Replied</option>
              <option value="converted">Converted</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="complained">Complained</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div style={rowStyle(fields.notes)}>
          <input type="checkbox" checked={fields.notes} onChange={() => toggleField('notes')} style={{ marginTop: 9, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Notes</span>
              <label style={{ fontSize: '0.78rem', color: '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="notesMode" value="replace" checked={notesMode === 'replace'} onChange={() => setNotesMode('replace')} style={{ marginRight: 3 }} />
                Replace
              </label>
              <label style={{ fontSize: '0.78rem', color: '#64748b', cursor: 'pointer' }}>
                <input type="radio" name="notesMode" value="append" checked={notesMode === 'append'} onChange={() => setNotesMode('append')} style={{ marginRight: 3 }} />
                Append
              </label>
            </div>
            <Textarea value={notes} onChange={setNotes} rows={3} placeholder="Notes text…" />
          </div>
        </div>

        {saving && (
          <div style={{ margin: '12px 0', fontSize: '0.82rem', color: '#475569' }}>
            Updating… {progress} / {selectedIds.length}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={save} disabled={saving || activeFields.length === 0}>
            {saving ? 'Saving…' : `Apply to ${selectedIds.length}`}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function downloadCsvTemplate() {
  const headers = 'name,company,email,phone,property_type,country,region,town,language,website,source,notes';
  const rows = [
    '"Jane Smith","The Old Rectory B&B","jane@theoldrectory.co.uk","01539 432156","bb","uk","Lake District","Ambleside","en","https://theoldrectory.co.uk","Google","Beautiful property, 6 rooms, active on Facebook"',
    '"Pierre Dubois","Gîte Les Lavandes","pierre@gitelesslavandes.fr","+33 4 90 12 34 56","gite","fr","Provence","Roussillon","fr","https://gitelesslavandes.fr","Facebook","Whole property rental, stunning photos"',
    '"","Lakeside Guest House","","01539 443210","guesthouse","uk","Lake District","Windermere","en","","Google","No email found — phone only"',
  ];
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'nestbook-prospects-template.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function Outreach() {
  const [stats, setStats]           = useState(null);
  const [prospects, setProspects]   = useState([]);
  const [total, setTotal]           = useState(0);
  const [templates, setTemplates]   = useState([]);
  const [campaigns, setCampaigns]   = useState([]);
  const [followUps, setFollowUps]   = useState([]);
  const [dailyCount, setDailyCount]   = useState(0);
  const [limitEnabled, setLimitEnabled] = useState(true);

  // Filters — shared across both tabs (all client-side)
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState('actionable');
  const [filterSource, setFilterSource]   = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterLang, setFilterLang]       = useState('');
  const [filterFollowUp, setFilterFollowUp] = useState('');

  // UI state
  const [selected, setSelected]         = useState([]);
  const [showAdd, setShowAdd]           = useState(false);
  const [editing, setEditing]           = useState(null);
  const [showCompose, setShowCompose]   = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [showCsv, setShowCsv]           = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [tab, setTab]                   = useState('prospects'); // prospects | followup

  const load = useCallback(async () => {
    const [pRes, sRes, tRes, cRes, fRes, dcRes, lsRes] = await Promise.all([
      saApiFetch('/api/admin/outreach/prospects'),
      saApiFetch('/api/admin/outreach/stats'),
      saApiFetch('/api/admin/outreach/templates'),
      saApiFetch('/api/admin/outreach/campaigns'),
      saApiFetch('/api/admin/outreach/prospects/follow-up'),
      saApiFetch('/api/admin/outreach/daily-count'),
      saApiFetch('/api/admin/outreach/limit-status'),
    ]);
    if (pRes.ok) { const d = await pRes.json(); setProspects(d.prospects); setTotal(d.total); }
    if (sRes.ok) setStats(await sRes.json());
    if (tRes.ok) setTemplates(await tRes.json());
    if (cRes.ok) setCampaigns(await cRes.json());
    if (fRes.ok) setFollowUps(await fRes.json());
    if (dcRes.ok) { const d = await dcRes.json(); setDailyCount(d.count); }
    if (lsRes.ok) { const d = await lsRes.json(); setLimitEnabled(d.enabled); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleLimit() {
    const newVal = !limitEnabled;
    setLimitEnabled(newVal);
    await saApiFetch('/api/admin/outreach/limit-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newVal }),
    });
  }

  // Derived state — computed every render, no useMemo needed at this scale
  const today = new Date().toISOString().split('T')[0];
  const filteredProspects = prospects.filter(p => {
    if (search) {
      const terms = search.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      const hit = t =>
        p.name?.toLowerCase().includes(t) ||
        p.email?.toLowerCase().includes(t) ||
        p.company?.toLowerCase().includes(t) ||
        p.source?.toLowerCase().includes(t) ||
        p.notes?.toLowerCase().includes(t) ||
        p.website?.toLowerCase().includes(t) ||
        p.country?.toLowerCase().includes(t) ||
        p.language?.toLowerCase().includes(t);
      if (!terms.every(hit)) return false;
    }
    if (filterStatus === 'actionable') {
      if (BLOCKED_STATUSES.has(p.status)) return false;
    } else if (filterStatus) {
      if (p.status !== filterStatus) return false;
    }
    if (filterSource  && p.source   !== filterSource)  return false;
    if (filterCountry && p.country  !== filterCountry) return false;
    if (filterLang    && p.language !== filterLang)    return false;
    if (filterFollowUp === 'today'   && p.follow_up_date !== today)                        return false;
    if (filterFollowUp === 'overdue' && !(p.follow_up_date && p.follow_up_date < today))   return false;
    if (filterFollowUp === 'set'     && !p.follow_up_date)                                 return false;
    if (filterFollowUp === 'none'    && p.follow_up_date)                                  return false;
    return true;
  });

  const filteredFollowUps = followUps.filter(p => {
    if (search) {
      const terms = search.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      const hit = t =>
        p.name?.toLowerCase().includes(t) ||
        p.email?.toLowerCase().includes(t) ||
        p.company?.toLowerCase().includes(t) ||
        p.source?.toLowerCase().includes(t) ||
        p.notes?.toLowerCase().includes(t) ||
        p.website?.toLowerCase().includes(t) ||
        p.country?.toLowerCase().includes(t) ||
        p.language?.toLowerCase().includes(t);
      if (!terms.every(hit)) return false;
    }
    if (filterStatus === 'actionable') {
      if (BLOCKED_STATUSES.has(p.status)) return false;
    } else if (filterStatus) {
      if (p.status !== filterStatus) return false;
    }
    if (filterSource  && p.source   !== filterSource)  return false;
    if (filterCountry && p.country  !== filterCountry) return false;
    if (filterLang    && p.language !== filterLang)    return false;
    return true;
  });

  const countries = [...new Set(prospects.map(p => p.country).filter(Boolean))].sort();
  const languages = [...new Set(prospects.map(p => p.language).filter(Boolean))].sort();
  const sources   = [...new Set(prospects.map(p => p.source).filter(Boolean))].sort();

  const anyFilter = search || filterStatus !== 'actionable' || filterSource || filterCountry || filterLang || filterFollowUp;

  function clearFilters() {
    setSearch(''); setFilterStatus('actionable'); setFilterSource('');
    setFilterCountry(''); setFilterLang(''); setFilterFollowUp('');
    setSelected([]);
  }

  function toggleSelect(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  function toggleAll() {
    const pool = tab === 'followup' ? filteredFollowUps : filteredProspects;
    setSelected(selected.length === pool.length ? [] : pool.map(p => p.id));
  }

  async function bulkChangeStatus(newStatus) {
    for (const id of selected) {
      await saApiFetch(`/api/admin/outreach/prospects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    }
    load(); setSelected([]);
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selected.length} prospect(s)?`)) return;
    for (const id of selected) {
      await saApiFetch(`/api/admin/outreach/prospects/${id}`, { method: 'DELETE' });
    }
    load(); setSelected([]);
  }

  async function markComplained(id) {
    if (!window.confirm('Mark this prospect as complained? They will be blocked from future sends.')) return;
    await saApiFetch(`/api/admin/outreach/prospects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'complained' }),
    });
    load();
  }

  function exportCsv() {
    const pool = [...prospects, ...followUps.filter(f => !prospects.find(p => p.id === f.id))];
    const rows = pool.filter(p => selected.includes(p.id));
    const header = ['id','name','company','email','country','language','source','status','follow_up_date','notes','created_at'];
    const lines = [header.join(','), ...rows.map(p =>
      header.map(k => JSON.stringify(p[k] ?? '')).join(',')
    )];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'prospects-export.csv'; a.click(); URL.revokeObjectURL(a.href);
  }

  async function delProspect(id) {
    if (!window.confirm('Delete this prospect?')) return;
    await saApiFetch(`/api/admin/outreach/prospects/${id}`, { method: 'DELETE' });
    setSelected(s => s.filter(x => x !== id));
    load();
  }

  const tabStyle = active => ({
    padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem',
    cursor: 'pointer', border: 'none', fontFamily: 'inherit',
    background: active ? '#1a4710' : '#f1f5f9',
    color: active ? '#fff' : '#374151',
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>Prospect Outreach</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            CRM for reaching out to potential B&B and guesthouse owners
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" onClick={() => setShowCampaigns(true)}>Campaigns</Btn>
          <Btn variant="secondary" onClick={() => setShowTemplates(true)}>Templates</Btn>
          <Btn variant="secondary" onClick={downloadCsvTemplate}>↓ CSV template</Btn>
          <Btn variant="secondary" onClick={() => setShowCsv(true)}>Import CSV</Btn>
          <Btn onClick={() => setShowAdd(true)}>+ Add Prospect</Btn>
        </div>
      </div>

      <StatsBar stats={stats} />

      {/* ── Limiter toggle ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
        background: limitEnabled ? '#fef9c3' : '#f0fdf4',
        border: `1px solid ${limitEnabled ? '#fde047' : '#bbf7d0'}`,
        borderRadius: 8,
        marginBottom: 8,
      }}>
        <i className={`ti ${limitEnabled ? 'ti-lock' : 'ti-lock-open'}`}
           style={{ fontSize: 16, color: limitEnabled ? '#854d0e' : '#166534' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: limitEnabled ? '#854d0e' : '#166534', flex: 1 }}>
          {limitEnabled ? 'Daily limit: ON (100/day)' : 'Daily limit: OFF — unlimited sending'}
        </span>
        <button
          onClick={toggleLimit}
          style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 6,
            border: `1px solid ${limitEnabled ? '#fde047' : '#bbf7d0'}`,
            background: limitEnabled ? '#fef08a' : '#dcfce7',
            color: limitEnabled ? '#854d0e' : '#166534',
            cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
          }}
        >
          {limitEnabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>

      {/* ── Daily send counter ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 8, marginBottom: 16,
        background: (limitEnabled && dailyCount >= 100) ? '#fef2f2' : (limitEnabled && dailyCount >= 80) ? '#fef3c7' : '#f0fdf4',
        border: `1px solid ${(limitEnabled && dailyCount >= 100) ? '#fca5a5' : (limitEnabled && dailyCount >= 80) ? '#fbbf24' : '#bbf7d0'}`,
        fontSize: '0.85rem', fontWeight: 600,
        color: (limitEnabled && dailyCount >= 100) ? '#dc2626' : (limitEnabled && dailyCount >= 80) ? '#92400e' : '#166534',
      }}>
        <i className="ti ti-mail" /> Today: {dailyCount} emails sent
        {limitEnabled
          ? (dailyCount >= 100 ? ' — Daily limit reached!' : ` — ${100 - dailyCount} remaining`)
          : ' — No daily limit'}
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabStyle(tab === 'prospects')} onClick={() => { setTab('prospects'); setSelected([]); }}>All Prospects ({total})</button>
        <button style={tabStyle(tab === 'followup')}  onClick={() => { setTab('followup'); setSelected([]); }}>Follow-up Queue ({followUps.length})</button>
      </div>

      {/* ── Shared filter bar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Input
          value={search} onChange={v => { setSearch(v); setSelected([]); }}
          placeholder="Search… use commas for AND: uk, guesthouse"
          style={{ flex: '2 1 180px', minWidth: 140 }}
        />
        <select
          value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setSelected([]); }}
          style={{ flex: '1 1 120px', minWidth: 110, padding: '7px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit' }}
        >
          <option value="">All statuses</option>
          <option value="actionable">Actionable</option>
          <option value="new">New</option>
          <option value="1st_contact_sent">1 Sent</option>
          <option value="1st_followup_sent">2 Sent</option>
          <option value="2nd_followup_sent">3 Sent</option>
          <option value="3rd_followup_sent">4 Sent</option>
          <option value="replied">Replied</option>
          <option value="converted">Converted</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="complained">Complained</option>
        </select>
        <select
          value={filterSource} onChange={e => { setFilterSource(e.target.value); setSelected([]); }}
          style={{ flex: '1 1 110px', minWidth: 100, padding: '7px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit' }}
        >
          <option value="">All sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterCountry} onChange={e => { setFilterCountry(e.target.value); setSelected([]); }}
          style={{ flex: '1 1 110px', minWidth: 100, padding: '7px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit' }}
        >
          <option value="">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterLang} onChange={e => { setFilterLang(e.target.value); setSelected([]); }}
          style={{ flex: '1 1 110px', minWidth: 100, padding: '7px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit' }}
        >
          <option value="">All languages</option>
          {languages.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        {tab === 'prospects' && (
          <select
            value={filterFollowUp} onChange={e => { setFilterFollowUp(e.target.value); setSelected([]); }}
            style={{ flex: '1 1 120px', minWidth: 110, padding: '7px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit' }}
          >
            <option value="">Follow-up: any</option>
            <option value="today">Due today</option>
            <option value="overdue">Overdue</option>
            <option value="set">Date set</option>
            <option value="none">No date</option>
          </select>
        )}
        {anyFilter && (
          <Btn variant="secondary" small onClick={clearFilters} style={{ alignSelf: 'stretch' }}>Clear ✕</Btn>
        )}
      </div>

      {/* ── Showing count ── */}
      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 10 }}>
        {tab === 'followup'
          ? (anyFilter
              ? `Showing ${filteredFollowUps.length} of ${followUps.length} follow-ups`
              : `${followUps.length} follow-up${followUps.length !== 1 ? 's' : ''}`)
          : (anyFilter
              ? `Showing ${filteredProspects.length} of ${prospects.length} prospects`
              : `${prospects.length} prospect${prospects.length !== 1 ? 's' : ''}`)
        }
      </div>

      {/* ── Bulk action bar (shared) ── */}
      {selected.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
          padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem',
        }}>
          <span style={{ fontWeight: 600, color: '#166534', marginRight: 4 }}>
            ✓ {selected.length} selected
          </span>
          <Btn small onClick={() => setShowCompose(true)}>Send email</Btn>
          <Btn small variant="secondary" onClick={() => setShowBulkEdit(true)}>Bulk edit</Btn>
          <select
            value=""
            onChange={e => { if (e.target.value) bulkChangeStatus(e.target.value); }}
            style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="">Change status ▾</option>
            <option value="new">New</option>
            <option value="1st_contact_sent">1 Sent</option>
            <option value="1st_followup_sent">2 Sent</option>
            <option value="2nd_followup_sent">3 Sent</option>
            <option value="3rd_followup_sent">4 Sent</option>
            <option value="replied">Replied</option>
            <option value="converted">Converted</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="complained">Complained</option>
          </select>
          <Btn small variant="danger" onClick={bulkDelete}>Delete</Btn>
          <Btn small variant="secondary" onClick={exportCsv}>Export CSV</Btn>
        </div>
      )}

      {tab === 'followup' && (
        <Section title="Follow-up Queue" action={
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Due today or overdue</span>
        }>
          {followUps.length === 0 ? (
            <p style={{ color: '#94a3b8', margin: 0 }}>No follow-ups due right now.</p>
          ) : filteredFollowUps.length === 0 ? (
            <p style={{ color: '#94a3b8', margin: 0 }}>No follow-ups match the current filters.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', width: 32 }}>
                      <input type="checkbox" checked={selected.length === filteredFollowUps.length && filteredFollowUps.length > 0} onChange={toggleAll} />
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Company</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Follow-up Date</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredFollowUps.map(p => {
                    const overdue  = p.follow_up_date && p.follow_up_date < today;
                    const dueToday = p.follow_up_date && p.follow_up_date === today;
                    const rowBg    = selected.includes(p.id) ? '#f0fdf4' : overdue ? '#fff7ed' : dueToday ? '#fefce8' : 'transparent';
                    const dateColor = overdue ? '#b45309' : dueToday ? '#854d0e' : '#94a3b8';
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc', background: rowBg }}>
                        <td style={{ padding: '8px 12px' }}>
                          <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <strong>{p.name}</strong>
                          <br /><span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{p.email}</span>
                          {p.notes && <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>{p.notes.slice(0, 50)}{p.notes.length > 50 ? '…' : ''}</div>}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>
                          {p.company || '—'}
                          {(p.country || p.language) && (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
                              {[p.country, p.language].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: dateColor, fontSize: '0.8rem', fontWeight: overdue ? 600 : 400 }}>
                          {p.follow_up_date ? new Date(p.follow_up_date + 'T00:00:00').toLocaleDateString() : '—'}
                          {overdue && <span style={{ marginLeft: 6, fontSize: '0.72rem', color: '#f97316' }}>overdue</span>}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <StatusBadge status={p.status} />
                          {p.emails_sent_count > 0 && (
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 6 }}>({p.emails_sent_count} sent)</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Btn small variant="secondary" onClick={() => setEditing(p)}>Edit</Btn>
                            <Btn small onClick={() => { setSelected([p.id]); setShowCompose(true); }}>Email</Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {tab === 'prospects' && (
        <Section title="Prospects">
          {prospects.length === 0 ? (
            <p style={{ color: '#94a3b8', margin: 0 }}>No prospects found. Add one or import a CSV.</p>
          ) : filteredProspects.length === 0 ? (
            <p style={{ color: '#94a3b8', margin: 0 }}>No prospects match the current filters.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', width: 32 }}>
                      <input type="checkbox" checked={selected.length === filteredProspects.length && filteredProspects.length > 0} onChange={toggleAll} />
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Company</th>
                    <th className="col-hide-mobile" style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Source</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Status</th>
                    <th className="col-hide-mobile" style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Added</th>
                    <th style={{ padding: '8px 12px' }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredProspects.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc', background: selected.includes(p.id) ? '#f0fdf4' : undefined }}>
                      <td style={{ padding: '8px 12px' }}>
                        <input
                          type="checkbox"
                          checked={selected.includes(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          disabled={BLOCKED_STATUSES.has(p.status)}
                        />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <strong>{p.name}</strong>
                        <br />
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{p.email || '—'}</span>
                        {p.phone && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: 2 }}>
                            <i className="ti ti-phone" style={{ fontSize: '0.75rem', marginRight: 2 }} />
                            {p.phone}
                          </div>
                        )}
                        {p.notes && <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>{p.notes.slice(0, 50)}{p.notes.length > 50 ? '…' : ''}</div>}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#475569' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.company || '—'}</div>
                        {p.town && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>
                            <i className="ti ti-map-pin" style={{ fontSize: '0.72rem', marginRight: 2 }} />
                            {p.town}{p.region ? ` · ${p.region}` : ''}
                          </div>
                        )}
                        {!p.town && (p.country || p.language) && (
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
                            {[p.country, p.language].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="col-hide-mobile" style={{ padding: '8px 12px' }}><SourceBadge source={p.source} /></td>
                      <td style={{ padding: '8px 12px' }}>
                        <StatusBadge status={p.status} />
                        {p.emails_sent_count > 0 && (
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 6 }}>({p.emails_sent_count} sent)</span>
                        )}
                      </td>
                      <td className="col-hide-mobile" style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '0.78rem' }}>
                        {new Date(p.created_at).toLocaleDateString()}
                        {p.follow_up_date && <div style={{ color: '#92400e', fontWeight: 600 }}>Follow-up: {new Date(p.follow_up_date).toLocaleDateString()}</div>}
                        {p.converted_at && <div style={{ color: '#166534', fontWeight: 600 }}>Converted!</div>}
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Btn small variant="secondary" onClick={() => setEditing(p)}>Edit</Btn>
                          {!BLOCKED_STATUSES.has(p.status) && (
                            <Btn small onClick={() => { setSelected([p.id]); setShowCompose(true); }}>Email</Btn>
                          )}
                          {p.status !== 'complained' && (
                            <Btn small variant="danger" onClick={() => markComplained(p.id)} title="Mark as complained" style={{ padding: '4px 7px' }}>!</Btn>
                          )}
                          <Btn small variant="danger" onClick={() => delProspect(p.id)}>✕</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* ── Modals ── */}
      {showAdd && <AddProspectModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {editing  && <EditProspectModal prospect={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {showCompose && (
        <ComposeModal
          selectedIds={selected}
          prospects={prospects.concat(followUps)}
          templates={templates}
          campaigns={campaigns}
          dailyCount={dailyCount}
          limitEnabled={limitEnabled}
          onClose={() => setShowCompose(false)}
          onSent={load}
        />
      )}
      {showTemplates && (
        <TemplateManager
          apiBase="/api/admin/outreach"
          bodyField="body"
          onClose={() => setShowTemplates(false)}
          onChanged={load}
        />
      )}
      {showCampaigns && <CampaignManager campaigns={campaigns} onClose={() => setShowCampaigns(false)} onChanged={load} />}
      {showCsv       && <CsvImportModal  onClose={() => setShowCsv(false)} onImported={load} />}
      {showBulkEdit  && <BulkEditModal  selectedIds={selected} onClose={() => setShowBulkEdit(false)} onSaved={() => { load(); setSelected([]); }} />}
    </div>
  );
}
