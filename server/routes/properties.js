import { Router } from 'express';
import db from '../db/database.js';
import { logAction, getIp } from '../utils/auditLog.js';

export const propertiesRouter = Router();

function actorFromReq(req) {
  const u = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(req.user.userId);
  return { userId: req.user.userId, userName: u?.name, userEmail: u?.email, userRole: u?.role };
}

// ── Ownership helper ──────────────────────────────────────────────────────────
// Returns true if userId can read/write propId.
// Owners: validated via properties.owner_id.
// Reception staff: validated via their single users.property_id.
function canAccess(userId, role, propId) {
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

// ── GET /api/properties ───────────────────────────────────────────────────────
// Owners: returns all their properties. Reception: returns their one assigned property.
propertiesRouter.get('/', (req, res) => {
  try {
    if (req.user.role === 'owner') {
      let rows = db.prepare('SELECT * FROM properties WHERE owner_id = ? ORDER BY id')
        .all(req.user.userId);

      // Fallback for owners whose property pre-dates the owner_id migration:
      // if nothing found via owner_id, locate via users.property_id and backfill.
      if (rows.length === 0) {
        const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(req.user.userId);
        if (u?.property_id) {
          db.prepare('UPDATE properties SET owner_id = ? WHERE id = ? AND owner_id IS NULL')
            .run(req.user.userId, u.property_id);
          const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(u.property_id);
          rows = prop ? [prop] : [];
        }
      }

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

    const created = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: created.id,
      action: 'PROPERTY_CREATED',
      category: 'property',
      targetType: 'property',
      targetId: created.id,
      targetName: created.name,
      ipAddress: getIp(req),
    });
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
    const {
      name, type, address, city, country,
      check_in_time, check_out_time, currency, locale,
      breakfast_included, require_deposit, deposit_amount, breakfast_price,
      breakfast_start_time, breakfast_end_time,
    } = req.body;
    db.prepare(`
      UPDATE properties
      SET name = ?, type = ?, address = ?, city = ?, country = ?,
          check_in_time = ?, check_out_time = ?, currency = ?, locale = ?,
          breakfast_included = ?, require_deposit = ?, deposit_amount = ?,
          breakfast_price = ?, breakfast_start_time = ?, breakfast_end_time = ?
      WHERE id = ?
    `).run(
      name, type, address, city, country,
      check_in_time, check_out_time, currency, locale,
      breakfast_included ? 1 : 0,
      require_deposit    ? 1 : 0,
      parseFloat(deposit_amount) || 0,
      parseFloat(breakfast_price) || 0,
      breakfast_start_time ?? '07:00',
      breakfast_end_time   ?? '11:00',
      req.params.id,
    );
    const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      propertyId: updated.id,
      action: 'PROPERTY_UPDATED',
      category: 'property',
      targetType: 'property',
      targetId: updated.id,
      targetName: updated.name,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/properties/:id ────────────────────────────────────────────────
// Owners only. Cannot delete your last property.
// Deletes in FK order: bookings → rooms → property.
// Nullifies staff property_id refs before deletion.
// Returns the updated properties list.
propertiesRouter.delete('/:id', (req, res) => {
  try {
    const pid = Number(req.params.id);

    // Only owners can delete properties
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only account owners can remove properties.' });
    }

    if (!canAccess(req.user.userId, req.user.role, pid)) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    // Prevent deleting last property
    const count = db.prepare('SELECT COUNT(*) as n FROM properties WHERE owner_id = ?')
      .get(req.user.userId).n;
    if (count <= 1) {
      return res.status(400).json({
        error: 'You cannot delete your only property. If you want to close your account, use the Manage Subscription option in settings.',
      });
    }

    // Delete in FK order: nullify staff refs → charges → bookings → categories → rooms → property
    try {
      db.exec('BEGIN');
      db.prepare('UPDATE users SET property_id = NULL WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM room_charges WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM bookings WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM service_categories WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM rooms WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM properties WHERE id = ?').run(pid);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }

    // If this was the owner's active property, switch them to another one
    const owner = db.prepare('SELECT property_id FROM users WHERE id = ?').get(req.user.userId);
    if (Number(owner?.property_id) === pid) {
      const next = db.prepare('SELECT id FROM properties WHERE owner_id = ? ORDER BY id LIMIT 1')
        .get(req.user.userId);
      if (next) {
        db.prepare('UPDATE users SET property_id = ? WHERE id = ?').run(next.id, req.user.userId);
      }
    }

    // Return the remaining properties list
    const remaining = db.prepare('SELECT * FROM properties WHERE owner_id = ? ORDER BY id')
      .all(req.user.userId);
    res.json({ deleted_id: pid, properties: remaining });

    logAction(db, {
      ...actorFromReq(req),
      propertyId: pid,
      action: 'PROPERTY_DELETED',
      category: 'property',
      targetType: 'property',
      targetId: pid,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
