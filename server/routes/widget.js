// Public widget API — no authentication required.
// These endpoints are called by the embedded booking widget from guest-facing
// websites. They expose only the minimum data needed for public availability
// checks and booking creation.
import { Router } from 'express';
import db from '../db/database.js';
import { sendBookingConfirmation } from '../email/emailService.js';

export const widgetRouter = Router();

// ── GET /api/widget/rooms?property_id=X ──────────────────────────────────────
// Returns rooms for a property (no guest PII).
widgetRouter.get('/rooms', (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    const rows = db.prepare(
      'SELECT * FROM rooms WHERE property_id = ? ORDER BY id'
    ).all(property_id);
    res.json(rows);
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
    const rows = db.prepare(`
      SELECT id, room_id, check_in_date, check_out_date, status
      FROM bookings
      WHERE property_id = ?
        AND status NOT IN ('cancelled', 'checked_out')
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
widgetRouter.post('/bookings', (req, res) => {
  try {
    const {
      property_id, room_id, guest_id,
      check_in_date, check_out_date,
      num_guests, status, source, notes, total_price,
    } = req.body;

    if (!property_id || !room_id || !guest_id || !check_in_date || !check_out_date) {
      return res.status(400).json({
        error: 'property_id, room_id, guest_id, check_in_date and check_out_date are required',
      });
    }

    if (check_out_date <= check_in_date) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    const conflict = db.prepare(`
      SELECT id FROM bookings
      WHERE room_id = ?
        AND status NOT IN ('cancelled', 'checked_out')
        AND check_in_date < ?
        AND check_out_date > ?
    `).get(room_id, check_out_date, check_in_date);
    if (conflict) {
      return res.status(409).json({ error: 'This room is no longer available for the selected dates. Please choose different dates.' });
    }

    // Flag the booking if the guest's email matches a blacklisted guest
    const guestData = db.prepare('SELECT email, blacklisted FROM guests WHERE id = ?').get(guest_id);
    let flagged = guestData?.blacklisted ? 1 : 0;
    if (!flagged && guestData?.email) {
      const bl = db.prepare('SELECT id FROM guests WHERE email = ? AND blacklisted = 1').get(guestData.email);
      if (bl) flagged = 1;
    }

    const result = db.prepare(`
      INSERT INTO bookings
        (property_id, room_id, guest_id, check_in_date, check_out_date,
         num_guests, status, source, notes, total_price, flagged)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, room_id, guest_id,
      check_in_date, check_out_date,
      num_guests   ?? 1,
      status       ?? 'confirmed',
      source       ?? 'direct',
      notes        ?? null,
      total_price  ?? null,
      flagged,
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

    // Fire-and-forget — email must not delay or break the HTTP response
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(newBooking.property_id);
    sendBookingConfirmation(newBooking, property).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
