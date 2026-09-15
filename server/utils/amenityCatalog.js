// server/utils/amenityCatalog.js
//
// Curated structured-amenity vocabulary — the prerequisite for Channex Slice C
// (facilities push), but built as a real NestBook feature in its own right
// (see docs/completed/channex-structured-amenities.md).
//
// Channex expects a fixed-vocabulary facility ID (191 room-level, 301
// property-level — confirmed live against staging, see
// docs/in-progress/channex-facilities-investigation.md). Exposing all 191/301
// to an owner would be overwhelming, and NestBook's free-text amenities have
// no reliable way to map onto them (tested directly in that investigation —
// naive keyword matching produces wrong associations, e.g. "safe" matching
// "Baby safety gates"). So instead: a small, curated subset, hand-picked from
// Channex's REAL current staging option lists (GET /api/v1/room_facilities/
// options and /api/v1/property_facilities/options, fetched 2026-09-15), with
// the Channex facility UUID stored alongside each item from day one.
//
// `key` is NestBook's own stable identifier (stored in the DB and used for
// i18n lookups); `channexId` is the exact UUID Channex expects in a
// `facilities` array — not used by anything yet (that's the Slice C push,
// deliberately out of scope for this pass), but captured now so no further
// "guessing" layer is ever needed.
//
// Client mirror (icon choice only, no Channex IDs): client/src/constants/amenities.js
// — keys must stay in sync between the two files.

// ── Room / category level (matches Channex's room_facilities catalog) ───────
export const ROOM_AMENITIES = [
  { key: 'wifi',              channexId: '6556b81d-62e2-454b-bdb7-b9b11f6bf57c', icon: 'wifi' },              // "Wireless internet"
  { key: 'tv',                channexId: '724b54ce-57d3-4751-9c10-76844a6fa2ed', icon: 'tv' },                // "TV"
  { key: 'private_bathroom',  channexId: 'cd7b1937-8405-45a5-9800-28c91235f528', icon: 'bath' },              // "Bathroom"
  { key: 'shower',            channexId: '179c91be-836f-497f-9329-3acb333c85b1', icon: 'shower' },            // "Shower"
  { key: 'air_conditioning',  channexId: '9f5726e2-f979-4b6b-a69e-cbca387bc7ea', icon: 'air-conditioning' },  // "Airconditioning"
  { key: 'heating',           channexId: '85dd90ff-d582-45a2-b6f9-b86155709deb', icon: 'heating-radiator' },  // "Heating"
  { key: 'minibar',           channexId: '6d03ddf6-2bed-4a39-bae2-55f5f5a87d1e', icon: 'fridge' },            // "Mini-bar"
  { key: 'safe',              channexId: '6e174877-c6e7-4ee7-a7af-abaaf07d72be', icon: 'safe' },              // "Safe Deposit Box"
  { key: 'balcony',           channexId: '363c2057-2cdf-4cbc-af98-069c2d573952', icon: 'balcony' },           // "Balcony"
  { key: 'sea_view',          channexId: 'e1d990b0-683c-4d1f-9151-c46c21aa6801', icon: 'waves-sea' },         // "Sea View"
  { key: 'hot_tub',           channexId: '2b85eb67-c28a-45a9-a7d6-147f0e2391db', icon: 'hot-tub' },           // "Hot Tub"
  { key: 'washing_machine',   channexId: 'e6e819a8-004e-498e-a578-c400a7171702', icon: 'washing-machine' },  // "Washing machine"
  { key: 'iron',              channexId: '734d5dfe-808e-43ef-82bd-54e7899da670', icon: 'iron' },              // "Ironing facilities"
  { key: 'hairdryer',         channexId: '36a4bcae-e011-4552-9088-7ebb9905ead1', icon: 'hairdryer' },         // "Hair Dryer"
  { key: 'fireplace',         channexId: 'feffe2ff-67eb-4162-bcd8-01907c5500c6', icon: 'fireplace' },         // "Fireplace"
  { key: 'sofa',              channexId: 'b57f3bc2-a1c5-4e2c-8b20-07fdd2eab0ed', icon: 'sofa' },              // "Sofa"
];

