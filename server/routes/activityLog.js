import { Router } from 'express';
import db from '../db/database.js';

export const activityLogRouter = Router();

// ── GET /api/activity-log ─────────────────────────────────────────────────────
// Query params (all optional):
//   property_id — defaults to requester's active property
//   category    — auth | booking | guest | room | property | user
//   action      — specific action string
//   user_id     — filter by actor
//   from / to   — ISO date range (inclusive)
//   page / limit
// Pro/Multi plan required.
activityLogRouter.get('/', (req, res) => {
  try {
    const user = db.prepare('SELECT plan, property_id FROM users WHERE id = ?').get(req.user.userId);
    if (!user || (user.plan !== 'pro' && user.plan !== 'multi')) {
      return res.status(403).json({ error: 'Pro or Multi plan required.' });
    }

    const { category, action, user_id, from, to, page, limit } = req.query;
    let { property_id } = req.query;

    if (!property_id) property_id = user.property_id;
    if (!property_id) return res.status(400).json({ error: 'property_id required' });

    // Owners: verify they own this property. Reception: use their own property only.
    if (req.user.role === 'owner') {
      const owns = db.prepare(
        'SELECT id FROM properties WHERE id = ? AND owner_id = ?'
      ).get(Number(property_id), req.user.userId);
      if (!owns) return res.status(403).json({ error: 'Access denied.' });
    } else {
      if (Number(user.property_id) !== Number(property_id)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    const conditions = ['property_id = ?'];
    const params     = [Number(property_id)];

    if (category) { conditions.push('category = ?');  params.push(category); }
    if (action)   { conditions.push('action = ?');    params.push(action); }
    if (user_id)  { conditions.push('user_id = ?');   params.push(Number(user_id)); }
    if (from)     { conditions.push("date(timestamp) >= ?"); params.push(from); }
    if (to)       { conditions.push("date(timestamp) <= ?"); params.push(to); }

    const where = 'WHERE ' + conditions.join(' AND ');

    const pageNum   = Math.max(1, Number(page) || 1);
    const pageLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const offset    = (pageNum - 1) * pageLimit;

    const total = db.prepare(`SELECT COUNT(*) as n FROM audit_log ${where}`).get(...params).n;
    const rows  = db.prepare(
      `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).all(...params, pageLimit, offset);

    res.json({ logs: rows, total, page: pageNum, totalPages: Math.ceil(total / pageLimit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
