// Fixed bed-type vocabulary (Phase 7a) — no free text, dropdown only. Must
// match VALID_BED_TYPES in server/routes/rooms.js exactly.
export const BED_TYPES = ['single', 'double', 'queen', 'king', 'sofa_bed', 'bunk_bed'];

const LABEL_KEYS = {
  single:   'bedTypeSingle',
  double:   'bedTypeDouble',
  queen:    'bedTypeQueen',
  king:     'bedTypeKing',
  sofa_bed: 'bedTypeSofaBed',
  bunk_bed: 'bedTypeBunkBed',
};

export function bedTypeLabel(t, type) {
  return t(LABEL_KEYS[type] ?? type);
}
