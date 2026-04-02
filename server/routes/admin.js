import { Router } from 'express';
import db from '../db/database.js';

export const adminRouter = Router();

const PLAN_MRR = { pro: 19, multi: 39 };

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
adminRouter.get('/stats', (req, res) => {
  const totalProperties = db.prepare('SELECT COUNT(*) as n FROM properties').get().n;
  const totalUsers      = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const proSubs         = db.prepare("SELECT COUNT(*) as n FROM subscriptions WHERE plan='pro'  AND status='active'").get().n;
  const multiSubs       = db.prepare("SELECT COUNT(*) as n FROM subscriptions WHERE plan='multi' AND status='active'").get().n;
  const newThisWeek     = db.prepare("SELECT COUNT(*) as n FROM users WHERE datetime(created_at) >= datetime('now','-7 days')").get().n;
  const mrr             = proSubs * PLAN_MRR.pro + multiSubs * PLAN_MRR.multi;

  res.json({ totalProperties, totalUsers, proSubs, multiSubs, mrr, newThisWeek });
});

// ── GET /api/admin/signups ────────────────────────────────────────────────────
adminRouter.get('/signups', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.plan, u.created_at,
           p.name as property_name
    FROM users u
    LEFT JOIN properties p ON p.id = u.property_id
    ORDER BY u.created_at DESC
    LIMIT 10
  `).all();
  res.json(rows);
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
adminRouter.get('/users', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.plan, u.created_at,
           p.name as property_name, p.country
    FROM users u
    LEFT JOIN properties p ON p.id = u.property_id
    ORDER BY u.created_at DESC
  `).all();
  res.json(rows);
});

// ── GET /api/admin/properties ─────────────────────────────────────────────────
adminRouter.get('/properties', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.type, p.country, p.created_at,
           u.email as owner_email, u.plan,
           (SELECT COUNT(*) FROM rooms    r WHERE r.property_id = p.id) as rooms_count,
           (SELECT COUNT(*) FROM bookings b WHERE b.property_id = p.id) as bookings_count
    FROM properties p
    LEFT JOIN users u ON u.property_id = p.id AND u.role = 'owner'
    ORDER BY p.created_at DESC
  `).all();
  res.json(rows);
});

// ── GET /api/admin/revenue ────────────────────────────────────────────────────
adminRouter.get('/revenue', (req, res) => {
  const planCounts = db.prepare(`
    SELECT plan, COUNT(*) as count
    FROM subscriptions
    WHERE status = 'active'
    GROUP BY plan
  `).all();

  const monthlyRaw = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
    FROM users
    GROUP BY strftime('%Y-%m', created_at)
    ORDER BY month ASC
  `).all();

  // Build last-6-months array, filling zeros for gaps
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key   = d.toISOString().slice(0, 7);
    const found = monthlyRaw.find(m => m.month === key);
    months.push({ month: key, count: found ? found.count : 0 });
  }

  res.json({ planCounts, signupsByMonth: months });
});

// ── GET /api/admin/geography ──────────────────────────────────────────────────
adminRouter.get('/geography', (req, res) => {
  const rows = db.prepare(`
    SELECT country, COUNT(*) as count
    FROM properties
    WHERE country IS NOT NULL AND country != ''
    GROUP BY country
    ORDER BY count DESC
  `).all();

  const total = rows.reduce((s, r) => s + r.count, 0);
  res.json(rows.map(r => ({
    country:    r.country,
    count:      r.count,
    percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
  })));
});
