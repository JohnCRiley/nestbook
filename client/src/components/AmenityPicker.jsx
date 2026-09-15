// Structured amenity checklist — same interaction style as Settings.jsx's
// AtAGlanceSection (checkbox grid), but using the guest-facing icon library
// (server/public/images/guest-icons) instead of the Tabler icon font, since
// these amenities are also shown to guests on the booking page and should
// look identical there and here.
//
// `catalog`: array of { key, icon } from client/src/utils/amenityCatalog.js.
// `selected`: array of selected keys. `onChange(nextArray)`.
// `labelPrefix`: i18n namespace, e.g. 'amenities.room' or 'amenities.property'
// — resolves to `t(`${labelPrefix}.${key}`)` per item.
export default function AmenityPicker({ catalog, selected, onChange, t, labelPrefix }) {
  const selectedSet = new Set(selected ?? []);

  function toggle(key) {
    const next = selectedSet.has(key)
      ? [...selectedSet].filter(k => k !== key)
      : [...selectedSet, key];
    onChange(next);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px 12px' }}>
      {catalog.map(({ key, icon }) => {
        const checked = selectedSet.has(key);
        return (
          <label
            key={key}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
              padding: '5px 8px', borderRadius: 6,
              border: `1px solid ${checked ? 'var(--accent, #405440)' : 'var(--border, #e2e8f0)'}`,
              background: checked ? 'var(--light-green, #f0f5f0)' : 'transparent',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(key)}
              style={{ width: 15, height: 15, flexShrink: 0 }}
            />
            <img src={`/images/guest-icons/${icon}.png`} width={16} height={16} alt="" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t(`${labelPrefix}.${key}`)}
            </span>
          </label>
        );
      })}
    </div>
  );
}
