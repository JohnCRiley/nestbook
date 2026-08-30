// Public widget API — no authentication required.
// These endpoints are called by the embedded booking widget from guest-facing
// websites. They expose only the minimum data needed for public availability
// checks and booking creation.
import crypto from 'crypto';
import { Router } from 'express';
import db from '../db/database.js';
import { stripe } from '../lib/stripeClient.js';
import { getRateForDate, calcSeasonalBreakdown } from '../utils/ratePeriods.js';
import { recoveryUrl, verifyRecoveryToken, makeRecoveryToken } from '../lib/recoveryToken.js';
import { assignRoomForCategoryBooking, getAvailableRoomsInCategory } from '../utils/categoryAvailability.js';
import {
  sendBookingConfirmation,
  sendApprovalRequestEmail,
  sendBookingApprovedEmail,
  sendBookingDeclinedEmail,
} from '../email/emailService.js';


// ── Demo mode rooms (static, never blocked, no DB dependency) ─────────────────
// Was used by widget-test.html (removed) for a fake-booking demo; nothing in
// the live site sets data-demo="true" on widget.js anymore, so this endpoint
// is currently unreachable. Left in place rather than removed as part of an
// unrelated change — safe to delete alongside DEMO_MODE in widget.js.
const DEMO_ROOMS = [
  { id: 'D1', property_id: 0, name: 'Chambre Lavande',  type: 'double', price_per_night: 95,  capacity: 2, amenities: 'wifi,ensuite,balcony',        status: 'available' },
  { id: 'D2', property_id: 0, name: 'Chambre Mistral',  type: 'twin',   price_per_night: 85,  capacity: 2, amenities: 'wifi,ensuite',                 status: 'available' },
  { id: 'D3', property_id: 0, name: 'Suite Provence',   type: 'suite',  price_per_night: 145, capacity: 4, amenities: 'wifi,ensuite,terrace,minibar', status: 'available' },
  { id: 'D4', property_id: 0, name: 'Chambre Olivier',  type: 'single', price_per_night: 65,  capacity: 1, amenities: 'wifi',                         status: 'available' },
];

export const widgetRouter = Router();

// ── Widget property guard ─────────────────────────────────────────────────────
// Returns the property row augmented with owner plan/suspended if valid for
// widget use (Pro or Multi, owner not suspended). Returns null otherwise.
function widgetPropertyGuard(property_id) {
  const row = db.prepare(`
    SELECT p.id, u.plan, u.suspended
    FROM properties p
    LEFT JOIN users u ON u.id = p.owner_id AND u.role = 'owner'
    WHERE p.id = ?
  `).get(property_id);
  if (!row || !row.plan || row.suspended || !['pro', 'multi'].includes(row.plan)) return null;
  return row;
}

