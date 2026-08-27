// Canonical list of valid guest-icon filenames (server/public/images/guest-icons/*.png).
//
// Shared between properties.js (validating an owner's At a Glance custom-fact
// icon choice on save) and bookingPage.js (defense-in-depth re-validation
// before building an <img src> from a DB value, rather than trusting
// whatever string happens to be stored). Kept as its own module — not part
// of export-guest-icons.mjs — because that script does real rasterization
// work as a side effect of being loaded; this is just data, safe to import
// anywhere.
//
// Must match the manifest in server/scripts/export-guest-icons.mjs and the
// category grouping in client/src/admin/IconPicker.jsx.
export const GUEST_ICON_NAMES = new Set([
  // Pets & Animals
  'paw', 'dog', 'dog-bowl', 'cat', 'bird', 'fish', 'horse', 'farm-barn',
  // Food & Drink
  'coffee-cup', 'tea', 'breakfast-plate', 'wine-glass', 'beer', 'bread-bakery',
  'fruit', 'restaurant-cutlery', 'bbq-grill', 'fridge', 'ice-cream', 'birthday-cake',
  // Outdoors & Activity
  'hiking-boot', 'trail-map', 'bicycle', 'mountain', 'beach-umbrella', 'waves-sea',
  'tree', 'garden-flower', 'campfire', 'tent', 'binoculars', 'fishing-rod',
  'golf', 'kayak-canoe', 'ski', 'backpack',
  // Comfort & Amenities
  'wifi', 'bed', 'bath', 'shower', 'pool', 'hot-tub', 'air-conditioning',
  'heating-radiator', 'tv', 'washing-machine', 'iron', 'hairdryer',
  'safe', 'balcony', 'fireplace', 'sofa',
  // Practical / Property Info
  'parking', 'key', 'clock', 'location-pin', 'luggage', 'lift', 'stairs',
  'no-smoking', 'fire-extinguisher', 'first-aid', 'umbrella-weather',
  'cash', 'credit-card', 'calendar', 'door', 'bell',
  // People & Access
  'family', 'child', 'wheelchair', 'group-friends', 'couple',
  'pet-friendly', 'no-pets', 'single-traveller',
  // Weather / Ambience
  'sun', 'cloud', 'rain', 'snow', 'moon-night', 'wind', 'thermometer', 'night-sky-stars',
  // Social Media & Contact
  'google', 'facebook', 'instagram', 'whatsapp', 'x', 'tripadvisor', 'youtube',
  'linkedin', 'pinterest', 'tiktok', 'phone-call', 'email', 'message-chat',
  'website-globe', 'messenger', 'qr-code',
]);
