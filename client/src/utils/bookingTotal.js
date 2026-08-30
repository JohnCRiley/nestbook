import { nightsBetween } from './format.js';
import { countBreakfastMornings } from './breakfast.js';

function parseBreakdown(raw) {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) && p.length > 0 ? p : null;
  } catch {
    return null;
  }
}

/**
 * The single source of truth for a booking's money.
 *
 * Every "total due" / "amount owed" / "booking price" surface must call this —
 * nothing should read `b.total_price` directly (it means different things
 * depending on how the booking was created: owner-made bookings bake paid
 * breakfast in, widget/import ones don't).
 *
 * Mirrors `EstimatedTotal`'s logic exactly. The room subtotal is derived from
 * the recorded rate breakdown, never from `total_price` — so breakfast can be
 * added on top without ever double-counting.
 *
 * opts.charges       — unvoided room_charges rows (for itemised views that fetch
 *                      them). Omitted → falls back to `b.charges_total` (a column
 *                      on ENRICHED_SELECT). Charges are always additive.
 * opts.roomBreakdown — { total, breakdown } from a live /rate-range fetch.
 *                      Preferred over the stored breakdown when present, matching
 *                      EstimatedTotal / CheckoutModal.
 *
 * Returns:
 *   grossTotal        room + breakfast + charges (the booking's full value)
 *   total             grossTotal − deposit-already-paid − refund, clamped ≥ 0
 *                     (what's still owed — use this for "Total Due")
 *   roomSubtotal, breakfastSubtotal, chargesSubtotal, depositDeduction, refund
 *   breakfastFree     property/room-included breakfast (show "complimentary")
 *   breakfastCharged  paid breakfast on this booking
 *   breakfastGuests, breakfastDays, breakfastPricePerPerson   (for the "g × d × price" line)
 *   isStoredTotal     true when the booking can't be recomputed (rare import
 *                     case) and `total_price` is being trusted verbatim
 */
export function computeBookingTotal(b, property, { charges = null, roomBreakdown = null } = {}) {
  const isWP     = property?.rental_type === 'whole_property';
  const nights   = nightsBetween(b.check_in_date, b.check_out_date);
  const stored   = parseFloat(b.total_price) || 0;
  const storedBd = parseBreakdown(b.rate_breakdown);

  // EstimatedTotal's exact guard: a total, but nothing to recompute the room
  // subtotal from. Trust the stored number as the room+breakfast figure.
  const isStoredTotal = !!(b.total_price && b.total_price > 0) && !storedBd && !(b.price_per_night > 0);

  const chargesSubtotal = Array.isArray(charges)
    ? charges.filter((c) => !c.voided_at).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
    : (parseFloat(b.charges_total) || 0);

  const breakfastFree    = !!(property?.breakfast_included || b.room_breakfast_included);
  const breakfastCharged = !isStoredTotal && !!b.breakfast_added && !breakfastFree;
  const bfPrice = b.breakfast_price_per_person != null
    ? parseFloat(b.breakfast_price_per_person) || 0
    : parseFloat(property?.breakfast_price) || 0;
  const bfDays   = breakfastCharged
    ? countBreakfastMornings(b.breakfast_start_date, b.check_in_date, b.check_out_date)
    : 0;
  const bfGuests = b.breakfast_start_date ? (b.breakfast_guests || 1) : (b.num_guests || 1);
  const breakfastSubtotal = breakfastCharged ? bfGuests * bfDays * bfPrice : 0;

  const depositAmount    = parseFloat(property?.deposit_amount) || 0;
  const depositDeduction = b.deposit_paid ? depositAmount : 0;
  const refund           = parseFloat(b.refund_amount) || 0;

  let roomSubtotal;
  if (isStoredTotal) {
    // stored number is the room+breakfast price as recorded
    roomSubtotal = stored;
  } else if (isWP) {
    roomSubtotal = stored;
  } else {
    const fallbackPerNight = parseFloat(b.price_per_night) || 0;
    roomSubtotal = roomBreakdown?.total
      ?? (storedBd ? storedBd.reduce((s, seg) => s + (seg.subtotal || 0), 0) : null)
      ?? (nights * fallbackPerNight);
  }

  const grossTotal = roomSubtotal + breakfastSubtotal + chargesSubtotal;
  const total      = Math.max(0, grossTotal - depositDeduction - refund);

  return {
    grossTotal,
    total,
    roomSubtotal,
    breakfastSubtotal,
    chargesSubtotal,
    depositDeduction,
    refund,
    breakfastFree,
    breakfastCharged,
    breakfastGuests: bfGuests,
    breakfastDays: bfDays,
    breakfastPricePerPerson: bfPrice,
    isStoredTotal,
  };
}
