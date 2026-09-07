// server/utils/channexPushInventory.js
//
// Channex integration — Phase 2, slice 3. First-time push of a connected
// property's inventory (room types + rate plans + a forward window of
// availability and base rates) to Channex.
//
// Super Admin manual trigger ONLY (POST /api/admin/properties/:id/channex-push).
// No customer-facing surface, no billing gating, and NO automatic re-sync on
// room/rate/availability changes — that is a later slice. This function pushes
// once; if a property already has channex_room_mappings rows it refuses (see
// pushInitialInventory's guard) rather than trying to reconcile.
//
// Source-of-truth notes:
//   - Room selection / availability per mode mirrors server/routes/widget.js's
//     `GET /api/widget/day-availability` and server/routes/bookings.js's
//     hasOverlap(): the two data sources are `bookings` (excluding
//     cancelled / checked_out / cancelled_unpaid / declined) and `ical_blocks`
//     (room_id IS NULL = property-wide). Categories mode reuses the shared
//     getAvailableRoomsInCategory() helper directly.
//   - Base rate is NestBook's current flat rate (rooms.price_per_night, or
//     properties.whole_property_rate for WP). Seasonal rate_periods are NOT
//     reflected here — that belongs in the ongoing-sync slice.
//
// Channex API shapes used (verified against docs.channex.io, 2026-09-07):
//   POST /api/v1/room_types   { room_type:  { property_id, title, count_of_rooms,
//                               occ_adults, occ_children, occ_infants, default_occupancy, room_kind } }
//   POST /api/v1/rate_plans   { rate_plan:  { title, property_id, room_type_id,
//                               options:[{ occupancy, is_primary, rate }], currency, sell_mode, rate_mode } }
//   POST /api/v1/availability { values: [{ property_id, room_type_id, date_from, date_to, availability }] }
//   POST /api/v1/restrictions { values: [{ property_id, rate_plan_id, date_from, date_to, rate }] }  // rate > 0

import db from '../db/database.js';
import {
  createRoomType,
  createRatePlan,
  deleteRoomType,
  deleteRatePlan,
  updateAvailability,
  updateRates,
  ChannexError,
} from './channexClient.js';
import { getAvailableRoomsInCategory } from './categoryAvailability.js';

const WINDOW_DAYS = 90;
const EXCLUDED_BOOKING_STATUSES = ['cancelled', 'checked_out', 'cancelled_unpaid', 'declined'];

// ── date helpers ────────────────────────────────────────────────────────────
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" -> a local Date at midnight (avoids the UTC-parse off-by-one). */
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The calendar day after a "YYYY-MM-DD" string, as a "YYYY-MM-DD" string. */
function nextDay(s) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

/** [today, today+1, … today+WINDOW_DAYS-1] as YYYY-MM-DD (local). */
function windowDates(days = WINDOW_DAYS) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(ymd(d));
  }
  return out;
}

/**
 * Collapse a per-date value map into contiguous {date_from, date_to, value}
 * segments so the ARI payload stays small (one row per run, not per day).
 */
function coalesce(dates, valueForDate) {
  const segments = [];
  for (const date of dates) {
    const value = valueForDate(date);
    const last = segments[segments.length - 1];
    if (last && last.value === value) {
      last.date_to = date;
    } else {
      segments.push({ date_from: date, date_to: date, value });
    }
  }
  return segments;
}

function occFromRoom(room) {
  const adults = Math.max(1, Number(room.max_occupancy) || Number(room.capacity) || 1);
  const dflt = Math.min(adults, Math.max(1, Number(room.capacity) || 1));
  return { occAdults: adults, defaultOccupancy: dflt };
}

// ── availability lookups (mirror widget.js / bookings.js) ────────────────────

/** Bookings + property-wide-or-room ical_blocks for one room, fetched once. */
function roomBlockers(propertyId, roomId) {
  const bookings = db.prepare(`
    SELECT check_in_date, check_out_date FROM bookings
    WHERE room_id = ?
      AND status NOT IN (${EXCLUDED_BOOKING_STATUSES.map(() => '?').join(',')})
  `).all(roomId, ...EXCLUDED_BOOKING_STATUSES);
  const blocks = db.prepare(`
    SELECT start_date, end_date FROM ical_blocks
    WHERE property_id = ? AND (room_id IS NULL OR room_id = ?)
  `).all(propertyId, roomId);
  return { bookings, blocks };
}

function nightIsFree({ bookings, blocks }, date) {
  const booked = bookings.some((b) => b.check_in_date <= date && b.check_out_date > date);
  if (booked) return false;
  const blocked = blocks.some((b) => b.start_date <= date && b.end_date > date);
  return !blocked;
}

