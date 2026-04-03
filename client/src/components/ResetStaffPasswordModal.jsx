import { useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';

export default function ResetStaffPasswordModal({ user, onClose }) {
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [error,           setError]           = useState(null);
  const [success,         setSuccess]         = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/users/${user.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 420 }} role="dialog" aria-label="Reset staff password">

        <div className="modal-header">
          <h2>Reset Password</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {success ? (
          <>
            <div className="modal-body">
              <div style={{
                background: '#f0faf0',
                border: '1px solid #c6e8bb',
                borderRadius: 6,
                padding: '14px 16px',
                color: '#3a6e2a',
                fontSize: '0.9rem',
              }}>
                Password for <strong>{user.name}</strong> has been updated. Share the new password with them directly.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Set a new password for <strong>{user.name}</strong> ({user.email}).
                Share it with them directly and ask them to change it after logging in.
              </p>

              {error && <div className="form-error">{error}</div>}

              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  placeholder="Min. 8 characters"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repeat new password"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Set Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
