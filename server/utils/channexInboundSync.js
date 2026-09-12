// server/utils/channexInboundSync.js
//
// Channex integration — Phase 2, slice 5 (INBOUND).
//
// Turns a Channex reservation (pulled fresh from the API — never the webhook
// body, which is only a pointer) into real NestBook booking rows, and keeps
// them in step on later modify / cancel webhooks.
//
// Flow, per webhook:
//   routes/channex.js  →  getBookingRevision(revision_id)  →  syncReservationFromRevision(revision)
//
// Design decisions:
//   - status is always 'confirmed'. OTA payment is handled by the OTA, never by
//     NestBook — an inbound booking never touches a deposit / balance / Stripe
//     flow.
//   - source = normaliseSource(revision.ota_name) — the SAME mapping the CSV
//     Booking Import Wizard uses (utils/normaliseSource.js), so the value is
//     always CHECK-constraint-safe ('booking_com' | 'airbnb' | 'other' | …).
//   - guest is deduped by (lower(email), property_id, deleted = 0) exactly like
//     the Import Wizard.
//   - the Channex reservation UUID (booking_id — stable across revisions) is
//     stored on every booking it creates as `channex_reservation_id`, so a
//     later revision finds and updates the right row(s) instead of duplicating.
//   - a reservation can span multiple room types (rooms is an array). Each
//     non-cancelled room becomes one booking, sharing guest + reservation id.
//   - IR-Categories: the mapped ref is a category, so a concrete physical room
//     is assigned via assignRoomForCategoryBooking() (never left NULL).
//   - LOOP PREVENTION: after writing, we call scheduleAvailabilityPush()
//     (channexDebounce.js, wrapping slice 4's pushAvailabilityUpdate()) so
//     Channex lowers the room's availability and OTHER OTAs stop selling it —
//     but we NEVER push the reservation itself back to Channex.
//     There is no reservation-create call anywhere in this file.
//   - Slice 9 (certification prep): once a revision is SUCCESSFULLY processed
//     (DB committed) we POST /booking_revisions/:id/ack — required for
//     certification (cert test 11). Fired only after the commit, so a failed
//     sync never falsely acks. The ack goes out DIRECTLY (its own retry in
//     channexClient), NOT through channexQueue — it must never be stalled
//     behind a slow/retrying ARI push on that single worker. It is also
//     submitted before the (fire-and-forget) availability push-back. If it
//     still somehow fails, Channex's non_acked_booking reminder ~30 min later
//     re-drives this same path (routes/channex.js).

import db from '../db/database.js';
import { getBookingRevision, acknowledgeBookingRevision } from './channexClient.js';
import { assignRoomForCategoryBooking } from './categoryAvailability.js';
import { scheduleAvailabilityPush } from './channexDebounce.js';
import { normaliseSource, splitName } from './normaliseSource.js';

// Bookings in these states do not block a room (mirrors bookings.js hasOverlap
// and channexPushInventory.js EXCLUDED_BOOKING_STATUSES).
const INACTIVE_STATUSES = ['cancelled', 'checked_out', 'cancelled_unpaid', 'declined'];

/** Re-export the pull helper so the route can `import { fetchRevision }`.
 *  revision_id is ALWAYS present in a Channex booking-webhook payload
 *  (research §12); we deliberately do NOT fall back to GET /api/v1/bookings/:id
 *  — the cert guide (test 11) says to use booking_revisions, not bookings. */
export async function fetchRevision({ revisionId }) {
  if (!revisionId) throw new Error('fetchRevision: revision_id missing from the webhook payload');
  return getBookingRevision(revisionId);
}

/** Acknowledge a successfully-processed revision to Channex (cert test 11).
 *  Queued (retried) + fire-and-forget — an ack failure must not fail the
 *  webhook (the DB write already succeeded; Channex just re-reminds). */
function ackRevision(revision) {
  const rid = revision?.id;
  if (!rid) return;
  acknowledgeBookingRevision(rid)
    .then(() => console.log(`[channex-inbound] acknowledged revision ${rid}`))
    .catch((e) => console.error(`[channex-inbound] ack failed for revision ${rid} (non-fatal): ${e.message}`));
}

// ── helpers ─────────────────────────────────────────────────────────────────

function firstRoomOfProperty(propertyId) {
  return db.prepare('SELECT id FROM rooms WHERE property_id = ? ORDER BY id LIMIT 1').get(propertyId)?.id ?? null;
}

