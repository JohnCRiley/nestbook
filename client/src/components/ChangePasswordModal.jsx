import { useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import PasswordInput from './PasswordInput.jsx';

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/users/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword:     form.newPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setSuccess(true);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 420 }} role="dialog" aria-label="Change password">

        <div className="modal-header">
          <h2>Change Password</h2>
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
                Password updated successfully.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="form-error">{error}</div>}

              <div className="form-group">
                <label className="form-label">Current Password</label>
                <PasswordInput name="currentPassword" className="form-control"
                  value={form.currentPassword} onChange={handleChange}
                  required autoFocus placeholder="Your current password" />
              </div>

              <div className="form-group">
                <label className="form-label">New Password</label>
                <PasswordInput name="newPassword" className="form-control"
                  value={form.newPassword} onChange={handleChange}
                  required placeholder="Min. 8 characters" />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <PasswordInput name="confirmPassword" className="form-control"
                  value={form.confirmPassword} onChange={handleChange}
                  required placeholder="Repeat new password" />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
