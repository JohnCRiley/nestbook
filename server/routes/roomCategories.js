import { Router } from 'express';
import db from '../db/database.js';
import { requireVerified } from '../middleware/requireVerified.js';

export const roomCategoriesRouter = Router();

// ── Ownership helper (mirrors rooms.js / ratePeriods.js) ──────────────────────
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

// ── GET /api/properties/:propertyId/room-categories ──────────────────────────
roomCategoriesRouter.get('/properties/:propertyId/room-categories', (req, res) => {
  try {
    const propId = Number(req.params.propertyId);
    if (!canAccessProperty(req.user.userId, req.user.role, propId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const rows = db.prepare(
      'SELECT * FROM room_categories WHERE property_id = ? ORDER BY display_order ASC, id ASC'
    ).all(propId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/properties/:propertyId/room-categories ─────────────────────────
roomCategoriesRouter.post('/properties/:propertyId/room-categories', requireVerified, (req, res) => {
  try {
    const propId = Number(req.params.propertyId);
    if (!canAccessProperty(req.user.userId, req.user.role, propId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const { name, buffer, display_order } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const result = db.prepare(`
      INSERT INTO room_categories (property_id, name, buffer, display_order)
      VALUES (?, ?, ?, ?)
    `).run(propId, name.trim(), Number(buffer ?? 0), Number(display_order ?? 0));

    const created = db.prepare('SELECT * FROM room_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/room-categories/:id ──────────────────────────────────────────────
roomCategoriesRouter.put('/room-categories/:id', requireVerified, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM room_categories WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, existing.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const { name, buffer, display_order } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }

    db.prepare(`
      UPDATE room_categories
      SET name = ?, buffer = ?, display_order = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      buffer !== undefined ? Number(buffer) : existing.buffer,
      display_order !== undefined ? Number(display_order) : existing.display_order,
      id,
    );

    const updated = db.prepare('SELECT * FROM room_categories WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/room-categories/:id ───────────────────────────────────────────
// Blocks the delete with a clear error if any rooms still reference this
// category, rather than silently orphaning them.
roomCategoriesRouter.delete('/room-categories/:id', requireVerified, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM room_categories WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, existing.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const roomCount = db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE category_id = ?').get(id).n;
    if (roomCount > 0) {
      return res.status(409).json({
        error: `${roomCount} room${roomCount === 1 ? '' : 's'} still use${roomCount === 1 ? 's' : ''} this category.`,
      });
    }

    db.prepare('DELETE FROM room_categories WHERE id = ?').run(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
