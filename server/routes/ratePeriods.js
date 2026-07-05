import { Router } from 'express';
import db from '../db/database.js';
import { requireVerified } from '../middleware/requireVerified.js';

export const ratePeriodsRouter = Router();

ratePeriodsRouter.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return requireVerified(req, res, next);
});

const PLAN_LIMITS = { free: 0, pro: 5, multi: Infinity };

function canAccess(userId, role, propId) {
  const pid = Number(propId);
  if (!pid) return false;
  if (role === 'owner') {
    if (db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?').get(pid, userId)) return true;
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

function attachRoomRates(period) {
  period.roomRates = db.prepare(`
    SELECT rpr.room_id, rpr.amount, r.name AS room_name, r.price_per_night AS default_price
    FROM rate_period_rooms rpr
    JOIN rooms r ON r.id = rpr.room_id
    WHERE rpr.rate_period_id = ?
    ORDER BY r.name ASC
  `).all(period.id);
  return period;
}

// GET /api/rate-periods?property_id=X
ratePeriodsRouter.get('/', (req, res) => {
  try {
    const propId = Number(req.query.property_id);
    if (!propId) return res.status(400).json({ error: 'property_id is required' });
    if (!canAccess(req.user.userId, req.user.role, propId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const rows = db.prepare(
      'SELECT * FROM rate_periods WHERE property_id = ? ORDER BY priority ASC, id ASC'
    ).all(propId);
    res.json(rows.map(attachRoomRates));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rate-periods
ratePeriodsRouter.post('/', (req, res) => {
  try {
    const { property_id, name, date_from, date_to, rate_type, rate_value, priority, roomRates } = req.body;
    if (!property_id || !name?.trim() || !date_from || !date_to) {
      return res.status(400).json({ error: 'property_id, name, date_from and date_to are required' });
    }
    if (!canAccess(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    const limit = PLAN_LIMITS[user?.plan ?? 'free'] ?? 0;
    if (limit === 0) {
      return res.status(403).json({ error: 'Seasonal pricing is a Pro feature. Upgrade to use it.' });
    }
    const count = db.prepare('SELECT COUNT(*) AS n FROM rate_periods WHERE property_id = ?').get(property_id).n;
    if (count >= limit) {
      return res.status(403).json({
        error: `Your plan allows a maximum of ${limit} rate periods. Upgrade to Multi for unlimited.`,
      });
    }

    let newId;
    try {
      db.exec('BEGIN');
      const result = db.prepare(
        `INSERT INTO rate_periods (property_id, name, date_from, date_to, rate_type, rate_value, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        property_id, name.trim(), date_from, date_to,
        rate_type ?? 'flat', Number(rate_value ?? 0), Number(priority ?? 0)
      );
      newId = Number(result.lastInsertRowid);

      const insertRoomRate = db.prepare(
        'INSERT OR REPLACE INTO rate_period_rooms (rate_period_id, room_id, amount) VALUES (?, ?, ?)'
      );
      for (const rr of (roomRates ?? [])) {
        if (rr.roomId && rr.amount > 0) insertRoomRate.run(newId, rr.roomId, rr.amount);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const period = db.prepare('SELECT * FROM rate_periods WHERE id = ?').get(newId);
    res.status(201).json(attachRoomRates(period));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/rate-periods/:id
ratePeriodsRouter.put('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const period = db.prepare('SELECT * FROM rate_periods WHERE id = ?').get(id);
    if (!period) return res.status(404).json({ error: 'Rate period not found' });
    if (!canAccess(req.user.userId, req.user.role, period.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const { name, date_from, date_to, rate_type, rate_value, priority, roomRates } = req.body;

    try {
      db.exec('BEGIN');
      db.prepare(
        `UPDATE rate_periods
         SET name = ?, date_from = ?, date_to = ?, rate_type = ?, rate_value = ?, priority = ?
         WHERE id = ?`
      ).run(
        name?.trim()  ?? period.name,
        date_from     ?? period.date_from,
        date_to       ?? period.date_to,
        rate_type     ?? period.rate_type,
        rate_value != null ? Number(rate_value) : period.rate_value,
        priority   != null ? Number(priority)   : period.priority,
        id
      );

      db.prepare('DELETE FROM rate_period_rooms WHERE rate_period_id = ?').run(id);
      const insertRoomRate = db.prepare(
        'INSERT INTO rate_period_rooms (rate_period_id, room_id, amount) VALUES (?, ?, ?)'
      );
      for (const rr of (roomRates ?? [])) {
        if (rr.roomId && rr.amount > 0) insertRoomRate.run(id, rr.roomId, rr.amount);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const updated = db.prepare('SELECT * FROM rate_periods WHERE id = ?').get(id);
    res.json(attachRoomRates(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/rate-periods/:id
ratePeriodsRouter.delete('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const period = db.prepare('SELECT * FROM rate_periods WHERE id = ?').get(id);
    if (!period) return res.status(404).json({ error: 'Rate period not found' });
    if (!canAccess(req.user.userId, req.user.role, period.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    db.prepare('DELETE FROM rate_periods WHERE id = ?').run(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
