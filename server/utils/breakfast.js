/**
 * How many breakfast mornings a stay actually covers.
 *
 * `breakfastStartDate` is stored as the night BEFORE the first breakfast
 * morning (or null → treat as the check-in night). All args are YYYY-MM-DD.
 *
 * Returns 0 — NOT floored to 1 — when the start no longer falls within the
 * stay (e.g. a date edit shrank check-out past it).
 *
 * Kept byte-for-byte in sync with client/src/utils/breakfast.js
 * countBreakfastMornings — the only difference is that this copy does the
 * night arithmetic inline (server has no shared date util) while the client
 * borrows nightsBetween from ./format.js. Both produce the same integer for
 * date-only strings.
 */
export function countBreakfastMornings(breakfastStartDate, checkInDate, checkOutDate) {
  const start = breakfastStartDate || checkInDate;
  const effectiveStart = start < checkInDate ? checkInDate : start;
  if (effectiveStart >= checkOutDate) return 0;
  return Math.round(
    (new Date(checkOutDate + 'T00:00:00Z') - new Date(effectiveStart + 'T00:00:00Z')) / 86_400_000,
  );
}