/** Does an ACTIVE booking (other than excludeId) overlap [checkIn, checkOut) on this room? */
function overlappingBookingId(roomId, checkIn, checkOut, excludeId = null) {
  const row = db.prepare(`
    SELECT id FROM bookings
    WHERE room_id = ?
      AND status NOT IN (${INACTIVE_STATUSES.map(() => '?').join(',')})
      AND check_in_date < ? AND check_out_date > ?
      ${excludeId ? 'AND id != ?' : ''}
    LIMIT 1
  `).get(...[roomId, ...INACTIVE_STATUSES, checkOut, checkIn, ...(excludeId ? [excludeId] : [])]);
  return row?.id ?? null;
}

/** guests dedup — identical rule to the Booking Import Wizard. Returns guest id. */
function resolveGuest(propertyId, { email, name, surname, phone }) {
  const cleanEmail = (email ?? '').trim().toLowerCase() || null;
  const cleanPhone = (phone ?? '').trim().replace(/[^\d+\s\-()]/g, '') || null;

  if (cleanEmail) {
    const existing = db.prepare(
      'SELECT id FROM guests WHERE email = ? AND property_id = ? AND deleted = 0 LIMIT 1'
    ).get(cleanEmail, propertyId);
    if (existing) return existing.id;
  }

  // name/surname come as separate fields from Channex; fall back to splitName
  // if only a combined string is present.
  let first = (name ?? '').trim();
  let last  = (surname ?? '').trim();
  if (!last && first.includes(' ')) ({ first, last } = splitName(first));
  if (!first) first = 'Guest';
  if (!last)  last = '.';

  return db.prepare(
    'INSERT INTO guests (first_name, last_name, email, phone, property_id) VALUES (?,?,?,?,?)'
  ).run(first, last, cleanEmail, cleanPhone, propertyId).lastInsertRowid;
}

/**
 * Resolve one Channex reservation room → a concrete NestBook room_id, plus the
 * mapping row it came through (needed for the availability push-back).
 * Returns null when the room type isn't mapped for this property.
 *
 * MUST be called synchronously immediately before the booking INSERT for the
 * category branch — assignRoomForCategoryBooking + INSERT form one race-free
 * check-then-act step (see categoryAvailability.js).
 */
function resolveRoom(property, mapping, checkIn, checkOut) {
  if (mapping.nestbook_ref_type === 'room') {
    return { roomId: mapping.nestbook_ref_id, mapping };
  }
  if (mapping.nestbook_ref_type === 'whole_property') {
    return { roomId: firstRoomOfProperty(property.id), mapping };
  }
  if (mapping.nestbook_ref_type === 'category') {
    const categoryId = mapping.nestbook_ref_id;
    let roomId = assignRoomForCategoryBooking(db, categoryId, checkIn, checkOut, { respectBuffer: false });
    if (!roomId) {
      // OTA sold a room the category no longer has free — we're oversold. Honour
      // the OTA booking anyway (it's real, the guest paid the OTA); pin it to the
      // lowest-id room in the category and flag loudly for a human.
      roomId = db.prepare('SELECT id FROM rooms WHERE category_id = ? ORDER BY id LIMIT 1').get(categoryId)?.id ?? null;
      console.warn(`[channex-inbound] category #${categoryId} oversold for ${checkIn}..${checkOut} — pinned to room #${roomId}, needs manual review`);
    }
    return { roomId, mapping };
  }
  return null;
}

function guestsCount(occupancy) {
  const o = occupancy ?? {};
  const n = (Number(o.adults) || 0) + (Number(o.children) || 0);
  return n > 0 ? n : 1;
}

// ── main ────────────────────────────────────────────────────────────────────

/**
 * @param {object} revision  a Channex booking-revision `attributes` object
 *                            (from getBookingRevision)
 * @returns {Promise<object>} summary { action, reservationId, propertyId,
 *                            bookingIds:[], cancelledIds:[], skipped?, warnings:[] }
 */
