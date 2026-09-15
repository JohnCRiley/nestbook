// client/src/utils/amenityCatalog.js
//
// Curated structured-amenity picker vocabulary, shared by the Room/Category
// editors (RoomPanel.jsx, NewRoomModal.jsx) and the property-level picker
// (Settings.jsx). Keys and icons only — the Channex facility UUID each key
// maps to is a server-only concern (server/utils/amenityCatalog.js); this
// file's `key` list MUST stay in sync with that one, since the server
// validates submitted keys against its own copy and silently drops anything
// it doesn't recognise.
//
// `icon` names reference the existing 100-icon guest-facing library
// (server/public/images/guest-icons/<icon>.png, see IconPicker.jsx's
// GUEST_ICON_GROUPS) — the same icons already used guest-side, so a checked
// amenity looks identical whether it's shown to the owner here or to a guest
// on the booking page.
//
// Labels come from i18n (amenities.room.<key> / amenities.property.<key>),
// not from this file — room and property both happen to include a "wifi"
// and "air_conditioning" key, so the two catalogs are namespaced separately
// in the translation dictionary to avoid collision.

export const ROOM_AMENITIES = [
  { key: 'wifi',             icon: 'wifi' },
  { key: 'tv',               icon: 'tv' },
  { key: 'private_bathroom', icon: 'bath' },
  { key: 'shower',           icon: 'shower' },
  { key: 'air_conditioning', icon: 'air-conditioning' },
  { key: 'heating',          icon: 'heating-radiator' },
  { key: 'minibar',          icon: 'fridge' },
  { key: 'safe',             icon: 'safe' },
  { key: 'balcony',          icon: 'balcony' },
  { key: 'sea_view',         icon: 'waves-sea' },
  { key: 'hot_tub',          icon: 'hot-tub' },
  { key: 'washing_machine',  icon: 'washing-machine' },
  { key: 'iron',             icon: 'iron' },
  { key: 'hairdryer',        icon: 'hairdryer' },
  { key: 'fireplace',        icon: 'fireplace' },
  { key: 'sofa',             icon: 'sofa' },
];

export const PROPERTY_AMENITIES = [
  { key: 'parking',               icon: 'parking' },
  { key: 'pool',                  icon: 'pool' },
  { key: 'pet_friendly',          icon: 'pet-friendly' },
  { key: 'sun_terrace',           icon: 'beach-umbrella' },
  { key: 'reception_24hr',        icon: 'bell' },
  { key: 'wifi',                  icon: 'wifi' },
  { key: 'restaurant',            icon: 'restaurant-cutlery' },
  { key: 'bar',                   icon: 'beer' },
  { key: 'air_conditioning',      icon: 'air-conditioning' },
  { key: 'non_smoking',           icon: 'no-smoking' },
  { key: 'elevator',              icon: 'lift' },
  { key: 'laundry',               icon: 'washing-machine' },
  { key: 'wheelchair_accessible', icon: 'wheelchair' },
  { key: 'garden',                icon: 'garden-flower' },
  { key: 'bbq',                   icon: 'bbq-grill' },
  { key: 'baggage_storage',       icon: 'luggage' },
  { key: 'first_aid',             icon: 'first-aid' },
  { key: 'fire_extinguisher',     icon: 'fire-extinguisher' },
];
