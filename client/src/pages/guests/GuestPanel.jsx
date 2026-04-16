import { useState } from 'react';
import { initials, phoneFlag, phoneCountry, fmtDate, fmtPrice } from '../../utils/guestHelpers.js';
import { BADGE_CLASS } from '../../utils/bookingConstants.js';
import { nightsBetween } from '../../utils/format.js';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';


/**
 * Slide-in panel showing full guest details, booking history, and an edit form.
 */
export default function GuestPanel({ guest, bookings, onClose, onGuestUpdated }) {
  const [mode, setMode] = useState('view');   // 'view' | 'edit'

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="detail-panel" role="dialog" aria-label="Guest details">

        <PanelHeader guest={guest} onClose={onClose} />

        <div className="panel-scroll">
          <div className="panel-body">
            {mode === 'view' ? (
              <ViewMode guest={guest} bookings={bookings} onEdit={() => setMode('edit')} />
            ) : (
              <EditMode
                guest={guest}
                onCancel={() => setMode('view')}
                onSaved={(updated) => { onGuestUpdated(updated); setMode('view'); }}
              />
            )}
          </div>
        </div>

      </aside>
    </>
  );
}

// ── Panel header ──────────────────────────────────────────────────────────────

function PanelHeader({ guest, onClose }) {
  const flag    = phoneFlag(guest.phone);
  const country = phoneCountry(guest.phone);
  const t = useT();
  const { locale } = useLocale();

  return (
    <div className="panel-header">
      <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
      <div className="panel-header-row">
        <div className="panel-avatar-lg">
          {initials(guest.first_name, guest.last_name)}
        </div>
        <div>
          <div className="panel-guest-name" style={{ marginBottom: 2 }}>
            {guest.first_name} {guest.last_name}
            {flag && <span style={{ marginLeft: 7, fontSize: '1.1rem' }}>{flag}</span>}
          </div>
          {country && (
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem' }}>{country}</div>
          )}
        </div>
      </div>
      <div className="panel-booking-ref">
        {t('guestRef')}{guest.id} · {t('addedOn')} {fmtDate(guest.created_at?.slice(0, 10), locale)}
      </div>
    </div>
  );
}

// ── View mode ─────────────────────────────────────────────────────────────────

function ViewMode({ guest, bookings, onEdit }) {
  const { currencySymbol } = useLocale();
  const t = useT();
  const sorted = [...bookings].sort((a, b) => (b.check_in_date > a.check_in_date ? 1 : -1));
  const totalSpend = bookings.reduce((s, b) => s + (b.total_price || 0), 0);

  return (
    <>
      {/* Contact details */}
      <div className="panel-section">
        <div className="panel-section-title">{t('sectionContact')}</div>
        <PanelRow label={t('labelEmail')} value={guest.email  || '—'} />
        <PanelRow label={t('labelPhone')} value={guest.phone  || '—'} />
        {guest.notes && <PanelRow label={t('sectionNotes')} value={guest.notes} />}
      </div>

      {/* Stay summary */}
      <div className="panel-section">
        <div className="panel-section-title">{t('sectionStaySummary')}</div>
        <div className="panel-price-callout">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="panel-price-main">{fmtPrice(totalSpend, currencySymbol)}</div>
              <div className="panel-price-detail">{t('totalAllBookings')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-dark)' }}>
                {bookings.length}
              </div>
              <div style={{ fontSize: '0.78rem', opacity: 0.75 }}>
                {t('bookingWord')(bookings.length).replace(/^\d+\s*/, '')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Booking history */}
      <div className="panel-section">
        <div className="panel-section-title">{t('sectionBookingHistory')}</div>
        {sorted.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.83rem' }}>{t('noBookingsYet')}</div>
        ) : (
          sorted.map((b) => <HistoryRow key={b.id} booking={b} />)
        )}
      </div>

      {/* Edit action */}
      <div className="panel-actions">
        <button className="btn-panel-primary" onClick={onEdit}>{t('editGuestDetails')}</button>
      </div>
    </>
  );
}

// ── Edit mode ─────────────────────────────────────────────────────────────────

function EditMode({ guest, onCancel, onSaved }) {
  const t = useT();
  const [form, setForm] = useState({
    first_name: guest.first_name ?? '',
    last_name:  guest.last_name  ?? '',
    email:      guest.email      ?? '',
    phone:      guest.phone      ?? '',
    notes:      guest.notes      ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError(t('nameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/guests/${guest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const updated = await res.json();
      onSaved(updated);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">{t('editGuestDetails')}</div>

        {error && (
          <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>
        )}

        <div className="panel-edit-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={t('firstName')} name="first_name" value={form.first_name} onChange={handleChange} />
            <Field label={t('lastName')}  name="last_name"  value={form.last_name}  onChange={handleChange} />
          </div>
          <Field label={t('labelEmail')} name="email" value={form.email} onChange={handleChange} type="email" />
          <Field label={t('labelPhone')} name="phone" value={form.phone} onChange={handleChange} type="tel" />
          <div className="panel-field">
            <label className="panel-field-label">{t('sectionNotes')}</label>
            <textarea
              name="notes"
              className="panel-field-input panel-field-textarea"
              value={form.notes}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>

      <div className="panel-actions">
        <button className="btn-panel-primary" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={saving}
          style={{ border: '1.5px solid var(--border)' }}>
          {t('cancel')}
        </button>
      </div>
    </>
  );
}

// ── HistoryRow ────────────────────────────────────────────────────────────────

function HistoryRow({ booking: b }) {
  const { currencySymbol, locale } = useLocale();
  const t = useT();
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  const statusLabel = { arriving: t('calLegendInHouse'), confirmed: t('confirmed'), checked_out: t('checkedOut'), cancelled: t('cancelled') }[b.status] ?? b.status;
  return (
    <div className="history-row">
      <div className="history-dates">
        {fmtDate(b.check_in_date, locale)} → {fmtDate(b.check_out_date, locale)}
      </div>
      <div className="history-meta">
        <span>{b.room_name ?? `${t('roomRef')}${b.room_id}`}</span>
        <span>·</span>
        <span>{t('nightWord')(nights)}</span>
        <span>·</span>
        <span className={BADGE_CLASS[b.status] ?? 'badge'} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
          {statusLabel}
        </span>
        <span className="history-price">{fmtPrice(b.total_price, currencySymbol)}</span>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function PanelRow({ label, value }) {
  return (
    <div className="panel-row">
      <span className="panel-row-label">{label}</span>
      <span className="panel-row-value">{value}</span>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text' }) {
  return (
    <div className="panel-field">
      <label className="panel-field-label">{label}</label>
      <input
        type={type}
        name={name}
        className="panel-field-input"
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