export async function syncReservationFromRevision(revision) {
  const warnings = [];
  if (!revision || typeof revision !== 'object') {
    return { action: 'skipped', skipped: 'no_revision', warnings };
  }

  const channexPropertyId = revision.property_id;
  const reservationId     = revision.booking_id || revision.id;
  const rawStatus         = String(revision.status ?? 'new').toLowerCase();
  const status = ['cancelled', 'canceled'].includes(rawStatus) ? 'cancelled'
               : rawStatus === 'modified' ? 'modified'
               : 'new';

  const property = db.prepare('SELECT * FROM properties WHERE channex_property_id = ?').get(channexPropertyId);
  if (!property) {
    console.warn(`[channex-inbound] reservation ${reservationId}: Channex property ${channexPropertyId} is not connected to any NestBook property — ignored`);
    ackRevision(revision); // we received it and made a terminal decision — stop the reminders
    return { action: 'skipped', skipped: 'unmapped_property', reservationId, warnings };
  }

  const existing = db.prepare(
    'SELECT * FROM bookings WHERE channex_reservation_id = ?'
  ).all(reservationId);

  // ── CANCELLATION ──────────────────────────────────────────────────────────
  if (status === 'cancelled') {
    const cancelledIds = [];
    const toPush = [];
    if (existing.length) {
      db.exec('BEGIN');
      try {
        const upd = db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status != 'cancelled'`);
        for (const b of existing) {
          if (b.status !== 'cancelled') {
            upd.run(b.id);
            cancelledIds.push(b.id);
            toPush.push({ roomId: b.room_id, from: b.check_in_date, to: b.check_out_date });
          }
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    } else {
      warnings.push('cancellation for a reservation with no NestBook booking — nothing to cancel');
    }
    ackRevision(revision);
    pushForRooms(property.id, toPush).catch(() => {}); // fire-and-forget — drains via channexQueue
    console.log(`[channex-inbound] reservation ${reservationId} CANCELLED — ${cancelledIds.length} booking(s) freed`);
    return { action: 'cancelled', reservationId, propertyId: property.id, cancelledIds, warnings };
  }

  // ── NEW / MODIFIED ────────────────────────────────────────────────────────
  const source = normaliseSource(revision.ota_name);
  const guest = {
    email:   revision.customer?.mail,
    name:    revision.customer?.name,
    surname: revision.customer?.surname,
    phone:   revision.customer?.phone,
  };
  const noteBase = `OTA booking via Channel Sync — ${revision.ota_name ?? 'OTA'}` +
    (revision.ota_reservation_code ? ` (ref ${revision.ota_reservation_code})` : '');

  const activeRooms = (revision.rooms ?? []).filter(r => !r.is_cancelled);
  if (activeRooms.length === 0) {
    // every room cancelled but the revision isn't flagged 'cancelled' — treat as cancel
    warnings.push('revision has no active rooms — treating as cancellation');
    return syncReservationFromRevision({ ...revision, status: 'cancelled' });
  }

  const createdIds = [];
  const cancelledIds = [];
  const toPush = [];

  db.exec('BEGIN');
  try {
    const guestId = resolveGuest(property.id, guest);
    const existingActive = existing.filter(b => b.status !== 'cancelled');

    // Existing single active booking + still a single-room revision → update in
    // place. Covers the common date/occupancy change AND an at-least-once
    // redelivery of the original 'new' event (Channex delivery is unordered and
    // may repeat — research §12); either way this is idempotent and never
    // churns booking rows.
    const canUpdateInPlace = existingActive.length === 1 && activeRooms.length === 1;

    if (canUpdateInPlace) {
      const b = existingActive[0];
      const room = activeRooms[0];
      const mapping = db.prepare(
        'SELECT * FROM channex_room_mappings WHERE property_id = ? AND channex_room_type_id = ?'
      ).get(property.id, room.room_type_id);
      const checkIn  = room.checkin_date  || revision.arrival_date;
      const checkOut = room.checkout_date || revision.departure_date;

      // keep the already-assigned room if it still fits (category or not);
      // only re-resolve if the room type mapping changed or the room now clashes
      let roomId = b.room_id;
      if (mapping && mapping.nestbook_ref_type === 'room' && mapping.nestbook_ref_id !== b.room_id) {
        roomId = mapping.nestbook_ref_id;
      } else if (mapping && mapping.nestbook_ref_type === 'category' &&
                 overlappingBookingId(b.room_id, checkIn, checkOut, b.id)) {
        const r = resolveRoom(property, mapping, checkIn, checkOut);
        roomId = r?.roomId ?? b.room_id;
      } else if (mapping && mapping.nestbook_ref_type === 'whole_property') {
        roomId = firstRoomOfProperty(property.id);
      }

      const clash = overlappingBookingId(roomId, checkIn, checkOut, b.id);
      if (clash) warnings.push(`updated booking #${b.id} overlaps existing booking #${clash}`);

      db.prepare(`
        UPDATE bookings
        SET room_id = ?, check_in_date = ?, check_out_date = ?, num_guests = ?,
            status = 'confirmed', total_price = COALESCE(?, total_price),
            notes = ?
        WHERE id = ?
      `).run(
        roomId, checkIn, checkOut, guestsCount(room.occupancy),
        room.amount != null ? parseFloat(room.amount) : null,
        clash ? `${noteBase}\n⚠ overlaps booking #${clash} — review` : noteBase,
        b.id,
      );
      createdIds.push(b.id);
      // push both the old range (may have freed nights) and the new range
      toPush.push({ roomId: b.room_id, from: b.check_in_date, to: b.check_out_date });
      toPush.push({ roomId, from: checkIn, to: checkOut });
    } else {
      // NEW, or a shape change we don't reconcile field-by-field (multi-room,
      // room count changed): cancel whatever exists for this reservation and
      // (re)create one booking per active room. OTA bookings are never edited
      // locally, so no local state is lost beyond the row id.
      for (const b of existing) {
        if (b.status !== 'cancelled') {
          db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(b.id);
          cancelledIds.push(b.id);
          toPush.push({ roomId: b.room_id, from: b.check_in_date, to: b.check_out_date });
        }
      }

      const insertBooking = db.prepare(`
        INSERT INTO bookings
          (property_id, room_id, guest_id, check_in_date, check_out_date,
           num_guests, status, source, notes, total_price, channex_reservation_id)
        VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
      `);

      for (const room of activeRooms) {
        const mapping = db.prepare(
          'SELECT * FROM channex_room_mappings WHERE property_id = ? AND channex_room_type_id = ?'
        ).get(property.id, room.room_type_id);
        if (!mapping) {
          warnings.push(`room type ${room.room_type_id} is not mapped for this property — room skipped`);
          console.warn(`[channex-inbound] reservation ${reservationId}: unmapped room type ${room.room_type_id} — skipped`);
          continue;
        }
        const checkIn  = room.checkin_date  || revision.arrival_date;
        const checkOut = room.checkout_date || revision.departure_date;

        // resolveRoom (category branch) + INSERT must stay synchronous — no await.
        const resolved = resolveRoom(property, mapping, checkIn, checkOut);
        if (!resolved?.roomId) {
          warnings.push(`could not resolve a room for mapping ${mapping.id} — room skipped`);
          continue;
        }
        const clash = overlappingBookingId(resolved.roomId, checkIn, checkOut);
        if (clash) warnings.push(`new booking on room #${resolved.roomId} overlaps existing booking #${clash}`);

        const id = insertBooking.run(
          property.id, resolved.roomId, guestId, checkIn, checkOut,
          guestsCount(room.occupancy),
          source,
          clash ? `${noteBase}\n⚠ overlaps booking #${clash} — review` : noteBase,
          room.amount != null ? parseFloat(room.amount) : null,
          reservationId,
        ).lastInsertRowid;
        createdIds.push(id);
        toPush.push({ roomId: resolved.roomId, from: checkIn, to: checkOut });
      }

      if (createdIds.length === 0) {
        db.exec('ROLLBACK');
        console.warn(`[channex-inbound] reservation ${reservationId}: no rooms could be mapped — nothing created`);
        ackRevision(revision); // terminal decision — nothing to retry
        return { action: 'skipped', skipped: 'no_mapped_rooms', reservationId, propertyId: property.id, warnings };
      }
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  // Acknowledge to Channex ONLY now that the booking rows are committed.
  // Submitted BEFORE the availability push-back so the ack job is first in the
  // channexQueue (it also has priority there over ARI jobs) — the ack is
  // certification-critical and must not wait behind a burst of availability
  // updates or their retry/backoff.
  ackRevision(revision);

  // ── loop prevention: availability push-back ONLY, never a reservation echo ──
  // Fire-and-forget — the DB write is committed; the availability push drains
  // through channexQueue so the webhook responds fast.
  pushForRooms(property.id, toPush).catch(() => {});

  const action = existing.length ? 'updated' : 'created';
  console.log(`[channex-inbound] reservation ${reservationId} ${action.toUpperCase()} — booking(s) ${createdIds.join(', ')}` +
    (cancelledIds.length ? ` (cancelled ${cancelledIds.join(', ')})` : '') +
    (warnings.length ? ` — ${warnings.length} warning(s)` : ''));

  return { action, reservationId, propertyId: property.id, bookingIds: createdIds, cancelledIds, warnings };
}

/**
 * Fire the slice-4 outbound availability sync for every (room, range) touched.
 * Deduped, sequential, never throws (scheduleAvailabilityPush already
 * swallows its own errors). This is the ONLY thing sent back to Channex — the
 * reservation is never echoed. Routed through channexDebounce.js rather than
 * pushed immediately, so several webhook deliveries landing close together
 * coalesce into one outbound call; the `await` here just returns once each
 * change is enqueued, not once Channex has actually replied.
 */
async function pushForRooms(propertyId, entries) {
  const seen = new Set();
  for (const e of entries) {
    if (e.roomId == null) continue;
    const key = `${e.roomId}|${e.from}|${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await scheduleAvailabilityPush(propertyId, 'room', e.roomId, e.from, e.to);
  }
}
