import { Router } from 'express';
import db from '../db/database.js';
import { logAction, getIp } from '../utils/auditLog.js';

function actorFromReq(req) {
  const u = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(req.user.userId);
  return { userId: req.user.userId, userName: u?.name, userEmail: u?.email, userRole: u?.role };
}

export const chargesRouter = Router();

// Returns the Multi plan status based on the property owner, not the requesting user.
// charges_staff users have plan='free' personally but their property may be Multi.
function propertyIsMulti(propertyId) {
  const row = db.prepare(
    `SELECT u.plan FROM users u JOIN properties p ON p.owner_id = u.id WHERE p.id = ?`
  ).get(propertyId);
  return row?.plan === 'multi';
}

// Resolve the active property ID: prefer an explicit query/body param (owner only),
// verified against ownership, then fall back to the JWT property.
function getPropertyId(req) {
  const explicit = Number(req.query.property_id) || Number(req.body?.property_id);
  if (explicit && req.user.role === 'owner') {
    const owns = db.prepare(
      `SELECT id FROM properties WHERE id = ? AND owner_id = ?`
    ).get(explicit, req.user.userId);
    if (owns) return explicit;
  }
  return req.user.propertyId;
}

function requireMulti(req, res, next) {
  if (!propertyIsMulti(getPropertyId(req))) {
    return res.status(403).json({ error: 'Room charges require the Multi plan.' });
  }
  next();
}

// ── GET /api/charges/categories ───────────────────────────────────────────────
chargesRouter.get('/categories', requireMulti, (req, res) => {
  const propertyId = getPropertyId(req);
  const cats = db.prepare(
    `SELECT * FROM service_categories WHERE property_id = ? ORDER BY sort_order, name`
  ).all(propertyId);
  res.json(cats);
});

// ── POST /api/charges/categories ──────────────────────────────────────────────
chargesRouter.post('/categories', requireMulti, (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can manage categories.' });
  }
  const { name, color, icon } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Category name is required.' });
  const propertyId = getPropertyId(req);
  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM service_categories WHERE property_id = ?`
  ).get(propertyId)?.m ?? -1;
  const result = db.prepare(
    `INSERT INTO service_categories (property_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)`
  ).run(propertyId, name.trim(), color || '#64748b', icon || '📌', maxOrder + 1);
  const cat = db.prepare(`SELECT * FROM service_categories WHERE id = ?`).get(Number(result.lastInsertRowid));
  res.status(201).json(cat);
});

// ── PUT /api/charges/categories/:id ──────────────────────────────────────────
chargesRouter.put('/categories/:id', requireMulti, (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can manage categories.' });
  }
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Category name is required.' });
  const cat = db.prepare(
    `SELECT * FROM service_categories WHERE id = ? AND property_id = ?`
  ).get(Number(req.params.id), getPropertyId(req));
  if (!cat) return res.status(404).json({ error: 'Category not found.' });
  db.prepare(`UPDATE service_categories SET name = ?, color = ? WHERE id = ?`)
    .run(name.trim(), color || cat.color, Number(req.params.id));
  res.json(db.prepare(`SELECT * FROM service_categories WHERE id = ?`).get(Number(req.params.id)));
});

// ── DELETE /api/charges/categories/:id ───────────────────────────────────────
chargesRouter.delete('/categories/:id', requireMulti, (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can manage categories.' });
  }
  const cat = db.prepare(
    `SELECT * FROM service_categories WHERE id = ? AND property_id = ?`
  ).get(Number(req.params.id), getPropertyId(req));
  if (!cat) return res.status(404).json({ error: 'Category not found.' });
  db.prepare(`DELETE FROM service_categories WHERE id = ?`).run(Number(req.params.id));
  res.json({ success: true });
});

// ── GET /api/charges/rooms-today ──────────────────────────────────────────────
// Returns rooms with active (arriving/confirmed) in-house bookings today,
// plus total active charge amount per booking.
chargesRouter.get('/rooms-today', requireMulti, (req, res) => {
  const propertyId = getPropertyId(req);
  const rows = db.prepare(`
    SELECT
      b.id              AS booking_id,
      b.room_id,
      r.name            AS room_name,
      r.type            AS room_type,
      g.first_name      AS guest_first_name,
      g.last_name       AS guest_last_name,
      b.check_in_date,
      b.check_out_date,
      b.num_guests,
      b.status,
      COALESCE((
        SELECT SUM(rc.amount)
        FROM room_charges rc
        WHERE rc.booking_id = b.id AND rc.voided_at IS NULL
      ), 0) AS charges_total,
      COALESCE((
        SELECT COUNT(*)
        FROM room_charges rc
        WHERE rc.booking_id = b.id AND rc.voided_at IS NULL
      ), 0) AS charges_count
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    JOIN guests g ON g.id = b.guest_id
    WHERE b.property_id = ?
      AND b.status IN ('arriving', 'confirmed')
      AND b.check_in_date <= date('now')
      AND b.check_out_date > date('now')
    ORDER BY r.name
  `).all(propertyId);
  res.json(rows);
});

// ── GET /api/charges/today-summary ───────────────────────────────────────────
// Dashboard stat: total active charges for today.
chargesRouter.get('/today-summary', requireMulti, (req, res) => {
  const propertyId = getPropertyId(req);
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(rc.amount), 0) AS total,
      COUNT(*) AS count
    FROM room_charges rc
    WHERE rc.property_id = ? AND rc.voided_at IS NULL AND rc.charge_date = date('now')
  `).get(propertyId);
  res.json(row);
});