/** Property-wide blockers for WP mode (any booking on any of the property's rooms). */
function wholePropertyBlockers(propertyId) {
  const bookings = db.prepare(`
    SELECT b.check_in_date, b.check_out_date
    FROM bookings b JOIN rooms r ON r.id = b.room_id
    WHERE r.property_id = ?
      AND b.status NOT IN (${EXCLUDED_BOOKING_STATUSES.map(() => '?').join(',')})
  `).all(propertyId, ...EXCLUDED_BOOKING_STATUSES);
  const blocks = db.prepare(
    `SELECT start_date, end_date FROM ical_blocks WHERE property_id = ?`
  ).all(propertyId);
  return { bookings, blocks };
}

// ── target building (one entry == one Channex room type) ─────────────────────
//
// target: { refType, refId, title, countOfRooms, occAdults, defaultOccupancy,
//           baseRate|null, availabilityForDate(date) -> int 0..countOfRooms }

export function buildTargets(property) {
  const pid = property.id;
  const rentalType = property.rental_type ?? 'rooms';
  const irMode = property.ir_room_mode ?? 'named';

  if (rentalType === 'whole_property') {
    const cap = Math.max(1, Number(property.total_capacity) || 1);
    const rate = Number(property.whole_property_rate);
    const blockers = wholePropertyBlockers(pid);
    return [{
      refType: 'whole_property',
      refId: null,
      title: (property.name || 'Whole property').slice(0, 255),
      countOfRooms: 1,
      occAdults: cap,
      defaultOccupancy: cap,
      baseRate: rate > 0 ? rate : null,
      availabilityForDate: (date) => (nightIsFree(blockers, date) ? 1 : 0),
    }];
  }

  if (rentalType === 'rooms' && irMode === 'categories') {
    const cats = db.prepare(
      `SELECT id, name FROM room_categories WHERE property_id = ? ORDER BY display_order ASC, id ASC`
    ).all(pid);
    const targets = [];
    for (const cat of cats) {
      // Match getAvailableRoomsInCategory()'s world-view: status != 'maintenance'.
      const rooms = db.prepare(
        `SELECT id, capacity, max_occupancy, price_per_night FROM rooms
         WHERE category_id = ? AND status != 'maintenance'`
      ).all(cat.id);
      if (rooms.length === 0) continue;
      const occAdults = Math.max(
        1,
        ...rooms.map((r) => Number(r.max_occupancy) || Number(r.capacity) || 1)
      );
      const positivePrices = rooms.map((r) => Number(r.price_per_night)).filter((n) => n > 0);
      const baseRate = positivePrices.length ? Math.min(...positivePrices) : null;
      targets.push({
        refType: 'category',
        refId: cat.id,
        title: (cat.name || `Category ${cat.id}`).slice(0, 255),
        countOfRooms: rooms.length,
        occAdults,
        defaultOccupancy: occAdults,
        baseRate,
        availabilityForDate: (date) =>
          getAvailableRoomsInCategory(db, cat.id, date, nextDay(date), { respectBuffer: false }).length,
      });
    }
    return targets;
  }

  // IR-Named and Units: one Channex room type per top-level bookable room/unit.
  // parent_unit_id IS NULL excludes a unit's internal display-only sub-rooms.
  const rooms = db.prepare(`
    SELECT id, name, capacity, max_occupancy, price_per_night
    FROM rooms
    WHERE property_id = ?
      AND parent_unit_id IS NULL
      AND is_sample_data = 0
      AND status != 'maintenance'
    ORDER BY id ASC
  `).all(pid);

  return rooms.map((room) => {
    const { occAdults, defaultOccupancy } = occFromRoom(room);
    const rate = Number(room.price_per_night);
    const blockers = roomBlockers(pid, room.id);
    return {
      refType: 'room',
      refId: room.id,
      title: (room.name || `Room ${room.id}`).slice(0, 255),
      countOfRooms: 1,
      occAdults,
      defaultOccupancy,
      baseRate: rate > 0 ? rate : null,
      availabilityForDate: (date) => (nightIsFree(blockers, date) ? 1 : 0),
    };
  });
}

// ── main ────────────────────────────────────────────────────────────────────

/**
 * Push a connected property's room types, rate plans and an initial
 * {WINDOW_DAYS}-day window of availability + base rates to Channex.
 *
 * Caller (the admin route) is responsible for the "already connected" and
 * "already pushed" guards — this function assumes property.channex_property_id
 * is set and no channex_room_mappings rows exist yet, and will create fresh
 * Channex objects unconditionally.
 *
 * @param {object} property  a full NestBook `properties` row
 * @returns {Promise<object>} summary { window, roomTypes:[…], availability:{…}, rates:{…} }
 * @throws {ChannexError|Error}
 */
