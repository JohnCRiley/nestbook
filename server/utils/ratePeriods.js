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
 * Return the effective rate for a room on a given date.
 * baseRateOverride: pass property.whole_property_rate for WP mode so multiplier
 * periods and the no-period fallback both use the correct property-level base.
 * Priority order:
 *   1. Room-specific override in rate_period_rooms
 *   2. Period default rate (rate_value > 0)
 *   3. baseRateOverride ?? room.price_per_night
 * Returns { rate, periodName } — periodName is null when the base rate applies.
 */
export function getRateForDate(propertyId, roomId, checkInDate, baseRateOverride = null) {
  const room = db.prepare(
    'SELECT price_per_night FROM rooms WHERE id = ? AND property_id = ?'
  ).get(roomId, propertyId);
  if (!room) return null;

  const base = baseRateOverride ?? room.price_per_night;
  const periods = db.prepare(
    'SELECT * FROM rate_periods WHERE property_id = ? ORDER BY priority ASC, id ASC'
  ).all(propertyId);

  for (const p of periods) {
    if (dateInRange(checkInDate, p.date_from, p.date_to)) {
      // 1. Room-specific flat rate override
      const roomRate = db.prepare(
        'SELECT amount FROM rate_period_rooms WHERE rate_period_id = ? AND room_id = ?'
      ).get(p.id, roomId);
      if (roomRate?.amount > 0) {
        return { rate: roomRate.amount, periodName: p.name };
      }
      // 2. Period default rate (flat or multiplier against the correct base)
      if (p.rate_value > 0) {
        const rate = p.rate_type === 'multiplier'
          ? Math.round(base * p.rate_value * 100) / 100
          : p.rate_value;
        return { rate, periodName: p.name };
      }
      // 3. Period matched but no configured rate — return correct base
      return { rate: base, periodName: null };
    }
  }

  return { rate: base, periodName: null };
}

/**
 * Sum seasonal rates night by night for a date range.
 * Pass baseRateOverride = property.whole_property_rate for WP mode.
 */
export function calcSeasonalTotal(propertyId, roomId, checkIn, checkOut, baseRateOverride = null) {
  let total = 0;
  let current = checkIn;
  while (current < checkOut) {
    const result = getRateForDate(propertyId, roomId, current, baseRateOverride);
    total += result?.rate ?? (baseRateOverride || 0);
    const d = new Date(current + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    current = d.toISOString().slice(0, 10);
  }
  return Math.round(total * 100) / 100;
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
