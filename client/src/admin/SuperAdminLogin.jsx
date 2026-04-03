import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storeSAToken } from './saApiFetch.js';

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [locked,   setLocked]   = useState(false);
  const [minutes,  setMinutes]  = useState(0);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLocked(false);
    setLoading(true);

    try {
      const res = await fetch('/api/super-admin/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429 && data.locked) {
        setLocked(true);
        setMinutes(data.minutesRemaining ?? 15);
        return;
      }

      if (!res.ok) {
        setError('Invalid credentials.');
        return;
      }

      storeSAToken(data.token);
      navigate('/super-admin', { replace: true });
    } catch {
      setError('Could not reach server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={styles.lockIcon}>🔒</div>
        <h1 style={styles.title}>Administrator Access</h1>

        {locked ? (
          <div style={styles.lockoutBox}>
            Too many failed attempts. Try again in {minutes} minute{minutes !== 1 ? 's' : ''}.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            {error && <div style={styles.errorBox}>{error}</div>}

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                autoComplete="current-password"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
            >
              {loading ? 'Verifying…' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Inline styles — completely self-contained, no shared CSS ──────────────────
const styles = {
  shell: {
    minHeight:       '100vh',
    background:      '#0a0a0a',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    width:           '100%',
    maxWidth:        380,
    background:      '#111',
    border:          '1px solid #222',
    borderRadius:    10,
    padding:         '44px 36px',
    boxShadow:       '0 8px 32px rgba(0,0,0,0.6)',
  },
  lockIcon: {
    textAlign:       'center',
    fontSize:        28,
    marginBottom:    16,
  },
  title: {
    margin:          '0 0 28px',
    textAlign:       'center',
    fontSize:        '1.15rem',
    fontWeight:      600,
    color:           '#e5e7eb',
    letterSpacing:   '0.01em',
  },
  form: {
    display:         'flex',
    flexDirection:   'column',
    gap:             16,
  },
  field: {
    display:         'flex',
    flexDirection:   'column',
    gap:             6,
  },
  label: {
    fontSize:        '0.78rem',
    fontWeight:      500,
    color:           '#9ca3af',
    letterSpacing:   '0.04em',
    textTransform:   'uppercase',
  },
  input: {
    background:      '#1a1a1a',
    border:          '1px solid #2a2a2a',
    borderRadius:    6,
    padding:         '10px 12px',
    color:           '#f9fafb',
    fontSize:        '0.95rem',
    outline:         'none',
    width:           '100%',
    boxSizing:       'border-box',
  },
  btn: {
    marginTop:       8,
    padding:         '11px 0',
    background:      '#1d4ed8',
    color:           '#fff',
    border:          'none',
    borderRadius:    6,
    fontSize:        '0.95rem',
    fontWeight:      600,
    cursor:          'pointer',
    letterSpacing:   '0.02em',
  },
  btnDisabled: {
    opacity:         0.6,
    cursor:          'not-allowed',
  },
  errorBox: {
    background:      '#1c0a0a',
    border:          '1px solid #7f1d1d',
    borderRadius:    6,
    padding:         '10px 12px',
    color:           '#fca5a5',
    fontSize:        '0.85rem',
  },
  lockoutBox: {
    background:      '#1c1500',
    border:          '1px solid #713f12',
    borderRadius:    6,
    padding:         '14px 16px',
    color:           '#fde68a',
    fontSize:        '0.88rem',
    lineHeight:      1.5,
    textAlign:       'center',
  },
};
