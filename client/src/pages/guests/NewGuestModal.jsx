import { useState } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { useT } from '../../i18n/LocaleContext.jsx';

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', notes: '' };

export default function NewGuestModal({ onClose, onSuccess }) {
  const t = useT();
  const [form,       setForm]       = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError(t('nameRequired'));
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
          <h2>{t('newGuestTitle')}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t('firstName')} *</label>
                <input name="first_name" className="form-control"
                  value={form.first_name} onChange={handleChange} required autoFocus />
              </div>

              <div className="form-group">
                <label className="form-label">{t('lastName')} *</label>
                <input name="last_name" className="form-control"
                  value={form.last_name} onChange={handleChange} required />
              </div>

              <div className="form-group span-2">
                <label className="form-label">{t('moEmailLbl')}</label>
                <input name="email" type="email" className="form-control"
                  value={form.email} onChange={handleChange}
                  placeholder="guest@example.com" />
              </div>

              <div className="form-group span-2">
                <label className="form-label">{t('moPhoneLbl')}</label>
                <input name="phone" type="tel" className="form-control"
                  value={form.phone} onChange={handleChange}
                  placeholder="+33 6 12 34 56 78" />
                <span className="form-hint">{t('phoneHint')}</span>
              </div>

              <div className="form-group span-2">
                <label className="form-label">{t('sectionNotes')}</label>
                <textarea name="notes" className="form-control"
                  value={form.notes} onChange={handleChange}
                  rows={3} placeholder={t('notesPlaceholderGuest')}
                  style={{ resize: 'vertical' }} />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t('adding') : t('addGuest')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
