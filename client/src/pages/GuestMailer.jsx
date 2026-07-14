import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLocale, useT } from '../i18n/LocaleContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import PlanGate from '../components/PlanGate.jsx';
import QuillEditor from '../admin/QuillEditor.jsx';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Same list as server — client-side first check before even submitting
const BLOCKED_DOMAINS = [
  'guest.airbnb.com', 'airbnb.com', 'booking.com', 'messages.booking.com',
  'reply.booking.com', 'relay.booking.com', 'm.booking.com',
  'expedia.com', 'homeaway.com', 'vrbo.com', 'tripadvisor.com', 'flipkey.com',
];
function isBlockedEmail(email) {
  if (!email) return false;
  const at = email.toLowerCase().indexOf('@');
  if (at < 0) return false;
  const domain = email.toLowerCase().slice(at + 1);
  return BLOCKED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

function parseAdditional(raw) {
  return raw.split(/[\n,]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
}

export default function GuestMailer() {
  const plan = usePlan();
  const { property, updatePropertyInList, setProperty } = useLocale();
  const t = useT();

  return (
    <PlanGate requiredPlan="pro">
      <GuestMailerInner property={property} updatePropertyInList={updatePropertyInList} setProperty={setProperty} t={t} plan={plan} />
    </PlanGate>
  );
}

function GuestMailerInner({ property, updatePropertyInList, setProperty, t }) {
  const [tab, setTab] = useState('compose');

  // Settings
  const [logoUrl, setLogoUrl]         = useState(property?.logo_url || null);
  const [signature, setSignature]     = useState(property?.mailer_signature || '');
  const [logoUploading, setLogoUploading] = useState(false);

  // Compose state
  const [subject, setSubject]         = useState('');
  const [bodyHtml, setBodyHtml]       = useState('');
  const [htmlMode, setHtmlMode]       = useState(false);
  const [ctaEnabled, setCtaEnabled]   = useState(true);
  const [ctaLabel, setCtaLabel]       = useState('');
  const [ctaUrl, setCtaUrl]           = useState('');
  const quillRef = useRef(null);

  // Recipients
  const [recipients, setRecipients]   = useState([]);
  const [loadingR, setLoadingR]       = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [guestSearch, setGuestSearch] = useState('');
  const [additionalRaw, setAdditionalRaw] = useState('');
  const [additionalError, setAdditionalError] = useState('');

  // UI
  const [toast, setToast]             = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending]         = useState(false);

  // History
  const [history, setHistory]         = useState([]);
  const [historyItem, setHistoryItem] = useState(null);
  const [loadingH, setLoadingH]       = useState(false);

  const pid = property?.id;
  const bookingUrl = `https://nestbook.io/book/${property?.booking_slug || pid}`;

  // Sync from property when it changes (e.g. property switch)
  useEffect(() => {
    setLogoUrl(property?.logo_url || null);
    setSignature(property?.mailer_signature || '');
  }, [property?.id]);

  // Pre-fill CTA URL from booking page
  useEffect(() => {
    if (!ctaUrl) setCtaUrl(bookingUrl);
  }, [pid]);

  // Load recipients when on compose tab
  useEffect(() => {
    if (!pid) return;
    setLoadingR(true);
    apiFetch(`/api/guest-mailer/recipients?property_id=${pid}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setRecipients(Array.isArray(data) ? data : []); })
      .catch(() => setRecipients([]))
      .finally(() => setLoadingR(false));
  }, [pid]);

  // Load history when history tab is active
  useEffect(() => {
    if (tab !== 'history' || !pid) return;
    setLoadingH(true);
    apiFetch(`/api/guest-mailer/history?property_id=${pid}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingH(false));
  }, [tab, pid]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Refresh property in context after logo/signature change
  async function refreshProperty() {
    if (!pid) return;
    const r = await apiFetch(`/api/properties/${pid}`);
    if (r.ok) {
      const updated = await r.json();
      updatePropertyInList(updated);
      if (updated.id === pid) setProperty(updated);
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const r = await apiFetch(`/api/properties/${pid}/logo`, { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) { showToast(data.error || 'Upload failed'); return; }
      setLogoUrl(data.logo_url);
      await refreshProperty();
      showToast('Logo saved');
    } catch { showToast('Upload failed'); }
    finally { setLogoUploading(false); }
  }

  async function handleRemoveLogo() {
    const r = await apiFetch(`/api/properties/${pid}/logo`, { method: 'DELETE' });
    if (r.ok) {
      setLogoUrl(null);
      await refreshProperty();
      showToast('Logo removed');
    }
  }

  async function handleSignatureBlur() {
    await apiFetch(`/api/properties/${pid}/mailer-signature`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature }),
    });
    await refreshProperty();
  }

  // Derived: parse + validate additional emails
  const additionalParsed = parseAdditional(additionalRaw);
  const additionalValid  = additionalParsed.filter(e => EMAIL_RE.test(e) && !isBlockedEmail(e));
  const guestEmailsSet   = new Set(
    [...selectedIds].flatMap(id => {
      const g = recipients.find(r => r.id === id);
      return g ? [g.email.toLowerCase()] : [];
    })
  );
  const uniqueAdditional = additionalValid.filter(e => !guestEmailsSet.has(e));
  const totalCount       = selectedIds.size + new Set(uniqueAdditional).size;

  const filteredRecipients = recipients.filter(g => {
    if (!guestSearch) return true;
    const q = guestSearch.toLowerCase();
    return (
      g.first_name?.toLowerCase().includes(q) ||
      g.last_name?.toLowerCase().includes(q) ||
      g.email?.toLowerCase().includes(q)
    );
  });

  function toggleAll() {
    const allFiltered = filteredRecipients.map(g => g.id);
    const allSelected = allFiltered.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) allFiltered.forEach(id => next.delete(id));
      else             allFiltered.forEach(id => next.add(id));
      return next;
    });
  }

  function validateAdditional(raw) {
    const parsed = parseAdditional(raw);
    const blocked = parsed.filter(e => isBlockedEmail(e));
    if (blocked.length > 0) {
      setAdditionalError(t('gm.relayError'));
    } else {
      setAdditionalError('');
    }
    setAdditionalRaw(raw);
  }

  async function handlePreview() {
    if (!bodyHtml.trim()) return;
    const r = await apiFetch('/api/guest-mailer/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: pid, body_html: bodyHtml,
        cta_label: ctaLabel, cta_url: ctaUrl, cta_enabled: ctaEnabled,
      }),
    });
    if (r.ok) {
      const data = await r.json();
      setPreviewHtml(data.html);
      setShowPreview(true);
    }
  }

  async function handleTestSend() {
    if (!subject.trim() || !bodyHtml.trim()) {
      showToast('Please fill in subject and message before sending.');
      return;
    }
    const r = await apiFetch('/api/guest-mailer/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: pid, subject, body_html: bodyHtml,
        cta_label: ctaLabel, cta_url: ctaUrl, cta_enabled: ctaEnabled,
        recipient_ids: [], additional_emails: [], test_mode: true,
      }),
    });
    const data = await r.json();
    showToast(r.ok ? (data.message || 'Test email sent') : (data.error || 'Failed'));
  }

  async function handleSend() {
    setSending(true);
    setShowConfirm(false);
    try {
      const r = await apiFetch('/api/guest-mailer/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id:       pid,
          subject,
          body_html:         bodyHtml,
          cta_label:         ctaLabel,
          cta_url:           ctaUrl,
          cta_enabled:       ctaEnabled,
          recipient_ids:     [...selectedIds],
          additional_emails: additionalParsed,
          test_mode:         false,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        showToast(`Email sent to ${data.recipientCount} guests`);
        setSelectedIds(new Set());
        setAdditionalRaw('');
        setSubject('');
        setBodyHtml('');
      } else {
        showToast(data.error || 'Send failed');
      }
    } finally {
      setSending(false);
    }
  }

  async function viewHistoryItem(id) {
    const r = await apiFetch(`/api/guest-mailer/history/${id}`);
    if (r.ok) setHistoryItem(await r.json());
  }

  const BTN  = { padding: '9px 18px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' };
  const BTN_P = { ...BTN, background: 'var(--accent)', color: '#fff' };
  const BTN_S = { ...BTN, background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)', border: '1px solid var(--border)' };
  const INPUT = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
  const CARD  = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 };
  const LBL   = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 };

  return (
    <div style={{ padding: '28px 24px 60px', maxWidth: 860, margin: '0 auto' }}>
      <div className="page-header">
        <h1>{t('guestMailer')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
          {t('gm.subtitle')}
        </p>
      </div>

      {/* ── Settings: Logo ───────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          {/* Logo preview */}
          <div style={{
            width: 80, height: 80, borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--page-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {logoUrl
              ? <img src={`/uploads/logos/${logoUrl}`} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: '2rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {(property?.name || '?').charAt(0).toUpperCase()}
                </span>
            }
          </div>
          {/* Logo controls */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{t('gm.logo')}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 10 }}>{t('gm.logoHint')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ ...BTN_S, display: 'inline-block', cursor: logoUploading ? 'wait' : 'pointer' }}>
                {logoUploading ? '…' : t('gm.uploadLogo')}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
              </label>
              {logoUrl && (
                <button style={BTN_S} onClick={handleRemoveLogo}>{t('gm.removeLogo')}</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Settings: Signature ──────────────────────────────────── */}
      <div style={CARD}>
        <label style={LBL}>{t('gm.sigLabel')}</label>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8, marginTop: 0 }}>
          {t('gm.sigHint')}
        </p>
        <textarea
          value={signature}
          onChange={e => setSignature(e.target.value)}
          onBlur={handleSignatureBlur}
          rows={3}
          placeholder="John Smith · +44 7700 900000"
          style={{ ...INPUT, resize: 'vertical' }}
        />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {['compose', 'history'].map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none',
              fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
              color: tab === k ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {k === 'compose' ? t('gm.compose') : t('gm.history')}
          </button>
        ))}
      </div>

      {/* ── Compose tab ──────────────────────────────────────────── */}
      {tab === 'compose' && (
        <>
          {/* Subject */}
          <div style={{ marginBottom: 16 }}>
            <label style={LBL}>{t('settings.subject') || 'Subject'}</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Come back soon — we'd love to have you again"
              style={INPUT}
            />
          </div>

          {/* Body editor */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ ...LBL, marginBottom: 0 }}>Message</label>
              <button
                style={{ ...BTN_S, padding: '4px 10px', fontSize: '0.75rem' }}
                onClick={() => setHtmlMode(m => !m)}
              >
                {htmlMode ? 'Visual' : 'HTML'}
              </button>
            </div>
            {htmlMode ? (
              <textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                rows={12}
                style={{ ...INPUT, fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
              />
            ) : (
              <QuillEditor
                ref={quillRef}
                value={bodyHtml}
                onChange={setBodyHtml}
                placeholder="Write your message here…"
                minHeight={200}
              />
            )}
          </div>

          {/* CTA section */}
          <div style={{ ...CARD, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
              <input
                type="checkbox"
                checked={ctaEnabled}
                onChange={e => setCtaEnabled(e.target.checked)}
              />
              {t('gm.ctaToggle')}
            </label>
            {ctaEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <div>
                  <label style={LBL}>{t('gm.ctaLabel')}</label>
                  <input
                    type="text"
                    value={ctaLabel}
                    onChange={e => setCtaLabel(e.target.value)}
                    placeholder="Book direct"
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={LBL}>{t('gm.ctaUrl')}</label>
                  <input
                    type="url"
                    value={ctaUrl}
                    onChange={e => setCtaUrl(e.target.value)}
                    placeholder={bookingUrl}
                    style={INPUT}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Recipients */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <label style={{ ...LBL, marginBottom: 0 }}>{t('gm.recipients')}</label>
              {recipients.length > 0 && (
                <button style={{ ...BTN_S, padding: '3px 10px', fontSize: '0.75rem' }} onClick={toggleAll}>
                  {filteredRecipients.every(g => selectedIds.has(g.id)) ? t('gm.deselectAll') : t('gm.selectAll')}
                </button>
              )}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 10px', fontStyle: 'italic' }}>
              {t('gm.recipientsNote')}
            </p>

            {/* Search */}
            {recipients.length > 5 && (
              <input
                type="search"
                placeholder={t('gm.search')}
                value={guestSearch}
                onChange={e => setGuestSearch(e.target.value)}
                style={{ ...INPUT, marginBottom: 10 }}
              />
            )}

            {/* Guest list */}
            {loadingR ? (
              <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>
            ) : filteredRecipients.length === 0 ? (
              <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {recipients.length === 0 ? t('gm.noGuests') : 'No results'}
              </div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {filteredRecipients.map(g => (
                  <label
                    key={g.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      background: selectedIds.has(g.id) ? 'var(--accent-light, rgba(26,71,16,0.06))' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(g.id)}
                      onChange={() => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                          return next;
                        });
                      }}
                    />
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>
                      {g.first_name} {g.last_name}
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.78rem' }}>{g.email}</span>
                    </span>
                    {g.last_stay && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {t('gm.lastStay')}: {g.last_stay}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {recipients.length === 0 && !loadingR && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6, marginBottom: 0 }}>
                {t('gm.noGuestsHint')}
              </p>
            )}

            {/* Manual add */}
            <div style={{ marginTop: 14 }}>
              <label style={LBL}>{t('gm.addEmail')}</label>
              <textarea
                value={additionalRaw}
                onChange={e => validateAdditional(e.target.value)}
                placeholder={t('gm.addEmailHint')}
                rows={2}
                style={{ ...INPUT, resize: 'vertical' }}
              />
              {additionalError && (
                <p style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: 4, marginBottom: 0 }}>
                  {additionalError}
                </p>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <button style={BTN_S} onClick={handlePreview} disabled={!bodyHtml.trim()}>
              {t('gm.preview')}
            </button>
            <button style={BTN_S} onClick={handleTestSend}>
              {t('gm.sendTest')}
            </button>
            <button
              style={{ ...BTN_P, marginLeft: 'auto', opacity: totalCount === 0 || sending ? 0.5 : 1 }}
              disabled={totalCount === 0 || sending || !!additionalError}
              onClick={() => setShowConfirm(true)}
            >
              {t('gm.send').replace('{n}', totalCount)}
            </button>
          </div>
        </>
      )}

      {/* ── History tab ──────────────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          {loadingH ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {t('gm.noHistory')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: 600 }}>{h.subject}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {t('gm.toGuests').replace('{n}', h.recipient_count)}
                    </td>
                    <td style={{ padding: '12px 0 12px 8px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {t('gm.sentAt').replace('{date}', h.sent_at?.slice(0, 10))}
                    </td>
                    <td style={{ padding: '12px 0 12px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button style={{ ...BTN_S, padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => viewHistoryItem(h.id)}>
                        {t('gm.viewEmail')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Preview modal ─────────────────────────────────────────── */}
      {showPreview && previewHtml && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setShowPreview(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', maxWidth: 680, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <strong style={{ fontSize: '0.9rem' }}>{t('gm.preview')}</strong>
              <button style={{ ...BTN_S, padding: '5px 14px' }} onClick={() => setShowPreview(false)}>{t('gm.closePreview') || '✕'}</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                style={{ width: '100%', border: 'none', minHeight: 500 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── History item modal ───────────────────────────────────── */}
      {historyItem && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setHistoryItem(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', maxWidth: 680, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <div>
                <strong style={{ fontSize: '0.9rem', display: 'block' }}>{historyItem.subject}</strong>
                <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  {t('gm.toGuests').replace('{n}', historyItem.recipient_count)} ·{' '}
                  {t('gm.sentAt').replace('{date}', historyItem.sent_at?.slice(0, 10))}
                </span>
              </div>
              <button style={{ ...BTN_S, padding: '5px 14px' }} onClick={() => setHistoryItem(null)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <iframe
                srcDoc={historyItem.body_html}
                title="Sent email"
                style={{ width: '100%', border: 'none', minHeight: 400 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm send modal ───────────────────────────────────── */}
      {showConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 28, maxWidth: 420, width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: '1rem' }}>
              {t('gm.confirmTitle').replace('{n}', totalCount)}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {t('gm.confirmBody').replace(/\{n\}/g, totalCount)}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={BTN_S} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button style={BTN_P} onClick={handleSend} disabled={sending}>
                {sending ? 'Sending…' : t('gm.send').replace('{n}', totalCount)}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast toast-success">{toast}</div>}
    </div>
  );
}
