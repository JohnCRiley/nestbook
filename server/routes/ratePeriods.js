import { Router } from 'express';
import db from '../db/database.js';

export const ratePeriodsRouter = Router();

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
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rate-periods
ratePeriodsRouter.post('/', (req, res) => {
  try {
    const { property_id, name, date_from, date_to, rate_type, rate_value, priority } = req.body;
    if (!property_id || !name?.trim() || !date_from || !date_to || !rate_type || rate_value == null) {
      return res.status(400).json({ error: 'property_id, name, date_from, date_to, rate_type and rate_value are required' });
    }
    if (!['flat', 'multiplier'].includes(rate_type)) {
      return res.status(400).json({ error: 'rate_type must be flat or multiplier' });
    }
    if (!canAccess(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    const limit = PLAN_LIMITS[user?.plan ?? 'free'] ?? 0;
    if (limit === 0) {
      return res.status(403).json({ error: 'Seasonal pricing is a Pro feature. Upgrade to use it.' });
    }
    const count = db.prepare(
      'SELECT COUNT(*) AS n FROM rate_periods WHERE property_id = ?'
    ).get(property_id).n;
    if (count >= limit) {
      return res.status(403).json({
        error: `Your plan allows a maximum of ${limit} rate periods. Upgrade to Multi for unlimited.`,
      });
    }

    const result = db.prepare(
      `INSERT INTO rate_periods (property_id, name, date_from, date_to, rate_type, rate_value, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(property_id, name.trim(), date_from, date_to, rate_type, Number(rate_value), Number(priority ?? 0));

    res.status(201).json(db.prepare('SELECT * FROM rate_periods WHERE id = ?').get(result.lastInsertRowid));
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

    const { name, date_from, date_to, rate_type, rate_value, priority } = req.body;
    db.prepare(
      `UPDATE rate_periods
       SET name = ?, date_from = ?, date_to = ?, rate_type = ?, rate_value = ?, priority = ?
       WHERE id = ?`
    ).run(
      name?.trim() ?? period.name,
      date_from    ?? period.date_from,
      date_to      ?? period.date_to,
      rate_type    ?? period.rate_type,
      rate_value   != null ? Number(rate_value)  : period.rate_value,
      priority     != null ? Number(priority)    : period.priority,
      id
    );

    res.json(db.prepare('SELECT * FROM rate_periods WHERE id = ?').get(id));
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
