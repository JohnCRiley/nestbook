// Pooled availability + atomic room-assignment for Room Categories mode.
//
// node:sqlite's DatabaseSync is synchronous and Node is single-threaded: as
// long as the availability check and the booking INSERT happen in the same
// synchronous call stack with no `await` between them, no other request can
// interleave and race for the same room. That's sufficient for correctness —
// no explicit row-locking needed. See the comment on
// assignRoomForCategoryBooking() below for what this means for callers.

/**
 * Returns the ids of rooms in `categoryId` with no booking overlap for
 * [checkIn, checkOut), excluding maintenance rooms, ordered by room id
 * ascending. Overlap logic matches hasOverlap() in routes/bookings.js:
 * excludes cancelled / checked_out / cancelled_unpaid bookings, overlap test
 * is check_in_date < checkOut AND check_out_date > checkIn.
 *
 * respectBuffer: true holds back the LAST `buffer` rooms (by id) from the
 * returned list — the pool automatic/online booking should never draw from.
 * respectBuffer: false (owner/manual bookings) returns the full list,
 * including buffered rooms.
 *
 * minCapacity: optional — when set, also excludes rooms whose capacity is
 * below it. Defaults to null (no capacity filtering), so every existing
 * caller (Phase 5/6a's manual assignment and booking-creation routes, which
 * don't consider guest count) is unaffected.
 */
export function getAvailableRoomsInCategory(db, categoryId, checkIn, checkOut, { respectBuffer = false, minCapacity = null } = {}) {
  const rows = db.prepare(`
    SELECT id FROM rooms
    WHERE category_id = ?
      AND status != 'maintenance'
      AND (? IS NULL OR capacity >= ?)
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.room_id = rooms.id
          AND b.status NOT IN ('cancelled', 'checked_out', 'cancelled_unpaid')
          AND b.check_in_date < ?
          AND b.check_out_date > ?
      )
    ORDER BY id ASC
  `).all(categoryId, minCapacity, minCapacity, checkOut, checkIn);

  let ids = rows.map((r) => r.id);

  if (respectBuffer) {
    const cat = db.prepare('SELECT buffer FROM room_categories WHERE id = ?').get(categoryId);
    const buffer = cat?.buffer ?? 0;
    if (buffer > 0) {
      ids = buffer >= ids.length ? [] : ids.slice(0, ids.length - buffer);
    }
  }

  return ids;
}

/**
 * Returns the lowest-id available room for the category/date range, or null
 * if none are free.
 *
 * IMPORTANT: the caller must perform the booking INSERT immediately after
 * calling this — synchronously, with no `await` in between (not even a
 * microtask). This function and the INSERT together form one atomic
 * check-then-act step: because node:sqlite is synchronous and Node is
 * single-threaded, nothing else can run between them, so no other request
 * can grab the same room in the gap. Putting anything async (sending an
 * email, calling an external API, etc.) between this call and the INSERT
 * reopens that race — do that work AFTER the booking is created instead.
 */
export function assignRoomForCategoryBooking(db, categoryId, checkIn, checkOut, { respectBuffer = false } = {}) {
  const ids = getAvailableRoomsInCategory(db, categoryId, checkIn, checkOut, { respectBuffer });
  return ids.length > 0 ? ids[0] : null;
}
