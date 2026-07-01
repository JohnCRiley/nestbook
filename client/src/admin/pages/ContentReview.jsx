import { useState, useEffect, useCallback } from 'react';
import { saApiFetch } from '../saApiFetch.js';

const TYPE_LABEL = {
  room_photo:           'Room photo',
  hero_photo:           'Hero photo',
  property_description: 'Property description',
  room_description:     'Room description',
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function photoUrl(flag, thumb = false) {
  if (flag.content_type === 'room_photo') {
    const f = thumb ? `thumb_${flag.content_ref}` : flag.content_ref;
    return `/uploads/rooms/${f}`;
  }
  if (flag.content_type === 'hero_photo') {
    return `/uploads/properties/${flag.content_ref}`;
  }
  return null;
}

function isPhoto(flag) {
  return flag.content_type === 'room_photo' || flag.content_type === 'hero_photo';
}

// ── Review modal ──────────────────────────────────────────────────────────────
function ReviewModal({ flag, onClose, onDone }) {
  const [removeMode, setRemoveMode] = useState(null); // null | 'email' | 'silent'
  const [reason, setReason]         = useState('');
  const [saving, setSaving]         = useState(false);

  async function verify() {
    setSaving(true);
    await saApiFetch(`/api/admin/content-flags/${flag.id}/verify`, { method: 'POST' });
    setSaving(false);
    onDone();
  }

  async function remove(sendEmail) {
    setSaving(true);
    await saApiFetch(`/api/admin/content-flags/${flag.id}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendEmail, reason: reason.trim() || null }),
    });
    setSaving(false);
    onDone();
  }

  const thumb = isPhoto(flag) ? photoUrl(flag, false) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Review Content</h3>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }}>✕</button>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 6 }}>
            <strong>{flag.property_name}</strong> · {flag.owner_name || flag.owner_email}
            {flag.owner_email && flag.owner_name && <span> · {flag.owner_email}</span>}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>
            {TYPE_LABEL[flag.content_type]} · uploaded {timeAgo(flag.created_at)}
          </div>
        </div>

        {/* Content preview */}
        <div style={{ padding: '16px 24px' }}>
          {thumb ? (
            <img src={thumb} alt="Content" style={{ width: '100%', maxHeight: 340, objectFit: 'contain', borderRadius: 8, background: '#f8fafc' }} />
          ) : (
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, fontSize: '0.9rem', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
              {flag.preview_text || <span style={{ color: '#94a3b8' }}>No preview available</span>}
            </div>
          )}
        </div>

        {/* Remove reason field */}
        {removeMode === 'email' && (
          <div style={{ padding: '0 24px 12px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>Reason (included in email to owner)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Optional — explain what was removed and why"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!removeMode && (
            <>
              <button
                onClick={verify}
                disabled={saving}
                style={{ padding: '8px 18px', background: '#166534', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {saving ? 'Saving…' : 'Verify — content is fine'}
              </button>
              <button
                onClick={() => setRemoveMode('email')}
                disabled={saving}
                style={{ padding: '8px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Remove and email owner
              </button>
              <button
                onClick={() => remove(false)}
                disabled={saving}
                style={{ padding: '8px 14px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 7, fontWeight: 500, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Remove silently
              </button>
            </>
          )}
          {removeMode === 'email' && (
            <>
              <button
                onClick={() => remove(true)}
                disabled={saving}
                style={{ padding: '8px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {saving ? 'Removing…' : 'Confirm — remove and send email'}
              </button>
              <button
                onClick={() => setRemoveMode(null)}
                disabled={saving}
                style={{ padding: '8px 14px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ContentReview() {
  const [tab, setTab]           = useState('pending');
  const [flags, setFlags]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [reviewing, setReviewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const status = tab === 'pending' ? 'pending' : 'history';
    try {
      const res = await saApiFetch(`/api/admin/content-flags?status=${status}`);
      if (res.ok) setFlags(await res.json());
    } catch {}
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  function handleDone() {
    setReviewing(null);
    load();
  }

  const tabStyle = (active) => ({
    padding: '8px 20px', border: 'none', background: active ? '#1a4710' : 'transparent',
    color: active ? '#fff' : '#64748b', borderRadius: 7, fontWeight: active ? 600 : 400,
    fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Content Review</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            New uploads and description edits appear here for moderation. Content stays live until removed.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 9 }}>
          <button style={tabStyle(tab === 'pending')} onClick={() => setTab('pending')}>Pending</button>
          <button style={tabStyle(tab === 'history')} onClick={() => setTab('history')}>History</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</div>
      ) : flags.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          {tab === 'pending' ? 'No pending items — all clear.' : 'No history yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {flags.map(flag => (
            <FlagCard
              key={flag.id}
              flag={flag}
              showHistory={tab === 'history'}
              onReview={() => setReviewing(flag)}
            />
          ))}
        </div>
      )}

      {reviewing && (
        <ReviewModal flag={reviewing} onClose={() => setReviewing(null)} onDone={handleDone} />
      )}
    </div>
  );
}

function FlagCard({ flag, showHistory, onReview }) {
  const thumb = isPhoto(flag) ? photoUrl(flag, true) : null;
  const statusColor = flag.status === 'verified' ? '#166534' : flag.status === 'removed' ? '#991b1b' : '#92400e';
  const statusBg    = flag.status === 'verified' ? '#dcfce7' : flag.status === 'removed' ? '#fee2e2' : '#fef3c7';

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {thumb ? (
        <img src={thumb} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block', background: '#f8fafc' }} />
      ) : (
        <div style={{ height: 80, background: '#f8fafc', padding: '10px 14px', overflow: 'hidden' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#374151', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {flag.preview_text || '—'}
          </p>
        </div>
      )}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {flag.property_name}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 8 }}>
          {flag.owner_name || flag.owner_email} · {TYPE_LABEL[flag.content_type]}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {showHistory ? (
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: statusBg, color: statusColor }}>
              {flag.status === 'verified' ? 'Verified' : 'Removed'}
            </span>
          ) : (
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{timeAgo(flag.created_at)}</span>
          )}
          {!showHistory && (
            <button
              onClick={onReview}
              style={{ padding: '5px 12px', background: '#1a4710', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Review →
            </button>
          )}
          {showHistory && flag.reviewed_at && (
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{timeAgo(flag.reviewed_at)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
