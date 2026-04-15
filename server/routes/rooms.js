import { Router } from 'express';
import db from '../db/database.js';

export const roomsRouter = Router();

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

// ── GET /api/rooms?property_id=X&status=available ────────────────────────────
roomsRouter.get('/', (req, res) => {
  try {
    const { property_id, status } = req.query;

    if (property_id) {
      if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const conditions = ['property_id = ?'];
      const params     = [property_id];
      if (status) { conditions.push('status = ?'); params.push(status); }
      return res.json(
        db.prepare(`SELECT * FROM rooms WHERE ${conditions.join(' AND ')} ORDER BY id`).all(...params)
      );
    }

    // No filter: return rooms for all of the user's accessible properties
    const propIds = getUserPropertyIds(req.user.userId, req.user.role);
    if (!propIds.length) return res.json([]);
    const placeholders = propIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM rooms WHERE property_id IN (${placeholders}) ORDER BY id`)
      .all(...propIds);
    res.json(rows);
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
    const { property_id, name, type, price_per_night, capacity, amenities, status } = req.body;

    if (!property_id || !name || !type || price_per_night == null) {
      return res.status(400).json({ error: 'property_id, name, type and price_per_night are required' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Free plan: max 10 rooms per property
    const currentUser = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    if (currentUser?.plan === 'free') {
      const roomCount = db.prepare('SELECT COUNT(*) as n FROM rooms WHERE property_id = ?').get(property_id).n;
      if (roomCount >= 10) {
        return res.status(403).json({
          error: "You've reached the free plan limit of 10 rooms. Upgrade to Pro for unlimited rooms.",
        });
      }
    }

    const result = db.prepare(`
      INSERT INTO rooms (property_id, name, type, price_per_night, capacity, amenities, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, name, type,
      price_per_night,
      capacity  ?? 2,
      amenities ?? null,
      status    ?? 'available'
    );

    res.status(201).json(
      db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/rooms/:id ────────────────────────────────────────────────────
roomsRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM rooms WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Room not found' });

    const { property_id, name, type, price_per_night, capacity, amenities, status } = req.body;

    db.prepare(`
      UPDATE rooms
      SET property_id = ?, name = ?, type = ?, price_per_night = ?,
          capacity = ?, amenities = ?, status = ?
      WHERE id = ?
    `).run(property_id, name, type, price_per_night, capacity, amenities, status, req.params.id);

    res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/rooms/:id ─────────────────────────────────────────────────
roomsRouter.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Room not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
