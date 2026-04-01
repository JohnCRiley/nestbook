import { useState } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', notes: '' };

export default function NewGuestModal({ onClose, onSuccess }) {
  const [form,       setForm]       = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name:  form.last_name.trim(),
          email:      form.email.trim()  || null,
          phone:      form.phone.trim()  || null,
          notes:      form.notes.trim()  || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      const created = await res.json();
      onSuccess(created);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" role="dialog" aria-label="New guest">

        <div className="modal-header">
          <h2>New Guest</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input name="first_name" className="form-control"
                  value={form.first_name} onChange={handleChange} required autoFocus />
              </div>

              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input name="last_name" className="form-control"
                  value={form.last_name} onChange={handleChange} required />
              </div>

              <div className="form-group span-2">
                <label className="form-label">Email</label>
                <input name="email" type="email" className="form-control"
                  value={form.email} onChange={handleChange}
                  placeholder="guest@example.com" />
              </div>

              <div className="form-group span-2">
                <label className="form-label">Phone</label>
                <input name="phone" type="tel" className="form-control"
                  value={form.phone} onChange={handleChange}
                  placeholder="+33 6 12 34 56 78" />
                <span className="form-hint">Include country code for flag detection</span>
              </div>

              <div className="form-group span-2">
                <label className="form-label">Notes</label>
                <textarea name="notes" className="form-control"
                  value={form.notes} onChange={handleChange}
                  rows={3} placeholder="Dietary requirements, preferences, VIP…"
                  style={{ resize: 'vertical' }} />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add Guest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
