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
// Slice 9 (certification prep): the sync window is 500 days (cert test 1), the
// Full Sync's ARI push is exactly 2 calls (1 batched /availability spanning
// every room type + 1 batched /restrictions spanning every rate plan), and
// EVERY outbound write goes through channexQueue (per-property rate limiter +
// 429/5xx retry-backoff). pushAvailabilityUpdate / pushRateUpdate submit an ARI
// job whose run() RE-COMPUTES from the DB at execution time, so the queue can
// safely dedupe rapid repeats without pushing stale state. Delta-on-change is
// preserved — nothing here runs on a timer.
//
// Slice 8: disconnectChannexProperty() — clears properties.channex_property_id +
// deletes the property's channex_room_mappings rows. NestBook-side only: no
// Channex API call (a property DELETE is irreversible; room types may hold OTA
// booking history). Bookings untouched. See admin.js channex-disconnect route.
//
// Slice 7: pushRoomTypeReconcile() — keeps channex_room_mappings + the
// Channex-side room types / rate plans in sync when an owner adds, renames or
// deletes a room / category / unit AFTER the initial push. Same fire-and-forget,
// never-throws contract as slices 4–6. A created ref gets a fresh Channex room
// type + rate plan + full-window ARI; a renamed ref is PUT in place (Channex supports
// updating a room-type / rate-plan title); a deleted ref is ORPHAN-MARKED
// (channex_room_mappings.orphaned_at) with its Channex availability pushed to 0 —
// never an automatic DELETE, because that call can be irreversible and the room
// type may carry OTA booking history a human must reconcile.
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
  updateRoomType,
  updateRatePlan,
  deleteRoomType,
  deleteRatePlan,
  updateAvailability,
  updateRates,
  channexRequest,
  ChannexError,
} from './channexClient.js';
import { submitChannexJob } from './channexQueue.js';
import { getAvailableRoomsInCategory } from './categoryAvailability.js';
import { getRateForDate } from './ratePeriods.js';

// Channex certification (test 1) requires the Full Sync to cover 500 days.
// This is the ONLY place the window is defined; the delta paths widen with it
// (still 1 change-triggered call each, never a timer — cert-compliant).
const WINDOW_DAYS = 500;
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

/** Cheap "is this property Channex-connected?" check — keeps pushXUpdate() a
 *  silent, zero-cost no-op (and never enqueues) for the ~99% unconnected case. */
function isChannexConnected(propertyId) {
  return !!db.prepare(
    'SELECT 1 FROM channex_room_mappings WHERE property_id = ? LIMIT 1'
  ).get(propertyId);
}

/** Pull the async-task id(s) out of a raw ARI response body — Channex answers
 *  POST /availability and POST /restrictions with
 *  { data: [{ id, type: "task" }, …], meta: { message: "Success" } }. Logging
 *  the id(s) makes an ARI push traceable through to Channex's task processor
 *  (and is what their PMS certification asks us to record per test scenario).
 *  Returns a comma-separated list, or '-' when the body carries none. */
function channexTaskIds(result) {
  const data = Array.isArray(result?.data)
    ? result.data
    : (result?.data ? [result.data] : []);
  const ids = data.map((d) => d?.id).filter(Boolean);
  return ids.length ? ids.join(', ') : '-';
}

/**
 * Fire-and-forget outbound availability sync for one NestBook change.
 *
 * NEVER throws and NEVER returns a rejected promise — callers must not await it
 * in a booking's response path. Silently no-ops when the property isn't
 * Channex-connected.
 *
 * The actual push runs as a channexQueue `availability` job so it is
 * per-property rate-limited and retried on 429/5xx. The job's run() RE-COMPUTES
 * availability from the DB at execution time, so the queue can safely dedupe
 * rapid identical calls (same property/ref/range) without ever pushing stale
 * state — the surviving job picks up every intervening change.
 *
 * @param {number} propertyId          NestBook properties.id
 * @param {'room'|'category'|'whole_property'|'property'} refType
 * @param {number|null} refId          rooms.id / room_categories.id / null
 * @param {string|null} dateFrom       'YYYY-MM-DD' inclusive (booking check-in)
 * @param {string|null} dateTo         'YYYY-MM-DD' inclusive (booking check-out)
 * @returns {Promise<void>}
 */
