// server/utils/normaliseSource.js
//
// Shared helpers for mapping an external booking onto NestBook's schema.
// Extracted verbatim (behaviour-preserving superset) from the CSV Booking
// Import Wizard's inline closures in routes/bookings.js so the Channex inbound
// sync (Phase 2, slice 5) uses the EXACT same normalisation instead of
// reinventing it.

/**
 * Map a free-text / OTA channel name onto the `bookings.source` CHECK-constraint
 * enum: 'direct' | 'phone' | 'email' | 'booking_com' | 'airbnb' | 'other' |
 * 'walk_in' | 'website'.
 *
 * Superset of the original importer version: it also strips separators before
 * matching, so Channex's separator-free OTA names ("BookingCom") resolve the
 * same as a human typing "Booking.com". Every input the importer previously
 * recognised still resolves identically.
 *
 * @param {string} raw
 * @returns {string} a valid bookings.source value
 */
export function normaliseSource(raw) {
  if (!raw) return 'other';
  const s = String(raw).trim().toLowerCase();
  const compact = s.replace(/[\s._-]+/g, '');
  if (compact.includes('bookingcom') || compact === 'bdc')    return 'booking_com';
  if (compact.includes('airbnb'))                             return 'airbnb';
  if (compact.includes('direct'))                             return 'direct';
  if (compact.includes('phone') || compact.includes('tel'))   return 'phone';
  if (compact.includes('email'))                              return 'email';
  if (compact.includes('website') || compact.includes('web')) return 'website';
  if (compact.includes('walk'))                               return 'walk_in';
  return 'other';
}

/**
 * Split a single "full name" string into { first, last } the way the Booking
 * Import Wizard does — a lone token gets last name '.', an empty string yields
 * a usable placeholder (Channex reservations always carry name + surname, but
 * be defensive).
 *
 * @param {string} full
 * @returns {{first: string, last: string}}
 */
export function splitName(full) {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Guest', last: '.' };
  if (parts.length === 1) return { first: parts[0], last: '.' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}
