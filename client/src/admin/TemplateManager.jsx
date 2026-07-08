import { useState, useEffect } from 'react';
import { saApiFetch } from './saApiFetch.js';
import QuillEditor from './QuillEditor.jsx';

// ── Local mini components ────────────────────────────────────────────────────

function Btn({ children, onClick, variant = 'primary', small, disabled }) {
  const s = {
    primary:   { background: '#1a4710', color: '#fff', border: 'none' },
    secondary: { background: '#fff', color: '#374151', border: '1px solid #d1d5db' },
    danger:    { background: '#fff', color: '#dc2626', border: '1px solid #fca5a5' },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '4px 10px' : '7px 14px',
        borderRadius: 6, fontSize: small ? '0.8rem' : '0.85rem', fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit', ...s,
      }}
    >{children}</button>
  );
}

function Input({ value, onChange, placeholder, style }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit', ...style }}
    />
  );
}

// ── Client-side email wrapper (mirrors server/utils/emailWrapper.js) ──────────
function buildPreviewHtml(bodyHtml, footerNote) {
  const raw = (bodyHtml ?? '').trim();
  const htmlContent = raw.startsWith('<')
    ? raw
    : raw.split(/\n{2,}/).map(p => `<p style="margin:0 0 16px 0;line-height:1.7">${p.replace(/\n/g, '<br>')}</p>`).join('\n');
  const footer = footerNote ?? 'You received this email because you manage a hospitality property.';

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

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({ body, subject, footerNote, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 700, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Email Preview</div>
            {subject && <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 2 }}>Subject: {subject}</div>}
          </div>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
        <iframe
          srcDoc={buildPreviewHtml(body, footerNote)}
          title="Email preview"
          sandbox="allow-same-origin"
          style={{ flex: 1, border: 'none', minHeight: 480 }}
        />
      </div>
    </div>
  );
}

// ── TemplateManager ───────────────────────────────────────────────────────────
//
// Props:
//   apiBase    – e.g. '/api/admin/outreach' or '/api/admin/user-mailer'
//   bodyField  – 'body' (Outreach) or 'html' (UserMailer)  [default: 'body']
//   onClose    – called when the modal is closed
//   onChanged  – called after any CRUD operation so parent can refresh dropdown
//   onLoad     – optional (subject, body) → void; if provided, each template row
//                shows a "Load" button that populates the composer and closes
//   footerNote – optional; passed to preview modal's email wrapper

export default function TemplateManager({ apiBase, bodyField = 'body', onClose, onChanged, onLoad, footerNote }) {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing]     = useState(null); // null | 'new' | <id>
  const [name, setName]           = useState('');
  const [subject, setSubject]     = useState('');
  const [body, setBody]           = useState('');
  const [htmlMode, setHtmlMode]   = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving]       = useState(false);

  useEffect(() => { load(); }, [apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const res = await saApiFetch(`${apiBase}/templates`);
    if (res.ok) setTemplates(await res.json());
  }

  function startNew() {
    setEditing('new'); setName(''); setSubject(''); setBody('');
    setHtmlMode(false); setShowPreview(false);
  }

  function startEdit(t) {
    setEditing(t.id); setName(t.name); setSubject(t.subject);
    setBody(t[bodyField] ?? '');
    setHtmlMode(/<(div|table|td|tr|section|style)\b/i.test(t[bodyField] ?? ''));
    setShowPreview(false);
  }

  function cancel() { setEditing(null); }

  async function save() {
    if (!name.trim() || !subject.trim() || !body.trim()) return;
    setSaving(true);
    const payload = { name: name.trim(), subject: subject.trim(), [bodyField]: body };
    if (editing === 'new') {
      await saApiFetch(`${apiBase}/templates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await saApiFetch(`${apiBase}/templates/${editing}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    setSaving(false); setEditing(null);
    await load();
    onChanged?.();
  }

  async function del(id) {
    if (!window.confirm('Delete this template?')) return;
    await saApiFetch(`${apiBase}/templates/${id}`, { method: 'DELETE' });
    await load();
    onChanged?.();
  }

  function handleLoad(t) {
    onLoad?.(t.subject, t[bodyField] ?? '');
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Email Templates</h3>
          <Btn onClick={startNew} small>+ New Template</Btn>
        </div>

        {/* Edit / New form */}
        {editing && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>{editing === 'new' ? 'New Template' : 'Edit Template'}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input value={name}    onChange={setName}    placeholder="Template name"  style={{ width: '100%' }} />
              <Input value={subject} onChange={setSubject} placeholder="Email subject"  style={{ width: '100%' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
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
              <div style={{ display: htmlMode ? 'none' : 'block' }}>
                <QuillEditor value={body} onChange={setBody} minHeight={160} />
              </div>
              {htmlMode && (
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Paste raw HTML here — rendered as-is in the email"
                  style={{
                    width: '100%', height: 220, fontFamily: 'monospace', fontSize: '0.78rem',
                    border: '1px solid #1a4710', borderRadius: 8, padding: '10px 12px',
                    resize: 'vertical', lineHeight: 1.5, color: '#1e293b', background: '#f8fff6',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Btn onClick={save} small disabled={saving || !name.trim() || !subject.trim() || !body.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </Btn>
              <Btn variant="secondary" onClick={() => setShowPreview(true)} small disabled={!body.trim()}>Preview</Btn>
              <Btn variant="secondary" onClick={cancel} small>Cancel</Btn>
            </div>
          </div>
        )}

        {/* Template list */}
        {templates.length === 0 && !editing && (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No templates yet. Click "+ New Template" to create one.</p>
        )}
        {templates.map(t => (
          <div key={t.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 1 }}>{t.subject}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(t[bodyField] ?? '').replace(/<[^>]*>/g, ' ').trim().slice(0, 80)}…
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {onLoad && <Btn small onClick={() => handleLoad(t)}>Load</Btn>}
              <Btn small variant="secondary" onClick={() => startEdit(t)}>Edit</Btn>
              <Btn small variant="danger"    onClick={() => del(t.id)}>Delete</Btn>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
      </div>

      {showPreview && (
        <PreviewModal body={body} subject={subject} footerNote={footerNote} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