// ── Property level (matches Channex's property_facilities catalog) ─────────
//
// Deliberately excludes a "breakfast" checkbox: `properties.breakfast_included`
// already exists as a real structured feature (with its own price/timing/
// widget fields) — duplicating it here as a plain checkbox would just confuse
// owners with two "breakfast" controls. Whenever Slice C's push is built, that
// existing flag can feed Channex's "Breakfast" facility directly, no picker
// entry needed for it.
//
// "Parking" has no single generic Channex ID at this level (confirmed in the
// investigation — 6 granular variants, no plain "Parking"). "Street parking"
// is used as the curated catalog-all — the option a truthful checkbox is
// least likely to overclaim (a private secured/indoor lot implies more than
// most independent properties actually offer).
export const PROPERTY_AMENITIES = [
  { key: 'parking',                channexId: '6fe8d0f3-1f34-49e0-ae60-5a7e4cc28fc0', icon: 'parking' },          // "Street parking"
  { key: 'pool',                   channexId: 'b8956092-5d84-472e-8536-4d9c8a48759d', icon: 'pool' },             // "Swimming pool"
  { key: 'pet_friendly',           channexId: '4610a953-20ba-4c82-bb0a-2210bbdf8557', icon: 'pet-friendly' },     // "Pet Friendly"
  { key: 'sun_terrace',            channexId: '8a4109f0-3952-4a33-98fa-4787008f8cfc', icon: 'beach-umbrella' },   // "Sun terrace"
  { key: 'reception_24hr',         channexId: '864d91a6-3a40-4098-a880-84b841e11adb', icon: 'bell' },             // "24-hour front desk"
  { key: 'wifi',                   channexId: 'ed553333-7f1f-434a-8c43-eb8fe96c5f54', icon: 'wifi' },             // "WiFi"
  { key: 'restaurant',             channexId: '893cae56-0348-4e27-844f-df092b47c2e5', icon: 'restaurant-cutlery' }, // "Restaurant"
  { key: 'bar',                    channexId: 'f47cd66c-6074-440b-8a70-bc97e7178512', icon: 'beer' },             // "Bar"
  { key: 'air_conditioning',       channexId: 'cc402cc0-696b-4bd6-a5d7-4adb060bc056', icon: 'air-conditioning' }, // "Air conditioning"
  { key: 'non_smoking',            channexId: 'bf382902-2be1-486c-a2b5-44d09efb7def', icon: 'no-smoking' },       // "Non-smoking rooms"
  { key: 'elevator',               channexId: '62c62700-89fb-4493-9069-ce79cc8c7ada', icon: 'lift' },             // "Elevators"
  { key: 'laundry',                channexId: 'e313e9b9-dc1b-40ac-a100-ac5ea02dacac', icon: 'washing-machine' },  // "Laundry"
  { key: 'wheelchair_accessible',  channexId: 'd7ab0d30-1658-4355-b1f3-063cb67fc94b', icon: 'wheelchair' },       // "Property is wheel chair accessible"
  { key: 'garden',                 channexId: '7fda90a7-90fb-4abe-a180-dfc1e9160af3', icon: 'garden-flower' },    // "Garden"
  { key: 'bbq',                    channexId: '3226463a-5468-4886-b16f-3a7738e5679f', icon: 'bbq-grill' },        // "BBQ/Picnic area"
  { key: 'baggage_storage',        channexId: '24f98ce0-5717-47e1-bd95-c792bc9f6250', icon: 'luggage' },          // "Baggage Storage"
  { key: 'first_aid',              channexId: '124edccf-939d-4b91-a96f-9dcac12abe2b', icon: 'first-aid' },        // "First aid kit available"
  { key: 'fire_extinguisher',      channexId: '182d38d2-38bf-41de-a258-e5219a9c4bbb', icon: 'fire-extinguisher' }, // "Fire extinguishers"
];

export const ROOM_AMENITY_KEYS     = new Set(ROOM_AMENITIES.map(a => a.key));
export const PROPERTY_AMENITY_KEYS = new Set(PROPERTY_AMENITIES.map(a => a.key));

/**
 * Filters a submitted amenity-key list down to known catalog keys, dedupes,
 * and returns a JSON string ready for storage — or null if nothing valid
 * remains (same "don't store an empty/malformed value" convention as
 * properties.js's normalizeAtAGlanceFacts).
 */
export function normalizeAmenityKeys(list, validKeys) {
  if (!Array.isArray(list)) return null;
  const clean = [...new Set(list.filter(k => validKeys.has(k)))];
  return clean.length ? JSON.stringify(clean) : null;
}

/** Parses a stored amenity-keys JSON string back into an array (never throws). */
export function parseAmenityKeys(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