// ── GET /api/charges/booking/:bookingId ───────────────────────────────────────
chargesRouter.get('/booking/:bookingId', requireMulti, (req, res) => {
  const bookingId = Number(req.params.bookingId);
  const propertyId = getPropertyId(req);

  // Verify the booking belongs to this property
  const booking = db.prepare(
    `SELECT id FROM bookings WHERE id = ? AND property_id = ?`
  ).get(bookingId, propertyId);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  const charges = db.prepare(`
    SELECT
      rc.*,
      sc.name  AS category_name,
      sc.color AS category_color,
      sc.icon  AS category_icon,
      u.name   AS charged_by_name
    FROM room_charges rc
    LEFT JOIN service_categories sc ON sc.id = rc.category_id
    LEFT JOIN users u ON u.id = rc.charged_by
    WHERE rc.booking_id = ?
    ORDER BY rc.created_at DESC
  `).all(bookingId);
  res.json(charges);
});

// ── POST /api/charges ─────────────────────────────────────────────────────────
chargesRouter.post('/', requireMulti, (req, res) => {
  const { booking_id, category_id, description, amount, charge_date } = req.body;
  const propertyId = getPropertyId(req);

  if (!booking_id || amount == null) {
    return res.status(400).json({ error: 'booking_id and amount are required.' });
  }
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number.' });
  }

  // Verify booking belongs to this property and is in-house
  const booking = db.prepare(
    `SELECT id, status FROM bookings WHERE id = ? AND property_id = ?`
  ).get(Number(booking_id), propertyId);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot charge a cancelled booking.' });
  }

  const result = db.prepare(`
    INSERT INTO room_charges (booking_id, property_id, category_id, description, amount, charge_date, charged_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(booking_id),
    getPropertyId(req),
    category_id ? Number(category_id) : null,
    description?.trim() || null,
    parsedAmount,
    charge_date || new Date().toISOString().slice(0, 10),
    req.user.userId,
  );

  const charge = db.prepare(`
    SELECT rc.*, sc.name AS category_name, sc.color AS category_color, sc.icon AS category_icon,
           u.name AS charged_by_name
    FROM room_charges rc
    LEFT JOIN service_categories sc ON sc.id = rc.category_id
    LEFT JOIN users u ON u.id = rc.charged_by
    WHERE rc.id = ?
  `).get(Number(result.lastInsertRowid));
  res.status(201).json(charge);

  logAction(db, {
    ...actorFromReq(req),
    propertyId: propertyId,
    action: 'CHARGE_ADDED',
    category: 'charge',
    targetType: 'charge',
    targetId: Number(result.lastInsertRowid),
    targetName: description?.trim() || charge?.category_name || null,
    detail: `Booking #${booking_id} — ${parsedAmount.toFixed(2)}`,
    ipAddress: getIp(req),
  });
});

// ── DELETE /api/charges/:id (void) ────────────────────────────────────────────
chargesRouter.delete('/:id', requireMulti, (req, res) => {
  if (req.user.role === 'charges_staff') {
    return res.status(403).json({ error: 'Only owners and reception staff can void charges.' });
  }
  const charge = db.prepare(
    `SELECT * FROM room_charges WHERE id = ? AND property_id = ?`
  ).get(Number(req.params.id), getPropertyId(req));
  if (!charge) return res.status(404).json({ error: 'Charge not found.' });
  if (charge.voided_at) return res.status(400).json({ error: 'Charge already voided.' });

  db.prepare(
    `UPDATE room_charges SET voided_at = datetime('now'), voided_by = ? WHERE id = ?`
  ).run(req.user.userId, Number(req.params.id));
  res.json({ success: true });

  logAction(db, {
    ...actorFromReq(req),
    propertyId: getPropertyId(req),
    action: 'CHARGE_VOIDED',
    category: 'charge',
    targetType: 'charge',
    targetId: Number(req.params.id),
    targetName: charge?.description || charge?.category_name || null,
    detail: `Booking #${charge.booking_id} — voided ${parseFloat(charge.amount).toFixed(2)}`,
    ipAddress: getIp(req),
  });
});
