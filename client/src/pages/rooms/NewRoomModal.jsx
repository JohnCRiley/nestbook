import { useState } from 'react';
import { formatAmenity } from './RoomPanel.jsx';
import { apiFetch } from '../../utils/apiFetch.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';

const ROOM_TYPES    = ['single', 'double', 'twin', 'suite', 'apartment', 'other'];

const EMPTY = {
  name: '', type: 'double', price_per_night: '',
  capacity: 2, amenities: '', status: 'available',
};

/** Parse amenities string → array, filtering blanks. */
const parseAmenities = (str) =>
  (str ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Capitalise first letter. */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function NewRoomModal({ onClose, onSuccess }) {
  const { currencySymbol, property } = useLocale();
  const t = useT();
  const [form,       setForm]       = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError(t('roomNameRequired')); return; }
    if (!form.price_per_night || isNaN(Number(form.price_per_night))) {
      setError(t('priceRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id:     property?.id ?? 1,
          name:            form.name.trim(),
          type:            form.type,
          price_per_night: Number(form.price_per_night),
          capacity:        Number(form.capacity),
          amenities:       form.amenities.trim() || null,
          status:          form.status,
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

  const amenityPreview = parseAmenities(form.amenities);

  return (
    <div className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={t('moRoomTitle')}>

        <div className="modal-header">
          <h2>{t('moRoomTitle')}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

            <div className="form-grid">
              <div className="form-group span-2">
                <label className="form-label">{t('roomNameLabel')} *</label>
                <input name="name" className="form-control" value={form.name}
                  onChange={handleChange} required autoFocus
                  placeholder="e.g. La Suite Lavande" />
              </div>

              <div className="form-group">
                <label className="form-label">{t('typeLabel')}</label>
                <select name="type" className="form-control" value={form.type} onChange={handleChange}>
                  {ROOM_TYPES.map((rt) => (
                    <option key={rt} value={rt}>{t(`roomType${capitalize(rt)}`)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('status')}</label>
                <select name="status" className="form-control" value={form.status} onChange={handleChange}>
                  <option value="available">{t('available')}</option>
                  <option value="maintenance">{t('maintenance')}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('pricePerNightLabel')} ({currencySymbol}) *</label>
                <input name="price_per_night" type="number" className="form-control"
                  value={form.price_per_night} onChange={handleChange}
                  min="0" step="0.01" placeholder="120" required />
              </div>

              <div className="form-group">
                <label className="form-label">{t('capacityGuestsLabel')}</label>
                <input name="capacity" type="number" className="form-control"
                  value={form.capacity} onChange={handleChange} min="1" max="20" />
              </div>

              <div className="form-group span-2">
                <label className="form-label">{t('amenities')}</label>
                <input name="amenities" className="form-control"
                  value={form.amenities} onChange={handleChange}
                  placeholder="wifi, ensuite, balcony, parking, minibar…" />
                <span className="form-hint">{t('amenitiesHint')}</span>
                {amenityPreview.length > 0 && (
                  <div className="amenity-list" style={{ marginTop: 8 }}>
                    {amenityPreview.map((a) => (
                      <span key={a} className="amenity-tag">{formatAmenity(a)}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t('adding') : t('moRoomTitle')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
