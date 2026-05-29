import db from '../db/database.js';

/** Extract MM-DD from a YYYY-MM-DD string. */
function toMmDd(dateIso) {
  return dateIso.slice(5);
}

/**
 * Returns true if dateIso (YYYY-MM-DD) falls within the rate period's range.
 * date_from / date_to may be:
 *   MM-DD  — annual, repeats every year (length 5)
 *   YYYY-MM-DD — one-off specific year (length 10)
 */
function dateInRange(dateIso, from, to) {
  const annual = from.length === 5;
  if (annual) {
    const mmdd = toMmDd(dateIso);
    // Year-wrap: e.g. "12-24" → "01-06" spans Dec–Jan
    if (from <= to) return mmdd >= from && mmdd <= to;
    return mmdd >= from || mmdd <= to;
  }
  return dateIso >= from && dateIso <= to;
}

/**
 * Return the effective rate for a room on a given check-in date.
 * Iterates rate_periods ordered by priority ASC (lower = higher priority).
 * Returns { rate, periodName } — periodName is null when the base rate applies.
 */
export function getRateForDate(propertyId, roomId, checkInDate) {
  const room = db.prepare(
    'SELECT price_per_night FROM rooms WHERE id = ? AND property_id = ?'
  ).get(roomId, propertyId);
  if (!room) return null;

  const base = room.price_per_night;
  const periods = db.prepare(
    'SELECT * FROM rate_periods WHERE property_id = ? ORDER BY priority ASC, id ASC'
  ).all(propertyId);

  for (const p of periods) {
    if (dateInRange(checkInDate, p.date_from, p.date_to)) {
      const rate = p.rate_type === 'multiplier'
        ? Math.round(base * p.rate_value * 100) / 100
        : p.rate_value;
      return { rate, periodName: p.name };
    }
  }

  return { rate: base, periodName: null };
}

/**
 * Return all rate periods active on a given date for a property.
 * Used by the calendar to show indicators.
 */
export function getActivePeriodsForDate(propertyId, dateIso) {
  const periods = db.prepare(
    'SELECT * FROM rate_periods WHERE property_id = ?'
  ).all(propertyId);
  return periods.filter((p) => dateInRange(dateIso, p.date_from, p.date_to));
}
