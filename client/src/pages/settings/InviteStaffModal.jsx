import { useState } from 'react';

export default function InviteStaffModal({ onClose, onSuccess }) {
  const [form,       setForm]       = useState({ name: '', email: '', role: 'reception' });
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id:   1,
          name:          form.name.trim(),
          email:         form.email.trim(),
          // Placeholder hash — a real invite flow would email a setup link.
          // For now we store a recognisable placeholder so it's obvious in the DB.
          password_hash: '$2b$10$INVITE_PENDING_SET_VIA_EMAIL_FLOW',
          role:          form.role,
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
      <div className="modal" role="dialog" aria-label="Invite staff member">

        <div className="modal-header">
          <h2>Invite Staff Member</h2>
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
                </select>
              </div>

              <div className="form-group span-2">
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  In a future release, an invitation email with a setup link will be sent automatically.
                  For now the account is created immediately and a password can be set in a later step.
                </p>
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
