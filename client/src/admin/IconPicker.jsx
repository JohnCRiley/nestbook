import { useState, useEffect, useRef } from 'react';

// Must match server/scripts/export-email-icons.mjs ICON_GROUPS
const ICON_GROUPS = {
  'Calendar & Time': [
    'calendar', 'calendar-check', 'calendar-event', 'calendar-off',
    'calendar-plus', 'calendar-time', 'clock', 'alarm', 'hourglass', 'clock-hour-4',
  ],
  'Communication': [
    'mail', 'mail-opened', 'phone', 'phone-call', 'message',
    'message-dots', 'bell', 'bell-ringing', 'send', 'speakerphone',
  ],
  'Property & Rooms': [
    'home', 'building', 'key', 'door', 'bed',
    'bath', 'sofa', 'lamp', 'home-2', 'stairs',
  ],
  'Food & Drink': [
    'coffee', 'mug', 'bowl-spoon', 'glass-full', 'chef-hat',
    'pizza', 'salad', 'apple', 'fish', 'bottle',
  ],
  'Travel & Transport': [
    'plane', 'car', 'bus', 'train', 'map',
    'map-pin', 'compass', 'luggage', 'anchor', 'ticket',
  ],
  'People & Service': [
    'user', 'users', 'user-check', 'star', 'heart',
    'thumb-up', 'mood-happy', 'award', 'crown', 'gift',
  ],
  'Finance': [
    'currency-dollar', 'credit-card', 'receipt', 'coin', 'wallet',
    'discount', 'tag', 'percentage', 'cash', 'pig-money',
  ],
  'Status & Actions': [
    'check', 'circle-check', 'circle-x', 'alert-circle', 'info-circle',
    'circle-plus', 'edit', 'trash', 'copy', 'download',
  ],
  'Media & Files': [
    'photo', 'camera', 'file-text', 'file-download', 'printer',
    'qrcode', 'barcode', 'scan', 'share', 'eye',
  ],
  'Nature & Weather': [
    'sun', 'moon', 'cloud', 'leaf', 'tree',
    'droplet', 'wave-sine', 'mountain', 'flame', 'snowflake',
  ],
};

const COLOR_OPTIONS = [
  { key: 'green', label: 'Green',  hex: '#1a4710', textColor: '#fff' },
  { key: 'white', label: 'White',  hex: '#ffffff', textColor: '#374151', border: '#d1d5db', previewBg: '#1a4710' },
  { key: 'red',   label: 'Red',    hex: '#dc2626', textColor: '#fff' },
];

const BASE_URL = 'https://nestbook.io/images/email-icons';

export default function IconPicker({ onInsert, onClose }) {
  const [search, setSearch]   = useState('');
  const [color, setColor]     = useState('green');
  const searchRef             = useRef(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const q = search.trim().toLowerCase();

  const filtered = Object.entries(ICON_GROUPS).reduce((acc, [category, icons]) => {
    const hits = q ? icons.filter(n => n.includes(q)) : icons;
    if (hits.length) acc.push({ category, icons: hits });
    return acc;
  }, []);

  function handleInsert(iconName) {
    const url = `${BASE_URL}/${iconName}-${color}.png`;
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

          {/* Search */}
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search icons…"
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: 10 }}
          />

          {/* Colour swatches */}
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
                  border: color === c.key ? '2.5px solid #1a4710' : `1.5px solid ${c.border ?? c.hex}`,
                  boxShadow: color === c.key ? '0 0 0 2px #d9f0cc' : 'none',
                  position: 'relative',
                  transition: 'box-shadow 0.1s',
                }}
              />
            ))}
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 4 }}>
              {selectedColor?.label} — inserted as 20×20 px
            </span>
          </div>
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
                      background: color === 'white' ? '#1a4710' : '#f8fafc',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0, transition: 'border-color 0.1s, background 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#1a4710'; e.currentTarget.style.background = color === 'white' ? '#0f2d08' : '#f0fdf4'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = color === 'white' ? '#1a4710' : '#f8fafc'; }}
                  >
                    <img
                      src={`/images/email-icons/${name}-${color}.png`}
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
