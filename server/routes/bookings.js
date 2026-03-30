import { Router } from 'express';
import db from '../db/database.js';

export const bookingsRouter = Router();

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
    g.first_name   AS guest_first_name,
    g.last_name    AS guest_last_name,
    g.email        AS guest_email,
    g.phone        AS guest_phone,
    r.name         AS room_name,
    r.type         AS room_type,
    r.price_per_night
  FROM bookings b
  LEFT JOIN guests g ON b.guest_id  = g.id
  LEFT JOIN rooms  r ON b.room_id   = r.id
`;

// ── GET /api/bookings ─────────────────────────────────────────────────────
// Query params (all optional):
//   property_id  — filter by property
//   status       — filter by status (confirmed | arriving | checked_out | cancelled)
//   room_id      — filter by room
//   from         — bookings with check_in_date >= from  (YYYY-MM-DD)
//   to           — bookings with check_out_date <= to
bookingsRouter.get('/', (req, res) => {
  try {
    const { property_id, status, room_id, from, to } = req.query;
    const conditions = [];
    const params = [];

    if (property_id) { conditions.push('b.property_id = ?');    params.push(property_id); }
    if (status)      { conditions.push('b.status = ?');          params.push(status); }
    if (room_id)     { conditions.push('b.room_id = ?');         params.push(room_id); }
    if (from)        { conditions.push('b.check_in_date >= ?');  params.push(from); }
    if (to)          { conditions.push('b.check_out_date <= ?'); params.push(to); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const rows = db.prepare(`${ENRICHED_SELECT} ${where} ORDER BY b.check_in_date`).all(...params);
    res.json(rows);
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
      num_guests, status, source, notes, total_price
    } = req.body;

    if (!property_id || !room_id || !guest_id || !check_in_date || !check_out_date) {
      return res.status(400).json({
        error: 'property_id, room_id, guest_id, check_in_date and check_out_date are required'
      });
    }

    if (check_out_date <= check_in_date) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    const result = db.prepare(`
      INSERT INTO bookings
        (property_id, room_id, guest_id, check_in_date, check_out_date,
         num_guests, status, source, notes, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, room_id, guest_id,
      check_in_date, check_out_date,
      num_guests   ?? 1,
      status       ?? 'confirmed',
      source       ?? 'direct',
      notes        ?? null,
      total_price  ?? null
    );

    res.status(201).json(
      db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(result.lastInsertRowid)
    );
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
      num_guests, status, source, notes, total_price
    } = req.body;

    if (check_out_date <= check_in_date) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    db.prepare(`
      UPDATE bookings
      SET room_id = ?, guest_id = ?, check_in_date = ?, check_out_date = ?,
          num_guests = ?, status = ?, source = ?, notes = ?, total_price = ?
      WHERE id = ?
    `).run(
      room_id, guest_id, check_in_date, check_out_date,
      num_guests, status, source, notes, total_price,
      req.params.id
    );

    res.json(db.prepare(`${ENRICHED_SELECT} WHERE b.id = ?`).get(req.params.id));
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
