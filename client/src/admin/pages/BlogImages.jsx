import { useState, useEffect, useRef } from 'react';
import { saApiFetch } from '../saApiFetch.js';

export default function BlogImages() {
  const [posts, setPosts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(null);
  const [message, setMessage]   = useState(null);
  const fileInputs = useRef({});

  useEffect(() => { fetchPosts(); }, []);

  async function fetchPosts() {
    setLoading(true);
    try {
      const res  = await saApiFetch('/api/admin/blog-images');
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to load blog posts' });
    }
    setLoading(false);
  }

  async function handleUpload(slug, file) {
    if (!file) return;
    setUploading(slug);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res  = await saApiFetch(`/api/admin/blog-images/${slug}`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Image uploaded for "${slug}" (${data.imgSize})` });
        await fetchPosts();
      } else {
        setMessage({ type: 'error', text: data.error || 'Upload failed' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Upload failed — ' + e.message });
    }
    setUploading(null);
  }

  async function handleDelete(slug, title) {
    if (!confirm(`Remove image for "${title}"?`)) return;
    try {
      await saApiFetch(`/api/admin/blog-images/${slug}`, { method: 'DELETE' });
      setMessage({ type: 'success', text: `Image removed for "${slug}"` });
      await fetchPosts();
    } catch (e) {
      setMessage({ type: 'error', text: 'Delete failed' });
    }
  }

  const withImage    = posts.filter(p => p.hasImage).length;
  const withoutImage = posts.filter(p => !p.hasImage).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Blog Images
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Upload header images for each blog post. Images are automatically resized to 1200×630px and optimised.
          &nbsp;·&nbsp; {withImage} with image
          &nbsp;·&nbsp;
          <span style={{ color: withoutImage > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
            {withoutImage} without
          </span>
        </p>
      </div>

      {message && (
        <div style={{
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fca5a5'}`,
          color: message.type === 'success' ? '#166534' : '#dc2626',
          padding: '10px 16px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {message.text}
          <button
            onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit', padding: 0 }}
          >×</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Loading blog posts...
        </div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No blog posts found in server/public/blog/
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {posts.map(post => (
            <div
              key={post.slug}
              style={{
                background: 'var(--card-bg)',
                border: `1.5px solid ${post.hasImage ? 'var(--border)' : '#f59e0b'}`,
                borderRadius: 10, padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              }}
            >
              {/* Thumbnail */}
              <div style={{
                width: 80, height: 42, borderRadius: 6, overflow: 'hidden',
                background: 'var(--page-bg)', border: '1px solid var(--border)',
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {post.hasImage ? (
                  <img
                    src={`/images/blog/${post.slug}.jpg?t=${Date.now()}`}
                    alt={post.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)',
                  marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {post.title}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ opacity: 0.7 }}>{post.slug}</span>
                  {post.hasImage && (
                    <span style={{ color: '#16a34a' }}>✓ {post.imgSize}</span>
                  )}
                  {!post.hasImage && (
                    <span style={{ color: '#f59e0b' }}>⚠ No image</span>
                  )}
                  <a
                    href={`/blog/${post.slug}.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.72rem' }}
                  >
                    ↗ View post
                  </a>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  ref={el => { fileInputs.current[post.slug] = el; }}
                  onChange={e => {
                    if (e.target.files[0]) {
                      handleUpload(post.slug, e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  onClick={() => fileInputs.current[post.slug]?.click()}
                  disabled={uploading === post.slug}
                  style={{
                    background: post.hasImage ? 'var(--card-bg)' : 'var(--accent)',
                    color: post.hasImage ? 'var(--text-primary)' : 'white',
                    border: `1.5px solid ${post.hasImage ? 'var(--border)' : 'var(--accent)'}`,
                    borderRadius: 7, padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600,
                    cursor: uploading === post.slug ? 'wait' : 'pointer',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                    opacity: uploading === post.slug ? 0.6 : 1,
                  }}
                >
                  {uploading === post.slug
                    ? '↻ Uploading...'
                    : post.hasImage ? '↻ Change image' : '↑ Upload image'}
                </button>

                {post.hasImage && (
                  <button
                    onClick={() => handleDelete(post.slug, post.title)}
                    style={{
                      background: 'none', color: '#dc2626', border: '1.5px solid #fca5a5',
                      borderRadius: 7, padding: '6px 10px', fontSize: '0.8rem',
                      cursor: 'pointer', fontFamily: 'inherit',
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

      <div style={{ marginTop: 16, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        Recommended: JPEG or PNG · Min 1200×630px · Under 10MB · Auto-resized and optimised on upload
      </div>

    </div>
  );
}
