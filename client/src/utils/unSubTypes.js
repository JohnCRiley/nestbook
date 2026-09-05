// Unit Sub-Type catalogue and default field bundles — shared between
// Settings' "Unit Sub-Type" section and Onboarding's units sub-type step,
// so both apply the exact same presets.

export const UN_SUB_TYPES = [
  {
    value: 'aparthotel',
    label: 'Aparthotel',
    desc: 'Apartments run like a small hotel — reception, bar and restaurant on-site. Self-catering optional.',
  },
  {
    value: 'glamping',
    label: 'Glamping',
    desc: 'Self-contained pods, tents and caravans, with a central office for check-in and support. Self-catering.',
  },
  {
    value: 'serviced_apartment',
    label: 'Holiday Rentals',
    desc: 'Self-catering, short-term rental properties.',
  },
];

// Defaults applied in one go when a sub-type is chosen — the owner can still
// edit every field individually afterwards (hybrid: presets set defaults,
// everything stays editable).
export const UN_SUB_TYPE_DEFAULTS = {
  aparthotel:          { walk_in_enabled: 1, booking_flow: 'instant', servicing_type: 'daily',               breakfast_included: 1 },
  glamping:            { walk_in_enabled: 1, booking_flow: 'instant', servicing_type: 'post_stay_optional',   breakfast_included: 0 },
  serviced_apartment:  { walk_in_enabled: 0, booking_flow: 'request', servicing_type: 'post_stay',            breakfast_included: 0 },
};
