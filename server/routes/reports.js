import { Router } from 'express';
import db from '../db/database.js';

export const reportsRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUserPropertyIds(userId, role) {
  if (role === 'owner') {
    const ids = db.prepare('SELECT id FROM properties WHERE owner_id = ?').all(userId).map(p => p.id);
    if (ids.length) return ids;
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
    return u?.property_id ? [Number(u.property_id)] : [];
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return u?.property_id ? [Number(u.property_id)] : [];
}

function requirePro(req, res) {
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
  if (!user || (user.plan !== 'pro' && user.plan !== 'multi')) {
    res.status(403).json({ error: 'Pro or Multi plan required.' });
    return false;
  }
  return true;
}

function resolvePropIds(userId, role, propertyId, userPropIds) {
  if (propertyId && propertyId !== 'all') {
    const pid = Number(propertyId);
    if (!userPropIds.includes(pid)) return null; // access denied
    return [pid];
  }
  return userPropIds;
}

// ── GET /api/reports/revenue ──────────────────────────────────────────────────
// Query params: from (YYYY-MM-DD), to (YYYY-MM-DD), propertyId, status
reportsRouter.get('/revenue', (req, res) => {
  if (!requirePro(req, res)) return;

  const { from, to, propertyId, status } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required.' });

  const userPropIds = getUserPropertyIds(req.user.userId, req.user.role);
  const propIds = resolvePropIds(req.user.userId, req.user.role, propertyId, userPropIds);
  if (!propIds) return res.status(403).json({ error: 'Access denied.' });
  if (!propIds.length) return res.json([]);

  const placeholders = propIds.map(() => '?').join(',');
  const args = [...propIds, from, to];

  let statusClause;
  if (status === 'confirmed') {
    statusClause = "AND b.status = 'confirmed'";
  } else if (status === 'checked_out') {
    statusClause = "AND b.status = 'checked_out'";
  } else {
    statusClause = "AND b.status NOT IN ('cancelled')";
  }

  try {
    const rows = db.prepare(`
      SELECT
        b.id, b.property_id, b.check_in_date, b.check_out_date,
        b.status, b.source, b.total_price, b.created_at,
        g.first_name  AS guest_first_name,
        g.last_name   AS guest_last_name,
        g.email       AS guest_email,
        r.name        AS room_name,
        r.price_per_night,
        p.name        AS property_name
      FROM bookings b
      LEFT JOIN guests     g ON b.guest_id    = g.id
      LEFT JOIN rooms      r ON b.room_id     = r.id
      LEFT JOIN properties p ON b.property_id = p.id
      WHERE b.property_id IN (${placeholders})
        AND b.check_in_date >= ?
        AND b.check_in_date <  ?
        ${statusClause}
      ORDER BY b.check_in_date ASC
    `).all(...args);
    res.json(rows);
  } catch (e) {
    console.error('[reports/revenue]', e);
    res.status(500).json({ error: 'Database error.' });
  }
});

// ── GET /api/reports/charges ──────────────────────────────────────────────────
// Query params: from (YYYY-MM-DD), to (YYYY-MM-DD), propertyId
// Multi plan only. Returns charges grouped by category with per-category tax.
reportsRouter.get('/charges', (req, res) => {
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
  if (!user || user.plan !== 'multi') {
    return res.status(403).json({ error: 'Multi plan required.' });
  }

  const { from, to, propertyId } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required.' });

  const userPropIds = getUserPropertyIds(req.user.userId, req.user.role);
  const propIds = resolvePropIds(req.user.userId, req.user.role, propertyId, userPropIds);
  if (!propIds) return res.status(403).json({ error: 'Access denied.' });
  if (!propIds.length) return res.json({ rows: [], totals: { count: 0, gross: 0, tax: 0, net: 0 } });

  const placeholders = propIds.map(() => '?').join(',');
  const args = [...propIds, from, to];

  try {
    const rawRows = db.prepare(`
      SELECT
        sc.id    AS category_id,
        sc.name  AS category_name,
        sc.color AS category_color,
        sc.icon  AS category_icon,
        COALESCE(sc.tax_rate, 0) AS tax_rate,
        COUNT(rc.id)    AS count,
        SUM(rc.amount)  AS gross
      FROM room_charges rc
      LEFT JOIN service_categories sc ON sc.id = rc.category_id
      WHERE rc.property_id IN (${placeholders})
        AND rc.voided_at IS NULL
        AND rc.charge_date >= ?
        AND rc.charge_date <  ?
      GROUP BY rc.category_id
      ORDER BY sc.name
    `).all(...args);

    let totalCount = 0, totalGross = 0, totalTax = 0, totalNet = 0;
    const rows = rawRows.map(r => {
      const gross   = r.gross || 0;
      const taxFrac = (r.tax_rate || 0) / 100;
      const tax     = gross * taxFrac;
      const net     = gross - tax;
      totalCount += r.count;
      totalGross += gross;
      totalTax   += tax;
      totalNet   += net;
      return { ...r, gross, tax, net };
    });

    res.json({
      rows,
      totals: { count: totalCount, gross: totalGross, tax: totalTax, net: totalNet },
    });
  } catch (e) {
    console.error('[reports/charges]', e);
    res.status(500).json({ error: 'Database error.' });
  }
});

// ── GET /api/reports/guests ───────────────────────────────────────────────────
// Query params: from, to, propertyId
reportsRouter.get('/guests', (req, res) => {
  if (!requirePro(req, res)) return;

  const { from, to, propertyId } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required.' });

  const userPropIds = getUserPropertyIds(req.user.userId, req.user.role);
  const propIds = resolvePropIds(req.user.userId, req.user.role, propertyId, userPropIds);
  if (!propIds) return res.status(403).json({ error: 'Access denied.' });
  if (!propIds.length) return res.json([]);

  const placeholders = propIds.map(() => '?').join(',');
  const args = [...propIds, from, to];

  try {
    const rows = db.prepare(`
      SELECT
        g.first_name, g.last_name, g.email,
        b.check_in_date, b.check_out_date,
        r.name AS room_name
      FROM bookings b
      LEFT JOIN guests g ON b.guest_id = g.id
      LEFT JOIN rooms  r ON b.room_id  = r.id
      WHERE b.property_id IN (${placeholders})
        AND b.check_in_date >= ?
        AND b.check_in_date <  ?
        AND b.status NOT IN ('cancelled')
        AND g.email IS NOT NULL AND g.email != ''
      ORDER BY b.check_in_date DESC
    `).all(...args);
    res.json(rows);
  } catch (e) {
    console.error('[reports/guests]', e);
    res.status(500).json({ error: 'Database error.' });
  }
});
