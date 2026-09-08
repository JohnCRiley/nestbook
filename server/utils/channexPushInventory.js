// server/utils/channexPushInventory.js
//
// Channex integration — Phase 2.
//
// Slice 3: pushInitialInventory() — first-time push of a connected property's
// room types + rate plans + a forward window of availability and base rates.
// Super Admin manual trigger ONLY (POST /api/admin/properties/:id/channex-push).
//
// Slice 6: rate resolution is now season-aware. buildTargets() targets carry a
// rateForDate(date) resolver (backed by getRateForDate() — the app's single
// source of truth for a night's price, shared with the booking modal, checkout
// and widget) instead of one flat baseRate, and pushInitialInventory() pushes
// one /restrictions row per contiguous same-rate segment across the window.
// pushRateUpdate() mirrors pushAvailabilityUpdate() for ongoing rate sync: it is
// called fire-and-forget whenever a rate_period / rate_period_rooms override is
// created, edited or deleted, and refreshes every rate plan across the window
// (Channex Last-Win reverts stale segments — no diffing needed).
//
// Slice 4: pushAvailabilityUpdate() — ongoing OUTBOUND availability sync. Called
// fire-and-forget from every place a NestBook booking is created / cancelled /
// declined / date-edited, so a connected property's OTA-visible availability
// stays correct after the initial push. Safe to call for ANY property: it
// no-ops silently when the property has no channex_room_mappings rows (the
// overwhelmingly common case), and it NEVER throws — a Channex API failure is
// logged, never allowed to block or roll back a real booking action.
//
// Slice 4 note: no room-type reconciliation here (add/rename/delete a NestBook
// room after the initial push) — that is still later work.
//
// Source-of-truth notes:
//   - Room selection / availability per mode mirrors server/routes/widget.js's
//     `GET /api/widget/day-availability` and server/routes/bookings.js's
//     hasOverlap(): the two data sources are `bookings` (excluding
//     cancelled / checked_out / cancelled_unpaid / declined) and `ical_blocks`
//     (room_id IS NULL = property-wide). Categories mode reuses the shared
//     getAvailableRoomsInCategory() helper directly.
//   - Nightly rate resolution goes through getRateForDate()
//     (server/utils/ratePeriods.js) exactly as the booking modal / checkout /
//     widget do: room-specific rate_period_rooms override → matching rate_period
//     (flat or multiplier) → base (rooms.price_per_night, or
//     properties.whole_property_rate for WP). Per-night values are coalesced into
//     contiguous same-rate segments, same as availability.
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
import { getRateForDate } from './ratePeriods.js';

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

// ── nightly rate resolution (season-aware; getRateForDate is the app's single
//    source of truth — booking modal / checkout / widget all resolve a night's
//    price through it) ───────────────────────────────────────────────────────

/** getRateForDate(...).rate as a positive number, or null when unset / <= 0. */
function positiveRate(propertyId, roomId, date, baseOverride = null) {
  const r = getRateForDate(propertyId, roomId, date, baseOverride);
  const v = Number(r?.rate);
  return v > 0 ? v : null;
}

/**
 * Coalesce a per-night rate resolver into contiguous {date_from, date_to, rate}
 * segments (rate = a "0.00" decimal string). A night whose rate is null (unset
 * or <= 0) becomes a segment with rate === null — the caller skips + warns for
 * it, exactly as slice 3 does for a fully-zero property rate, but per-segment.
 */
function rateSegments(dates, rateForDate) {
  return coalesce(dates, (date) => {
    const v = rateForDate(date);
    return v == null ? null : v.toFixed(2);
  }).map((seg) => ({ date_from: seg.date_from, date_to: seg.date_to, rate: seg.value }));
}

// ── target building (one entry == one Channex room type) ─────────────────────
//
// target: { refType, refId, title, countOfRooms, occAdults, defaultOccupancy,
//           rateForDate(date) -> number>0 | null,
//           availabilityForDate(date) -> int 0..countOfRooms }

