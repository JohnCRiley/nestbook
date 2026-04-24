import { useState, useEffect } from 'react';
import { BADGE_CLASS, SOURCE_LABELS } from '../../utils/bookingConstants.js';
import { formatDateMedium, nightsBetween } from '../../utils/format.js';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';
import DepositPill from '../../components/DepositPill.jsx';

const SOURCE_OPTIONS = [
  { value: 'direct',      label: 'Direct' },
  { value: 'phone',       label: 'Phone' },
  { value: 'email',       label: 'Email' },
  { value: 'walk_in',     label: 'Walk-in' },
  { value: 'website',     label: 'Website' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'airbnb',      label: 'Airbnb' },
  { value: 'other',       label: 'Other' },
];

const STATUS_OPTIONS = ['confirmed', 'arriving', 'checked_out', 'cancelled'];

export default function BookingPanel({ booking: b, rooms = [], guests = [], onClose, onStatusUpdate, onSave }) {
  const { fmtCurrency, locale, property, currencySymbol } = useLocale();
  const t = useT();
  const [mode, setMode] = useState('view');
  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  const perNight = b.price_per_night ?? (b.total_price && nights ? b.total_price / nights : null);
  const statusLabel = { arriving: t('calLegendInHouse'), confirmed: t('confirmed'), checked_out: t('checkedOut'), cancelled: t('cancelled') }[b.status] ?? b.status;

  useEffect(() => { setMode('view'); }, [b.id]);

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />

      <aside className="detail-panel" role="dialog" aria-label="Booking details">

        <div className="panel-header">
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="panel-guest-name">
            {b.guest_first_name} {b.guest_last_name}
          </div>
          <div style={{ marginBottom: 8 }}>
            <span className={BADGE_CLASS[b.status] ?? 'badge'}>{statusLabel}</span>
          </div>
          <div className="panel-booking-ref">{t('bookingRef')}{b.id}</div>
        </div>

        <div className="panel-scroll">
          <div className="panel-body">
            {mode === 'view' ? (
              <ViewMode
                b={b} nights={nights} perNight={perNight}
                fmtCurrency={fmtCurrency} locale={locale} t={t}
                property={property} currencySymbol={currencySymbol}
                onStatusUpdate={onStatusUpdate}
                onEdit={() => setMode('edit')}
                onBookingUpdated={onSave}
              />
            ) : (
              <EditMode
                b={b} rooms={rooms} guests={guests}
                onCancel={() => setMode('view')}
                onSaved={(updated) => { if (onSave) onSave(updated); setMode('view'); }}
                t={t}
              />
            )}
          </div>
        </div>

      </aside>
    </>
  );
}

// ── View mode ─────────────────────────────────────────────────────────────────

