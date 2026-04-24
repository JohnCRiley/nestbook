import { Router } from 'express';
import db from '../db/database.js';
import { sendBookingConfirmation, sendDepositRequest, sendDepositConfirmation } from '../email/emailService.js';

export const bookingsRouter = Router();

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
      AND status NOT IN ('cancelled', 'checked_out')
      AND check_in_date < ?
      AND check_out_date > ?
      ${excludeId ? 'AND id != ?' : ''}
  `;
  const args = excludeId ? [roomId, checkOut, checkIn, excludeId] : [roomId, checkOut, checkIn];
  return !!db.prepare(sql).get(...args);
}

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
      all:         db.prepare(`SELECT COUNT(*) as n ${base}`).get(property_id).n,
      arriving:    db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'arriving' AND b.check_in_date = date('now')`).get(property_id).n,
      in_house:    db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'arriving' AND b.check_in_date < date('now')`).get(property_id).n,
      confirmed:   db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'confirmed'`).get(property_id).n,
      checked_out: db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'checked_out'`).get(property_id).n,
      cancelled:   db.prepare(`SELECT COUNT(*) as n ${base} AND b.status = 'cancelled'`).get(property_id).n,
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
        case 'arriving':    conditions.push("b.status = 'arriving' AND b.check_in_date = date('now')"); break;
        case 'in_house':    conditions.push("b.status = 'arriving' AND b.check_in_date < date('now')"); break;
        case 'confirmed':   conditions.push("b.status = 'confirmed'");   break;
        case 'checked_out': conditions.push("b.status = 'checked_out'"); break;
        case 'cancelled':   conditions.push("b.status = 'cancelled'");   break;
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
        AND status NOT IN ('cancelled', 'checked_out')
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
    const conflict = hasOverlap(Number(room_id), check_in_date, check_out_date, exclude_id ? Number(exclude_id) : null);
    res.json({ available: !conflict });
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

// ── POST /api/bookings ────────────────────────────────────────────────────
bookingsRouter.post('/', (req, res) => {
  try {
    const {
      property_id, room_id, guest_id,
      check_in_date, check_out_date,
      num_guests, status, source, notes, total_price, breakfast_added
    } = req.body;

    if (!property_id || !room_id || !guest_id || !check_in_date || !check_out_date) {
      return res.status(400).json({
        error: 'property_id, room_id, guest_id, check_in_date and check_out_date are required'
      });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (check_out_date <= check_in_date) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    if (hasOverlap(Number(room_id), check_in_date, check_out_date)) {
      return res.status(409).json({ error: OVERLAP_ERROR });
    }

    const result = db.prepare(`
      INSERT INTO bookings
        (property_id, room_id, guest_id, check_in_date, check_out_date,
         num_guests, status, source, notes, total_price, breakfast_added)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, room_id, guest_id,
      check_in_date, check_out_date,
      num_guests      ?? 1,
      status          ?? 'confirmed',
      source          ?? 'direct',
      notes           ?? null,
      total_price     ?? null,
      breakfast_added ? 1 : 0
    );

    const newBooking = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(result.lastInsertRowid);
    res.status(201).json(newBooking);

    // Fire-and-forget — email must not delay or break the HTTP response
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(newBooking.property_id);
    sendBookingConfirmation(newBooking, property).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/bookings/:id ─────────────────────────────────────────────────
bookingsRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM bookings WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Booking not found' });

    const {
      room_id, guest_id, check_in_date, check_out_date,
      num_guests, status, source, notes, total_price, breakfast_added
    } = req.body;

    if (check_out_date <= check_in_date) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    if (hasOverlap(Number(room_id), check_in_date, check_out_date, Number(req.params.id))) {
      return res.status(409).json({ error: OVERLAP_ERROR });
    }

    db.prepare(`
      UPDATE bookings
      SET room_id = ?, guest_id = ?, check_in_date = ?, check_out_date = ?,
          num_guests = ?, status = ?, source = ?, notes = ?, total_price = ?,
          breakfast_added = ?
      WHERE id = ?
    `).run(
      room_id, guest_id, check_in_date, check_out_date,
      num_guests, status, source, notes, total_price,
      breakfast_added ? 1 : 0,
      req.params.id
    );

    res.json(db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id));
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
    db.prepare(`UPDATE bookings SET deposit_paid = 1, deposit_paid_at = ? WHERE id = ?`).run(now, req.params.id);

    const updated = db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id);
    res.json(updated);

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(booking.property_id);
    sendDepositConfirmation(updated, property).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/bookings/:id ──────────────────────────────────────────────
bookingsRouter.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Booking not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
