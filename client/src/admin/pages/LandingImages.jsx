import { useState, useEffect, useRef } from 'react';
import { saApiFetch } from '../saApiFetch.js';

export default function LandingImages() {
  const [slots, setSlots]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(null);
  const [message, setMessage]     = useState(null);
  const fileInputs                = useRef({});

  useEffect(() => { fetchSlots(); }, []);

  async function fetchSlots() {
    setLoading(true);
    try {
      const res  = await saApiFetch('/api/admin/landing-images');
      const data = await res.json();
      setSlots(data.slots || []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load' });
    }
    setLoading(false);
  }

  async function handleUpload(id, file) {
    if (!file) return;
    setUploading(id);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res  = await saApiFetch(`/api/admin/landing-images/${id}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Uploaded successfully (${data.size})` });
        await fetchSlots();
      } else {
        setMessage({ type: 'error', text: data.error || 'Upload failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Upload failed' });
    }
    setUploading(null);
  }

  async function handleDelete(id, label) {
    if (!confirm(`Remove ${label}?`)) return;
    await saApiFetch(`/api/admin/landing-images/${id}`, { method: 'DELETE' });
    setMessage({ type: 'success', text: 'Image removed' });
    await fetchSlots();
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700,
                     color: 'var(--text-primary)', marginBottom: 4 }}>
          Landing Page Images
        </h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Upload screenshots to replace the images on nestbook.io homepage.
          Images go live instantly — no deployment needed.
        </p>
      </div>

      {message && (
        <div style={{
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fca5a5'}`,
          color: message.type === 'success' ? '#166534' : '#dc2626',
          padding: '10px 16px',
          borderRadius: 8,
          fontSize: '0.85rem',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          {message.text}
          <button onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none',
                     cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40,
                      color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {slots.map(slot => (
            <div key={slot.id} style={{
              background: 'var(--card-bg)',
              border: `1.5px solid ${slot.exists ? 'var(--border)' : '#f59e0b'}`,
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}>

              {/* Preview */}
              <div style={{
                width: 120,
                height: 75,
                borderRadius: 6,
                overflow: 'hidden',
                background: 'var(--page-bg)',
                border: '1px solid var(--border)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {slot.exists ? (
                  <img
                    src={`/images/landing/${slot.id}.jpg?t=${Date.now()}`}
                    alt={slot.label}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                    strokeLinejoin="round" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                    <line x1="2" y1="2" x2="22" y2="22"/>
                  </svg>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem',
                              color: 'var(--text-primary)', marginBottom: 4 }}>
                  {slot.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)',
                              display: 'flex', gap: 10 }}>
                  {slot.exists ? (
                    <>
                      <span style={{ color: '#16a34a' }}>✓ {slot.size}</span>
                      <span>Updated {slot.modified}</span>
                    </>
                  ) : (
                    <span style={{ color: '#f59e0b' }}>
                      ⚠ No image — CSS mockup showing on homepage
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  ref={el => { fileInputs.current[slot.id] = el; }}
                  onChange={e => {
                    if (e.target.files[0]) {
                      handleUpload(slot.id, e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  onClick={() => fileInputs.current[slot.id]?.click()}
                  disabled={uploading === slot.id}
                  style={{
                    background: slot.exists ? 'var(--card-bg)' : 'var(--accent)',
                    color: slot.exists ? 'var(--text-primary)' : 'white',
                    border: `1.5px solid ${slot.exists ? 'var(--border)' : 'var(--accent)'}`,
                    borderRadius: 7,
                    padding: '7px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: uploading === slot.id ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: uploading === slot.id ? 0.6 : 1,
                  }}
                >
                  {uploading === slot.id ? '↻ Uploading...' :
                   slot.exists ? '↻ Replace' : '↑ Upload'}
                </button>

                {slot.exists && (
                  <button
                    onClick={() => handleDelete(slot.id, slot.label)}
                    style={{
                      background: 'none',
                      border: '1.5px solid #fca5a5',
                      color: '#dc2626',
                      borderRadius: 7,
                      padding: '7px 10px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    title="Remove image"
                  >
                    ✕
                  </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      <p style={{
        textAlign: 'center',
        fontSize: '0.72rem',
        color: 'var(--text-muted)',
        marginTop: 16,
      }}>
        Recommended: PNG or JPEG · Min 1600px wide · Under 15MB · Auto-optimised on upload
      </p>

    </div>
  );
}
