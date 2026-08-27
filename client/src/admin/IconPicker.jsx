import { useState, useEffect, useRef } from 'react';

// Must match server/scripts/export-email-icons.mjs ICON_GROUPS
const ICON_GROUPS = {
  'Calendar & Time': [
    'calendar', 'calendar-check', 'calendar-event', 'calendar-off',
    'calendar-plus', 'calendar-time', 'calendar-minus', 'calendar-stats',
    'clock', 'alarm', 'hourglass', 'clock-hour-4',
  ],
  'Communication': [
    'mail', 'mail-opened', 'phone', 'phone-call', 'phone-off',
    'message', 'message-dots', 'message-circle',
    'bell', 'bell-ringing', 'send', 'speakerphone',
    'language', 'external-link', 'link', 'world',
  ],
  'Property & Rooms': [
    'home', 'home-2', 'home-check', 'home-eco',
    'building', 'building-bank', 'building-castle',
    'key', 'door', 'door-enter', 'door-exit',
    'bed', 'bath', 'sofa', 'lamp', 'stairs',
  ],
  'Food & Drink': [
    'coffee', 'mug', 'bowl-spoon', 'glass-full', 'chef-hat',
    'pizza', 'salad', 'apple', 'fish', 'bottle',
  ],
  'Travel & Transport': [
    'plane', 'car', 'bus', 'train', 'map',
    'map-pin', 'compass', 'luggage', 'anchor', 'ticket',
    'sailboat', 'tent',
  ],
  'People & Service': [
    'user', 'users', 'user-check', 'user-plus',
    'id-badge', 'badge',
    'star', 'heart', 'thumb-up', 'mood-happy',
    'award', 'crown', 'gift',
  ],
  'Finance': [
    'currency-dollar', 'currency-pound', 'credit-card',
    'receipt', 'receipt-2', 'receipt-off',
    'coin', 'wallet', 'discount', 'tag', 'percentage',
    'cash', 'pig-money', 'report-money', 'calculator',
  ],
  'Status & Actions': [
    'check', 'circle-check', 'circle-x', 'circle-plus',
    'alert-circle', 'alert-triangle', 'info-circle',
    'ban', 'flag', 'archive', 'replace', 'arrow-up-circle',
    'lock', 'lock-open', 'shield',
    'edit', 'trash', 'copy', 'download',
    'clipboard', 'clipboard-list', 'notes', 'rocket',
  ],
  'Media & Files': [
    'photo', 'camera', 'camera-plus',
    'file-text', 'file-download', 'file-import',
    'pencil', 'table', 'printer',
    'qrcode', 'barcode', 'scan', 'share', 'eye',
  ],
  'Nature & Weather': [
    'sun', 'moon', 'cloud', 'leaf', 'tree',
    'droplet', 'wave-sine', 'mountain', 'flame', 'snowflake',
    'plant-2', 'sparkles',
  ],
  'Charts & Data': [
    'chart-bar', 'chart-line', 'chart-pie', 'trending-up',
    'adjustments', 'adjustments-horizontal', 'list-details', 'settings',
  ],
  'Tech & Brands': [
    'device-mobile', 'plug-connected', 'brush', 'bug',
    'category', 'palette',
    'brand-airbnb', 'brand-booking', 'brand-facebook',
  ],
};

const COLOR_OPTIONS = [
  { key: 'green', label: 'Green',  hex: '#405440', textColor: '#fff' },
  { key: 'white', label: 'White',  hex: '#ffffff', textColor: '#374151', border: '#d1d5db', previewBg: '#405440' },
  { key: 'red',   label: 'Red',    hex: '#dc2626', textColor: '#fff' },
];

const BASE_URL = 'https://nestbook.io/images/email-icons';

// ── Guest-facing icon library ────────────────────────────────────────────────
// Must match server/scripts/export-guest-icons.mjs GUEST_ICON_GROUPS (names
// only — colour is fixed per icon in this library, baked into the PNG at
// export time, so the picker doesn't need to know which ones are black vs
// real brand colour).
const GUEST_ICON_GROUPS = {
  'Pets & Animals': ['paw', 'dog', 'dog-bowl', 'cat', 'bird', 'fish', 'horse', 'farm-barn'],
  'Food & Drink': [
    'coffee-cup', 'tea', 'breakfast-plate', 'wine-glass', 'beer', 'bread-bakery',
    'fruit', 'restaurant-cutlery', 'bbq-grill', 'fridge', 'ice-cream', 'birthday-cake',
  ],
  'Outdoors & Activity': [
    'hiking-boot', 'trail-map', 'bicycle', 'mountain', 'beach-umbrella', 'waves-sea',
    'tree', 'garden-flower', 'campfire', 'tent', 'binoculars', 'fishing-rod',
    'golf', 'kayak-canoe', 'ski', 'backpack',
  ],
  'Comfort & Amenities': [
    'wifi', 'bed', 'bath', 'shower', 'pool', 'hot-tub', 'air-conditioning',
    'heating-radiator', 'tv', 'washing-machine', 'iron', 'hairdryer',
    'safe', 'balcony', 'fireplace', 'sofa',
  ],
  'Practical / Property Info': [
    'parking', 'key', 'clock', 'location-pin', 'luggage', 'lift', 'stairs',
    'no-smoking', 'fire-extinguisher', 'first-aid', 'umbrella-weather',
    'cash', 'credit-card', 'calendar', 'door', 'bell',
  ],
  'People & Access': [
    'family', 'child', 'wheelchair', 'group-friends', 'couple',
    'pet-friendly', 'no-pets', 'single-traveller',
  ],
  'Weather / Ambience': [
    'sun', 'cloud', 'rain', 'snow', 'moon-night', 'wind', 'thermometer', 'night-sky-stars',
  ],
  'Social Media & Contact': [
    'google', 'facebook', 'instagram', 'whatsapp', 'x', 'tripadvisor', 'youtube',
    'linkedin', 'pinterest', 'tiktok', 'phone-call', 'email', 'message-chat',
    'website-globe', 'messenger', 'qr-code',
  ],
};