export async function pushAvailabilityUpdate(propertyId, refType, refId, dateFrom, dateTo) {
  try {
    if (!propertyId || !isChannexConnected(propertyId)) return;
    await submitChannexJob({
      kind: 'ari',
      ariType: 'availability',
      propertyId,
      dedupeKey: `avail:${propertyId}:${refType}:${refId ?? ''}:${dateFrom ?? ''}:${dateTo ?? ''}`,
      label: `availability sync property #${propertyId} ${refType}:${refId ?? ''}`,
      run: () => runAvailabilitySync(propertyId, refType, refId, dateFrom, dateTo),
    });
  } catch (err) {
    console.error(
      `[channex-sync] property #${propertyId} availability push failed (non-fatal): ${err.message}`
    );
  }
}

/** The work behind pushAvailabilityUpdate — runs inside the queue worker.
 *  Recomputes from the DB, then ONE direct POST /availability. Throws on an API
 *  failure so the queue can retry. */
async function runAvailabilitySync(propertyId, refType, refId, dateFrom, dateTo) {
  const mappings = db.prepare(
    'SELECT * FROM channex_room_mappings WHERE property_id = ?'
  ).all(propertyId);
  if (mappings.length === 0) return;

  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
  if (!property || !property.channex_property_id) return;

  // Clamp the affected range to the sync window; Channex also rejects past dates.
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

  const result = await channexRequest('/api/v1/availability', { method: 'POST', body: { values }, raw: true });
  const warnings = result?.meta?.warnings ?? [];
  console.log(
    `[channex-sync] property #${propertyId} ${refType}:${refId ?? ''} ${from}..${to} — ` +
    `${values.length} availability segment(s) across ${affected.length} room type(s)` +
    ` — task_id(s): ${channexTaskIds(result)}` +
    (warnings.length ? ` (${warnings.length} warning(s))` : '')
  );
  return result;
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
 * seasonal rates for EVERY mapped rate plan across the whole sync window and
 * re-pushes them. Channex processes /restrictions Last-Win, so a full re-push
 * inherently reverts any stale segment left by an edited or deleted period — no
 * diffing needed.
 *
 * Runs as a channexQueue `restrictions` job (per-property rate-limited, retried
 * on 429/5xx); the job's run() recomputes from the DB so the queue can safely
 * dedupe rapid identical calls.
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
    if (!propertyId || !isChannexConnected(propertyId)) return;
    await submitChannexJob({
      kind: 'ari',
      ariType: 'restrictions',
      propertyId,
      dedupeKey: `rate:${propertyId}:${refType}:${refId ?? ''}:${dateFrom ?? ''}:${dateTo ?? ''}`,
      label: `rate sync property #${propertyId} ${refType}:${refId ?? ''}`,
      run: () => runRateSync(propertyId, refType, refId, dateFrom, dateTo),
    });
  } catch (err) {
    console.error(
      `[channex-sync] property #${propertyId} rate push failed (non-fatal): ${err.message}`
    );
  }
}

/** The work behind pushRateUpdate — runs inside the queue worker. Recomputes
 *  seasonal rates from the DB, then ONE direct POST /restrictions. Throws on an
 *  API failure so the queue can retry. */
async function runRateSync(propertyId, refType, refId, dateFrom, dateTo) {
  const mappings = db.prepare(
    'SELECT * FROM channex_room_mappings WHERE property_id = ?'
  ).all(propertyId);
  if (mappings.length === 0) return;

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

  const result = await channexRequest('/api/v1/restrictions', { method: 'POST', body: { values }, raw: true });
  const warnings = result?.meta?.warnings ?? [];
  console.log(
    `[channex-sync] property #${propertyId} ${refType}:${refId ?? ''} ${from}..${to} rates — ` +
    `${values.length} segment(s) across ${affected.length} rate plan(s)` +
    ` — task_id(s): ${channexTaskIds(result)}` +
    (skippedSegments ? `, ${skippedSegments} zero-rate segment(s) skipped` : '') +
    (warnings.length ? ` (${warnings.length} warning(s))` : '')
  );
  return result;
}

