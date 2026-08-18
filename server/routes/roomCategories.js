import { Router } from 'express';
import db from '../db/database.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { getAvailableRoomsInCategory } from '../utils/categoryAvailability.js';

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

    const { name, buffer, display_order, amenities, description } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }

    db.prepare(`
      UPDATE room_categories
      SET name = ?, buffer = ?, display_order = ?, amenities = ?, description = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      buffer !== undefined ? Number(buffer) : existing.buffer,
      display_order !== undefined ? Number(display_order) : existing.display_order,
      amenities !== undefined ? (amenities?.trim() || null) : existing.amenities,
      description !== undefined ? (description?.trim() || null) : existing.description,
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

// ── Public category-availability endpoint (Phase 6a) ─────────────────────────
// Separate router, deliberately NOT mounted alongside roomCategoriesRouter
// above — that one lives behind requireAuth (dashboard-only). This is
// guest-facing (the public booking page, Phase 6b), so index.js mounts it
// in the public-routes section instead, before requireAuth is applied.
export const categoryAvailabilityPublicRouter = Router();

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── GET /api/properties/:propertyId/category-availability/:categoryId ───────
// Public — no auth. Returns a ~365-day per-day availability map for a room
// category, matching NB_AVAILABILITY[roomId]'s shape in bookingPage.js
// exactly: { "YYYY-MM-DD": "available" | "booked", ... } — so Phase 6b's
// frontend can feed this straight into the existing renderCalendar() client
// function there with minimal changes.
//
// A date is 'available' if at least one non-buffered room in the category is
// free that day (getAvailableRoomsInCategory, respectBuffer: true — the
// guest-facing convention, matching Phase 6a's booking-creation routes),
// 'booked' otherwise. This reuses categoryAvailability.js's own
// status-exclude-list convention (NOT IN cancelled / checked_out /
// cancelled_unpaid) rather than bookingPage.js's getRoomAvailMap(), which
// uses a different status include-list for its own per-room calendars and is
// untouched by this phase — this is a new, separate data source alongside it,
// not a replacement.
categoryAvailabilityPublicRouter.get('/properties/:propertyId/category-availability/:categoryId', (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    const categoryId = Number(req.params.categoryId);
    const category = db.prepare('SELECT id FROM room_categories WHERE id = ? AND property_id = ?').get(categoryId, propertyId);
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const map = {};
    const base = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dateStr = localDateStr(d);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const nextStr = localDateStr(next);
      const available = getAvailableRoomsInCategory(db, categoryId, dateStr, nextStr, { respectBuffer: true });
      map[dateStr] = available.length > 0 ? 'available' : 'booked';
    }
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