// ── GET /api/widget/rooms?property_id=X ──────────────────────────────────────
// Returns rooms for a property (no guest PII).
widgetRouter.get('/rooms', (req, res) => {
  try {
    const { property_id, parent_unit_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
    const conditions = ['r.property_id = ?', 'r.is_sample_data = 0'];
    const params = [property_id];
    // Unit mode — optional scope to top-level rows only (?parent_unit_id=null),
    // same param pattern as the admin rooms endpoint. Omitted entirely (the
    // default for every existing caller) leaves this filter out, unchanged.
    if (parent_unit_id !== undefined) {
      if (parent_unit_id === 'null' || parent_unit_id === '') {
        conditions.push('r.parent_unit_id IS NULL');
      } else {
        conditions.push('r.parent_unit_id = ?');
        params.push(parent_unit_id);
      }
    }
    const rows = db.prepare(`
      SELECT r.*,
             p.breakfast_included AS property_breakfast_included,
             (SELECT filename FROM room_photos
              WHERE room_id = r.id
              ORDER BY display_order ASC, id ASC LIMIT 1) AS first_photo
      FROM rooms r
      JOIN properties p ON p.id = r.property_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.id
    `).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function localDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ── GET /api/widget/day-availability?property_id=X&room_id=Y ─────────────────
// Returns a ~365-day map of { "YYYY-MM-DD": "available" | "booked" } for the
// widget's own Step 1 date-picker. A separate implementation from
// bookingPage.js's read-only calendars (no shared code between the two files),
// but drawing on the same two data sources — bookings and ical_blocks — with
// the same scoping convention used everywhere else (room_id IS NULL on an
// ical_blocks row means property-wide).
//
// room_id (optional) — set when the guest arrived via a specific room's/
// unit's "Book this room" button, so the calendar reflects exactly what
// they're about to book. Without it, the map is pooled across every
// bookable room/unit/category so browsing guests see an honest picture
// before they've chosen anything: a date is 'available' if at least one
// slot is free that day, mirroring bookingPage.js's own Categories-mode
// pooling convention.
widgetRouter.get('/day-availability', (req, res) => {
  try {
    const { property_id, room_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }

    const property = db.prepare('SELECT rental_type, ir_room_mode FROM properties WHERE id = ?').get(property_id);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const map  = {};
    const base = new Date();

    if (room_id) {
      const roomIdNum = Number(room_id);
      const bookings = db.prepare(`
        SELECT check_in_date, check_out_date FROM bookings
        WHERE room_id = ? AND is_sample_data = 0
          AND status NOT IN ('cancelled', 'checked_out', 'cancelled_unpaid', 'declined')
      `).all(roomIdNum);
      const blocks = db.prepare(`
        SELECT start_date, end_date FROM ical_blocks
        WHERE property_id = ? AND (room_id IS NULL OR room_id = ?) AND end_date >= date('now')
      `).all(property_id, roomIdNum);
      for (let i = 0; i < 365; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        const s = localDateStr(d);
        const blocked = bookings.some((b) => b.check_in_date <= s && b.check_out_date > s) ||
          blocks.some((b) => b.start_date <= s && b.end_date > s);
        map[s] = blocked ? 'booked' : 'available';
      }
    } else if (property.rental_type === 'whole_property') {
      const bookings = db.prepare(`
        SELECT b.check_in_date, b.check_out_date
        FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE r.property_id = ? AND b.is_sample_data = 0
          AND b.status NOT IN ('cancelled', 'checked_out', 'cancelled_unpaid', 'declined')
      `).all(property_id);
      const blocks = db.prepare(`
        SELECT start_date, end_date FROM ical_blocks WHERE property_id = ? AND end_date >= date('now')
      `).all(property_id);
      for (let i = 0; i < 365; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        const s = localDateStr(d);
        const blocked = bookings.some((b) => b.check_in_date <= s && b.check_out_date > s) ||
          blocks.some((b) => b.start_date <= s && b.end_date > s);
        map[s] = blocked ? 'booked' : 'available';
      }
    } else if (property.rental_type === 'rooms' && property.ir_room_mode === 'categories') {
      const categories = db.prepare('SELECT id FROM room_categories WHERE property_id = ?').all(property_id);
      for (let i = 0; i < 365; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        const s = localDateStr(d);
        const next = new Date(d); next.setDate(d.getDate() + 1);
        const nextS = localDateStr(next);
        const available = categories.some((cat) =>
          getAvailableRoomsInCategory(db, cat.id, s, nextS, { respectBuffer: true }).length > 0
        );
        map[s] = available ? 'available' : 'booked';
      }
    } else {
      // Named Rooms or Units — pool across every bookable room/unit
      // (parent_unit_id IS NULL excludes a unit's internal display-only rooms).
      const rooms = db.prepare(`
        SELECT id FROM rooms WHERE property_id = ? AND status != 'maintenance' AND parent_unit_id IS NULL AND is_sample_data = 0
      `).all(property_id);
      const roomIds = rooms.map((r) => r.id);
      if (roomIds.length === 0) { res.json({}); return; }

      const placeholders = roomIds.map(() => '?').join(', ');
      const bookings = db.prepare(`
        SELECT room_id, check_in_date, check_out_date FROM bookings
        WHERE room_id IN (${placeholders}) AND status NOT IN ('cancelled', 'checked_out', 'cancelled_unpaid', 'declined')
      `).all(...roomIds);
      const blocks = db.prepare(`
        SELECT room_id, start_date, end_date FROM ical_blocks
        WHERE property_id = ? AND end_date >= date('now')
      `).all(property_id);

      for (let i = 0; i < 365; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        const s = localDateStr(d);
        const available = roomIds.some((rid) => {
          const roomBooked = bookings.some((b) => b.room_id === rid && b.check_in_date <= s && b.check_out_date > s);
          const roomBlocked = blocks.some((b) => (b.room_id === null || b.room_id === rid) && b.start_date <= s && b.end_date > s);
          return !roomBooked && !roomBlocked;
        });
        map[s] = available ? 'available' : 'booked';
      }
    }

    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/rate-periods?property_id=X ───────────────────────────────
// Returns rate periods so the widget can show seasonal prices to guests.
widgetRouter.get('/rate-periods', (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
    const rows = db.prepare(
      'SELECT id, name, date_from, date_to, rate_type, rate_value, priority FROM rate_periods WHERE property_id = ? ORDER BY priority ASC, id ASC'
    ).all(property_id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Bed configuration (Phase 7a format) ───────────────────────────────────
// Mirrors the same-named local helpers already in rooms.js/bookingPage.js —
// small enough that each route file keeps its own copy rather than sharing
// a module, matching the established pattern in this codebase.
function parseBedConfig(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Returns the shared bed_config array only if EVERY room passed in has an
// identical, non-null bed_config (same types and quantities, order-
// independent) — otherwise null, so the caller omits the bed info entirely
// rather than showing a partial or misleading result.
function getUniformBedConfig(rooms) {
  if (!rooms || rooms.length === 0) return null;
  const signature = (arr) => arr.map((e) => `${e.type}:${e.qty}`).sort().join(',');

  let shared = null;
  let sharedSignature = null;
  for (const room of rooms) {
    const parsed = parseBedConfig(room.bed_config);
    if (!parsed || parsed.length === 0) return null;
    const sig = signature(parsed);
    if (sharedSignature === null) {
      sharedSignature = sig;
      shared = parsed;
    } else if (sig !== sharedSignature) {
      return null;
    }
  }
  return shared;
}

// Room Categories mode only — true when the property is set up that way.
function isCategoriesModeProperty(propertyId) {
  const property = db.prepare('SELECT rental_type, ir_room_mode FROM properties WHERE id = ?').get(propertyId);
  return property?.rental_type === 'rooms' && property?.ir_room_mode === 'categories';
}

// ── GET /api/widget/categories?property_id=X&check_in=Y&check_out=Z&guests=N ──
// Room Categories mode only — one row per category: price range, capacity,
// and bed_config across the rooms that fit `guests`, a representative photo,
// and a buffer-respecting availability flag (mirrors getAvailableRoomsInCategory's
// own convention, same as Phase 6a's booking-creation routes). Public — no
// auth, no guest PII. Categories with zero guest-eligible rooms are omitted
// entirely rather than returned with a misleading empty range.
widgetRouter.get('/categories', (req, res) => {
  try {
    const { property_id, check_in, check_out, guests } = req.query;
    if (!property_id || !check_in || !check_out) {
      return res.status(400).json({ error: 'property_id, check_in and check_out are required' });
    }
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
    if (!isCategoriesModeProperty(property_id)) {
      return res.status(400).json({ error: 'This property is not in Room Categories mode.' });
    }

    const numGuests = Math.max(1, parseInt(guests, 10) || 1);

    const categories = db.prepare(
      'SELECT id, name FROM room_categories WHERE property_id = ? ORDER BY display_order ASC, id ASC'
    ).all(property_id);

    const result = categories.map((category) => {
      const rooms = db.prepare(`
        SELECT id, price_per_night, capacity, bed_config
        FROM rooms
        WHERE category_id = ? AND status != 'maintenance' AND capacity >= ?
        ORDER BY id ASC
      `).all(category.id, numGuests);

      if (rooms.length === 0) return null;

      const prices = rooms.map((r) => Number(r.price_per_night ?? 0)).filter((p) => p > 0);
      const priceMin = prices.length ? Math.min(...prices) : 0;
      const priceMax = prices.length ? Math.max(...prices) : 0;
      const capacity = Math.max(...rooms.map((r) => Number(r.capacity ?? 0)));

      const photoRow = db.prepare(
        'SELECT filename FROM room_photos WHERE room_id = ? ORDER BY display_order ASC, id ASC LIMIT 1'
      ).get(rooms[0].id);

      const availableIds = getAvailableRoomsInCategory(db, category.id, check_in, check_out, {
        respectBuffer: true,
        minCapacity: numGuests,
      });

      return {
        id:         category.id,
        name:       category.name,
        price_min:  priceMin,
        price_max:  priceMax,
        capacity,
        bed_config: getUniformBedConfig(rooms),
        photo:      photoRow?.filename ?? null,
        available:  availableIds.length > 0,
      };
    }).filter(Boolean);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/category-preview?category_id=X&check_in=Y&check_out=Z ──
// Room Categories mode only — read-only dry run of assignRoomForCategoryBooking
// (the exact same function and respectBuffer:true mode a real booking would
// use), so the widget can show the guest specifically which room they'd get
// before they confirm. Does NOT insert anything — no atomicity concerns here
// since there's no check-then-write pair; the real booking-creation routes
// (Phase 6a) own that discipline at submission time.
widgetRouter.get('/category-preview', (req, res) => {
  try {
    const { category_id, check_in, check_out } = req.query;
    if (!category_id || !check_in || !check_out) {
      return res.status(400).json({ error: 'category_id, check_in and check_out are required' });
    }
    const category = db.prepare('SELECT id, property_id FROM room_categories WHERE id = ?').get(category_id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    if (!widgetPropertyGuard(category.property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
    if (!isCategoriesModeProperty(category.property_id)) {
      return res.status(400).json({ error: 'This property is not in Room Categories mode.' });
    }

    const roomId = assignRoomForCategoryBooking(db, category_id, check_in, check_out, { respectBuffer: true });
    if (!roomId) {
      return res.status(409).json({ error: 'No rooms available in this category for those dates' });
    }

    const room = db.prepare(
      'SELECT id, property_id, name, type, price_per_night, capacity, amenities FROM rooms WHERE id = ?'
    ).get(roomId);
    const photoRow = db.prepare(
      'SELECT filename FROM room_photos WHERE room_id = ? ORDER BY display_order ASC, id ASC LIMIT 1'
    ).get(roomId);
    const { total, breakdown } = calcSeasonalBreakdown(room.property_id, room.id, check_in, check_out);

    res.json({
      room_id:         room.id,
      name:            room.name,
      type:            room.type,
      capacity:        room.capacity,
      amenities:       room.amenities,
      photo:           photoRow?.filename ?? null,
      price_per_night: room.price_per_night,
      total_price:     total,
      rate_breakdown:  breakdown,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/category-rooms?category_id=X&check_in=Y&check_out=Z ──────
// Room Categories mode only — every room in the category, deliberately NOT
// filtered by guest capacity (that filtering only happens at the category-
// list level; this endpoint backs the room-picker step, which shows every
// room regardless of guest count). `available` is false for a room that's
// booked for those dates OR buffered — buffered rooms are included here,
// same "never hidden" convention as booked ones, just flagged unavailable
// (mirrors getAvailableRoomsInCategory's own respectBuffer:true pool, same
// convention Phase 6a's booking routes and category-preview already use).
widgetRouter.get('/category-rooms', (req, res) => {
  try {
    const { category_id, check_in, check_out } = req.query;
    if (!category_id || !check_in || !check_out) {
      return res.status(400).json({ error: 'category_id, check_in and check_out are required' });
    }
    const category = db.prepare('SELECT id, property_id FROM room_categories WHERE id = ?').get(category_id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    if (!widgetPropertyGuard(category.property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
    if (!isCategoriesModeProperty(category.property_id)) {
      return res.status(400).json({ error: 'This property is not in Room Categories mode.' });
    }

    const rooms = db.prepare(
      "SELECT id, name, capacity, bed_config, price_per_night FROM rooms WHERE category_id = ? AND status != 'maintenance' ORDER BY id ASC"
    ).all(category_id);

    const assignableIds = new Set(
      getAvailableRoomsInCategory(db, category_id, check_in, check_out, { respectBuffer: true })
    );

    res.json({
      rooms: rooms.map((r) => ({
        room_id:         r.id,
        name:            r.name,
        capacity:        r.capacity,
        bed_config:      parseBedConfig(r.bed_config),
        price_per_night: r.price_per_night,
        available:       assignableIds.has(r.id),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/rate-range?propertyId=X&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD ──
// Returns seasonal rate total + per-segment breakdown for a date range.
// Used by WP widget to show correct price including seasonal adjustments.
widgetRouter.get('/rate-range', (req, res) => {
  try {
    const { propertyId, checkIn, checkOut } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!propertyId || !checkIn || !dateRe.test(checkIn) || !checkOut || !dateRe.test(checkOut) || checkOut <= checkIn) {
      return res.status(400).json({ error: 'propertyId, checkIn and checkOut (YYYY-MM-DD) required' });
    }

    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    if (!prop) return res.status(404).json({ error: 'Property not found' });

    const room = db.prepare('SELECT id FROM rooms WHERE property_id = ? ORDER BY id LIMIT 1').get(propertyId);
    if (!room) return res.status(404).json({ error: 'No rooms found for this property' });

    const isWP = prop.rental_type === 'whole_property';
    const baseRate = isWP ? (prop.whole_property_rate ?? 0) : 0;

    const breakdown = [];
    function addDay(iso) {
      const d = new Date(iso + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    let current = checkIn;
    while (current < checkOut) {
      const result = getRateForDate(prop.id, room.id, current, isWP ? baseRate : null);
      const rate = result?.rate ?? baseRate;
      const periodName = result?.periodName ?? null;
      const last = breakdown[breakdown.length - 1];
      if (last && last.rate === rate && last.periodName === periodName) {
        last.nights++;
      } else {
        breakdown.push({ periodName, nights: 1, rate });
      }
      current = addDay(current);
    }

    const total = Math.round(breakdown.reduce((s, seg) => s + seg.rate * seg.nights, 0) * 100) / 100;
    const nights = breakdown.reduce((s, seg) => s + seg.nights, 0);
    res.json({ total, nights, baseRate, breakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/bookings?property_id=X ────────────────────────────────────
// Returns minimal booking data needed for client-side availability checks.
// Guest PII is deliberately excluded.
widgetRouter.get('/bookings', (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
    const rows = db.prepare(`
      SELECT id, room_id, check_in_date, check_out_date, status
      FROM bookings
      WHERE property_id = ?
        AND status NOT IN ('cancelled', 'checked_out', 'cancelled_unpaid', 'declined')
      ORDER BY check_in_date
    `).all(property_id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/widget/guests ───────────────────────────────────────────────────
// Creates a new guest record. Called during widget booking flow.
widgetRouter.post('/guests', (req, res) => {
  try {
    const { first_name, last_name, email, phone, notes } = req.body;
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }
    const result = db.prepare(`
      INSERT INTO guests (first_name, last_name, email, phone, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(first_name, last_name, email ?? null, phone ?? null, notes ?? null);
    res.status(201).json(
      db.prepare('SELECT * FROM guests WHERE id = ?').get(result.lastInsertRowid)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/widget/bookings ─────────────────────────────────────────────────
// Creates a booking from the widget. Sends confirmation email.
// If the property owner has an active Stripe Connect account, creates the
// booking as pending_payment and returns a Stripe Checkout URL instead of
// confirming instantly. The webhook advances the booking to confirmed on payment.
widgetRouter.post('/bookings', async (req, res) => {
  try {
    const {
      property_id, guest_id,
      check_in_date, check_out_date,
      num_guests, status, source, notes, total_price,
      breakfast_added, breakfast_guests, breakfast_price_per_person, breakfast_start_date,
    } = req.body;
    let room_id = req.body.room_id;
    const category_id = req.body.category_id;

    if (!property_id || (!room_id && !category_id) || !guest_id || !check_in_date || !check_out_date) {
      return res.status(400).json({
        error: 'property_id, room_id (or category_id), guest_id, check_in_date and check_out_date are required',
      });
    }

    // Demo properties: return fake confirmation, never write to DB
    const propCheck = db.prepare('SELECT is_demo, rental_type, booking_flow, ir_room_mode, whole_property_rate FROM properties WHERE id = ?').get(property_id);
    if (propCheck?.is_demo === 1) {
      const ref = 'DEMO-' + String(Math.floor(1000 + Math.random() * 9000));
      console.log('[widget] Demo property booking blocked:', property_id);
      return res.status(201).json({ id: ref, demo: true, status: 'cancelled' });
    }

    // Properties still showing seeded sample data (visible on the public
    // booking page so a fresh host can preview it) can't take a real booking
    // yet — regardless of which room is targeted, real or sample. Only
    // clearing sample data (Settings → Sample Data) lifts this.
    const hasSampleData = db.prepare(
      'SELECT 1 FROM rooms WHERE property_id = ? AND is_sample_data = 1 LIMIT 1'
    ).get(property_id);
    if (hasSampleData) {
      return res.status(403).json({
        error: 'This property is still showing example data and can\'t accept bookings yet.',
        code: 'SAMPLE_DATA_ACTIVE',
      });
    }

    // Units mode, request-flow booking — routes through the exact same
    // pending_owner_approval / approval_token / sendApprovalRequestEmail
    // mechanism WP's own isWpRequest already uses below, just from a new,
    // independent condition. Every existing units-mode property defaults to
    // booking_flow='instant' (isUnitsRequestFlow stays false), so this is a
    // no-op for them; IR and WP never have rental_type === 'units', so it's
    // always false there regardless of their own booking_flow value.
    const isUnitsRequestFlow = propCheck?.rental_type === 'units' && propCheck?.booking_flow === 'request';

    if (check_out_date <= check_in_date) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    // Room Categories mode — category_id sent instead of room_id. Assigns a
    // specific room synchronously, immediately before the conflict check and
    // INSERT below, with no await in between (see categoryAvailability.js —
    // that's what keeps this race-free without an explicit lock).
    // respectBuffer: true — guest-facing/online bookings must never draw
    // from the buffered pool; only manual owner action (Phase 5) can.
    if (!room_id && category_id) {
      if (propCheck?.rental_type !== 'rooms' || propCheck?.ir_room_mode !== 'categories') {
        return res.status(400).json({ error: 'category_id is only valid for Room Categories-mode properties.' });
      }
      const category = db.prepare('SELECT id FROM room_categories WHERE id = ? AND property_id = ?').get(category_id, property_id);
      if (!category) {
        return res.status(400).json({ error: 'category_id does not belong to this property.' });
      }
      const assignedRoomId = assignRoomForCategoryBooking(db, category_id, check_in_date, check_out_date, { respectBuffer: true });
      if (!assignedRoomId) {
        return res.status(409).json({ error: 'No rooms available in this category for those dates' });
      }
      room_id = assignedRoomId;
    }

    console.log(`[widget-booking] started — property=${property_id} room=${room_id} guest=${guest_id} status=${status ?? 'none'}`);

    const conflict = db.prepare(`
      SELECT id FROM bookings
      WHERE room_id = ?
        AND status NOT IN ('cancelled', 'checked_out', 'cancelled_unpaid', 'declined')
        AND check_in_date < ?
        AND check_out_date > ?
    `).get(room_id, check_out_date, check_in_date);
    if (conflict) {
      return res.status(409).json({ error: 'This room is no longer available for the selected dates. Please choose different dates.' });
    }

    // Also check external iCal blocks
    const icalBlock = db.prepare(`
      SELECT id FROM ical_blocks
      WHERE property_id = ?
        AND (room_id IS NULL OR room_id = ?)
        AND start_date < ?
        AND end_date > ?
    `).get(property_id, room_id, check_out_date, check_in_date);
    if (icalBlock) {
      return res.status(409).json({ error: 'This room is no longer available for the selected dates. Please choose different dates.' });
    }

    // Flag the booking if the guest's email matches a blacklisted guest
    const guestData = db.prepare('SELECT email, blacklisted FROM guests WHERE id = ?').get(guest_id);
    let flagged = guestData?.blacklisted ? 1 : 0;
    if (!flagged && guestData?.email) {
      const bl = db.prepare('SELECT id FROM guests WHERE email = ? AND blacklisted = 1').get(guestData.email);
      if (bl) flagged = 1;
    }

    // Persist the room-rate breakdown so every "amount owed" surface can
    // reconstruct the room subtotal without trusting total_price (which for a
    // widget booking is room-only — breakfast rides as a separate Stripe line).
    const wpBaseRate = propCheck?.rental_type === 'whole_property'
      ? (propCheck.whole_property_rate ?? null)
      : null;
    const rateBreakdownStr = JSON.stringify(
      calcSeasonalBreakdown(Number(property_id), Number(room_id), check_in_date, check_out_date, wpBaseRate).breakdown
    );

    // ── Block-booking protection check ───────────────────────────────────────
    // Must run BEFORE the Stripe Connect branch so it applies even when the
    // property has an active Connect account (Stripe branch returns early and
    // would otherwise bypass this check entirely).
    const isWpRequest = (status === 'pending_owner_approval');
    let isBlockProtected = false;
    console.log(`[widget-booking] isWpRequest=${isWpRequest}, isUnitsRequestFlow=${isUnitsRequestFlow}, guestEmail=${guestData?.email ?? 'null'}`);
    if (!isWpRequest && !isUnitsRequestFlow && guestData?.email) {
      const protProp = db.prepare(
        'SELECT block_booking_protection, block_booking_threshold FROM properties WHERE id = ?'
      ).get(property_id);
      console.log(`[widget-booking] block_booking_protection=${protProp?.block_booking_protection}, threshold=${protProp?.block_booking_threshold}`);
      if (protProp?.block_booking_protection) {
        const threshold = protProp.block_booking_threshold ?? 2;
        const { n } = db.prepare(`
          SELECT COUNT(*) as n FROM bookings b
          JOIN guests g ON g.id = b.guest_id
          WHERE b.property_id = ?
            AND g.email = ?
            AND b.status NOT IN ('cancelled', 'checked_out', 'cancelled_unpaid', 'declined')
            AND b.check_in_date < ?
            AND b.check_out_date > ?
        `).get(property_id, guestData.email, check_out_date, check_in_date);
        console.log(`[widget-booking] overlapping rooms for ${guestData.email}: n=${n}, threshold=${threshold}, triggers=${(n + 1) >= threshold}`);
        if ((n + 1) >= threshold) {
          isBlockProtected = true;
        }
      }
    }

    // ── Stripe Connect payment branch ────────────────────────────────────────
    // Rooms-mode, non-WP bookings on properties with an active Connect account
    // are held as pending_payment. Block-booking protection takes priority:
    // if triggered the booking goes to pending_owner_approval, bypassing Stripe.
    // Units-mode request-flow bookings bypass Stripe entirely too, for the same reason.
    if (!isWpRequest && !isBlockProtected && !isUnitsRequestFlow) {
      const ownerRow = db.prepare(`
        SELECT u.stripe_connect_account_id, u.stripe_connect_status,
               p.currency, p.name AS property_name
        FROM properties p
        JOIN users u ON u.id = p.owner_id
        WHERE p.id = ?
      `).get(property_id);

      if (ownerRow?.stripe_connect_status === 'active') {
        const result = db.prepare(`
          INSERT INTO bookings
            (property_id, room_id, guest_id, check_in_date, check_out_date,
             num_guests, status, source, notes, total_price, rate_breakdown, flagged,
             breakfast_added, breakfast_guests, breakfast_price_per_person, breakfast_start_date)
          VALUES (?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          property_id, room_id, guest_id,
          check_in_date, check_out_date,
          num_guests ?? 1,
          source     ?? 'direct',
          notes      ?? null,
          total_price ?? null,
          rateBreakdownStr,
          flagged,
          breakfast_added ? 1 : 0,
          breakfast_guests ?? 0,
          parseFloat(breakfast_price_per_person) || 0,
          breakfast_start_date ?? null,
        );
        const bookingId = result.lastInsertRowid;
        const currency  = (ownerRow.currency || 'eur').toLowerCase();
        const amount    = Math.round((total_price ?? 0) * 100);

        let session;
        try {
          const base = process.env.APP_URL ?? 'https://nestbook.io';
          session = await stripe.checkout.sessions.create(
            {
              mode: 'payment',
              // 30 minutes is Stripe's minimum — keeps room hold short.
              // On expiry Stripe fires checkout.session.expired, which the
              // webhook handler uses to delete the pending_payment booking.
              expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
              line_items: (() => {
                const items = [{
                  price_data: {
                    currency,
                    product_data: { name: `${ownerRow.property_name} — ${check_in_date} to ${check_out_date}` },
                    unit_amount: amount,
                  },
                  quantity: 1,
                }];
                if (breakfast_added && breakfast_price_per_person && breakfast_guests) {
                  const nights = Math.round((new Date(check_out_date) - new Date(check_in_date)) / 86400000);
                  const bfAmt  = Math.round(parseFloat(breakfast_price_per_person) * Number(breakfast_guests) * nights * 100);
                  if (bfAmt > 0) {
                    items.push({ price_data: { currency, product_data: { name: 'Breakfast' }, unit_amount: bfAmt }, quantity: 1 });
                  }
                }
                return items;
              })(),
              success_url: `${base}/pay/success?booking=${bookingId}&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url:  recoveryUrl(base, bookingId),
              metadata: {
                booking_id: String(bookingId),
                source:     'widget_payment',
              },
            },
            { stripeAccount: ownerRow.stripe_connect_account_id },
          );
        } catch (stripeErr) {
          // Roll back the pending booking so dates aren't permanently blocked
          db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);
          throw stripeErr;
        }

        db.prepare('UPDATE bookings SET stripe_checkout_session_id = ? WHERE id = ?')
          .run(session.id, bookingId);

        const { exp: rExp, t: rTok } = makeRecoveryToken(bookingId);
        console.log(`[widget] Booking #${bookingId} pending_payment — Stripe session ${session.id}`);
        return res.status(201).json({ checkoutUrl: session.url, bookingId, exp: rExp, t: rTok });
      }
    }
    // ── End Stripe Connect branch ─────────────────────────────────────────────

    const needsApproval = isWpRequest || isBlockProtected || isUnitsRequestFlow;
    const approvalToken = needsApproval ? crypto.randomBytes(32).toString('hex') : null;

    const result = db.prepare(`
      INSERT INTO bookings
        (property_id, room_id, guest_id, check_in_date, check_out_date,
         num_guests, status, source, notes, total_price, rate_breakdown, flagged, approval_token,
         breakfast_added, breakfast_guests, breakfast_price_per_person, breakfast_start_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, room_id, guest_id,
      check_in_date, check_out_date,
      num_guests   ?? 1,
      needsApproval ? 'pending_owner_approval' : (status ?? 'confirmed'),
      source       ?? 'direct',
      notes        ?? null,
      total_price  ?? null,
      rateBreakdownStr,
      flagged,
      approvalToken,
      breakfast_added ? 1 : 0,
      breakfast_guests ?? 0,
      parseFloat(breakfast_price_per_person) || 0,
      breakfast_start_date ?? null,
    );

    const newBooking = db.prepare(`
      SELECT b.id, b.property_id, b.room_id, b.guest_id,
             b.check_in_date, b.check_out_date, b.num_guests,
             b.status, b.source, b.notes, b.total_price, b.created_at,
             g.first_name AS guest_first_name, g.last_name AS guest_last_name,
             g.email AS guest_email, g.phone AS guest_phone,
             r.name AS room_name, r.type AS room_type, r.price_per_night
      FROM bookings b
      LEFT JOIN guests g ON b.guest_id = g.id
      LEFT JOIN rooms  r ON b.room_id  = r.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newBooking);

    // Fire-and-forget emails — must not delay or break the HTTP response
    const property = db.prepare('SELECT p.*, u.email AS owner_email FROM properties p LEFT JOIN users u ON u.id = p.owner_id AND u.role = \'owner\' WHERE p.id = ?').get(newBooking.property_id);
    if (needsApproval && approvalToken) {
      const base = process.env.APP_URL ?? 'https://nestbook.io';
      const approveUrl = `${base}/api/widget/bookings/${newBooking.id}/approve?token=${approvalToken}`;
      const declineUrl = `${base}/api/widget/bookings/${newBooking.id}/decline?token=${approvalToken}`;
      sendApprovalRequestEmail(newBooking, property, approveUrl, declineUrl).catch(() => {});
    } else {
      sendBookingConfirmation(newBooking, property).catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/bookings/:id/approve?token=... ───────────────────────────
// Public endpoint — called from the approval email link. No auth required.
widgetRouter.get('/bookings/:id/approve', (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    if (!token) return res.status(400).send(approvalPage('Missing token', false));

    const booking = db.prepare(
      `SELECT b.*, g.first_name AS guest_first_name, g.last_name AS guest_last_name,
              g.email AS guest_email, g.phone AS guest_phone
       FROM bookings b LEFT JOIN guests g ON g.id = b.guest_id
       WHERE b.id = ?`
    ).get(Number(id));
    if (!booking)                               return res.status(404).send(approvalPage('Booking not found.', false));
    if (booking.approval_token !== token)       return res.status(403).send(approvalPage('Invalid or expired link.', false));
    if (booking.status === 'confirmed')         return res.send(approvalPage('This booking has already been approved.', true));
    if (booking.status === 'declined')          return res.send(approvalPage('This booking was previously declined.', false));
    if (booking.status !== 'pending_owner_approval') return res.send(approvalPage('This booking cannot be approved.', false));

    db.prepare(`UPDATE bookings SET status = 'confirmed', approval_token = NULL WHERE id = ?`).run(Number(id));

    const property = db.prepare(
      `SELECT p.*, u.email AS owner_email FROM properties p LEFT JOIN users u ON u.id = p.owner_id AND u.role = 'owner' WHERE p.id = ?`
    ).get(booking.property_id);
    const approved = { ...booking, status: 'confirmed' };
    sendBookingApprovedEmail(approved, property).catch(() => {});

    res.send(approvalPage(`Booking approved! ${booking.guest_first_name} ${booking.guest_last_name} has been notified by email.`, true));
  } catch (err) {
    res.status(500).send(approvalPage('Server error. Please try again.', false));
  }
});

// ── GET /api/widget/bookings/:id/decline?token=... ────────────────────────────
widgetRouter.get('/bookings/:id/decline', (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    if (!token) return res.status(400).send(approvalPage('Missing token', false));

    const booking = db.prepare(
      `SELECT b.*, g.first_name AS guest_first_name, g.last_name AS guest_last_name,
              g.email AS guest_email
       FROM bookings b LEFT JOIN guests g ON g.id = b.guest_id
       WHERE b.id = ?`
    ).get(Number(id));
    if (!booking)                               return res.status(404).send(approvalPage('Booking not found.', false));
    if (booking.approval_token !== token)       return res.status(403).send(approvalPage('Invalid or expired link.', false));
    if (booking.status === 'declined')          return res.send(approvalPage('This booking has already been declined.', false));
    if (booking.status === 'confirmed')         return res.send(approvalPage('This booking has already been approved.', true));
    if (booking.status !== 'pending_owner_approval') return res.send(approvalPage('This booking cannot be declined.', false));

    db.prepare(`UPDATE bookings SET status = 'declined', approval_token = NULL WHERE id = ?`).run(Number(id));

    const property = db.prepare(`SELECT * FROM properties WHERE id = ?`).get(booking.property_id);
    const declined = { ...booking, status: 'declined' };
    sendBookingDeclinedEmail(declined, property).catch(() => {});

    res.send(approvalPage(`Booking declined. ${booking.guest_first_name} ${booking.guest_last_name} has been notified.`, false));
  } catch (err) {
    res.status(500).send(approvalPage('Server error. Please try again.', false));
  }
});

function approvalPage(message, success) {
  const colour = success ? '#405440' : '#dc2626';
  const icon   = success ? '✓' : '✕';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NestBook — Booking ${success ? 'Approved' : 'Declined'}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F3F0}
.card{background:#fff;border-radius:14px;padding:40px 48px;max-width:480px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.12)}
.icon{width:64px;height:64px;border-radius:50%;background:${colour}20;color:${colour};font-size:2rem;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
h1{color:${colour};font-size:1.5rem;margin:0 0 12px}p{color:#374151;line-height:1.6;margin:0 0 24px}
a{color:#405440;font-weight:600}</style></head>
<body><div class="card"><div class="icon">${icon}</div>
<h1>${success ? 'Booking Approved' : 'Booking Declined'}</h1>
<p>${message}</p>
<p><a href="https://nestbook.io/app">Go to your NestBook dashboard →</a></p>
</div></body></html>`;
}

// ── GET /api/widget/property?property_id=X ───────────────────────────────────
// Returns the theme for a property so the widget can style itself correctly.
// Public endpoint — no auth required.
widgetRouter.get('/property', (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    const row = db.prepare(`
      SELECT p.name, p.theme, p.currency, p.rental_type, p.ir_room_mode, p.whole_property_rate, p.total_capacity,
             p.breakfast_widget_enabled, p.breakfast_price,
             u.stripe_connect_status
      FROM properties p
      LEFT JOIN users u ON u.id = p.owner_id
      WHERE p.id = ?
    `).get(property_id);
    if (!row) return res.status(404).json({ error: 'Property not found' });
    res.json({
      theme:                    row.theme              ?? 'forest',
      name:                     row.name               ?? '',
      currency:                 row.currency           ?? 'EUR',
      rental_type:              row.rental_type        ?? 'rooms',
      ir_room_mode:             row.ir_room_mode        ?? 'named',
      whole_property_rate:      row.whole_property_rate ?? null,
      total_capacity:           row.total_capacity      ?? null,
      stripe_connect_active:    row.stripe_connect_status === 'active',
      breakfast_widget_enabled: row.breakfast_widget_enabled === 1,
      breakfast_price:          row.breakfast_price ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/recovery-info ────────────────────────────────────────────
// Public. Called by pay/recover.html on load. Verifies the HMAC token and
// returns the booking summary needed to populate the recovery page.
widgetRouter.get('/recovery-info', (req, res) => {
  const { b, exp, t } = req.query;
  if (!verifyRecoveryToken(b, exp, t)) {
    return res.status(410).json({ error: 'expired' });
  }

  const booking = db.prepare(`
    SELECT b.id, b.check_in_date, b.check_out_date, b.total_price, b.status,
           b.num_guests, b.breakfast_added,
           g.first_name, g.last_name,
           r.name AS room_name,
           p.name AS property_name, p.currency
    FROM bookings b
    JOIN guests     g ON g.id = b.guest_id
    JOIN rooms      r ON r.id = b.room_id
    JOIN properties p ON p.id = b.property_id
    WHERE b.id = ?
  `).get(Number(b));

  if (!booking || booking.status !== 'pending_payment') {
    return res.status(410).json({ error: 'expired' });
  }

  res.json({
    booking_id:    booking.id,
    guest_name:    `${booking.first_name} ${booking.last_name}`,
    check_in:      booking.check_in_date,
    check_out:     booking.check_out_date,
    room_name:     booking.room_name,
    property_name: booking.property_name,
    total_price:   booking.total_price,
    currency:      booking.currency,
  });
});

// ── POST /api/widget/retry-payment ───────────────────────────────────────────
// Public. Called by pay/recover.html "Try again" button. Creates a fresh
// Stripe Checkout session for the same pending_payment booking and returns
// the URL to redirect to.
widgetRouter.post('/retry-payment', async (req, res) => {
  const { booking_id, exp, token } = req.body;
  if (!verifyRecoveryToken(booking_id, exp, token)) {
    return res.status(410).json({ error: 'Link expired — please start a new booking.' });
  }

  const booking = db.prepare(`
    SELECT b.*, p.currency, p.name AS property_name,
           u.stripe_connect_account_id, u.stripe_connect_status
    FROM bookings b
    JOIN properties p ON p.id = b.property_id
    JOIN users      u ON u.id = p.owner_id
    WHERE b.id = ?
  `).get(Number(booking_id));

  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.status !== 'pending_payment') {
    return res.status(410).json({ error: 'This booking is no longer available.' });
  }
  if (booking.stripe_connect_status !== 'active') {
    return res.status(400).json({ error: 'Payment not available for this property.' });
  }

  const base     = process.env.APP_URL ?? 'https://nestbook.io';
  const currency = (booking.currency || 'eur').toLowerCase();
  const amount   = Math.round((booking.total_price ?? 0) * 100);

  const lineItems = [{
    price_data: {
      currency,
      product_data: { name: `${booking.property_name} — ${booking.check_in_date} to ${booking.check_out_date}` },
      unit_amount: amount,
    },
    quantity: 1,
  }];

  if (booking.breakfast_added && booking.breakfast_price_per_person && booking.breakfast_guests) {
    const nights = Math.round((new Date(booking.check_out_date) - new Date(booking.check_in_date)) / 86400000);
    const bfAmt  = Math.round(parseFloat(booking.breakfast_price_per_person) * Number(booking.breakfast_guests) * nights * 100);
    if (bfAmt > 0) {
      lineItems.push({ price_data: { currency, product_data: { name: 'Breakfast' }, unit_amount: bfAmt }, quantity: 1 });
    }
  }

  try {
    // Expire the original session first so only one of the two can ever be
    // completed — without this, a guest with both the original and the
    // recovery checkout tab open could pay through both and be charged twice.
    // Best-effort: the original may already be expired/completed, which
    // Stripe rejects — that's fine, it just means there's nothing to expire.
    if (booking.stripe_checkout_session_id) {
      try {
        await stripe.checkout.sessions.expire(
          booking.stripe_checkout_session_id,
          { stripeAccount: booking.stripe_connect_account_id },
        );
      } catch (expireErr) {
        console.warn(`[widget] Could not expire prior session ${booking.stripe_checkout_session_id} for booking #${booking_id}:`, expireErr.message);
      }
    }

    // Issue fresh recovery token for the new cancel_url (resets the 2-hour window)
    const { exp: newExp, t: newTok } = makeRecoveryToken(booking_id);
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        line_items: lineItems,
        success_url: `${base}/pay/success?booking=${booking_id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${base}/pay/recover?b=${booking_id}&exp=${newExp}&t=${newTok}`,
        metadata: {
          booking_id: String(booking_id),
          // Same value the original pay-now session uses (widget.js POST
          // /bookings) — a retry is the same payment intent, not a
          // different kind of session, and the webhook only recognizes
          // this one value to advance the booking to confirmed.
          source:     'widget_payment',
        },
      },
      { stripeAccount: booking.stripe_connect_account_id },
    );

    db.prepare('UPDATE bookings SET stripe_checkout_session_id = ? WHERE id = ?')
      .run(session.id, booking_id);

    console.log(`[widget] Recovery retry — booking #${booking_id}, new session ${session.id}`);
    res.json({ checkoutUrl: session.url });
  } catch (e) {
    console.error('[widget] retry-payment error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/widget/demo/rooms ────────────────────────────────────────────────
// Always returns all 4 demo rooms as available — no auth, no DB query.
// Currently unreachable — see DEMO_ROOMS comment above.
widgetRouter.get('/demo/rooms', (_req, res) => {
  res.json(DEMO_ROOMS);
});

// ── GET /api/widget/verify-session ───────────────────────────────────────────
// Public (no auth). Called by pay/success.html on load to confirm Stripe
// actually completed the payment before showing the success message.
// Also acts as a webhook fallback — updates DB if paid but webhook hasn't fired.
widgetRouter.get('/verify-session', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const booking = db.prepare(`
    SELECT b.id, b.stripe_payment_status, b.property_id, p.booking_slug
    FROM bookings b
    JOIN properties p ON p.id = b.property_id
    WHERE b.stripe_checkout_session_id = ?
  `).get(session_id);

  if (!booking) return res.status(404).json({ error: 'Session not found' });

  const bookingSlug = booking.booking_slug ?? null;

  // If already marked paid (webhook already fired), return immediately
  if (booking.stripe_payment_status === 'paid') {
    return res.json({ paid: true, payment_status: 'paid', booking_id: booking.id, booking_slug: bookingSlug });
  }

  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  // Look up which connected account owns this property
  const owner = db.prepare(
    'SELECT stripe_connect_account_id FROM users WHERE property_id = ? AND role = ?'
  ).get(booking.property_id, 'owner');

  if (!owner?.stripe_connect_account_id) {
    return res.status(500).json({ error: 'Owner Stripe account not found' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      session_id,
      {},
      { stripeAccount: owner.stripe_connect_account_id }
    );

    const paid = session.payment_status === 'paid';
    console.log(`[verify-session] session=${session_id} payment_status=${session.payment_status} booking=${booking.id}`);

    if (paid && booking.stripe_payment_status !== 'paid') {
      db.prepare('UPDATE bookings SET stripe_payment_status = ? WHERE id = ?').run('paid', booking.id);
      console.log(`[verify-session] Booking #${booking.id} marked paid (webhook fallback)`);
    }

    res.json({ paid, payment_status: session.payment_status, booking_id: booking.id, booking_slug: bookingSlug });
  } catch (e) {
    console.error('[verify-session] Stripe error:', e.message);
    res.status(500).json({ error: 'Could not verify session' });
  }
});

// ── POST /api/widget/demo/bookings ────────────────────────────────────────────
// Accepts a booking payload, returns a realistic confirmation with a fake
// reference number, but NEVER writes to the database.
widgetRouter.post('/demo/bookings', (_req, res) => {
  const ref = 'DEMO-' + String(Math.floor(1000 + Math.random() * 9000));
  res.status(201).json({ id: ref, demo: true, status: 'cancelled' });
});