// ── Channex room-type / rate-plan creation (shared: initial push + slice 7) ──

/** Channex room_type attributes for a buildTargets() target (minus property_id,
 *  which PUT rejects and POST takes separately). */
function roomTypeAttributes(target) {
  return {
    title: target.title,
    count_of_rooms: target.countOfRooms,
    occ_adults: target.occAdults,
    occ_children: 0,
    occ_infants: 0,
    default_occupancy: target.defaultOccupancy,
    room_kind: 'room',
  };
}

/** Channex rate_plan attributes for the initial create of a target's plan. */
function ratePlanCreateAttributes(target, channexPropertyId, roomTypeId, currency) {
  return {
    title: `${target.title} — Standard`.slice(0, 255),
    property_id: channexPropertyId,
    room_type_id: roomTypeId,
    currency,
    sell_mode: 'per_room',
    rate_mode: 'manual',
    options: [{ occupancy: target.defaultOccupancy, is_primary: true, rate: 0 }],
  };
}

/**
 * Create one Channex room type + its rate plan for a target. Shared by
 * pushInitialInventory() and pushRoomTypeReconcile(). Best-effort cleanup of a
 * half-created pair on failure, then rethrow.
 * @returns {Promise<{channexRoomTypeId: string, channexRatePlanId: string}>}
 */
async function createTargetOnChannex(channexPropertyId, currency, target) {
  const roomTypeData = await createRoomType({
    property_id: channexPropertyId,
    ...roomTypeAttributes(target),
  });
  const channexRoomTypeId = roomTypeData?.id ?? roomTypeData?.attributes?.id;
  if (!channexRoomTypeId) {
    throw new ChannexError(`Channex created a room type for "${target.title}" but returned no id`, { details: roomTypeData });
  }

  let channexRatePlanId;
  try {
    const ratePlanData = await createRatePlan(
      ratePlanCreateAttributes(target, channexPropertyId, channexRoomTypeId, currency)
    );
    channexRatePlanId = ratePlanData?.id ?? ratePlanData?.attributes?.id;
    if (!channexRatePlanId) {
      throw new ChannexError(`Channex created a rate plan for "${target.title}" but returned no id`, { details: ratePlanData });
    }
  } catch (err) {
    try { await deleteRoomType(channexRoomTypeId, { force: true }); } catch { /* noop */ }
    throw err;
  }

  return { channexRoomTypeId, channexRatePlanId };
}

// ── ongoing room-type reconciliation (slice 7) ─────────────────────────────

const CHANNEX_TITLE_MAX = 255;

/** Push availability 0 across the whole window for one (now-orphaned) room type
 *  so OTAs stop selling a room NestBook no longer has. Queued as an ARI job. */
async function zeroOutRoomType(propertyId, channexPropertyId, channexRoomTypeId) {
  const dates = windowDates();
  await updateAvailability([{
    property_id: channexPropertyId,
    room_type_id: channexRoomTypeId,
    date_from: dates[0],
    date_to: dates[dates.length - 1],
    availability: 0,
  }], { propertyId });
}

/**
 * Ensure a live Channex room type matches a NestBook target.
 *  - mapping == null  → create room type + rate plan, insert the mapping row,
 *                       push its full-window availability + rates
 *  - mapping present  → PUT the room-type attributes (title / occ / count) and
 *                       the rate-plan title if they drifted, then refresh ARI
 */
