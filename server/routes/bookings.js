import { Router } from 'express';
import db from '../db/database.js';
import { stripe } from '../lib/stripeClient.js';
import { sendBookingConfirmation, sendDepositRequest, sendDepositConfirmation, sendBookingApprovedEmail, sendBookingDeclinedEmail, sendChargesSummaryEmail, sendReceiptEmail, sendBalanceDueEmail, sendStayExtendedEmail, sendStayShortenedEmail } from '../email/emailService.js';
import { logAction, getIp } from '../utils/auditLog.js';
import { calcSeasonalTotal, calcSeasonalBreakdown, getRateForDate } from '../utils/ratePeriods.js';
import { calculateDeposit } from '../utils/deposits.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { recoveryUrl } from '../lib/recoveryToken.js';

export const bookingsRouter = Router();

bookingsRouter.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return requireVerified(req, res, next);
});


function actorFromReq(req) {
  const u = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(req.user.userId);
  return { userId: req.user.userId, userName: u?.name, userEmail: u?.email, userRole: u?.role };
}

// ── Ownership helpers ─────────────────────────────────────────────────────────
function canAccessProperty(userId, role, propId) {
  const pid = Number(propId);
  if (!pid) return false;
  if (role === 'owner') {
    if (db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?').get(pid, userId)) {
      return true;
    }
    // Fallback: legacy users whose property predates the owner_id column.
    // Check via users.property_id and backfill owner_id so future calls skip this.
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
    if (Number(u?.property_id) === pid) {
      db.prepare('UPDATE properties SET owner_id = ? WHERE id = ? AND owner_id IS NULL').run(userId, pid);
      return true;
    }
    return false;
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return Number(u?.property_id) === pid;
}

function getUserPropertyIds(userId, role) {
  if (role === 'owner') {
    const ids = db.prepare('SELECT id FROM properties WHERE owner_id = ?').all(userId).map(p => p.id);
    if (ids.length) return ids;
    // Fallback for pre-migration owners
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
    return u?.property_id ? [Number(u.property_id)] : [];
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return u?.property_id ? [Number(u.property_id)] : [];
}

// Enriched SELECT — joins guest and room info so the caller doesn't need
// to do extra lookups. Useful for the calendar and booking list views.
const ENRICHED_SELECT = `
  SELECT
    b.id,
    b.property_id,
    b.room_id,
    b.guest_id,
    b.check_in_date,
    b.check_out_date,
    b.num_guests,
    b.status,
    b.source,
    b.notes,
    b.total_price,
    b.created_at,
    b.flagged,
    b.deposit_paid,
    b.deposit_requested_at,
    b.deposit_paid_at,
    b.breakfast_added,
    b.breakfast_start_date,
    b.breakfast_guests,
    b.breakfast_price_per_person,
    b.payment_method,
    b.checked_out_at,
    b.refund_amount,
    b.refund_reason,
    b.refunded_at,
    b.refunded_by,
    b.cleaning_status,
    b.payment_status,
    b.paid_at,
    b.charges_email_sent,
    b.rate_breakdown,
    b.deposit_amount,
    b.balance_amount,
    b.balance_paid,
    b.balance_paid_at,
    b.deposit_email_sent,
    b.balance_email_sent,
    b.deposit_forfeited,
    b.stripe_checkout_session_id,
    b.stripe_payment_status,
    b.stripe_payment_amount,
    g.first_name   AS guest_first_name,
    g.last_name    AS guest_last_name,
    g.email        AS guest_email,
    g.phone        AS guest_phone,
    r.name         AS room_name,
    r.type         AS room_type,
    r.price_per_night,
    r.breakfast_included AS room_breakfast_included
  FROM bookings b
  LEFT JOIN guests g ON b.guest_id  = g.id
  LEFT JOIN rooms  r ON b.room_id   = r.id
`;

const OVERLAP_ERROR = 'This room is already booked for the selected dates. Please choose different dates or a different room.';

function hasOverlap(roomId, checkIn, checkOut, excludeId = null) {
  const sql = `
    SELECT id FROM bookings
    WHERE room_id = ?
      AND status NOT IN ('cancelled', 'checked_out', 'cancelled_unpaid')
      AND check_in_date < ?
      AND check_out_date > ?
      ${excludeId ? 'AND id != ?' : ''}
  `;
  const args = excludeId ? [roomId, checkOut, checkIn, excludeId] : [roomId, checkOut, checkIn];
  return !!db.prepare(sql).get(...args);
}

// ── GET /api/bookings/pending-count ──────────────────────────────────────────
// Returns the count of pending_owner_approval bookings for the owner's properties.
// Used by Sidebar for the live badge. Must be before /:id.
bookingsRouter.get('/pending-count', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM bookings b
      JOIN properties p ON p.id = b.property_id
      WHERE p.owner_id = ?
        AND b.status = 'pending_owner_approval'
    `).get(req.user.userId);
    res.json({ count: row.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/missed-actions ─────────────────────────────────────────
// Returns the first booking needing owner attention (missed arrival or departure).
bookingsRouter.get('/missed-actions', (req, res) => {
  try {
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const propIds = getUserPropertyIds(req.user.userId, req.user.role);
    if (!propIds.length) return res.json({ missedArrival: null, missedDeparture: null });

    const ph = propIds.map(() => '?').join(',');

    // Missed arrival: check_in was yesterday, auto-advanced to in_house, not yet actioned
    const missedArrival = db.prepare(`
      SELECT b.*, g.first_name AS guest_first_name, g.last_name AS guest_last_name
      FROM bookings b
      LEFT JOIN guests g ON g.id = b.guest_id
      WHERE b.property_id IN (${ph})
        AND b.status = 'in_house'
        AND b.check_in_date = ?
        AND (b.missed_arrival_actioned IS NULL OR b.missed_arrival_actioned = 0)
      LIMIT 1
    `).get(...propIds, yesterday);

    // Missed departure: check_out is today, still in_house
    const missedDeparture = db.prepare(`
      SELECT b.*, g.first_name AS guest_first_name, g.last_name AS guest_last_name
      FROM bookings b
      LEFT JOIN guests g ON g.id = b.guest_id
      WHERE b.property_id IN (${ph})
        AND b.status = 'in_house'
        AND b.check_out_date = ?
      LIMIT 1
    `).get(...propIds, today);

    res.json({ missedArrival: missedArrival ?? null, missedDeparture: missedDeparture ?? null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/action-missed-arrival ──────────────────────────────
// Marks a missed-arrival as actioned so the dashboard modal won't reappear.
bookingsRouter.post('/:id/action-missed-arrival', (req, res) => {
  db.prepare(`UPDATE bookings SET missed_arrival_actioned = 1 WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// ── GET /api/bookings/:id/check-extension ────────────────────────────────────
// Returns availability + cost breakdown for extending a booking's check-out date.
bookingsRouter.get('/:id/check-extension', (req, res) => {
  try {
    const { newCheckOut } = req.query;
    if (!newCheckOut) return res.status(400).json({ error: 'newCheckOut required' });

    const booking = db.prepare(`
      SELECT b.*, r.property_id,
        p.rental_type, p.whole_property_rate, p.currency, p.name AS property_name
      FROM bookings b
      JOIN rooms  r ON r.id  = b.room_id
      JOIN properties p ON p.id = r.property_id
      WHERE b.id = ?
    `).get(req.params.id);

    if (!booking) return res.status(404).json({ error: 'Not found' });
    if (newCheckOut <= booking.check_out_date) {
      return res.status(400).json({ error: 'New check-out must be later than current' });
    }

    // Clash check — any booking in the extension window (same property for WP, same room for IP)
    const clash = db.prepare(`
      SELECT b.id, g.first_name, g.last_name, b.check_in_date, b.check_out_date
      FROM bookings b
      JOIN rooms r ON r.id = b.room_id
      LEFT JOIN guests g ON g.id = b.guest_id
      WHERE r.property_id = ?
        AND b.id != ?
        AND b.status NOT IN ('cancelled','declined','cancelled_unpaid')
        AND b.check_in_date < ?
        AND b.check_out_date > ?
        AND (? = 'whole_property' OR b.room_id = ?)
    `).get(booking.property_id, booking.id, newCheckOut, booking.check_out_date, booking.rental_type, booking.room_id);

    if (clash) {
      return res.json({
        available: false,
        clash: { guest: `${clash.first_name} ${clash.last_name}`, checkIn: clash.check_in_date, checkOut: clash.check_out_date },
      });
    }

    // Calculate extra cost night by night using seasonal rate periods
    const isWP = booking.rental_type === 'whole_property';
    const bookingRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(booking.room_id);
    const baseRate = isWP ? (booking.whole_property_rate ?? 0) : (bookingRoom?.price_per_night ?? 0);

    let extraTotal = 0;
    const segments = [];
    let cur = new Date(booking.check_out_date);
    const end = new Date(newCheckOut);

    while (cur < end) {
      const dateStr = cur.toISOString().split('T')[0];
      const rateResult = getRateForDate(booking.property_id, booking.room_id, dateStr, isWP ? baseRate : null);
      const nightRate = rateResult?.rate ?? baseRate;
      extraTotal += nightRate;

      const last = segments[segments.length - 1];
      if (last && last.rate === nightRate) { last.nights++; }
      else { segments.push({ rate: nightRate, nights: 1 }); }

      cur.setDate(cur.getDate() + 1);
    }

    const extraNights = Math.ceil((new Date(newCheckOut) - new Date(booking.check_out_date)) / 86400000);
    const currentTotal = booking.total_price ?? 0;

    res.json({
      available: true,
      extraNights,
      extraTotal:   Math.round(extraTotal   * 100) / 100,
      currentTotal,
      newTotal:     Math.round((currentTotal + extraTotal) * 100) / 100,
      segments,
      currency:     booking.currency ?? 'GBP',
    });
  } catch (err) {
    console.error('[check-extension] ERROR:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/counts ──────────────────────────────────────────────────
// Returns per-status counts for filter pill badges.
// Must be defined BEFORE /:id so Express doesn't treat "counts" as an id param.
bookingsRouter.get('/counts', (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id required' });
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const base = `FROM bookings b WHERE b.property_id = ?`;
    res.json({
      all:              db.prepare(`SELECT COUNT(*) as n ${base}`).get(property_id).n,
      arriving:         db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'arriving' AND b.check_in_date = date('now')`).get(property_id).n,
      in_house:         db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'in_house'`).get(property_id).n,
      confirmed:        db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'confirmed'`).get(property_id).n,
      checked_out:      db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'checked_out'`).get(property_id).n,
      cancelled:        db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'cancelled'`).get(property_id).n,
      pending:          db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'pending_owner_approval'`).get(property_id).n,
      cancelled_unpaid: db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'cancelled_unpaid'`).get(property_id).n,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings ─────────────────────────────────────────────────────────
// Query params (all optional):
//   property_id  — filter by property
//   status       — raw status filter (for calendar/dashboard backward compat)
//   room_id      — filter by room
//   from / to    — date range
//   filter       — named tab filter: arriving | in_house | confirmed | checked_out | cancelled
//   search       — guest name search
//   page / limit — when present returns paginated object {bookings,total,page,totalPages}
//                  when absent returns plain array (backward compat)
bookingsRouter.get('/', (req, res) => {
  try {
    const { property_id, status, room_id, from, to, filter, search, page, limit } = req.query;
    const conditions = [];
    const params     = [];

    if (property_id) {
      if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      conditions.push('b.property_id = ?');
      params.push(property_id);
    } else {
      const propIds = getUserPropertyIds(req.user.userId, req.user.role);
      if (!propIds.length) {
        return page ? res.json({ bookings: [], total: 0, page: 1, totalPages: 0 }) : res.json([]);
      }
      const placeholders = propIds.map(() => '?').join(',');
      conditions.push(`b.property_id IN (${placeholders})`);
      params.push(...propIds);
    }

    if (status)  { conditions.push('b.status = ?');          params.push(status); }
    if (room_id) { conditions.push('b.room_id = ?');         params.push(room_id); }
    if (from)    { conditions.push('b.check_in_date >= ?');  params.push(from); }
    if (to)      { conditions.push('b.check_out_date <= ?'); params.push(to); }

    // Named filter tab — maps to status + optional date conditions (no user input in SQL)
    if (filter && filter !== 'all') {
      switch (filter) {
        case 'arriving':         conditions.push("b.status = 'arriving'"); break;
        case 'in_house':         conditions.push("b.status = 'in_house'"); break;
        case 'confirmed':        conditions.push("b.status = 'confirmed'");   break;
        case 'checked_out':      conditions.push("b.status = 'checked_out'"); break;
        case 'cancelled':        conditions.push("b.status = 'cancelled'");   break;
        case 'pending':          conditions.push("b.status = 'pending_owner_approval'"); break;
        case 'cancelled_unpaid': conditions.push("b.status = 'cancelled_unpaid'"); break;
      }
    }

    if (search) {
      conditions.push("(g.first_name || ' ' || g.last_name) LIKE ?");
      params.push(`%${search}%`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    if (page) {
      const pageNum   = Math.max(1, Number(page));
      const pageLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const offset    = (pageNum - 1) * pageLimit;

      const countSql = `SELECT COUNT(*) as n FROM bookings b LEFT JOIN guests g ON b.guest_id = g.id LEFT JOIN rooms r ON b.room_id = r.id ${where}`;
      const total = db.prepare(countSql).get(...params).n;
      const rows  = db.prepare(
        `${ENRICHED_SELECT} ${where} ORDER BY b.check_in_date DESC LIMIT ? OFFSET ?`
      ).all(...params, pageLimit, offset);

      return res.json({ bookings: rows, total, page: pageNum, totalPages: Math.ceil(total / pageLimit) });
    }

    const rows = db.prepare(`${ENRICHED_SELECT} ${where} ORDER BY b.check_in_date`).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/booked-rooms ───────────────────────────────────────
// Returns array of room_ids with overlapping active bookings — used by
// NewBookingModal to hide unavailable rooms from the dropdown.
bookingsRouter.get('/booked-rooms', (req, res) => {
  try {
    const { property_id, check_in_date, check_out_date } = req.query;
    if (!property_id || !check_in_date || !check_out_date) {
      return res.status(400).json({ error: 'property_id, check_in_date and check_out_date are required' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const rows = db.prepare(`
      SELECT DISTINCT room_id FROM bookings
      WHERE property_id = ?
        AND room_id IS NOT NULL
        AND status NOT IN ('cancelled', 'checked_out', 'cancelled_unpaid')
        AND check_in_date < ?
        AND check_out_date > ?
    `).all(property_id, check_out_date, check_in_date);
    res.json(rows.map((r) => r.room_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/check ───────────────────────────────────────────────
// Pre-flight availability check used by NewBookingModal.
// Query params: room_id, check_in_date, check_out_date, exclude_id (optional)
bookingsRouter.get('/check', (req, res) => {
  try {
    const { room_id, check_in_date, check_out_date, exclude_id } = req.query;
    if (!room_id || !check_in_date || !check_out_date) {
      return res.status(400).json({ error: 'room_id, check_in_date and check_out_date are required' });
    }
    if (hasOverlap(Number(room_id), check_in_date, check_out_date, exclude_id ? Number(exclude_id) : null)) {
      return res.json({ available: false });
    }
    // Also check external iCal blocks
    const room = db.prepare('SELECT property_id FROM rooms WHERE id = ?').get(Number(room_id));
    if (room) {
      const externalBlock = db.prepare(`
        SELECT id FROM ical_blocks
        WHERE property_id = ?
          AND (room_id IS NULL OR room_id = ?)
          AND start_date < ?
          AND end_date > ?
      `).get(room.property_id, Number(room_id), check_out_date, check_in_date);
      if (externalBlock) return res.json({ available: false, reason: 'external_block' });
    }
    res.json({ available: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/wp-summary ─────────────────────────────────────────────
// Returns active booking, next booking, pending requests, and month stats
// for the user's whole_property rental. Must be BEFORE /:id.
bookingsRouter.get('/wp-summary', (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];
    const propIds = getUserPropertyIds(userId, req.user.role);
    if (!propIds.length) return res.json({ active: null, next: null, pending: [], stats: null });

    const placeholders = propIds.map(() => '?').join(',');
    const prop = db.prepare(
      `SELECT id FROM properties WHERE id IN (${placeholders}) AND rental_type = 'whole_property'`
    ).get(...propIds);
    if (!prop) return res.json({ active: null, next: null, pending: [], stats: null });

    const propId = prop.id;

    const active = db.prepare(`
      SELECT b.id, b.check_in_date, b.check_out_date, b.num_guests, b.status, b.total_price, b.notes,
             g.first_name AS guest_first_name, g.last_name AS guest_last_name,
             g.email AS guest_email, g.phone AS guest_phone
      FROM bookings b
      LEFT JOIN guests g ON b.guest_id = g.id
      WHERE b.property_id = ?
        AND b.check_in_date <= ?
        AND b.check_out_date > ?
        AND b.status IN ('arriving', 'in_house', 'confirmed')
      ORDER BY
        CASE b.status WHEN 'in_house' THEN 1 WHEN 'arriving' THEN 2 ELSE 3 END ASC,
        b.check_in_date ASC
      LIMIT 1
    `).get(propId, today, today);

    const next14Days = db.prepare(`
      SELECT b.id, b.check_in_date, b.check_out_date, b.num_guests, b.status, b.total_price, b.notes,
             g.first_name AS guest_first_name, g.last_name AS guest_last_name,
             g.email AS guest_email, g.phone AS guest_phone
      FROM bookings b
      LEFT JOIN guests g ON b.guest_id = g.id
      WHERE b.property_id = ?
        AND b.check_in_date > ?
        AND b.check_in_date <= date(?, '+14 days')
        AND b.status IN ('confirmed', 'pending_owner_approval')
      ORDER BY b.check_in_date ASC
    `).all(propId, today, today);

    const pending = db.prepare(`
      SELECT b.id, b.check_in_date, b.check_out_date, b.num_guests, b.total_price,
             g.first_name AS guest_first_name, g.last_name AS guest_last_name
      FROM bookings b
      LEFT JOIN guests g ON b.guest_id = g.id
      WHERE b.property_id = ? AND b.status = 'pending_owner_approval'
      ORDER BY b.check_in_date ASC
    `).all(propId);

    const monthStart = today.slice(0, 7) + '-01';
    const statsRow = db.prepare(`
      SELECT
        COUNT(*) AS bookings_count,
        SUM(CAST(julianday(check_out_date) - julianday(check_in_date) AS INTEGER)) AS nights_count,
        SUM(total_price) AS revenue
      FROM bookings
      WHERE property_id = ?
        AND check_in_date >= ?
        AND check_in_date <= ?
        AND status NOT IN ('cancelled', 'cancelled_unpaid')
    `).get(propId, monthStart, today);

    res.json({
      active: active || null,
      next: next14Days[0] || null,
      upcoming: next14Days,
      pending,
      stats: {
        bookingsThisMonth: statsRow.bookings_count || 0,
        nightsBookedThisMonth: statsRow.nights_count || 0,
        revenueThisMonth: statsRow.revenue || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/payments-summary ────────────────────────────────────
bookingsRouter.get('/payments-summary', (req, res) => {
  try {
    const propIds = getUserPropertyIds(req.user.userId, req.user.role);
    if (!propIds.length) return res.json({ rows: [] });
    const placeholders = propIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT
        b.id,
        b.property_id,
        b.check_in_date,
        b.check_out_date,
        b.status,
        b.deposit_paid,
        b.deposit_amount,
        b.balance_amount,
        b.balance_paid,
        b.deposit_requested_at,
        g.first_name AS guest_first_name,
        g.last_name  AS guest_last_name
      FROM bookings b
      LEFT JOIN guests g ON g.id = b.guest_id
      WHERE b.property_id IN (${placeholders})
        AND b.status NOT IN ('cancelled', 'cancelled_unpaid')
        AND (
          b.deposit_requested_at IS NOT NULL
          OR b.deposit_paid = 1
          OR b.deposit_amount IS NOT NULL
        )
      ORDER BY b.check_in_date DESC
      LIMIT 100
    `).all(...propIds);
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bookings/:id ─────────────────────────────────────────────────
bookingsRouter.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/import ─────────────────────────────────────────────
bookingsRouter.post('/import', (req, res) => {
  try {
    const { property_id, rows, room_map } = req.body;
    if (!property_id || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Missing property_id or rows' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Detect WP mode and resolve fixed room_id up-front
    const property = db.prepare('SELECT rental_type FROM properties WHERE id = ?').get(property_id);
    const isWP = property?.rental_type === 'whole_property';
    let wpRoomId = null;
    if (isWP) {
      const firstRoom = db.prepare('SELECT id FROM rooms WHERE property_id = ? ORDER BY id ASC LIMIT 1').get(property_id);
      if (!firstRoom) return res.status(400).json({ error: 'No rooms found for this property' });
      wpRoomId = firstRoom.id;
    }

    // Prepared statements
    const findGuest   = db.prepare('SELECT id FROM guests WHERE email = ? AND property_id = ? AND deleted = 0 LIMIT 1');
    const insertGuest = db.prepare('INSERT INTO guests (first_name, last_name, email, phone, property_id) VALUES (?,?,?,?,?)');
    const overlapChk  = db.prepare(`
      SELECT id FROM bookings
      WHERE room_id = ? AND property_id = ? AND status NOT IN ('cancelled','declined','cancelled_unpaid')
        AND check_in_date < ? AND check_out_date > ?
    `);
    const insertBook  = db.prepare(`
      INSERT INTO bookings
        (property_id, room_id, guest_id, check_in_date, check_out_date,
         num_guests, status, source, notes, total_price)
      VALUES (?,?,?,?,?,1,?,?,?,?)
    `);

    function normaliseStatus(raw) {
      const s = (raw ?? '').trim().toLowerCase();
      if (/^(confirmed?|con|yes)$/.test(s))                    return 'confirmed';
      if (/^(pending|tentative)$/.test(s))                     return 'pending_owner_approval';
      if (/^(cancell?ed?|canc|no)$/.test(s))                   return 'cancelled';
      if (/^(checked_out|complete[d]?|done)$/.test(s))         return 'checked_out';
      return 'confirmed';
    }

    function parseDate(raw) {
      if (!raw) return null;
      const s = raw.trim();
      // ISO YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // D/M/YYYY, DD/MM/YYYY, D/M/YY, DD/MM/YY (slash-separated)
      const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (slash) {
        const day = slash[1].padStart(2, '0');
        const mon = slash[2].padStart(2, '0');
        let yr = slash[3];
        if (yr.length === 2) yr = parseInt(yr) < 50 ? `20${yr}` : `19${yr}`;
        return `${yr}-${mon}-${day}`;
      }
      // D-M-YYYY, DD-MM-YYYY, D-M-YY, DD-MM-YY (dash-separated, European)
      const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
      if (dash) {
        const day = dash[1].padStart(2, '0');
        const mon = dash[2].padStart(2, '0');
        let yr = dash[3];
        if (yr.length === 2) yr = parseInt(yr) < 50 ? `20${yr}` : `19${yr}`;
        return `${yr}-${mon}-${day}`;
      }
      return null;
    }

    function splitName(full) {
      const parts = (full ?? '').trim().split(/\s+/);
      if (parts.length === 1) return { first: parts[0], last: '.' };
      return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
    }

    let imported = 0, skipped = 0;
    const errors = [];

    db.exec('BEGIN');
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Resolve room_id: WP uses fixed first room; IP uses client room_map
        let room_id;
        if (isWP) {
          room_id = wpRoomId;
        } else {
          const roomName  = (row.room ?? '').trim();
          const roomIdRaw = (room_map ?? {})[roomName];
          if (!roomIdRaw || roomIdRaw === 'skip') { skipped++; continue; }
          room_id = Number(roomIdRaw);
        }

        const check_in  = parseDate(row.check_in);
        const check_out = parseDate(row.check_out);
        if (!check_in || !check_out || check_in >= check_out) {
          errors.push(`Row ${i + 2}: invalid dates (${row.check_in} – ${row.check_out})`);
          continue;
        }

        const guestName = (row.guest_name ?? '').trim();
        if (!guestName) { errors.push(`Row ${i + 2}: missing guest name`); continue; }

        // Overlap check
        if (overlapChk.get(room_id, property_id, check_out, check_in)) {
          skipped++;
          continue;
        }

        // Find or create guest
        const email = (row.guest_email ?? '').trim().toLowerCase() || null;
        let guest_id;
        const phone = (row.guest_phone ?? '').trim().replace(/[^\d+\s\-()]/g, '') || null;
        if (email) {
          const existing = findGuest.get(email, property_id);
          if (existing) {
            guest_id = existing.id;
          } else {
            const { first, last } = splitName(guestName);
            guest_id = insertGuest.run(first, last, email, phone, property_id).lastInsertRowid;
          }
        } else {
          const { first, last } = splitName(guestName);
          guest_id = insertGuest.run(first, last, null, phone, property_id).lastInsertRowid;
        }

        const status      = normaliseStatus(row.status);
        const total_price = parseFloat(row.total_stay_amount) || null;
        const notes       = (row.notes ?? '').trim() || null;

        insertBook.run(property_id, room_id, guest_id, check_in, check_out, status, 'other', notes, total_price);
        imported++;
      }
      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }

    res.json({ imported, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings ────────────────────────────────────────────────────
bookingsRouter.post('/', (req, res) => {
  try {
    const {
      property_id, guest_id,
      check_in_date, check_out_date,
      num_guests, status, source, notes, total_price, breakfast_added,
      breakfast_start_date, breakfast_guests, breakfast_price_per_person
    } = req.body;

    if (!property_id || !guest_id || !check_in_date || !check_out_date) {
      return res.status(400).json({
        error: 'property_id, guest_id, check_in_date and check_out_date are required'
      });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // For whole_property rentals, auto-assign to the first room if room_id not provided
    let room_id = req.body.room_id;
    const prop = db.prepare('SELECT rental_type, whole_property_rate FROM properties WHERE id = ?').get(property_id);
    if (prop?.rental_type === 'whole_property' && !room_id) {
      const firstRoom = db.prepare('SELECT id FROM rooms WHERE property_id = ? ORDER BY id LIMIT 1').get(property_id);
      room_id = firstRoom?.id;
    }

    if (!room_id) {
      return res.status(400).json({ error: 'room_id is required' });
    }

    if (check_out_date <= check_in_date) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    if (hasOverlap(Number(room_id), check_in_date, check_out_date)) {
      return res.status(409).json({ error: OVERLAP_ERROR });
    }

    let finalTotalPrice = total_price ?? null;
    let rateBreakdownStr = null;
    if (room_id) {
      const isWPProp = prop?.rental_type === 'whole_property';
      const baseRate = isWPProp ? (prop.whole_property_rate ?? 0) : null;
      const { total: computedTotal, breakdown } = calcSeasonalBreakdown(
        Number(property_id), Number(room_id), check_in_date, check_out_date, baseRate
      );
      if (!finalTotalPrice) finalTotalPrice = computedTotal;
      rateBreakdownStr = JSON.stringify(breakdown);
    }

    const result = db.prepare(`
      INSERT INTO bookings
        (property_id, room_id, guest_id, check_in_date, check_out_date,
         num_guests, status, source, notes, total_price, rate_breakdown,
         breakfast_added, breakfast_start_date, breakfast_guests, breakfast_price_per_person)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, room_id, guest_id,
      check_in_date, check_out_date,
      num_guests      ?? 1,
      status          ?? 'confirmed',
      source          ?? 'direct',
      notes           ?? null,
      finalTotalPrice,
      rateBreakdownStr,
      breakfast_added ? 1 : 0,
      breakfast_start_date         ?? null,
      breakfast_guests             ?? 0,
      breakfast_price_per_person   ?? 0
    );

    const newBooking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(result.lastInsertRowid);
    res.status(201).json(newBooking);

    const actor = actorFromReq(req);
    logAction(db, {
      ...actor,
      propertyId: newBooking.property_id,
      action: 'BOOKING_CREATED',
      category: 'booking',
      targetType: 'booking',
      targetId: newBooking.id,
      targetName: `${newBooking.guest_first_name} ${newBooking.guest_last_name} — ${newBooking.room_name ?? ''}`,
      detail: `${newBooking.check_in_date} → ${newBooking.check_out_date}`,
      ipAddress: getIp(req),
    });

    // Fire-and-forget — email must not delay or break the HTTP response
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(newBooking.property_id);
    sendBookingConfirmation(newBooking, property).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/approve — in-app, authenticated ───────────────────
bookingsRouter.post('/:id/approve', async (req, res) => {
  try {
    const existing = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, existing.property_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (existing.status !== 'pending_owner_approval') {
      return res.status(400).json({ error: 'Booking is not awaiting approval' });
    }

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(existing.property_id);
    if (property?.deposit_enabled) {
      const { depositAmount, balanceAmount } = calculateDeposit(property, existing.total_price);
      const now = new Date().toISOString();
      db.prepare(`UPDATE bookings SET status = 'confirmed', deposit_amount = ?, balance_amount = ?, deposit_requested_at = ? WHERE id = ?`)
        .run(depositAmount, balanceAmount, now, req.params.id);
      const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
      if (property.deposit_auto_email) {
        sendDepositRequest(updated, property).catch(() => {});
        db.prepare(`UPDATE bookings SET deposit_email_sent = datetime('now') WHERE id = ?`).run(req.params.id);
      }
      return res.json(updated);
    }

    db.prepare(`UPDATE bookings SET status = 'confirmed' WHERE id = ?`).run(req.params.id);
    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    sendBookingApprovedEmail(updated, property).catch(() => {});
    console.log(`[booking] #${req.params.id} approved in-app`);
    res.json(updated);
  } catch (err) {
    console.error('[booking] in-app approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/decline — in-app, authenticated ───────────────────
bookingsRouter.post('/:id/decline', async (req, res) => {
  try {
    const existing = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, existing.property_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (existing.status !== 'pending_owner_approval') {
      return res.status(400).json({ error: 'Booking is not awaiting approval' });
    }

    db.prepare(`UPDATE bookings SET status = 'declined' WHERE id = ?`).run(req.params.id);
    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(updated.property_id);
    sendBookingDeclinedEmail(updated, property).catch(() => {});
    console.log(`[booking] #${req.params.id} declined in-app`);
    res.json(updated);
  } catch (err) {
    console.error('[booking] in-app decline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/bookings/:id ─────────────────────────────────────────────────
bookingsRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Booking not found' });

    const {
      room_id, guest_id, check_in_date, check_out_date,
      num_guests, status, source, notes, total_price, breakfast_added,
      breakfast_start_date, breakfast_guests, breakfast_price_per_person,
      payment_method, checked_out_at, _wp_action,
    } = req.body;

    // WP approve/decline from dashboard — status-only update + email
    if (_wp_action === 'approve' || _wp_action === 'decline') {
      const newStatus = _wp_action === 'approve' ? 'confirmed' : 'declined';

      if (_wp_action === 'approve') {
        const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(existing.property_id);
        if (property?.deposit_enabled) {
          const { depositAmount, balanceAmount } = calculateDeposit(property, existing.total_price);
          const now = new Date().toISOString();
          db.prepare(`
            UPDATE bookings SET status = ?, deposit_amount = ?, balance_amount = ?, deposit_requested_at = ?
            WHERE id = ?
          `).run(newStatus, depositAmount, balanceAmount, now, req.params.id);
          const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
          res.json(updated);
          if (property.deposit_auto_email) {
            sendDepositRequest(updated, property).catch(() => {});
            db.prepare(`UPDATE bookings SET deposit_email_sent = datetime('now') WHERE id = ?`).run(req.params.id);
          }
        } else {
          db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(newStatus, req.params.id);
          const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
          res.json(updated);
          sendBookingApprovedEmail(updated, property).catch(() => {});
        }
      } else {
        db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(newStatus, req.params.id);
        const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
        res.json(updated);
        const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(updated.property_id);
        sendBookingDeclinedEmail(updated, property).catch(() => {});
      }
      return;
    }

    // WP arrival — guests have the key
    if (_wp_action === 'wp_checkin') {
      const todayIso = new Date().toISOString().split('T')[0];
      if (todayIso < existing.check_in_date) {
        return res.status(400).json({
          error: `Cannot confirm arrival before check-in date (${existing.check_in_date})`,
        });
      }
      db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('in_house', req.params.id);
      const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
      return res.json(updated);
    }

    // WP departure — guests have left and returned the key
    if (_wp_action === 'wp_departure') {
      const todayIso = new Date().toISOString().split('T')[0];
      if (todayIso < existing.check_out_date) {
        return res.status(400).json({
          error: `Cannot confirm departure before check-out date (${existing.check_out_date}). To shorten the stay, use Edit booking.`,
        });
      }
      const now = new Date().toISOString();
      db.prepare('UPDATE bookings SET status = ?, checked_out_at = ? WHERE id = ?')
        .run('checked_out', now, req.params.id);
      const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
      res.json(updated);

      // Fire-and-forget charges summary email if outstanding charges exist
      const property  = db.prepare('SELECT * FROM properties WHERE id = ?').get(updated.property_id);
      const ownerRow  = db.prepare('SELECT email FROM users WHERE id = ?').get(property?.owner_id);
      const wpCharges = db.prepare(`
        SELECT rc.*, sc.name AS category_name
        FROM room_charges rc
        LEFT JOIN service_categories sc ON sc.id = rc.category_id
        WHERE rc.booking_id = ?
      `).all(updated.id);
      const outstanding = wpCharges.filter((c) => !c.voided_at);
      if (outstanding.length > 0 && !existing.charges_email_sent) {
        sendChargesSummaryEmail(updated, property, wpCharges, ownerRow?.email ?? '').catch(() => {});
        db.prepare(`UPDATE bookings SET charges_email_sent = datetime('now') WHERE id = ?`).run(updated.id);
      }
      return;
    }

    // WP cleaning status update
    if (_wp_action === 'wp_cleaning') {
      const { cleaning_status } = req.body;
      if (!cleaning_status) return res.status(400).json({ error: 'cleaning_status required' });
      db.prepare('UPDATE bookings SET cleaning_status = ? WHERE id = ?')
        .run(cleaning_status, req.params.id);
      const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
      return res.json(updated);
    }

    if (check_out_date <= check_in_date) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    // Date guardrails for status transitions — applies to all rental types
    if (status && status !== existing.status) {
      const todayIso = new Date().toISOString().split('T')[0];
      if ((status === 'arriving' || status === 'in_house') && todayIso < existing.check_in_date) {
        return res.status(400).json({
          error: `Cannot check in before arrival date (${existing.check_in_date})`,
        });
      }
      if ((status === 'arriving' || status === 'in_house') && todayIso === existing.check_in_date) {
        const prop = db.prepare('SELECT check_in_time FROM properties WHERE id = ?').get(existing.property_id);
        const checkInTime = prop?.check_in_time || '15:00';
        const nowTime = new Date().toTimeString().slice(0, 5);
        if (nowTime < checkInTime) {
          return res.status(400).json({
            error: `Check-in opens at ${checkInTime}. Current time is ${nowTime}.`,
          });
        }
      }
      if (status === 'checked_out' && todayIso < existing.check_out_date) {
        return res.status(400).json({
          error: `Cannot check out before departure date (${existing.check_out_date}). Edit the booking to shorten the stay.`,
        });
      }
    }

    if (hasOverlap(Number(room_id), check_in_date, check_out_date, Number(req.params.id))) {
      return res.status(409).json({ error: OVERLAP_ERROR });
    }

    const isExtension  = check_out_date != null && check_out_date > existing.check_out_date;
    const isShortening = check_out_date != null && check_out_date < existing.check_out_date;

    // Recalculate total_price and rate_breakdown when dates change
    let finalTotalPrice = total_price;
    let rateBreakdownStr = null;
    const newCheckIn  = check_in_date  ?? existing.check_in_date;
    const newCheckOut = check_out_date ?? existing.check_out_date;
    if (newCheckIn !== existing.check_in_date || newCheckOut !== existing.check_out_date) {
      const prop = db.prepare('SELECT rental_type, whole_property_rate FROM properties WHERE id = ?').get(existing.property_id);
      const isWPProp = prop?.rental_type === 'whole_property';
      const baseRate = isWPProp ? (prop.whole_property_rate ?? 0) : null;
      const { total: computedTotal, breakdown } = calcSeasonalBreakdown(
        existing.property_id, existing.room_id, newCheckIn, newCheckOut, baseRate
      );
      finalTotalPrice = computedTotal;
      rateBreakdownStr = JSON.stringify(breakdown);
    }

    db.prepare(`
      UPDATE bookings
      SET room_id = ?, guest_id = ?, check_in_date = ?, check_out_date = ?,
          num_guests = ?, status = ?, source = ?, notes = ?, total_price = ?,
          rate_breakdown = COALESCE(?, rate_breakdown),
          breakfast_added = ?, breakfast_start_date = ?, breakfast_guests = ?,
          breakfast_price_per_person = ?,
          payment_method = ?,
          checked_out_at = COALESCE(?, checked_out_at)
      WHERE id = ?
    `).run(
      room_id, guest_id, check_in_date, check_out_date,
      num_guests, status, source, notes, finalTotalPrice,
      rateBreakdownStr,
      breakfast_added ? 1 : 0,
      breakfast_start_date         ?? null,
      breakfast_guests             ?? 0,
      breakfast_price_per_person   ?? existing.breakfast_price_per_person ?? 0,
      payment_method ?? null,
      checked_out_at ?? null,
      req.params.id
    );

    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    res.json(updated);

    const actor = actorFromReq(req);
    const targetName = `${updated.guest_first_name} ${updated.guest_last_name} — ${updated.room_name ?? ''}`;
    let auditAction = 'BOOKING_EDITED';
    if (status && status !== existing.status) {
      if (status === 'cancelled')   auditAction = 'BOOKING_CANCELLED';
      else if (status === 'arriving')    auditAction = 'GUEST_CHECKED_IN';
      else if (status === 'checked_out') auditAction = 'GUEST_CHECKED_OUT';
    } else if (breakfast_added && !existing.breakfast_added) {
      auditAction = 'BREAKFAST_ADDED';
    }
    logAction(db, {
      ...actor,
      propertyId: updated.property_id,
      action: auditAction,
      category: 'booking',
      targetType: 'booking',
      targetId: updated.id,
      targetName,
      beforeValue: { status: existing.status },
      afterValue:  { status: updated.status },
      ipAddress: getIp(req),
    });

    // Fire-and-forget guest email when check-out date changed
    if ((isExtension || isShortening) && updated.guest_email) {
      const propFull   = db.prepare('SELECT * FROM properties WHERE id = ?').get(existing.property_id);
      const ownerEmail = db.prepare('SELECT email FROM users WHERE id = ?').get(propFull?.owner_id)?.email ?? '';
      // Pass old check_out_date so email shows "previous check-out" correctly
      const emailBooking = { ...updated, check_out_date: existing.check_out_date };
      if (isExtension) {
        sendStayExtendedEmail(emailBooking, propFull, newCheckOut, finalTotalPrice, ownerEmail).catch(() => {});
      } else {
        sendStayShortenedEmail(emailBooking, propFull, newCheckOut, finalTotalPrice, ownerEmail).catch(() => {});
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/request-deposit ────────────────────────────────
bookingsRouter.post('/:id/request-deposit', (req, res) => {
  try {
    const booking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, booking.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE bookings SET deposit_requested_at = ? WHERE id = ?`).run(now, req.params.id);

    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: booking.property_id,
      action: 'DEPOSIT_REQUESTED',
      category: 'booking',
      targetType: 'booking',
      targetId: booking.id,
      targetName: `${booking.guest_first_name} ${booking.guest_last_name}`,
      ipAddress: getIp(req),
    });

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(booking.property_id);
    sendDepositRequest(updated, property).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/mark-deposit-paid ──────────────────────────────
bookingsRouter.post('/:id/mark-deposit-paid', (req, res) => {
  try {
    const booking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, booking.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const now = new Date().toISOString();
    const isFullyPaid = (booking.balance_amount ?? 0) === 0;
    if (isFullyPaid) {
      db.prepare(`UPDATE bookings SET deposit_paid = 1, deposit_paid_at = ?, balance_paid = 1, balance_paid_at = ? WHERE id = ?`)
        .run(now, now, req.params.id);
    } else {
      db.prepare(`UPDATE bookings SET deposit_paid = 1, deposit_paid_at = ? WHERE id = ?`)
        .run(now, req.params.id);
    }

    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: booking.property_id,
      action: 'DEPOSIT_PAID',
      category: 'booking',
      targetType: 'booking',
      targetId: booking.id,
      targetName: `${booking.guest_first_name} ${booking.guest_last_name}`,
      ipAddress: getIp(req),
    });

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(booking.property_id);
    sendDepositConfirmation(updated, property).catch(() => {});

    // If balance is owed and auto-email enabled, schedule balance due reminder email
    if (property?.deposit_balance_auto_email && updated.balance_amount > 0) {
      // Balance email is sent by the scheduler; just mark it as pending here
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/mark-paid-full ────────────────────────────────
// One-action shortcut: marks both deposit and balance as received and sends receipt email.
bookingsRouter.post('/:id/mark-paid-full', (req, res) => {
  try {
    const booking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, booking.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const now        = new Date().toISOString();
    const totalPrice = parseFloat(booking.total_price) || 0;
    const depAmount  = (booking.deposit_amount && booking.deposit_amount > 0)
      ? booking.deposit_amount
      : totalPrice;

    db.prepare(`
      UPDATE bookings SET
        deposit_paid = 1, deposit_paid_at = ?,
        balance_paid = 1, balance_paid_at = ?,
        deposit_amount = ?, balance_amount = 0
      WHERE id = ?
    `).run(now, now, depAmount, req.params.id);

    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    res.json(updated);

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(booking.property_id);
    const ownerRow = db.prepare('SELECT email FROM users WHERE id = ?').get(property?.owner_id);
    const charges  = db.prepare(`
      SELECT rc.*, sc.name AS category_name
      FROM room_charges rc
      LEFT JOIN service_categories sc ON sc.id = rc.category_id
      WHERE rc.booking_id = ?
    `).all(booking.id);
    sendReceiptEmail(updated, property, charges, ownerRow?.email ?? '').catch(() => {});

    logAction(db, {
      ...actorFromReq(req),
      propertyId: booking.property_id,
      action: 'PAID_IN_FULL',
      category: 'booking',
      targetType: 'booking',
      targetId: booking.id,
      targetName: `${booking.guest_first_name} ${booking.guest_last_name}`,
      detail: `Marked as paid in full`,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/resend-deposit ─────────────────────────────────
bookingsRouter.post('/:id/resend-deposit', (req, res) => {
  try {
    const booking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, booking.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(booking.property_id);
    sendDepositRequest(booking, property).catch(() => {});
    db.prepare(`UPDATE bookings SET deposit_email_sent = datetime('now') WHERE id = ?`).run(req.params.id);

    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: booking.property_id,
      action: 'DEPOSIT_RESENT',
      category: 'booking',
      targetType: 'booking',
      targetId: booking.id,
      targetName: `${booking.guest_first_name} ${booking.guest_last_name}`,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/mark-balance-paid ──────────────────────────────
bookingsRouter.post('/:id/mark-balance-paid', (req, res) => {
  try {
    const booking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, booking.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (booking.balance_paid) {
      return res.status(400).json({ error: 'Balance is already marked as paid.' });
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE bookings SET balance_paid = 1, balance_paid_at = ? WHERE id = ?`).run(now, req.params.id);

    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: booking.property_id,
      action: 'BALANCE_PAID',
      category: 'booking',
      targetType: 'booking',
      targetId: booking.id,
      targetName: `${booking.guest_first_name} ${booking.guest_last_name}`,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/refund ─────────────────────────────────────────
// Owner-only. Records a refund against a checked-in or checked-out booking.
bookingsRouter.post('/:id/refund', (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required.' });
    }

    const booking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, booking.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!['arriving', 'in_house', 'checked_out'].includes(booking.status)) {
      return res.status(400).json({ error: 'Refunds can only be recorded for checked-in or checked-out bookings.' });
    }

    const { amount, reason } = req.body;
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'A positive refund amount is required.' });
    }

    const actor = actorFromReq(req);
    const now   = new Date().toISOString();
    db.prepare(`
      UPDATE bookings
      SET refund_amount = ?, refund_reason = ?, refunded_at = ?, refunded_by = ?
      WHERE id = ?
    `).run(amt, reason ?? null, now, actor.userName ?? null, req.params.id);

    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actor,
      propertyId: booking.property_id,
      action: 'REFUND_RECORDED',
      category: 'booking',
      targetType: 'booking',
      targetId: booking.id,
      targetName: `${booking.guest_first_name} ${booking.guest_last_name} — ${booking.room_name ?? ''}`,
      detail: `Amount: ${amt.toFixed(2)}${reason ? ` — ${reason}` : ''}`,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bookings/:id/create-payment-link ───────────────────────────────
// Owner only. Creates a Stripe-hosted payment link charged to the owner's
// connected account — NestBook never touches the money.
bookingsRouter.post('/:id/create-payment-link', async (req, res) => {
  try {
    const booking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, booking.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const { amount, description } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const owner = db.prepare(
      'SELECT stripe_connect_account_id, stripe_connect_status FROM users WHERE id = ?'
    ).get(req.user.userId);
    if (!owner?.stripe_connect_account_id || owner.stripe_connect_status !== 'active') {
      return res.status(400).json({ error: 'Stripe Connect not set up' });
    }

    const property = db.prepare('SELECT currency FROM properties WHERE id = ?').get(booking.property_id);
    const currency = (property?.currency || 'EUR').toLowerCase();

    const baseUrl = process.env.APP_URL || 'https://nestbook.io';
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency,
            product_data: {
              name: description || `Booking #${booking.id} — ${booking.guest_first_name} ${booking.guest_last_name}`,
            },
            unit_amount: Math.round(amt * 100),
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/pay/success?booking=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  recoveryUrl(baseUrl, booking.id),
        metadata: {
          booking_id:        String(booking.id),
          nestbook_owner_id: String(req.user.userId),
        },
      },
      { stripeAccount: owner.stripe_connect_account_id }
    );

    db.prepare('UPDATE bookings SET stripe_checkout_session_id = ?, stripe_payment_status = ?, stripe_payment_amount = ? WHERE id = ?')
      .run(session.id, 'pending', amt, booking.id);

    console.log(`[stripe] Payment link created for booking ${booking.id} — ${currency} ${amt}`);
    res.json({ url: session.url });
  } catch (e) {
    console.error('[stripe] create-payment-link error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/bookings/:id/mark-paid ─────────────────────────────────────────
// Owner/reception only. Marks WP booking as paid and fires receipt email.
bookingsRouter.post('/:id/mark-paid', (req, res) => {
  try {
    const booking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, booking.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (req.user.role === 'charges_staff') {
      return res.status(403).json({ error: 'Only owners and reception can mark bookings as paid.' });
    }
    if (booking.payment_status === 'paid') {
      return res.status(400).json({ error: 'Booking is already marked as paid.' });
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE bookings SET payment_status = 'paid', paid_at = ? WHERE id = ?`)
      .run(now, req.params.id);

    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    res.json(updated);

    // Fire-and-forget receipt email
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(booking.property_id);
    const ownerRow = db.prepare('SELECT email FROM users WHERE id = ?').get(property?.owner_id);
    const charges  = db.prepare(`
      SELECT rc.*, sc.name AS category_name
      FROM room_charges rc
      LEFT JOIN service_categories sc ON sc.id = rc.category_id
      WHERE rc.booking_id = ?
    `).all(booking.id);
    sendReceiptEmail(updated, property, charges, ownerRow?.email ?? '').catch(() => {});

    logAction(db, {
      ...actorFromReq(req),
      propertyId: booking.property_id,
      action: 'BOOKING_PAID',
      category: 'booking',
      targetType: 'booking',
      targetId: booking.id,
      targetName: `${booking.guest_first_name} ${booking.guest_last_name}`,
      detail: `Payment confirmed — receipt sent to ${booking.guest_email}`,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/bookings/:id ──────────────────────────────────────────────
bookingsRouter.delete('/:id', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, p.rental_type, p.cancellation_days, p.owner_id
      FROM bookings b
      JOIN rooms r ON r.id = b.room_id
      JOIN properties p ON p.id = r.property_id
      WHERE b.id = ?
    `).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const todayIso = new Date().toISOString().split('T')[0];
    const daysUntil = Math.ceil(
      (new Date(booking.check_in_date) - new Date(todayIso)) / (1000 * 60 * 60 * 24)
    );
    const cancellationDays = booking.cancellation_days ?? 7;

    if (booking.rental_type === 'whole_property') {
      if (daysUntil <= 0) {
        return res.status(403).json({
          error: 'Cannot cancel — guests have already arrived or stay is in progress.',
        });
      }
      if (daysUntil <= cancellationDays) {
        return res.status(403).json({
          error: `Cancellation window has passed (${cancellationDays} days before arrival). Use Edit booking to shorten the stay instead.`,
        });
      }
    }

    const isActive = todayIso >= booking.check_in_date && todayIso <= booking.check_out_date;
    if (isActive && ['confirmed', 'arriving', 'in_house'].includes(booking.status)) {
      return res.status(403).json({
        error: 'Cannot delete an active booking.',
      });
    }

    db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
