import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/database.js';
import { logAction, getIp } from '../utils/auditLog.js';
import { getRateForDate } from '../utils/ratePeriods.js';

export const roomsRouter = Router();

function actorFromReq(req) {
  const u = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(req.user.userId);
  return { userId: req.user.userId, userName: u?.name, userEmail: u?.email, userRole: u?.role };
}

// ── Ownership helper (mirrors properties.js) ──────────────────────────────
function canAccessProperty(userId, role, propId) {
  const pid = Number(propId);
  if (!pid) return false;
  if (role === 'owner') {
    if (db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?').get(pid, userId)) {
      return true;
    }
    // Fallback: legacy users whose property predates the owner_id column.
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

// ── GET /api/rooms?property_id=X&status=available&page=1&limit=20 ────────────
// Query params (all optional):
//   property_id  — filter by property (access-checked)
//   status       — filter by status
//   page / limit — when present returns paginated object {rooms,total,page,totalPages}
//                  when absent returns plain array (backward compat)
roomsRouter.get('/', (req, res) => {
  try {
    const { property_id, status, page, limit } = req.query;
    const conditions = [];
    const params     = [];

    if (property_id) {
      if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      conditions.push('property_id = ?');
      params.push(property_id);
    } else {
      const propIds = getUserPropertyIds(req.user.userId, req.user.role);
      if (!propIds.length) {
        return page ? res.json({ rooms: [], total: 0, page: 1, totalPages: 0 }) : res.json([]);
      }
      const placeholders = propIds.map(() => '?').join(',');
      conditions.push(`property_id IN (${placeholders})`);
      params.push(...propIds);
    }

    if (status) { conditions.push('status = ?'); params.push(status); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    if (page) {
      const pageNum   = Math.max(1, Number(page));
      const pageLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const offset    = (pageNum - 1) * pageLimit;

      const total = db.prepare(`SELECT COUNT(*) as n FROM rooms ${where}`).get(...params).n;
      const rows  = db.prepare(`
        SELECT r.*,
          (SELECT COUNT(*) FROM room_photos WHERE room_id = r.id) AS photo_count,
          (SELECT filename FROM room_photos WHERE room_id = r.id ORDER BY display_order ASC LIMIT 1) AS primary_photo,
          (SELECT thumb_filename FROM room_photos WHERE room_id = r.id ORDER BY display_order ASC LIMIT 1) AS primary_thumb
        FROM rooms r ${where} ORDER BY r.id LIMIT ? OFFSET ?
      `).all(...params, pageLimit, offset);

      return res.json({ rooms: rows, total, page: pageNum, totalPages: Math.ceil(total / pageLimit) });
    }

    res.json(db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM room_photos WHERE room_id = r.id) AS photo_count,
        (SELECT filename FROM room_photos WHERE room_id = r.id ORDER BY display_order ASC LIMIT 1) AS primary_photo,
        (SELECT thumb_filename FROM room_photos WHERE room_id = r.id ORDER BY display_order ASC LIMIT 1) AS primary_thumb
      FROM rooms r ${where} ORDER BY r.id
    `).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rooms/:id/rate?date=YYYY-MM-DD ───────────────────────────────
roomsRouter.get('/:id/rate', (req, res) => {
  try {
    const rid  = Number(req.params.id);
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date query param (YYYY-MM-DD) is required' });
    }
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(rid);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const result = getRateForDate(room.property_id, rid, date);
    if (!result) return res.status(404).json({ error: 'Room not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rooms/:id/rate-range?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD ──
roomsRouter.get('/:id/rate-range', (req, res) => {
  try {
    const rid      = Number(req.params.id);
    const checkIn  = req.query.check_in;
    const checkOut = req.query.check_out;
    const dateRe   = /^\d{4}-\d{2}-\d{2}$/;
    if (!checkIn || !dateRe.test(checkIn) || !checkOut || !dateRe.test(checkOut) || checkOut <= checkIn) {
      return res.status(400).json({ error: 'check_in and check_out (YYYY-MM-DD) are required; check_out must be after check_in' });
    }
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(rid);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // WP properties store the base rate on the property, not the room
    const propRow = db.prepare('SELECT rental_type, whole_property_rate FROM properties WHERE id = ?').get(room.property_id);
    const baseRateOverride = propRow?.rental_type === 'whole_property' ? (propRow.whole_property_rate ?? null) : null;

    function addDaysIso(iso, n) {
      const d = new Date(iso + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    }

    const breakdown = [];
    let current = checkIn;
    while (current < checkOut) {
      const result     = getRateForDate(room.property_id, rid, current, baseRateOverride);
      const rate       = result?.rate ?? (baseRateOverride ?? room.price_per_night);
      const periodName = result?.periodName ?? null;
      const last       = breakdown[breakdown.length - 1];
      if (last && last.ratePerNight === rate && last.periodName === periodName) {
        last.nights  += 1;
        last.subtotal = Math.round(last.nights * last.ratePerNight * 100) / 100;
      } else {
        breakdown.push({ periodName, nights: 1, ratePerNight: rate, subtotal: rate });
      }
      current = addDaysIso(current, 1);
    }

    const total = Math.round(breakdown.reduce((s, seg) => s + seg.subtotal, 0) * 100) / 100;
    res.json({ total, breakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rooms/:id ────────────────────────────────────────────────────
roomsRouter.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Room not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rooms ───────────────────────────────────────────────────────────
roomsRouter.post('/', (req, res) => {
  try {
    const { property_id, name, type, price_per_night, capacity, amenities, status, breakfast_included, description } = req.body;

    if (!property_id || !name || !type || price_per_night == null) {
      return res.status(400).json({ error: 'property_id, name, type and price_per_night are required' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Free plan: max 3 rooms per property
    const currentUser = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    if (currentUser?.plan === 'free') {
      const roomCount = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE property_id = ?').get(property_id).n;
      if (roomCount >= 3) {
        return res.status(403).json({
          error: "You've reached the free plan limit of 3 rooms. Upgrade to Pro for unlimited rooms.",
        });
      }
    }

    const ical_token = crypto.randomBytes(16).toString('hex');
    const result = db.prepare(`
      INSERT INTO rooms (property_id, name, type, price_per_night, capacity, amenities, status, breakfast_included, description, ical_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, name, type,
      price_per_night,
      capacity  ?? 2,
      amenities ?? null,
      status    ?? 'available',
      breakfast_included ? 1 : 0,
      description || null,
      ical_token
    );

    const created = db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: Number(property_id),
      action: 'ROOM_CREATED',
      category: 'room',
      targetType: 'room',
      targetId: created.id,
      targetName: created.name,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/rooms/:id ────────────────────────────────────────────────────
roomsRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Room not found' });

    const { property_id, name, type, price_per_night, capacity, amenities, status, breakfast_included, description } = req.body;

    db.prepare(`
      UPDATE rooms
      SET property_id = ?, name = ?, type = ?, price_per_night = ?,
          capacity = ?, amenities = ?, status = ?, breakfast_included = ?, description = ?
      WHERE id = ?
    `).run(property_id, name, type, price_per_night, capacity, amenities, status, breakfast_included ? 1 : 0, description || null, req.params.id);

    const updated = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: updated.property_id,
      action: 'ROOM_UPDATED',
      category: 'room',
      targetType: 'room',
      targetId: updated.id,
      targetName: updated.name,
      beforeValue: { status: existing.status, price_per_night: existing.price_per_night },
      afterValue:  { status: updated.status,  price_per_night: updated.price_per_night },
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/rooms/:id ─────────────────────────────────────────────────
// ?force=true  — skip the warning and delete even when the room has bookings.
// Without force, returns 409 { booking_count } so the UI can warn the user.
roomsRouter.delete('/:id', (req, res) => {
  try {
    const rid = Number(req.params.id);
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(rid);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.is_demo) return res.status(403).json({ error: 'Demo rooms cannot be deleted.' });

    const bookingCount = db.prepare(
      `SELECT COUNT(*) as n FROM bookings WHERE room_id = ? AND status != 'cancelled'`
    ).get(rid).n;

    if (!req.query.force && bookingCount > 0) {
      return res.status(409).json({ booking_count: bookingCount });
    }

    db.prepare(`UPDATE bookings SET room_id = NULL WHERE room_id = ?`).run(rid);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(rid);
    res.status(204).end();

    logAction(db, {
      ...actorFromReq(req),
      propertyId: room.property_id,
      action: 'ROOM_DELETED',
      category: 'room',
      targetType: 'room',
      targetId: room.id,
      targetName: room.name,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