async function syncTarget(property, target, mapping) {
  const cxPropId = property.channex_property_id;

  if (!mapping) {
    const currency = (property.currency ?? 'EUR').trim().toUpperCase();
    const { channexRoomTypeId, channexRatePlanId } =
      await createTargetOnChannex(cxPropId, currency, target);

    const insert = db.prepare(`
      INSERT INTO channex_room_mappings
        (property_id, channex_property_id, nestbook_ref_type, nestbook_ref_id,
         channex_room_type_id, channex_rate_plan_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    try {
      db.exec('BEGIN');
      try {
        insert.run(property.id, cxPropId, target.refType, target.refId,
          channexRoomTypeId, channexRatePlanId);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    } catch (err) {
      // The DB row is the source of truth for "already pushed" — if we can't
      // record it, undo the Channex side so it isn't silently duplicated later.
      try { await deleteRatePlan(channexRatePlanId, { force: true }); } catch { /* noop */ }
      try { await deleteRoomType(channexRoomTypeId, { force: true }); } catch { /* noop */ }
      throw err;
    }

    console.log(
      `[channex-sync] property #${property.id} ${target.refType}:${target.refId ?? ''} ` +
      `— created Channex room type ${channexRoomTypeId} ("${target.title}")`
    );
  } else {
    await updateRoomType(mapping.channex_room_type_id, roomTypeAttributes(target));
    const planTitle = `${target.title} — Standard`.slice(0, CHANNEX_TITLE_MAX);
    try {
      await updateRatePlan(mapping.channex_rate_plan_id, { title: planTitle });
    } catch (err) {
      // Rate-plan title is cosmetic (channels map on id) — don't fail the sync.
      console.warn(
        `[channex-sync] property #${property.id} ${target.refType}:${target.refId ?? ''} ` +
        `— rate-plan title update skipped (non-fatal): ${err.message}`
      );
    }
    console.log(
      `[channex-sync] property #${property.id} ${target.refType}:${target.refId ?? ''} ` +
      `— updated Channex room type ${mapping.channex_room_type_id} ("${target.title}")`
    );
  }

  // Fresh ARI for the (new or updated) target — reuses slices 4 + 6, which
  // re-query the mappings table so a just-inserted row is visible.
  await pushAvailabilityUpdate(property.id, target.refType, target.refId, null, null);
  await pushRateUpdate(property.id, target.refType, target.refId, null, null);
}

/**
 * The NestBook side of a mapping is gone. DO NOT delete on Channex (irreversible;
 * may hold OTA booking history). Mark the row orphaned, push availability 0 so
 * OTAs stop selling it, and warn loudly so a human can force-remove on Channex.
 */
async function orphanTarget(property, mapping, reason) {
  if (mapping.orphaned_at) return; // already handled
  db.prepare(
    `UPDATE channex_room_mappings SET orphaned_at = datetime('now') WHERE id = ?`
  ).run(mapping.id);

  try {
    await zeroOutRoomType(property.id, property.channex_property_id, mapping.channex_room_type_id);
  } catch (err) {
    console.error(
      `[channex-sync] property #${property.id} — could not zero availability for ` +
      `orphaned room type ${mapping.channex_room_type_id} (non-fatal): ${err.message}`
    );
  }

  console.warn(
    `[channex-sync] property #${property.id} — ${reason}. Channex room type ` +
    `${mapping.channex_room_type_id} / rate plan ${mapping.channex_rate_plan_id} ` +
    `orphan-marked and its availability set to 0. It was NOT deleted from Channex ` +
    `(a room type with OTA booking history needs a human to force-remove it). ` +
    `Mapping row #${mapping.id}.`
  );
}

/**
 * Fire-and-forget room-type reconciliation for one NestBook room/category/unit
 * change on an already-Channex-connected property.
 *
 * Same contract as pushAvailabilityUpdate() / pushRateUpdate(): NEVER throws /
 * never rejects, silent no-op when the property has no channex_room_mappings
 * rows or no channex_property_id. Callers must NOT await it in a CRUD response
 * path.
 *
 * @param {number} propertyId
 * @param {'room'|'category'|'property'} refType  what changed in NestBook
 * @param {number|null} refId                     rooms.id / room_categories.id
 * @param {'created'|'renamed'|'deleted'} changeType
 * @param {{categoryId?: number|null, parentUnitId?: number|null}} [opts]
 *        for a room in Categories mode / a deleted room, captured by the caller
 *        BEFORE the row is gone.
 * @returns {Promise<void>}
 */
