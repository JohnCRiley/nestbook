import { addDays } from './format.js';

/**
 * Returns true if a booking is eligible for breakfast on the given targetDate.
 * Pass room=null if only booking.room_breakfast_included is available.
 */
export function isEligibleForBreakfast(booking, room, property, targetDate) {
  if (booking.status === 'cancelled' || booking.status === 'checked_out') return false;
  if (!booking.num_guests) return false;

  const propIncluded = !!property?.breakfast_included;
  const roomIncluded = !!(room ? room.breakfast_included : booking.room_breakfast_included);
  const bfAdded = !!booking.breakfast_added;
  if (!propIncluded && !roomIncluded && !bfAdded) return false;

  // targetDate must fall within the stay (check-in through check-out morning)
  if (targetDate < booking.check_in_date) return false;
  if (targetDate > booking.check_out_date) return false;

  // Check-in day: if guest arrives after breakfast ends, no breakfast on arrival day
  if (targetDate === booking.check_in_date) {
    const ciTime = property?.check_in_time ?? '15:00';
    const bfEnd  = property?.breakfast_end_time ?? '11:00';
    if (ciTime >= bfEnd) return false;
  }

  // Check-out day: if guest leaves before/at breakfast start, no breakfast on departure morning
  if (targetDate === booking.check_out_date) {
    const coTime  = property?.check_out_time ?? '11:00';
    const bfStart = property?.breakfast_start_time ?? '07:00';
    if (coTime <= bfStart) return false;
  }

  // For booking-added breakfast: must be on or after the first opted-in morning
  if (!propIncluded && !roomIncluded && bfAdded) {
    const firstMorning = booking.breakfast_start_date
      ? addDays(booking.breakfast_start_date, 1)
      : addDays(booking.check_in_date, 1);
    if (targetDate < firstMorning) return false;
  }

  return true;
}
