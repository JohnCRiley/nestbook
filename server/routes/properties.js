import { Router } from 'express';
import db from '../db/database.js';

export const propertiesRouter = Router();

// ── Ownership helper ──────────────────────────────────────────────────────────
// Returns true if userId can read/write propId.
// Owners: validated via properties.owner_id.
// Reception staff: validated via their single users.property_id.
function canAccess(userId, role, propId) {
  const pid = Number(propId);
  if (!pid) return false;
  if (role === 'owner') {
    return !!db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?').get(pid, userId);
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return Number(u?.property_id) === pid;
}

// ── GET /api/properties ───────────────────────────────────────────────────────
// Owners: returns all their properties. Reception: returns their one assigned property.
propertiesRouter.get('/', (req, res) => {
  try {
    if (req.user.role === 'owner') {
      const rows = db.prepare('SELECT * FROM properties WHERE owner_id = ? ORDER BY id')
        .all(req.user.userId);
      return res.json(rows);
    }
    // Reception staff — return their single assigned property
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(req.user.userId);
    if (!u?.property_id) return res.json([]);
    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(u.property_id);
    return res.json(prop ? [prop] : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/properties/:id ───────────────────────────────────────────────────
propertiesRouter.get('/:id', (req, res) => {
  try {
    if (!canAccess(req.user.userId, req.user.role, req.params.id)) {
      return res.status(404).json({ error: 'Property not found.' });
    }
    const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/properties/active/:id ────────────────────────────────────────────
// Switches the active property for this user (persists to users.property_id).
// Defined BEFORE /:id so Express doesn't swallow "active" as a param.
propertiesRouter.put('/active/:id', (req, res) => {
  try {
    const propId = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, propId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    db.prepare('UPDATE users SET property_id = ? WHERE id = ?').run(propId, req.user.userId);
    res.json({ success: true, active_property_id: propId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/properties ──────────────────────────────────────────────────────
// Creates a new property. Multi plan owners only; hard cap of 5.
propertiesRouter.post('/', (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only account owners can add properties.' });
    }
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    if (user?.plan !== 'multi') {
      return res.status(403).json({ error: 'A Multi plan is required to add more than one property.' });
    }
    const count = db.prepare('SELECT COUNT(*) as n FROM properties WHERE owner_id = ?')
      .get(req.user.userId).n;
    if (count >= 5) {
      return res.status(400).json({ error: 'Maximum of 5 properties reached.' });
    }

    const { name, type, address, city, country, check_in_time, check_out_time, currency, locale } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required.' });

    const result = db.prepare(`
      INSERT INTO properties
        (name, type, address, city, country, check_in_time, check_out_time, currency, locale, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, type,
      address        ?? null,
      city           ?? null,
      country        ?? null,
      check_in_time  ?? '15:00',
      check_out_time ?? '11:00',
      currency       ?? 'EUR',
      locale         ?? 'en',
      req.user.userId
    );

    res.status(201).json(
      db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/properties/:id ───────────────────────────────────────────────────
propertiesRouter.put('/:id', (req, res) => {
  try {
    if (!canAccess(req.user.userId, req.user.role, req.params.id)) {
      return res.status(404).json({ error: 'Property not found.' });
    }
    const { name, type, address, city, country, check_in_time, check_out_time, currency, locale } = req.body;
    db.prepare(`
      UPDATE properties
      SET name = ?, type = ?, address = ?, city = ?, country = ?,
          check_in_time = ?, check_out_time = ?, currency = ?, locale = ?
      WHERE id = ?
    `).run(name, type, address, city, country, check_in_time, check_out_time, currency, locale, req.params.id);
    res.json(db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/properties/:id ────────────────────────────────────────────────
// Cannot delete your only property.
propertiesRouter.delete('/:id', (req, res) => {
  try {
    if (!canAccess(req.user.userId, req.user.role, req.params.id)) {
      return res.status(404).json({ error: 'Property not found.' });
    }
    const count = db.prepare('SELECT COUNT(*) as n FROM properties WHERE owner_id = ?')
      .get(req.user.userId).n;
    if (count <= 1) {
      return res.status(400).json({ error: 'Cannot delete your only property.' });
    }
    db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
