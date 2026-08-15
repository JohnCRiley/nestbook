import { useState, useEffect } from 'react';
import { formatAmenity } from './RoomPanel.jsx';
import { apiFetch } from '../../utils/apiFetch.js';
import { apiError } from '../../utils/apiError.js';
import { useLocale, useT } from '../../i18n/LocaleContext.jsx';

const ROOM_TYPES = ['single', 'double', 'twin', 'suite', 'apartment', 'other'];

const BEDROOM_TYPES = ['single', 'double', 'twin', 'bunk', 'master', 'kids', 'suite'];

const EMPTY = {
  name: '', type: 'double', price_per_night: '',
  capacity: 2, amenities: '', status: 'available', breakfast_included: 0, description: '',
  category_id: '',
};

/** Parse amenities string → array, filtering blanks. */
const parseAmenities = (str) =>
  (str ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Capitalise first letter. */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function NewRoomModal({ onClose, onSuccess, parentUnitId = null }) {
  const { currencySymbol, property } = useLocale();
  const t = useT();
  // Unit mode: creating an internal room inside a unit (parentUnitId set)
  // reuses the same WP-lite create form as WP room-types. Creating a unit
  // itself (parentUnitId null) falls through to the existing form below,
  // unaffected.
  const isWP = property?.rental_type === 'whole_property' || !!parentUnitId;
  // Room Categories (Phase 4): only IR-mode properties that have switched
  // via the Phase 3 migration show this field at all.
  const showCategoryField = !isWP && property?.rental_type === 'rooms' && property?.ir_room_mode === 'categories';
  const [form,       setForm]       = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const isBedroom = BEDROOM_TYPES.includes(form.type);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    if (!showCategoryField || !property?.id) return;
    apiFetch(`/api/properties/${property.id}/room-categories`)
      .then((r) => r.ok ? r.json() : [])
      .then(setCategories)
      .catch(() => {});
  }, [showCategoryField, property?.id]);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError(isUnitTopLevel ? 'Unit name is required.' : t('roomNameRequired')); return; }
    if (!isWP && (!form.price_per_night || isNaN(Number(form.price_per_night)))) {
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
          property_id:        property?.id ?? 1,
          name:               form.name.trim(),
          type:               form.type,
          price_per_night:    isWP ? 0 : Number(form.price_per_night),
          capacity:           (!isWP || isBedroom) ? Number(form.capacity) : 0,
          amenities:          form.amenities.trim() || null,
          status:             isWP ? 'available' : form.status,
          breakfast_included: isWP ? 0 : (form.breakfast_included ? 1 : 0),
          description:        form.description.trim() || null,
          parent_unit_id:     parentUnitId ?? null,
          category_id:        showCategoryField && form.category_id ? Number(form.category_id) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(apiError(body, t));
      }
      onSuccess(await res.json());
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const amenityPreview = parseAmenities(form.amenities);
  const hasData = !!(form.name || (!isWP && form.price_per_night));

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (hasData) return;
      onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [hasData, onClose]);

  function handleBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    if (hasData) return;
    onClose();
  }

  // Unit mode top-level create (a unit itself, not an internal room) gets its
  // own plain-English label — not yet in the i18n catalogue (UI isn't
  // customer-facing at this stage; flagged here for translation later).
  const isUnitTopLevel = property?.rental_type === 'units' && !parentUnitId;
  const modalTitle = isUnitTopLevel
    ? 'Add Unit'
    : (isWP ? t('rooms.addRoom') : t('moRoomTitle'));

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal" role="dialog" aria-label={modalTitle}>

        <div className="modal-header">
          <h2>{modalTitle}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

            <div className="form-grid">
              <div className="form-group span-2">
                <label className="form-label">
                  {isWP ? 'Room name' : (isUnitTopLevel ? 'Unit Name' : t('roomNameLabel'))} *
                </label>
                <input name="name" className="form-control" value={form.name}
                  onChange={handleChange} required autoFocus
                  placeholder={isWP ? 'e.g. Master Bedroom, Kitchen, Garden' : 'e.g. La Suite Lavande'} />
              </div>

              {isWP && (
                <div className="form-group span-2">
                  <label className="form-label">Room type</label>
                  <select name="type" className="form-control" value={form.type} onChange={handleChange}>
                    <optgroup label="Bedrooms">
                      <option value="double">Double bedroom</option>
                      <option value="twin">Twin bedroom</option>
                      <option value="single">Single bedroom</option>
                      <option value="bunk">Bunk room</option>
                      <option value="master">Master suite</option>
                      <option value="kids">Kids room</option>
                    </optgroup>
                    <optgroup label="Bathrooms">
                      <option value="bathroom">Bathroom</option>
                      <option value="ensuite">En-suite</option>
                      <option value="shower_room">Shower room</option>
                      <option value="wc">WC / Cloakroom</option>
                    </optgroup>
                    <optgroup label="Living spaces">
                      <option value="living_room">Living room</option>
                      <option value="kitchen">Kitchen</option>
                      <option value="kitchen_diner">Kitchen / Diner</option>
                      <option value="dining_room">Dining room</option>
                      <option value="study">Study / Office</option>
                      <option value="games_room">Games room</option>
                      <option value="cinema_room">Cinema room</option>
                      <option value="playroom">Playroom</option>
                    </optgroup>
                    <optgroup label="Outdoor &amp; leisure">
                      <option value="garden">Garden</option>
                      <option value="terrace">Terrace / Patio</option>
                      <option value="pool">Swimming pool</option>
                      <option value="hot_tub">Hot tub</option>
                      <option value="sauna">Sauna</option>
                      <option value="gym">Gym</option>
                      <option value="garage">Garage / Parking</option>
                      <option value="games_area">Outdoor games area</option>
                    </optgroup>
                    <optgroup label="Other">
                      <option value="other">Other</option>
                    </optgroup>
                  </select>
                </div>
              )}

              {!isWP && (
                <div className="form-group">
                  <label className="form-label">{t('typeLabel')}</label>
                  <select name="type" className="form-control" value={form.type} onChange={handleChange}>
                    {ROOM_TYPES.map((rt) => (
                      <option key={rt} value={rt}>{t(`roomType${capitalize(rt)}`)}</option>
                    ))}
                  </select>
                </div>
              )}

              {!isWP && (
                <div className="form-group">
                  <label className="form-label">{t('status')}</label>
                  <select name="status" className="form-control" value={form.status} onChange={handleChange}>
                    <option value="available">{t('available')}</option>
                    <option value="maintenance">{t('maintenance')}</option>
                  </select>
                </div>
              )}

              {!isWP && (
                <div className="form-group">
                  <label className="form-label">{t('pricePerNightLabel')} ({currencySymbol}) *</label>
                  <input name="price_per_night" type="number" className="form-control"
                    value={form.price_per_night} onChange={handleChange}
                    min="0" step="0.01" placeholder="120" required />
                </div>
              )}

              {(!isWP || isBedroom) && (
                <div className={`form-group${isWP ? ' span-2' : ''}`}>
                  <label className="form-label">
                    {isWP ? t('rooms.sleeps') : t('capacityGuestsLabel')}
                  </label>
                  <input name="capacity" type="number" className="form-control"
                    value={form.capacity} onChange={handleChange} min="1" max="20" />
                  {!isWP && !isUnitTopLevel && (
                    <span className="form-hint">{t('capacityGuestsHint')}</span>
                  )}
                </div>
              )}

              {showCategoryField && (
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select name="category_id" className="form-control" value={form.category_id} onChange={handleChange}>
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {!isWP && (
                <div className="form-group span-2">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!form.breakfast_included}
                      onChange={(e) => setForm((prev) => ({ ...prev, breakfast_included: e.target.checked ? 1 : 0 }))}
                    />
                    <span className="form-label" style={{ marginBottom: 0 }}>{t('breakfastIncludedLabel')}</span>
                  </label>
                  <span className="form-hint">{isUnitTopLevel ? 'Advertise breakfast as included in the unit rate' : t('roomBreakfastSubtitle')}</span>
                </div>
              )}

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

              <div className="form-group span-2">
                <label className="form-label">
                  {'Description (optional)'}
                </label>
                <textarea name="description" className="form-control" rows={2}
                  value={form.description} onChange={handleChange}
                  placeholder={isWP
                    ? 'Describe this bedroom — the bed size, the view, en-suite…'
                    : (isUnitTopLevel
                        ? 'Describe this unit — the space, the view, what makes it special...'
                        : 'Describe this room — the view, the bed, what makes it special...')}
                  style={{ resize: 'vertical' }} />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t('adding') : modalTitle}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