const GUEST_BASE_URL = 'https://nestbook.io/images/guest-icons';

// `guestOnly`: for callers that just want the owner to pick a bare icon name
// (not an <img> HTML snippet to insert into rich text) — e.g. At a Glance's
// per-custom-fact icon choice, which stores the name itself. Forces guest
// mode permanently and hides the mode tabs, since email icons (which need a
// colour choice) don't make sense for that use case.
export default function IconPicker({ onInsert, onClose, defaultMode = 'email', guestOnly = false }) {
  const [mode, setMode]       = useState(guestOnly ? 'guest' : defaultMode); // 'email' | 'guest'
  const [search, setSearch]   = useState('');
  const [color, setColor]     = useState('green');
  const searchRef             = useRef(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const q = search.trim().toLowerCase();

  const activeGroups = mode === 'guest' ? GUEST_ICON_GROUPS : ICON_GROUPS;

  const filtered = Object.entries(activeGroups).reduce((acc, [category, icons]) => {
    const hits = q ? icons.filter(n => n.includes(q)) : icons;
    if (hits.length) acc.push({ category, icons: hits });
    return acc;
  }, []);

  function handleInsert(iconName) {
    if (guestOnly) {
      onInsert(iconName);
      onClose();
      return;
    }
    const url = mode === 'guest'
      ? `${GUEST_BASE_URL}/${iconName}.png`
      : `${BASE_URL}/${iconName}-${color}.png`;
    onInsert(`<img src="${url}" width="20" height="20" alt="${iconName}" style="vertical-align:middle;display:inline-block;">`);
    onClose();
  }

  const selectedColor = COLOR_OPTIONS.find(c => c.key === color);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 560, maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e293b' }}>Insert Icon</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8', lineHeight: 1 }}>✕</button>
          </div>

          {/* Mode tabs — hidden entirely for guestOnly callers, which never leave guest mode */}
          {!guestOnly && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: '#f1f5f9', borderRadius: 7, padding: 3 }}>
              {[
                { key: 'email', label: 'Email icons' },
                { key: 'guest', label: 'Property & Guest icons' },
              ].map(m => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 700,
                    background: mode === m.key ? '#fff' : 'transparent',
                    color: mode === m.key ? '#405440' : '#64748b',
                    boxShadow: mode === m.key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    transition: 'background 0.1s, color 0.1s',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search icons…"
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: 10 }}
          />

          {/* Colour swatches — email icons only; guest icons have a fixed colour per icon */}
          {mode === 'email' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Colour:</span>
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.key}
                  onClick={() => setColor(c.key)}
                  title={c.label}
                  style={{
                    width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                    background: c.hex,
                    border: color === c.key ? '2.5px solid #405440' : `1.5px solid ${c.border ?? c.hex}`,
                    boxShadow: color === c.key ? '0 0 0 2px #F4F3F0' : 'none',
                    position: 'relative',
                    transition: 'box-shadow 0.1s',
                  }}
                />
              ))}
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 4 }}>
                {selectedColor?.label} — inserted as 20×20 px
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              Black by default; platform logos use their own real brand colour — inserted as 20×20 px
            </span>
          )}
        </div>

        {/* Icon grid */}
        <div style={{ overflowY: 'auto', padding: '12px 16px', flex: 1 }}>
          {filtered.length === 0 && (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', marginTop: 24 }}>No icons match "{search}"</p>
          )}
          {filtered.map(({ category, icons }) => (
            <div key={category} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {category}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {icons.map(name => (
                  <button
                    key={name}
                    onClick={() => handleInsert(name)}
                    title={name}
                    style={{
                      width: 44, height: 44, borderRadius: 7, border: '1px solid #e2e8f0',
                      background: mode === 'email' && color === 'white' ? '#405440' : '#f8fafc',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0, transition: 'border-color 0.1s, background 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#405440'; e.currentTarget.style.background = mode === 'email' && color === 'white' ? '#0f2d08' : '#F4F3F0'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = mode === 'email' && color === 'white' ? '#405440' : '#f8fafc'; }}
                  >
                    <img
                      src={mode === 'guest' ? `/images/guest-icons/${name}.png` : `/images/email-icons/${name}-${color}.png`}
                      width={22}
                      height={22}
                      alt={name}
                      style={{ display: 'block' }}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
