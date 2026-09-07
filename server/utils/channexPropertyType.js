// server/utils/channexPropertyType.js
//
// Pure mapping: a NestBook property record -> the Channex `property_type` string
// it must be created with. Phase 2, slice 1. No I/O, no side effects.
//
// Why this one function matters: `property_type` silently determines Channex's
// internal Billing Type (Hotel-flat $7/property vs Vacation-Rental $0.50/unit),
// so the mapping is a commercial decision, not a cosmetic one. The values below
// were confirmed directly with Channex support — see
// docs/in-progress/channex-integration-research.md sections 4 and 12 — and every
// string returned is a member of Channex's documented property_type enum
// (https://docs.channex.io/api-v.1-documentation/hotels-collection#fields).
//
// Mapping (NestBook mode -> Channex property_type):
//   rooms  + ir_room_mode 'named'             -> guest_house   (flat billing)
//   rooms  + ir_room_mode 'categories'        -> guest_house   (flat billing)
//   whole_property                            -> villa         (per-unit, always exactly 1)
//   units  + un_sub_type 'aparthotel'         -> apart_hotel   (flat billing)
//   units  + un_sub_type 'glamping'           -> camping       (flat billing)
//   units  + un_sub_type 'serviced_apartment' -> apartment     (per-unit, real unit count)
//
// (un_sub_type values are the raw DB values — see server/db/schema.js:
//  'aparthotel' | 'glamping' | 'serviced_apartment'. 'serviced_apartment' is the
//  mode surfaced to owners as "Holiday Rentals".)

/** Channex's full documented property_type enum, verbatim. */
const CHANNEX_PROPERTY_TYPES = new Set([
  'apart_hotel', 'apartment', 'boat', 'camping', 'capsule_hotel', 'chalet',
  'country_house', 'farm_stay', 'guest_house', 'holiday_home', 'holiday_park',
  'homestay', 'hostel', 'hotel', 'inn', 'lodge', 'motel', 'resort', 'riad',
  'ryokan', 'tent', 'villa',
]);

/**
 * @param {object} property   a NestBook `properties` table row
 * @returns {string}          a Channex property_type enum value
 * @throws {Error}            if the property's mode / sub-type isn't mapped
 */
export function getChannexPropertyType(property) {
  if (!property || typeof property !== 'object') {
    throw new Error('getChannexPropertyType: a property record is required');
  }

  const id = property.id ?? '(no id)';
  const rentalType = property.rental_type ?? 'rooms';
  let type;

  switch (rentalType) {
    case 'rooms':
      // Both IR sub-modes ('named' and 'categories') are one inventory calendar
      // with room types underneath -> hotel-family type, regardless of sub-mode.
      type = 'guest_house';
      break;

    case 'whole_property':
      type = 'villa';
      break;

    case 'units': {
      const subType = property.un_sub_type ?? null;
      switch (subType) {
        case 'aparthotel':         type = 'apart_hotel'; break;
        case 'glamping':           type = 'camping';     break;
        case 'serviced_apartment': type = 'apartment';   break;
        default:
          throw new Error(
            `getChannexPropertyType: units-mode property ${id} has un_sub_type ` +
            `${JSON.stringify(subType)} — no Channex property_type mapping. ` +
            `Expected one of: aparthotel, glamping, serviced_apartment.`
          );
      }
      break;
    }

    default:
      throw new Error(
        `getChannexPropertyType: property ${id} has rental_type ${JSON.stringify(rentalType)} — ` +
        `no Channex property_type mapping.`
      );
  }

  // Defence in depth: never hand Channex a value it would reject.
  if (!CHANNEX_PROPERTY_TYPES.has(type)) {
    throw new Error(`getChannexPropertyType: computed '${type}' is not a valid Channex property_type`);
  }
  return type;
}

export { CHANNEX_PROPERTY_TYPES };
