import { UN_SUB_TYPES, UN_SUB_TYPE_DEFAULTS } from '../utils/unSubTypes.js';

// Rental-type (Rooms/Whole Property/Units) + Units sub-type (Aparthotel/
// Glamping/Serviced Apartment) selection — shared between the onboarding
// wizard (its own two steps) and the Add Property flow (one combined step).
// Pure/controlled: takes `form`/`setForm`/`t` and renders only the choice
// UI — callers own their own step chrome (labels, Continue/Back buttons).

export function RentalTypeSelector({ form, setForm, t }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 14 }}>
        <button
          type="button"
          onClick={() => setForm({ ...form, rental_type: 'rooms' })}
          className={`rental-type-btn${form.rental_type === 'rooms' ? ' active' : ''}`}
          data-rt="rooms"
          style={{ flex: 1, padding: '16px 18px', textAlign: 'left' }}
        >
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
            <i className="ti ti-bed" /> {t('onboard.rentalTypeRooms')}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.4, marginBottom: 8 }}>
            {t('onboard.rentalTypeRoomsDesc')}
          </div>
          <span className="wiz-inn-tag">
            ✦ {t('onboard.rentalTypeInn')} — {t('onboard.rentalTypeInnDesc')}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setForm({ ...form, rental_type: 'whole_property' })}
          className={`rental-type-btn${form.rental_type === 'whole_property' ? ' active' : ''}`}
          data-rt="whole_property"
          style={{ flex: 1, padding: '16px 18px', textAlign: 'left' }}
        >
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
            <i className="ti ti-home" /> {t('onboard.rentalTypeWhole')}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.4 }}>
            {t('onboard.rentalTypeWholeDesc')}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setForm({ ...form, rental_type: 'units' })}
          className={`rental-type-btn${form.rental_type === 'units' ? ' active' : ''}`}
          data-rt="units"
          style={{ flex: 1, padding: '16px 18px', textAlign: 'left' }}
        >
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
            <i className="ti ti-building" /> {t('onboard.rentalTypeUnits')}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.4 }}>
            {t('onboard.rentalTypeUnitsDesc')}
          </div>
        </button>
      </div>
      <div style={{
        marginTop: 14, padding: '8px 14px',
        background: '#fefce8', border: '1px solid #fbbf24',
        borderRadius: 7, fontSize: '0.78rem', color: '#92400e',
      }}>
        <i className="ti ti-lock" style={{ marginRight: 5 }} />
        {t('onboard.rentalTypeLockNote')}{' '}
        <a
          href="https://nestbook.io/help.html#getting-started"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#92400e', textDecoration: 'underline' }}
        >
          {t('onboard.rentalTypeLockLink')}
        </a>
      </div>
    </>
  );
}

export function UnSubTypeSelector({ form, setForm, t }) {
  const subType = form.un_sub_type ?? null;
  function chooseSubType(value) {
    setForm(f => ({ ...f, un_sub_type: value, ...UN_SUB_TYPE_DEFAULTS[value] }));
  }
  function chooseDecideLater() {
    setForm(f => ({
      ...f,
      un_sub_type: null,
      walk_in_enabled: 0,
      booking_flow: 'instant',
      servicing_type: null,
      breakfast_included: 0,
    }));
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
      {UN_SUB_TYPES.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => chooseSubType(opt.value)}
          className={`rental-type-btn${subType === opt.value ? ' active' : ''}`}
          style={{ padding: '14px 16px', textAlign: 'left' }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>
            {t(`onboard.unSubType.${opt.value}`)}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.4 }}>
            {t(`onboard.unSubType.${opt.value}Desc`)}
          </div>
        </button>
      ))}
      <button
        type="button"
        onClick={chooseDecideLater}
        className={`rental-type-btn${subType === null ? ' active' : ''}`}
        style={{ padding: '14px 16px', textAlign: 'left' }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          {t('onboard.unSubType.decideLater')}
        </div>
      </button>
    </div>
  );
}

// IR-mode room-organization sub-type (Named Rooms / Room Categories) — same
// two-choice-with-description pattern as UnSubTypeSelector above. Onboarding
// only for now; the Add Property flow's combined RentalTypeStep below is
// deliberately not wired to this yet (existing accounts get this choice via
// a separate Settings migration flow in a later phase).
export function IrRoomModeSelector({ form, setForm, t }) {
  const mode = form.ir_room_mode ?? 'named';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setForm(f => ({ ...f, ir_room_mode: 'named' }))}
        className={`rental-type-btn${mode === 'named' ? ' active' : ''}`}
        style={{ padding: '14px 16px', textAlign: 'left' }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>
          {t('onboard.irRoomMode.named')}
        </div>
        <div style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.4 }}>
          {t('onboard.irRoomMode.namedDesc')}
        </div>
      </button>
      <button
        type="button"
        onClick={() => setForm(f => ({ ...f, ir_room_mode: 'categories' }))}
        className={`rental-type-btn${mode === 'categories' ? ' active' : ''}`}
        style={{ padding: '14px 16px', textAlign: 'left' }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>
          {t('onboard.irRoomMode.categories')}
        </div>
        <div style={{ fontSize: '0.8rem', opacity: 0.8, lineHeight: 1.4 }}>
          {t('onboard.irRoomMode.categoriesDesc')}
        </div>
      </button>
    </div>
  );
}

// Combined step for flows that want rental-type + (conditionally) sub-type
// as a single screen, e.g. the Add Property flow's shorter step sequence.
export default function RentalTypeStep({ form, setForm, t }) {
  return (
    <>
      <RentalTypeSelector form={form} setForm={setForm} t={t} />
      {form.rental_type === 'units' && (
        <div style={{ marginTop: 20 }}>
          <div className="wiz-step-label">{t('onboard.wizUnSubType')}</div>
          <UnSubTypeSelector form={form} setForm={setForm} t={t} />
        </div>
      )}
    </>
  );
}