export async function pushRoomTypeReconcile(propertyId, refType, refId, changeType, opts = {}) {
  try {
    if (!propertyId) return;

    const allMappings = db.prepare(
      'SELECT * FROM channex_room_mappings WHERE property_id = ?'
    ).all(propertyId);
    if (allMappings.length === 0) return; // not Channex-connected — nothing to do

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    if (!property || !property.channex_property_id) return;

    const rentalType = property.rental_type ?? 'rooms';
    const irMode = property.ir_room_mode ?? 'named';
    const liveMappings = allMappings.filter((m) => !m.orphaned_at);

    const targets = buildTargets(property);
    const targetByRef = new Map(targets.map((t) => [`${t.refType}:${t.refId ?? ''}`, t]));
    const liveByRef = new Map(liveMappings.map((m) => [`${m.nestbook_ref_type}:${m.nestbook_ref_id ?? ''}`, m]));

    // ── bulk: a room/category import created several refs at once ────────────
    if (refType === 'property') {
      let created = 0;
      let updated = 0;
      for (const t of targets) {
        const m = liveByRef.get(`${t.refType}:${t.refId ?? ''}`);
        await syncTarget(property, t, m ?? null);
        if (m) updated += 1; else created += 1;
      }
      console.log(
        `[channex-sync] property #${propertyId} bulk reconcile — ${created} created, ${updated} refreshed`
      );
      return;
    }

    // WP: room/section changes never move a Channex room type (the single WP
    // room type is property-level; occ = total_capacity).
    if (rentalType === 'whole_property') return;

    const categoriesMode = rentalType === 'rooms' && irMode === 'categories';

    // Resolve which Channex ref this change maps to.
    let ref;
    if (categoriesMode) {
      let categoryId = refType === 'category'
        ? Number(refId)
        : (opts.categoryId != null
            ? Number(opts.categoryId)
            : db.prepare('SELECT category_id FROM rooms WHERE id = ?').get(Number(refId))?.category_id ?? null);
      if (categoryId == null) return; // uncategorised room — not OTA-visible
      ref = `category:${categoryId}`;
    } else {
      // IR-Named / Units: internal unit rooms (parent_unit_id set) are not their
      // own Channex room type.
      if (refType === 'room' && opts.parentUnitId != null) return;
      ref = `${refType}:${refId}`;
    }

    const mapping = liveByRef.get(ref);
    const orphaned = allMappings.find(
      (m) => `${m.nestbook_ref_type}:${m.nestbook_ref_id ?? ''}` === ref && m.orphaned_at
    );
    const target = targetByRef.get(ref);

    if (changeType === 'deleted') {
      // Categories mode: a room delete only orphans the category when it emptied
      // the category (buildTargets drops a 0-room category → no target).
      if (mapping && !target) {
        const reason = refType === 'category'
          ? `room category #${refId} has no bookable rooms left`
          : categoriesMode
            ? `the last room in Channex-mapped category ${ref} was deleted`
            : `room #${refId} was deleted`;
        await orphanTarget(property, mapping, reason);
      } else if (mapping && target) {
        // Category still has rooms — just refresh its ARI + occ/count.
        await syncTarget(property, target, mapping);
      }
      return;
    }

    // created / renamed → ensure the Channex room type exists and matches.
    if (!target) {
      // Nothing bookable yet (e.g. a brand-new empty category, or a maintenance
      // room) — nothing to create.
      return;
    }
    if (mapping) {
      await syncTarget(property, target, mapping);
    } else if (orphaned) {
      // The ref exists again but its old mapping is orphaned. Leave the orphan
      // for a human (its Channex room type may still carry booking history);
      // just note it rather than silently spawning a duplicate room type.
      console.warn(
        `[channex-sync] property #${propertyId} ${ref} — a NestBook ref reappeared but its ` +
        `mapping (row #${orphaned.id}) is orphaned. Not auto-creating a duplicate Channex room ` +
        `type; a human should un-orphan or force-remove on Channex.`
      );
    } else {
      await syncTarget(property, target, null);
    }
  } catch (err) {
    console.error(
      `[channex-sync] property #${propertyId} room-type reconcile failed (non-fatal): ${err.message}`
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
    // 1 + 2: create a room type and a rate plan for each target (shared with
    // slice 7's pushRoomTypeReconcile via createTargetOnChannex).
    for (const t of targets) {
      const { channexRoomTypeId: roomTypeId, channexRatePlanId: ratePlanId } =
        await createTargetOnChannex(channexPropertyId, currency, t);
      created.push({
        refType: t.refType, refId: t.refId, title: t.title,
        channexRoomTypeId: roomTypeId, channexRatePlanId: ratePlanId, countOfRooms: t.countOfRooms,
      });

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

  // Full Sync ARI — cert test 1 requires EXACTLY 2 calls: one batched
  // POST /availability spanning every room type, one batched POST /restrictions
  // spanning every rate plan, each 500 days. Both go through the queue
  // (per-property rate-limited + retried); awaited so the route gets the summary.
  const availabilityResult = await updateAvailability(availabilityValues, { propertyId: property.id });
  const rateResult = rateValues.length
    ? await updateRates(rateValues, { propertyId: property.id })
    : { meta: { warnings: [] } };

  console.log(
    `[channex-sync] property #${property.id} full sync — ` +
    `availability task_id(s): ${channexTaskIds(availabilityResult)}; ` +
    `rates task_id(s): ${channexTaskIds(rateResult)}`
  );

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

// ── disconnect (slice 8) ───────────────────────────────────────────────────

/**
 * Sever a property's Channex link on the NestBook side ONLY.
 *
 * Deliberately makes NO Channex API call. Channex's DELETE /properties/:id is
 * irreversible and its cascade to room types / rate plans is undocumented, and
 * those room types may carry OTA booking history — same standing rule as slices
 * 5 + 7: NestBook never auto-destroys OTA-side data. The Channex property + its
 * room types + rate plans are left intact for the owner to remove from their own
 * Channex account.
 *
 * Clears `properties.channex_property_id` and deletes every
 * `channex_room_mappings` row for the property (including slice-7 orphaned rows)
 * in one transaction. Does NOT touch `bookings` — an OTA-origin booking stays a
 * real NestBook booking and keeps its `channex_reservation_id` as the historical
 * record.
 *
 * After this, pushAvailabilityUpdate / pushRateUpdate / pushRoomTypeReconcile all
 * no-op for the property (no mapping rows), and channexInboundSync can't resolve
 * it (no channex_property_id) so inbound webhooks for the old Channex property
 * hit its existing "unmapped property → skip" path.
 *
 * @param {object} property  a full NestBook `properties` row
 * @returns {{ priorChannexPropertyId: string|null, mappingsDeleted: number,
 *             orphanedMappingsDeleted: number, roomTypeIds: string[],
 *             ratePlanIds: string[], channexSide: 'untouched' }}
 * @throws {Error} only on an unexpected DB failure (transaction is rolled back)
 */
export function disconnectChannexProperty(property) {
  if (!property || typeof property !== 'object' || !property.id) {
    throw new Error('disconnectChannexProperty: a property record is required');
  }
  const propId = property.id;
  const priorChannexPropertyId = property.channex_property_id ?? null;

  const mappings = db.prepare(
    'SELECT channex_room_type_id, channex_rate_plan_id, orphaned_at FROM channex_room_mappings WHERE property_id = ?'
  ).all(propId);

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM channex_room_mappings WHERE property_id = ?').run(propId);
    db.prepare('UPDATE properties SET channex_property_id = NULL WHERE id = ?').run(propId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    priorChannexPropertyId,
    mappingsDeleted: mappings.length,
    orphanedMappingsDeleted: mappings.filter((m) => m.orphaned_at).length,
    roomTypeIds: mappings.map((m) => m.channex_room_type_id),
    ratePlanIds: mappings.map((m) => m.channex_rate_plan_id),
    channexSide: 'untouched',
  };
}