export function buildTargets(property) {
  const pid = property.id;
  const rentalType = property.rental_type ?? 'rooms';
  const irMode = property.ir_room_mode ?? 'named';

  if (rentalType === 'whole_property') {
    const cap = Math.max(1, Number(property.total_capacity) || 1);
    const wpBase = Number(property.whole_property_rate) > 0 ? Number(property.whole_property_rate) : null;
    // WP seasonal rates resolve against the property's first room + the
    // whole_property_rate base override — the same pattern widget.js's
    // GET /api/widget/rate-range and bookings.js use.
    const firstRoom = db.prepare(
      'SELECT id FROM rooms WHERE property_id = ? ORDER BY id ASC LIMIT 1'
    ).get(pid);
    const blockers = wholePropertyBlockers(pid);
    return [{
      refType: 'whole_property',
      refId: null,
      title: (property.name || 'Whole property').slice(0, 255),
      countOfRooms: 1,
      occAdults: cap,
      defaultOccupancy: cap,
      rateForDate: (date) =>
        (firstRoom ? positiveRate(pid, firstRoom.id, date, wpBase) : null) ?? wpBase,
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
      const catRoomIds = rooms.map((r) => r.id);
      targets.push({
        refType: 'category',
        refId: cat.id,
        title: (cat.name || `Category ${cat.id}`).slice(0, 255),
        countOfRooms: rooms.length,
        occAdults,
        defaultOccupancy: occAdults,
        // Keep the flat-rate rule ("lowest positive room price"), now resolved
        // per night and season-aware via getRateForDate() per room.
        rateForDate: (date) => {
          const vals = catRoomIds
            .map((rid) => positiveRate(pid, rid, date))
            .filter((n) => n != null);
          return vals.length ? Math.min(...vals) : null;
        },
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
    const blockers = roomBlockers(pid, room.id);
    return {
      refType: 'room',
      refId: room.id,
      title: (room.name || `Room ${room.id}`).slice(0, 255),
      countOfRooms: 1,
      occAdults,
      defaultOccupancy,
      rateForDate: (date) => positiveRate(pid, room.id, date),
      availabilityForDate: (date) => (nightIsFree(blockers, date) ? 1 : 0),
    };
  });
}

// ── ongoing outbound availability sync (slice 4) ────────────────────────────

/**
 * Which channex_room_mappings rows does a change to (refType, refId) touch?
 * Reuses the same mode branching as buildTargets():
 *   - whole_property mode: the single whole_property mapping (any room change
 *     moves the one bookable unit)
 *   - IR-Categories: the mapping for the affected category — resolved from the
 *     room's category_id when a room id is given
 *   - IR-Named / Units: the mapping whose nestbook_ref_id is that room
 *   - refType 'property': every mapping (used for bulk imports)
 */
function affectedMappings(property, mappings, refType, refId) {
  if (refType === 'property') return mappings;

  const rentalType = property.rental_type ?? 'rooms';
  const irMode = property.ir_room_mode ?? 'named';

  if (rentalType === 'whole_property') {
    return mappings.filter((m) => m.nestbook_ref_type === 'whole_property');
  }

  if (rentalType === 'rooms' && irMode === 'categories') {
    let categoryId = null;
    if (refType === 'category') {
      categoryId = Number(refId);
    } else if (refType === 'room' && refId != null) {
      categoryId = db.prepare('SELECT category_id FROM rooms WHERE id = ?').get(Number(refId))?.category_id ?? null;
    }
    if (categoryId == null) return [];
    return mappings.filter(
      (m) => m.nestbook_ref_type === 'category' && Number(m.nestbook_ref_id) === Number(categoryId)
    );
  }

  // IR-Named / Units
  if (refType === 'room' && refId != null) {
    return mappings.filter(
      (m) => m.nestbook_ref_type === 'room' && Number(m.nestbook_ref_id) === Number(refId)
    );
  }
  return [];
}

/**
 * Fire-and-forget outbound availability sync for one NestBook change.
 *
 * NEVER throws and NEVER returns a rejected promise — callers must not await it
 * in a booking's response path. Silently no-ops when the property isn't
 * Channex-connected (no channex_room_mappings rows).
 *
 * @param {number} propertyId          NestBook properties.id
 * @param {'room'|'category'|'whole_property'|'property'} refType
 *        what changed — 'room' with the booking's room_id is the usual call;
 *        'property' refreshes every mapping (bulk import)
 * @param {number|null} refId          rooms.id / room_categories.id / null
 * @param {string|null} dateFrom       'YYYY-MM-DD' inclusive (booking check-in)
 * @param {string|null} dateTo         'YYYY-MM-DD' inclusive (booking check-out;
 *                                     the extra night is harmless — availability
 *                                     is recomputed from source either way)
 * @returns {Promise<void>}
 */
export async function pushAvailabilityUpdate(propertyId, refType, refId, dateFrom, dateTo) {
  try {
    if (!propertyId) return;

    const mappings = db.prepare(
      'SELECT * FROM channex_room_mappings WHERE property_id = ?'
    ).all(propertyId);
    if (mappings.length === 0) return; // not Channex-connected — nothing to do

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    if (!property || !property.channex_property_id) return;

    // Clamp the affected range to the window the initial push covered
    // ([today, today+WINDOW_DAYS-1]); Channex also rejects past dates.
    const win = windowDates();
    const winFrom = win[0];
    const winTo = win[win.length - 1];
    let from = winFrom;
    let to = winTo;
    if (refType !== 'property' && dateFrom && dateTo) {
      from = dateFrom > winFrom ? dateFrom : winFrom;
      to = dateTo < winTo ? dateTo : winTo;
    }
    if (from > to) return;
    const nights = win.filter((d) => d >= from && d <= to);
    if (nights.length === 0) return;

    const affected = affectedMappings(property, mappings, refType, refId);
    if (affected.length === 0) return;

    // Reuse buildTargets() for the per-mode availability computation.
    const byRef = new Map(
      buildTargets(property).map((t) => [`${t.refType}:${t.refId ?? ''}`, t])
    );

    const values = [];
    for (const m of affected) {
      const t = byRef.get(`${m.nestbook_ref_type}:${m.nestbook_ref_id ?? ''}`);
      if (!t) continue; // mapping exists but its room/category is gone — skip
      for (const seg of coalesce(nights, t.availabilityForDate)) {
        values.push({
          property_id: property.channex_property_id,
          room_type_id: m.channex_room_type_id,
          date_from: seg.date_from,
          date_to: seg.date_to,
          availability: seg.value,
        });
      }
    }
    if (values.length === 0) return;

    const result = await updateAvailability(values);
    const warnings = result?.meta?.warnings ?? [];
    console.log(
      `[channex-sync] property #${propertyId} ${refType}:${refId ?? ''} ${from}..${to} — ` +
      `${values.length} segment(s) across ${affected.length} room type(s)` +
      (warnings.length ? ` (${warnings.length} warning(s))` : '')
    );
  } catch (err) {
    console.error(
      `[channex-sync] property #${propertyId} availability push failed (non-fatal): ${err.message}`
    );
  }
}

// ── ongoing outbound rate sync (slice 6) ───────────────────────────────────

/**
 * Fire-and-forget outbound RATE sync for one NestBook seasonal-pricing change.
 *
 * The rate-sync twin of pushAvailabilityUpdate(): same contract — NEVER throws
 * and NEVER returns a rejected promise (callers must not await it in a
 * rate_period save/delete's response path), silently no-ops when the property
 * has no channex_room_mappings rows / no channex_property_id.
 *
 * rate_periods are property-scoped, so the normal call is
 * pushRateUpdate(propertyId, 'property', null, null, null) — it recomputes real
 * seasonal rates for EVERY mapped rate plan across the whole initial-push window
 * and re-pushes them. Channex processes /restrictions Last-Win, so a full
 * re-push inherently reverts any stale segment left by an edited or deleted
 * period — no diffing needed. The (refType, refId, dateFrom, dateTo) params
 * mirror pushAvailabilityUpdate() for a future narrower call.
 *
 * @param {number} propertyId
 * @param {'room'|'category'|'whole_property'|'property'} refType
 * @param {number|null} refId
 * @param {string|null} dateFrom  'YYYY-MM-DD' inclusive (ignored for 'property')
 * @param {string|null} dateTo    'YYYY-MM-DD' inclusive (ignored for 'property')
 * @returns {Promise<void>}
 */
export async function pushRateUpdate(propertyId, refType, refId, dateFrom, dateTo) {
  try {
    if (!propertyId) return;

    const mappings = db.prepare(
      'SELECT * FROM channex_room_mappings WHERE property_id = ?'
    ).all(propertyId);
    if (mappings.length === 0) return; // not Channex-connected — nothing to do

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    if (!property || !property.channex_property_id) return;

    const win = windowDates();
    const winFrom = win[0];
    const winTo = win[win.length - 1];
    let from = winFrom;
    let to = winTo;
    if (refType !== 'property' && dateFrom && dateTo) {
      from = dateFrom > winFrom ? dateFrom : winFrom;
      to = dateTo < winTo ? dateTo : winTo;
    }
    if (from > to) return;
    const nights = win.filter((d) => d >= from && d <= to);
    if (nights.length === 0) return;

    const affected = affectedMappings(property, mappings, refType, refId);
    if (affected.length === 0) return;

    // Reuse buildTargets() so rate resolution stays identical to the initial
    // push / the booking modal / checkout / widget.
    const byRef = new Map(
      buildTargets(property).map((t) => [`${t.refType}:${t.refId ?? ''}`, t])
    );

    const values = [];
    let skippedSegments = 0;
    for (const m of affected) {
      const t = byRef.get(`${m.nestbook_ref_type}:${m.nestbook_ref_id ?? ''}`);
      if (!t || !m.channex_rate_plan_id) continue; // room/category gone, or no plan
      for (const seg of rateSegments(nights, t.rateForDate)) {
        if (seg.rate == null) { skippedSegments += 1; continue; }
        values.push({
          property_id: property.channex_property_id,
          rate_plan_id: m.channex_rate_plan_id,
          date_from: seg.date_from,
          date_to: seg.date_to,
          rate: seg.rate,
        });
      }
    }
    if (values.length === 0) {
      if (skippedSegments) {
        console.warn(
          `[channex-sync] property #${propertyId} rate push — every night unset/zero ` +
          `across ${affected.length} rate plan(s); nothing sent`
        );
      }
      return;
    }

    const result = await updateRates(values);
    const warnings = result?.meta?.warnings ?? [];
    console.log(
      `[channex-sync] property #${propertyId} ${refType}:${refId ?? ''} ${from}..${to} rates — ` +
      `${values.length} segment(s) across ${affected.length} rate plan(s)` +
      (skippedSegments ? `, ${skippedSegments} zero-rate segment(s) skipped` : '') +
      (warnings.length ? ` (${warnings.length} warning(s))` : '')
    );
  } catch (err) {
    console.error(
      `[channex-sync] property #${propertyId} rate push failed (non-fatal): ${err.message}`
    );
  }
}

// ── main ────────────────────────────────────────────────────────────────────

/**
 * Push a connected property's room types, rate plans and an initial
 * {WINDOW_DAYS}-day window of availability + real (seasonal) rates to Channex.
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

      // 3b: real nightly rates across the window — seasonal rate_periods
      // resolved via getRateForDate() and coalesced into contiguous same-rate
      // segments. A segment whose rate is unset / <= 0 is skipped + reported
      // (Channex requires rate > 0), per-segment rather than per-property.
      for (const seg of rateSegments(dates, t.rateForDate)) {
        if (seg.rate == null) {
          rateSkipped.push(`${t.title} (${seg.date_from}..${seg.date_to})`);
          continue;
        }
        rateValues.push({
          property_id: channexPropertyId,
          rate_plan_id: ratePlanId,
          date_from: seg.date_from,
          date_to: seg.date_to,
          rate: seg.rate,
        });
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
