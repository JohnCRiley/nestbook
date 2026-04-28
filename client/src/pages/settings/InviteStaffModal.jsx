import { useState } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale } from '../../i18n/LocaleContext.jsx';

export default function InviteStaffModal({ onClose, onSuccess }) {
  const { property } = useLocale();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'reception' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (!form.password) {
      setError('A temporary password is required.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property?.id ?? 1,
          name:        form.name.trim(),
          email:       form.email.trim(),
          password:    form.password,
          role:        form.role,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      onSuccess(await res.json());
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Add staff member">

        <div className="modal-header">
          <h2>Add Staff Member</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

            <div className="form-grid">
              <div className="form-group span-2">
                <label className="form-label">Full Name *</label>
                <input name="name" className="form-control" value={form.name}
                  onChange={handleChange} required autoFocus
                  placeholder="e.g. Marie Dupont" />
              </div>

              <div className="form-group span-2">
                <label className="form-label">Email Address *</label>
                <input name="email" type="email" className="form-control"
                  value={form.email} onChange={handleChange} required
                  placeholder="marie@yourproperty.com" />
              </div>

              <div className="form-group span-2">
                <label className="form-label">Role</label>
                <select name="role" className="form-control" value={form.role} onChange={handleChange}>
                  <option value="reception">Reception — can view and manage bookings</option>
                  <option value="owner">Owner — full access including settings</option>
                  <option value="charges_staff">Charges Staff — room charges only (Multi)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Temporary Password *</label>
                <input name="password" type="password" className="form-control"
                  value={form.password} onChange={handleChange} required
                  placeholder="Min. 8 characters" />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password *</label>
                <input name="confirmPassword" type="password" className="form-control"
                  value={form.confirmPassword} onChange={handleChange} required
                  placeholder="Repeat password" />
              </div>

              <div className="form-group span-2">
                <div style={{
                  background: '#f0faf0',
                  border: '1px solid #c6e8bb',
                  borderRadius: 6,
                  padding: '10px 14px',
                  fontSize: '0.8rem',
                  color: '#3a6e2a',
                  lineHeight: 1.6,
                }}>
                  Share this temporary password with your staff member and ask them to change it on first login.
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