export async function pushInitialInventory(property) {
  if (!property || typeof property !== 'object') {
    throw new Error('pushInitialInventory: a property record is required');
  }
  const channexPropertyId = property.channex_property_id;
  if (!channexPropertyId) {
    throw new Error(
      `pushInitialInventory: property ${property.id ?? '(no id)'} has no channex_property_id — ` +
      `connect it to Channex first`
    );
  }

  const targets = buildTargets(property);
  if (targets.length === 0) {
    throw new Error(
      `pushInitialInventory: property ${property.id} has no bookable rooms/units/categories to push`
    );
  }

  const currency = (property.currency ?? 'EUR').trim().toUpperCase();
  const dates = windowDates();
  const windowFrom = dates[0];
  const windowTo = dates[dates.length - 1];

  const created = [];       // { refType, refId, title, channexRoomTypeId, channexRatePlanId, countOfRooms }
  const availabilityValues = [];
  const rateValues = [];
  const rateSkipped = [];   // titles whose base rate was <= 0

  try {
    // 1 + 2: create a room type and a rate plan for each target.
    for (const t of targets) {
      const roomTypeData = await createRoomType({
        property_id: channexPropertyId,
        title: t.title,
        count_of_rooms: t.countOfRooms,
        occ_adults: t.occAdults,
        occ_children: 0,
        occ_infants: 0,
        default_occupancy: t.defaultOccupancy,
        room_kind: 'room',
      });
      const roomTypeId = roomTypeData?.id ?? roomTypeData?.attributes?.id;
      if (!roomTypeId) {
        throw new ChannexError(`Channex created a room type for "${t.title}" but returned no id`, { details: roomTypeData });
      }
      created.push({
        refType: t.refType, refId: t.refId, title: t.title,
        channexRoomTypeId: roomTypeId, channexRatePlanId: null, countOfRooms: t.countOfRooms,
      });

      const ratePlanData = await createRatePlan({
        title: `${t.title} — Standard`.slice(0, 255),
        property_id: channexPropertyId,
        room_type_id: roomTypeId,
        currency,
        sell_mode: 'per_room',
        rate_mode: 'manual',
        options: [{ occupancy: t.defaultOccupancy, is_primary: true, rate: 0 }],
      });
      const ratePlanId = ratePlanData?.id ?? ratePlanData?.attributes?.id;
      if (!ratePlanId) {
        throw new ChannexError(`Channex created a rate plan for "${t.title}" but returned no id`, { details: ratePlanData });
      }
      created[created.length - 1].channexRatePlanId = ratePlanId;

      // 3a: availability segments (real NestBook availability for the window).
      for (const seg of coalesce(dates, t.availabilityForDate)) {
        availabilityValues.push({
          property_id: channexPropertyId,
          room_type_id: roomTypeId,
          date_from: seg.date_from,
          date_to: seg.date_to,
          availability: seg.value,
        });
      }

      // 3b: base rate across the whole window (flat — seasons are a later slice).
      if (t.baseRate && t.baseRate > 0) {
        rateValues.push({
          property_id: channexPropertyId,
          rate_plan_id: ratePlanId,
          date_from: windowFrom,
          date_to: windowTo,
          rate: t.baseRate.toFixed(2),
        });
      } else {
        rateSkipped.push(t.title);
      }
    }

    // 4: persist the mappings (only reached if every create above succeeded).
    // node:sqlite's DatabaseSync has no .transaction() helper — use explicit
    // BEGIN/COMMIT/ROLLBACK, the pattern used elsewhere in this codebase.
    const insertMapping = db.prepare(`
      INSERT INTO channex_room_mappings
        (property_id, channex_property_id, nestbook_ref_type, nestbook_ref_id,
         channex_room_type_id, channex_rate_plan_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    db.exec('BEGIN');
    try {
      for (const r of created) {
        insertMapping.run(
          property.id, channexPropertyId, r.refType, r.refId,
          r.channexRoomTypeId, r.channexRatePlanId
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    // Best-effort cleanup so a partial failure doesn't strand orphan room
    // types / rate plans on Channex (which would then be silently duplicated
    // on the operator's next attempt, since the re-push guard counts local
    // mappings). Delete newest-first; swallow cleanup errors and surface the
    // original failure.
    for (const r of [...created].reverse()) {
      try { if (r.channexRatePlanId) await deleteRatePlan(r.channexRatePlanId, { force: true }); } catch { /* noop */ }
      try { if (r.channexRoomTypeId) await deleteRoomType(r.channexRoomTypeId, { force: true }); } catch { /* noop */ }
    }
    try { db.prepare('DELETE FROM channex_room_mappings WHERE property_id = ?').run(property.id); } catch { /* noop */ }
    throw err;
  }

  // Push ARI. Availability + rates are separate endpoints, one call each
  // (well under the 10/min/property limit).
  const availabilityResult = await updateAvailability(availabilityValues);
  const rateResult = rateValues.length ? await updateRates(rateValues) : { meta: { warnings: [] } };

  return {
    window: { from: windowFrom, to: windowTo, days: WINDOW_DAYS },
    roomTypes: created.map(({ refType, refId, title, channexRoomTypeId, channexRatePlanId }) => ({
      refType, refId, title, channexRoomTypeId, channexRatePlanId,
    })),
    availability: {
      segments: availabilityValues.length,
      warnings: availabilityResult?.meta?.warnings ?? [],
    },
    rates: {
      pushed: rateValues.length,
      skippedZeroRate: rateSkipped,
      warnings: rateResult?.meta?.warnings ?? [],
    },
  };
}
