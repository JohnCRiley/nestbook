import { useState, useEffect, useCallback, useRef } from 'react';
import { saApiFetch } from '../saApiFetch.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { return (n ?? 0).toLocaleString(); }

function StatusBadge({ status }) {
  const colours = {
    new:              { bg: '#eff6ff', color: '#1d4ed8', label: 'New' },
    contacted:        { bg: '#fef9c3', color: '#92400e', label: 'Contacted' },
    follow_up_sent:   { bg: '#fff7ed', color: '#c2410c', label: 'Follow-up sent' },
    replied:          { bg: '#f0fdf4', color: '#166534', label: 'Replied' },
    converted:        { bg: '#dcfce7', color: '#15803d', label: 'Converted' },
    unsubscribed:     { bg: '#f1f5f9', color: '#64748b', label: 'Unsubscribed' },
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
  const [name, setName]       = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail]     = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  async function save() {
    if (!name.trim() || !email.trim()) { setErr('Name and email are required.'); return; }
    setSaving(true); setErr('');
    const res = await saApiFetch('/api/admin/outreach/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, company, email, country, language, notes }),
    });
    setSaving(false);
    if (res.ok) { onSaved(); onClose(); }
    else { const d = await res.json(); setErr(d.error || 'Failed to save'); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 440 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: '1rem' }}>Add Prospect</h3>
        {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>{err}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input value={name}    onChange={setName}    placeholder="Full name *" style={{ width: '100%' }} />
          <Input value={company} onChange={setCompany} placeholder="Company / property name" style={{ width: '100%' }} />
          <Input value={email}   onChange={setEmail}   placeholder="Email address *" type="email" style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={country}  onChange={setCountry}  placeholder="Country" style={{ flex: 1 }} />
            <Input value={language} onChange={setLanguage} placeholder="Language" style={{ flex: 1 }} />
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
  const [name, setName]             = useState(prospect.name);
  const [company, setCompany]       = useState(prospect.company ?? '');
  const [email, setEmail]           = useState(prospect.email);
  const [status, setStatus]         = useState(prospect.status);
  const [country, setCountry]       = useState(prospect.country ?? '');
  const [language, setLanguage]     = useState(prospect.language ?? '');
  const [notes, setNotes]           = useState(prospect.notes ?? '');
  const [followUp, setFollowUp]     = useState(prospect.follow_up_date ?? '');
  const [saving, setSaving]         = useState(false);

  async function save() {
    setSaving(true);
    await saApiFetch(`/api/admin/outreach/prospects/${prospect.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, company, email, status, country, language, notes, follow_up_date: followUp || null }),
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
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={country}  onChange={setCountry}  placeholder="Country" style={{ flex: 1 }} />
            <Input value={language} onChange={setLanguage} placeholder="Language" style={{ flex: 1 }} />
          </div>
          <select
            value={status} onChange={e => setStatus(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit' }}
          >
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="follow_up_sent">Follow-up sent</option>
            <option value="replied">Replied</option>
            <option value="converted">Converted</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
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
function ComposeModal({ selectedIds, prospects, templates, campaigns, onClose, onSent }) {
  const selected = prospects
    .filter(p => selectedIds.includes(p.id) && p.status !== 'unsubscribed')
    .filter((p, i, self) => self.findIndex(t => t.email === p.email) === i);
  const [subject, setSubject]       = useState('');
  const [body, setBody]             = useState('');
  const [tmplId, setTmplId]         = useState('');
  const [campId, setCampId]         = useState('');
  const [followUpDays, setFollowUpDays] = useState(7);
  const [sending, setSending]       = useState(false);
  const [result, setResult]         = useState(null);
  const sendingRef                  = useRef(false); // synchronous guard against double-click

  function loadTemplate(id) {
    const t = templates.find(t => t.id === Number(id));
    if (t) { setSubject(t.subject); setBody(t.body); setTmplId(id); }
  }

  async function send() {
    if (sendingRef.current || !subject.trim() || !body.trim()) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const res = await saApiFetch('/api/admin/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_ids: selected.map(p => p.id), subject, body, template_id: tmplId || null, campaign_id: campId || null, followUpDays }),
      });
      const data = await res.json();
      setResult(data.results);
      onSent();
    } catch {
      // Only re-enable on network error so the user can retry
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (result) {
    const ok = result.filter(r => r.ok).length;
    const fail = result.length - ok;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 28, maxWidth: 380 }}>
          <h3 style={{ margin: '0 0 12px' }}>Email sent</h3>
          <p style={{ color: '#166534' }}>✓ {ok} sent successfully</p>
          {fail > 0 && <p style={{ color: '#dc2626' }}>✗ {fail} failed</p>}
          <Btn onClick={onClose} style={{ marginTop: 12 }}>Close</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 580 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Compose Email</h3>
        <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '0 0 16px' }}>
          To: {selected.map(p => p.name).join(', ')} ({selected.length} recipient{selected.length !== 1 ? 's' : ''})
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select
            value={tmplId} onChange={e => loadTemplate(e.target.value)}
            style={{ flex: 1, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem', fontFamily: 'inherit' }}
          >
            <option value="">— Load a template —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            value={campId} onChange={e => setCampId(e.target.value)}
            style={{ flex: 1, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem', fontFamily: 'inherit' }}
          >
            <option value="">— Campaign (optional) —</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 10px' }}>
          Available in subject and body: {'{{name}}'} {'{{company}}'} {'{{first_name}}'}
        </p>

        <Input value={subject} onChange={setSubject} placeholder="Subject *" style={{ width: '100%', marginBottom: 10 }} />
        <Textarea value={body} onChange={setBody} rows={10} placeholder="Email body *" />

        <div style={{ marginTop: 14, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569' }}>
            Follow-up reminder in:&nbsp;
          </span>
          {[7, 14, 21].map(d => (
            <button
              key={d}
              onClick={() => setFollowUpDays(d)}
              style={{
                marginRight: 6, padding: '3px 10px', borderRadius: 4, border: '1px solid',
                borderColor: followUpDays === d ? 'var(--accent)' : '#d1d5db',
                background: followUpDays === d ? 'var(--light-green)' : '#fff',
                color: followUpDays === d ? 'var(--heading-text)' : '#475569',
                fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >{d} days</button>
          ))}
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            — sets follow-up date automatically after sending
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={send} disabled={sending || !subject.trim() || !body.trim()}>
            {sending ? 'Sending…' : `Send to ${selected.length}`}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Template Manager modal ────────────────────────────────────────────────────
function TemplateManager({ templates, onClose, onChanged }) {
  const [editing, setEditing]   = useState(null);
  const [name, setName]         = useState('');
  const [subject, setSubject]   = useState('');
  const [body, setBody]         = useState('');
  const [saving, setSaving]     = useState(false);

  function startNew()  { setEditing('new'); setName(''); setSubject(''); setBody(''); }
  function startEdit(t){ setEditing(t.id); setName(t.name); setSubject(t.subject); setBody(t.body); }
  function cancel()    { setEditing(null); }

  async function save() {
    if (!name || !subject || !body) return;
    setSaving(true);
    if (editing === 'new') {
      await saApiFetch('/api/admin/outreach/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, body }),
      });
    } else {
      await saApiFetch(`/api/admin/outreach/templates/${editing}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, body }),
      });
    }
    setSaving(false); setEditing(null); onChanged();
  }

  async function del(id) {
    if (!window.confirm('Delete this template?')) return;
    await saApiFetch(`/api/admin/outreach/templates/${id}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Email Templates</h3>
          <Btn onClick={startNew} small>+ New Template</Btn>
        </div>

        {editing && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>{editing === 'new' ? 'New Template' : 'Edit Template'}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input value={name}    onChange={setName}    placeholder="Template name" style={{ width: '100%' }} />
              <Input value={subject} onChange={setSubject} placeholder="Email subject" style={{ width: '100%' }} />
              <Textarea value={body} onChange={setBody} rows={8} placeholder="Email body (use {{name}}, {{company}})" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Btn onClick={save} small disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
              <Btn variant="secondary" onClick={cancel} small>Cancel</Btn>
            </div>
          </div>
        )}

        {templates.map(t => (
          <div key={t.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{t.subject}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{t.body.slice(0, 80)}…</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <Btn small variant="secondary" onClick={() => startEdit(t)}>Edit</Btn>
              <Btn small variant="danger"    onClick={() => del(t.id)}>Delete</Btn>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
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
        name:    obj.name          || obj['full name']   || '',
        company: obj.property_name || obj.company        || obj.property || '',
        email:   obj.email                               || '',
        notes:   obj.notes                               || '',
      };
    }).filter(r => r.email && r.name);
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
      setResult({ imported: 0, skipped: 0, errors: ['No valid rows found — check the file has name and email columns.'] });
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
          Required columns: <code>name</code>, <code>email</code>. Optional: <code>property_name</code>, <code>notes</code>. Use ↓ CSV template for the full format.
        </p>

        {result ? (
          <div>
            {result.imported > 0 && <div style={{ color: '#166534', marginBottom: 6 }}>✅ {result.imported} prospect{result.imported !== 1 ? 's' : ''} imported successfully.</div>}
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

// ── Main Page ─────────────────────────────────────────────────────────────────
function downloadCsvTemplate() {
  const csv = [
    'name,property_name,email,property_type,country,region,language,website,source,notes',
    'Margaret Hughes,The Old Rectory B&B,margaret@oldrectory.co.uk,bnb,UK,Dorset,en,www.oldrectory.co.uk,google,Found via Google search',
    'Pierre Dupont,Gite Les Lavandes,pierre@giteslavandes.fr,gite,France,Provence,fr,www.giteslavandes.fr,booking_com,Listed on Booking.com',
  ].join('\n');
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

  // Filters (all client-side)
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
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
  const [tab, setTab]                   = useState('prospects'); // prospects | followup

  const load = useCallback(async () => {
    const [pRes, sRes, tRes, cRes, fRes] = await Promise.all([
      saApiFetch('/api/admin/outreach/prospects?limit=2000'),
      saApiFetch('/api/admin/outreach/stats'),
      saApiFetch('/api/admin/outreach/templates'),
      saApiFetch('/api/admin/outreach/campaigns'),
      saApiFetch('/api/admin/outreach/prospects/follow-up'),
    ]);
    if (pRes.ok) { const d = await pRes.json(); setProspects(d.prospects); setTotal(d.total); }
    if (sRes.ok) setStats(await sRes.json());
    if (tRes.ok) setTemplates(await tRes.json());
    if (cRes.ok) setCampaigns(await cRes.json());
    if (fRes.ok) setFollowUps(await fRes.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived state — computed every render, no useMemo needed at this scale
  const today = new Date().toISOString().split('T')[0];
  const filteredProspects = prospects.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q) && !p.company?.toLowerCase().includes(q)) return false;
    }
    if (filterStatus  && p.status   !== filterStatus)  return false;
    if (filterSource  && p.source   !== filterSource)  return false;
    if (filterCountry && p.country  !== filterCountry) return false;
    if (filterLang    && p.language !== filterLang)    return false;
    if (filterFollowUp === 'today'   && p.follow_up_date !== today)                        return false;
    if (filterFollowUp === 'overdue' && !(p.follow_up_date && p.follow_up_date < today))   return false;
    if (filterFollowUp === 'set'     && !p.follow_up_date)                                 return false;
    if (filterFollowUp === 'none'    && p.follow_up_date)                                  return false;
    return true;
  });

  const countries = [...new Set(prospects.map(p => p.country).filter(Boolean))].sort();
  const languages = [...new Set(prospects.map(p => p.language).filter(Boolean))].sort();

  const anyFilter = search || filterStatus || filterSource || filterCountry || filterLang || filterFollowUp;

  function clearFilters() {
    setSearch(''); setFilterStatus(''); setFilterSource('');
    setFilterCountry(''); setFilterLang(''); setFilterFollowUp('');
    setSelected([]);
  }

  function toggleSelect(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  function toggleAll() {
    setSelected(selected.length === filteredProspects.length ? [] : filteredProspects.map(p => p.id));
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

  function exportCsv() {
    const rows = filteredProspects.filter(p => selected.includes(p.id));
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

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabStyle(tab === 'prospects')} onClick={() => setTab('prospects')}>All Prospects ({total})</button>
        <button style={tabStyle(tab === 'followup')}  onClick={() => setTab('followup')}>Follow-up Queue ({followUps.length})</button>
      </div>


      {tab === 'followup' && (
        <Section title="Follow-up Queue" action={
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Due today or overdue</span>
        }>
          {followUps.length === 0 ? (
            <p style={{ color: '#94a3b8', margin: 0 }}>No follow-ups due right now.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Company</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Follow-up Date</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {followUps.map(p => {
                  const today = new Date().toISOString().split('T')[0];
                  const overdue = p.follow_up_date && p.follow_up_date < today;
                  const dueToday = p.follow_up_date && p.follow_up_date === today;
                  const rowBg = overdue ? '#fff7ed' : dueToday ? '#fefce8' : 'transparent';
                  const dateColor = overdue ? '#b45309' : dueToday ? '#854d0e' : '#94a3b8';
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc', background: rowBg }}>
                      <td style={{ padding: '8px 12px' }}><strong>{p.name}</strong><br /><span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{p.email}</span></td>
                      <td style={{ padding: '8px 12px', color: '#475569' }}>{p.company || '—'}</td>
                      <td style={{ padding: '8px 12px', color: dateColor, fontSize: '0.8rem', fontWeight: overdue ? 600 : 400 }}>
                        {p.follow_up_date ? new Date(p.follow_up_date + 'T00:00:00').toLocaleDateString() : 'Never contacted'}
                        {overdue && <span style={{ marginLeft: 6, fontSize: '0.72rem', color: '#f97316' }}>overdue</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}><StatusBadge status={p.status} /></td>
                      <td style={{ padding: '8px 12px' }}>
                        <Btn small onClick={() => { setSelected([p.id]); setShowCompose(true); }}>Compose</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {tab === 'prospects' && (
        <Section title="Prospects">
          {/* ── Filter bar ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <Input
              value={search} onChange={v => { setSearch(v); setSelected([]); }}
              placeholder="Search name, email, company…"
              style={{ flex: '2 1 180px', minWidth: 140 }}
            />
            <select
              value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setSelected([]); }}
              style={{ flex: '1 1 120px', minWidth: 110, padding: '7px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit' }}
            >
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="follow_up_sent">Follow-up sent</option>
              <option value="replied">Replied</option>
              <option value="converted">Converted</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
            <select
              value={filterSource} onChange={e => { setFilterSource(e.target.value); setSelected([]); }}
              style={{ flex: '1 1 110px', minWidth: 100, padding: '7px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit' }}
            >
              <option value="">All sources</option>
              <option value="manual">Manual</option>
              <option value="csv">CSV</option>
              <option value="auto_signup">Signed up</option>
              <option value="website">Website</option>
              <option value="facebook">Facebook</option>
              <option value="google">Google</option>
              <option value="booking_com">Booking.com</option>
              <option value="airbnb">Airbnb</option>
              <option value="referral">Referral</option>
              <option value="other">Other</option>
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
            {anyFilter && (
              <Btn variant="secondary" small onClick={clearFilters} style={{ alignSelf: 'stretch' }}>Clear ✕</Btn>
            )}
          </div>

          {/* ── Showing count ── */}
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 10 }}>
            {anyFilter
              ? `Showing ${filteredProspects.length} of ${prospects.length} prospects`
              : `${prospects.length} prospect${prospects.length !== 1 ? 's' : ''}`
            }
          </div>

          {/* ── Bulk action bar ── */}
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
              <select
                value=""
                onChange={e => { if (e.target.value) bulkChangeStatus(e.target.value); }}
                style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                <option value="">Change status ▾</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="follow_up_sent">Follow-up sent</option>
                <option value="replied">Replied</option>
                <option value="converted">Converted</option>
                <option value="unsubscribed">Unsubscribed</option>
              </select>
              <Btn small variant="danger" onClick={bulkDelete}>Delete</Btn>
              <Btn small variant="secondary" onClick={exportCsv}>Export CSV</Btn>
            </div>
          )}

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
                          disabled={p.status === 'unsubscribed'}
                        />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <strong>{p.name}</strong>
                        <br />
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{p.email}</span>
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
                      <td className="col-hide-mobile" style={{ padding: '8px 12px' }}><SourceBadge source={p.source} /></td>
                      <td style={{ padding: '8px 12px' }}><StatusBadge status={p.status} /></td>
                      <td className="col-hide-mobile" style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '0.78rem' }}>
                        {new Date(p.created_at).toLocaleDateString()}
                        {p.follow_up_date && <div style={{ color: '#92400e', fontWeight: 600 }}>Follow-up: {new Date(p.follow_up_date).toLocaleDateString()}</div>}
                        {p.converted_at && <div style={{ color: '#166534', fontWeight: 600 }}>Converted!</div>}
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Btn small variant="secondary" onClick={() => setEditing(p)}>Edit</Btn>
                          {p.status !== 'unsubscribed' && (
                            <Btn small onClick={() => { setSelected([p.id]); setShowCompose(true); }}>Email</Btn>
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
          onClose={() => setShowCompose(false)}
          onSent={load}
        />
      )}
      {showTemplates && <TemplateManager templates={templates} onClose={() => setShowTemplates(false)} onChanged={load} />}
      {showCampaigns && <CampaignManager campaigns={campaigns} onClose={() => setShowCampaigns(false)} onChanged={load} />}
      {showCsv       && <CsvImportModal  onClose={() => setShowCsv(false)} onImported={load} />}
    </div>
  );
}
