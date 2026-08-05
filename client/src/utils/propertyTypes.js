// Shared property-type list — was previously duplicated independently across
// Register.jsx, Onboarding.jsx and Settings.jsx. Single source of truth now;
// add new types here once, not per-page.
export const PROPERTY_GROUPS = [
  { group: 'Hospitality', options: [
    { value: 'bnb',        label: 'B&B (Bed & Breakfast)' },
    { value: 'guesthouse', label: 'Guest House' },
    { value: 'inn',        label: 'Inn / Pub with rooms' },
    { value: 'hotel',      label: 'Small Hotel' },
    { value: 'hostel',     label: 'Hostel' },
  ]},
  { group: 'Self-catering', options: [
    { value: 'gite',          label: 'Gîte' },
    { value: 'cottage',       label: 'Holiday Cottage' },
    { value: 'villa',         label: 'Villa' },
    { value: 'apartment',     label: 'Holiday Apartment' },
    { value: 'aparthotel',    label: 'Aparthotel' },
    { value: 'lodge',         label: 'Lodge' },
    { value: 'caravan',       label: 'Static Caravan / Chalet' },
    { value: 'glamping',      label: 'Glamping (Pod / Bell Tent / Yurt)' },
    { value: 'shepherds_hut', label: "Shepherd's Hut" },
    { value: 'treehouse',     label: 'Treehouse' },
    { value: 'narrowboat',    label: 'Narrowboat / Houseboat' },
    { value: 'farmhouse',     label: 'Farmhouse' },
    { value: 'chateau',       label: 'Château / Manor House' },
  ]},
  { group: 'Asian accommodation', options: [
    { value: 'ryokan',       label: 'Ryokan (Japan)' },
    { value: 'minsu',        label: '民宿 Minsu (China/Taiwan)' },
    { value: 'homestay',     label: 'Homestay' },
    { value: 'resort_villa', label: 'Resort Villa' },
  ]},
  { group: 'Other', options: [
    { value: 'other', label: 'Other' },
  ]},
];

// Property types that default to Whole Property rental mode when chosen —
// shared between Onboarding (property-type step) and the Add Property flow.
export const WHOLE_PROPERTY_TYPES = new Set([
  'gite', 'cottage', 'villa', 'apartment', 'lodge',
  'caravan', 'glamping', 'shepherds_hut', 'treehouse',
  'narrowboat', 'farmhouse', 'chateau',
  'ryokan', 'minsu', 'homestay', 'resort_villa',
]);
