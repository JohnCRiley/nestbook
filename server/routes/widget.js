// Public widget API — no authentication required.
// These endpoints are called by the embedded booking widget from guest-facing
// websites. They expose only the minimum data needed for public availability
// checks and booking creation.
import { Router } from 'express';
import db from '../db/database.js';
import { sendBookingConfirmation } from '../email/emailService.js';

// ── Demo mode rooms (static, never blocked, no DB dependency) ─────────────────
// These match the Domaine des Lavandes demo property rooms shown on widget-test.html.
// The demo booking endpoint returns a fake ref and never writes to the DB.
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
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
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
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
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

// ── GET /api/widget/demo/rooms ────────────────────────────────────────────────
// Always returns all 4 demo rooms as available — no auth, no DB query.
// Used by widget-test.html in demo mode so visitor bookings never block rooms.
widgetRouter.get('/demo/rooms', (_req, res) => {
  res.json(DEMO_ROOMS);
});

// ── POST /api/widget/demo/bookings ────────────────────────────────────────────
// Accepts a booking payload, returns a realistic confirmation with a fake
// reference number, but NEVER writes to the database.
widgetRouter.post('/demo/bookings', (_req, res) => {
  const ref = 'DEMO-' + String(Math.floor(1000 + Math.random() * 9000));
  res.status(201).json({ id: ref, demo: true, status: 'cancelled' });
});