function ViewMode({ b, nights, perNight, fmtCurrency, locale, t, property, currencySymbol, onStatusUpdate, onEdit, onBookingUpdated }) {
  const [showCancelConfirm,  setShowCancelConfirm]  = useState(false);
  const [depositGateOpen,    setDepositGateOpen]    = useState(false);
  const [depositAction,      setDepositAction]      = useState(null); // { bookingId, newStatus }
  const [depositWorking,     setDepositWorking]     = useState(false);
  const [toast,              setToast]              = useState(null);

  const depositRequired = !!property?.require_deposit;

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleRequestDeposit = async () => {
    setDepositWorking(true);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}/request-deposit`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      if (onBookingUpdated) onBookingUpdated(updated);
      showToast(t('depositRequestSent'));
    } catch {
      // silent
    } finally {
      setDepositWorking(false);
    }
  };

  const handleMarkDepositPaid = async () => {
    setDepositWorking(true);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}/mark-deposit-paid`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      if (onBookingUpdated) onBookingUpdated(updated);
      showToast(t('depositMarkedPaid'));
    } catch {
      // silent
    } finally {
      setDepositWorking(false);
    }
  };

  // Intercept check-in: if deposit required but unpaid, show deposit gate
  const handleCheckIn = () => {
    if (depositRequired && !b.deposit_paid) {
      setDepositAction({ bookingId: b.id, newStatus: 'arriving' });
      setDepositGateOpen(true);
    } else {
      onStatusUpdate(b.id, 'arriving');
    }
  };

  return (
    <>
      {/* ── Deposit strip ─────────────────────────────────────────────────── */}
      {depositRequired && (b.status === 'confirmed' || b.status === 'arriving') && (
        <div style={{
          padding: '10px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DepositPill booking={b} property={property} />
            {b.deposit_paid && b.deposit_paid_at && (
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {t('depositPaidOn')} {formatDateMedium(b.deposit_paid_at.slice(0, 10), locale)}
              </span>
            )}
          </div>
          {!b.deposit_paid && (
            <div style={{ display: 'flex', gap: 6 }}>
              {!b.deposit_requested_at && (
                <button
                  className="btn-panel-secondary"
                  style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                  onClick={handleRequestDeposit}
                  disabled={depositWorking}
                >
                  {t('requestDepositBtn')}
                </button>
              )}
              <button
                className="btn-panel-primary"
                style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                onClick={handleMarkDepositPaid}
                disabled={depositWorking}
              >
                {t('markDepositPaidBtn')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Breakfast strip ───────────────────────────────────────────────── */}
      {(!!property?.breakfast_included || !!b.room_breakfast_included) && (
        <div style={{
          padding: '8px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.82rem', color: '#1a4710', fontWeight: 600,
          background: '#d9f0cc',
        }}>
          {t('fBreakfast')}
          {!!b.breakfast_added && (
            <span style={{ fontWeight: 400, fontSize: '0.78rem', color: '#2d6a1f', marginLeft: 4 }}>
              — {t('breakfastAddedNote')}
            </span>
          )}
        </div>
      )}

      {toast && (
        <div style={{
          margin: '10px 22px 0', padding: '7px 12px',
          background: '#f0faf0', border: '1px solid #86efac',
          borderRadius: 6, fontSize: '0.82rem', color: '#166534', fontWeight: 600,
        }}>
          {toast}
        </div>
      )}

      {(b.status === 'confirmed' || b.status === 'arriving') && (
        <StatusActions
          status={b.status} bookingId={b.id}
          onStatusUpdate={onStatusUpdate} onEdit={onEdit} t={t}
          prominent
          onCancelClick={() => setShowCancelConfirm(true)}
          onCheckIn={handleCheckIn}
        />
      )}

      <div className="panel-section">
        <div className="panel-section-title">{t('sectionGuest')}</div>
        <PanelRow label={t('labelName')}  value={`${b.guest_first_name} ${b.guest_last_name}`} />
        <PanelRow label={t('labelEmail')} value={b.guest_email ?? '—'} />
        <PanelRow label={t('labelPhone')} value={b.guest_phone ?? '—'} />
      </div>

      <div className="panel-section">
        <div className="panel-section-title">{t('sectionBooking')}</div>
        <PanelRow label={t('labelRoom')}     value={b.room_name ? `${b.room_name} (${b.room_type ?? ''})` : t('roomDeleted')} />
        <PanelRow label={t('moCinLbl')}      value={formatDateMedium(b.check_in_date, locale)} />
        <PanelRow label={t('moCoutLbl')}     value={formatDateMedium(b.check_out_date, locale)} />
        <PanelRow label={t('labelDuration')} value={t('nightWord')(nights)} />
        <PanelRow label={t('labelGuests')}   value={t('guestWord')(b.num_guests)} />
        <PanelRow label={t('labelSource')}   value={SOURCE_LABELS[b.source] ?? b.source} />
        <PanelRow label={t('labelCreated')}  value={b.created_at ? formatDateMedium(b.created_at.slice(0, 10), locale) : '—'} />
      </div>

      {b.notes && (
        <div className="panel-section">
          <div className="panel-section-title">{t('sectionNotes')}</div>
          <div className="panel-notes">{b.notes}</div>
        </div>
      )}

      <div className="panel-section">
        <div className="panel-section-title">{t('sectionPricing')}</div>
        <div className="panel-price-callout">
          <div className="panel-price-main">{fmtCurrency(b.total_price)}</div>
          {perNight && (
            <div className="panel-price-detail">
              {fmtCurrency(perNight)}{t('perNight')} × {t('nightWord')(nights)}
            </div>
          )}
        </div>
      </div>

      <div className="panel-actions">
        <button className="btn-panel-secondary" onClick={onEdit}>{t('editBookingLink')}</button>
        {b.status === 'confirmed' && (
          <button
            className="btn-panel-danger"
            style={{ fontSize: '0.82rem', padding: '7px 12px' }}
            onClick={() => setShowCancelConfirm(true)}
          >
            {t('cancelBookingBtn')}
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={showCancelConfirm}
        title={t('cancelBookingBtn')}
        message={t('cancelBookingConfirm')}
        confirmLabel={t('cancelBookingBtn')}
        cancelLabel={t('cancel')}
        variant="danger"
        onConfirm={() => { setShowCancelConfirm(false); onStatusUpdate(b.id, 'cancelled'); }}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* ── Deposit gate modal ─────────────────────────────────────────────── */}
      {depositGateOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '28px 28px 24px',
            maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 10, color: '#111827' }}>
              {t('depositGateTitle')}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#374151', marginBottom: 22, lineHeight: 1.55 }}>
              {t('depositGateMsg')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn-panel-primary"
                onClick={() => {
                  setDepositGateOpen(false);
                  handleMarkDepositPaid().then(() => onStatusUpdate(depositAction.bookingId, depositAction.newStatus));
                }}
              >
                {t('markPaidAndCheckIn')}
              </button>
              <button
                className="btn-panel-secondary"
                onClick={() => {
                  setDepositGateOpen(false);
                  onStatusUpdate(depositAction.bookingId, depositAction.newStatus);
                }}
              >
                {t('checkInWithoutDeposit')}
              </button>
              <button
                className="btn-secondary"
                style={{ border: '1.5px solid var(--border)', marginTop: 2 }}
                onClick={() => setDepositGateOpen(false)}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Edit mode ─────────────────────────────────────────────────────────────────

function EditMode({ b, rooms, guests, onCancel, onSaved, t }) {
  const { currencySymbol } = useLocale();
  const [form, setForm] = useState({
    room_id:        b.room_id        ? String(b.room_id)  : '',
    guest_id:       b.guest_id       ? String(b.guest_id) : '',
    check_in_date:  b.check_in_date  ?? '',
    check_out_date: b.check_out_date ?? '',
    num_guests:     b.num_guests     ?? 1,
    status:         b.status         ?? 'confirmed',
    source:         b.source         ?? 'direct',
    notes:          b.notes          ?? '',
    total_price:    b.total_price    ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    if (!form.check_in_date || !form.check_out_date) { setError(t('requiredFields')); return; }
    if (form.check_out_date <= form.check_in_date)   { setError(t('checkoutAfterCheckin')); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/bookings/${b.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...b,
          room_id:        form.room_id ? Number(form.room_id) : b.room_id,
          guest_id:       form.guest_id ? Number(form.guest_id) : b.guest_id,
          check_in_date:  form.check_in_date,
          check_out_date: form.check_out_date,
          num_guests:     Number(form.num_guests),
          status:         form.status,
          source:         form.source,
          notes:          form.notes || null,
          total_price:    form.total_price !== '' ? Number(form.total_price) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      onSaved(await res.json());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const nightsCount = form.check_in_date && form.check_out_date && form.check_out_date > form.check_in_date
    ? nightsBetween(form.check_in_date, form.check_out_date) : null;
  const selectedRoom = rooms.find((r) => r.id === Number(form.room_id));

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">{t('editBookingLink').replace(' →', '')}</div>

        {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="panel-edit-form">

          {rooms.length > 0 && (
            <div className="panel-field">
              <label className="panel-field-label">{t('moRoomLbl')}</label>
              <select name="room_id" className="panel-field-input" value={form.room_id} onChange={handleChange}>
                <option value="">{t('selectRoom')}</option>
                {rooms.filter((r) => r.status !== 'maintenance').map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                ))}
              </select>
            </div>
          )}

          {guests.length > 0 && (
            <div className="panel-field">
              <label className="panel-field-label">{t('moGuestLbl')}</label>
              <select name="guest_id" className="panel-field-input" value={form.guest_id} onChange={handleChange}>
                {guests.filter((g) => !g.deleted).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.blacklisted ? '⚠️ ' : ''}{g.first_name} {g.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="panel-field">
              <label className="panel-field-label">{t('moCinLbl')} *</label>
              <input type="date" name="check_in_date" className="panel-field-input"
                value={form.check_in_date} onChange={handleChange} />
            </div>
            <div className="panel-field">
              <label className="panel-field-label">{t('moCoutLbl')} *</label>
              <input type="date" name="check_out_date" className="panel-field-input"
                value={form.check_out_date} min={form.check_in_date || undefined} onChange={handleChange} />
              {nightsCount && <div className="panel-field-hint">{t('nightWord')(nightsCount)}</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="panel-field">
              <label className="panel-field-label">{t('moGuestsLbl')}</label>
              <input type="number" name="num_guests" className="panel-field-input"
                value={form.num_guests} min="1" max={selectedRoom?.capacity ?? 20} onChange={handleChange} />
            </div>
            <div className="panel-field">
              <label className="panel-field-label">{t('status')}</label>
              <select name="status" className="panel-field-input" value={form.status} onChange={handleChange}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {{ confirmed: t('confirmed'), arriving: t('calLegendInHouse'), checked_out: t('checkedOut'), cancelled: t('cancelled') }[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel-field">
            <label className="panel-field-label">{t('bookingSourceLabel')}</label>
            <select name="source" className="panel-field-input" value={form.source} onChange={handleChange}>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="panel-field">
            <label className="panel-field-label">{t('totalPriceLabel')} ({currencySymbol})</label>
            <input type="number" name="total_price" className="panel-field-input"
              value={form.total_price} min="0" step="0.01" onChange={handleChange}
              placeholder={t('autoCalcHint')} />
          </div>

          <div className="panel-field">
            <label className="panel-field-label">{t('moNotesLbl')}</label>
            <textarea name="notes" className="panel-field-input panel-field-textarea"
              value={form.notes} onChange={handleChange} rows={3} />
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

// ── Status action buttons ─────────────────────────────────────────────────────

function StatusActions({ status, bookingId, onStatusUpdate, onEdit, t, prominent, onCancelClick, onCheckIn }) {
  const wrapStyle = prominent
    ? { padding: '14px 22px 10px', borderBottom: '1px solid var(--border)', marginBottom: 0 }
    : {};

  if (status === 'arriving') {
    return (
      <div className="panel-actions" style={wrapStyle}>
        <button
          className="btn-panel-primary"
          style={prominent ? { fontSize: '1rem', padding: '12px 20px' } : {}}
          onClick={() => onStatusUpdate(bookingId, 'checked_out')}
        >
          {t('checkOutBtn')}
        </button>
        {!prominent && <button className="btn-panel-secondary" onClick={onEdit}>{t('editBookingLink')}</button>}
      </div>
    );
  }

  if (status === 'confirmed') {
    return (
      <div className="panel-actions" style={wrapStyle}>
        <button
          className="btn-panel-primary"
          style={prominent ? { fontSize: '1rem', padding: '12px 20px' } : {}}
          onClick={onCheckIn ?? (() => onStatusUpdate(bookingId, 'arriving'))}
        >
          {t('checkInBtn')}
        </button>
        {!prominent && <button className="btn-panel-danger" onClick={onCancelClick}>{t('cancelBookingBtn')}</button>}
        {!prominent && <button className="btn-panel-secondary" onClick={onEdit}>{t('editBookingLink')}</button>}
      </div>
    );
  }

  if (!prominent) {
    return (
      <div className="panel-actions">
        <button className="btn-panel-secondary" onClick={onEdit}>{t('editBookingLink')}</button>
      </div>
    );
  }

  return null;
}

function PanelRow({ label, value }) {
  return (
    <div className="panel-row">
      <span className="panel-row-label">{label}</span>
      <span className="panel-row-value">{value}</span>
    </div>
  );
}
