import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import Stripe from 'stripe';
import bcrypt from 'bcryptjs';
import db from '../db/database.js';
import { outreachRouter } from './outreach.js';
import { prospectFinderRouter } from './prospectFinder.js';
import { ROOM_UPLOAD_DIR } from './roomPhotos.js';
import { sendContentRemovedEmail } from '../email/emailService.js';

export const adminRouter = Router();

// Mount sub-routers — must come before any catch-all routes
adminRouter.use('/outreach', outreachRouter);
adminRouter.use('/prospect-finder', prospectFinderRouter);

const PLAN_MRR  = { pro: 19, multi: 39 };

// ── Blog image upload setup ───────────────────────────────────────────────────
const __dirname   = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR     = join(__dirname, '../public/blog');
const BLOG_IMG_DIR = join(__dirname, '../public/images/blog');

fs.mkdirSync(BLOG_IMG_DIR, { recursive: true });

const blogImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, '/tmp'),
    filename:    (req, file, cb) => cb(null, `blog-${Date.now()}.tmp`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('JPEG, PNG or WebP only'));
    }
  },
});
const stripe    = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

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
// Enriched with subscription data for plan management controls.
// Query params: page, limit, search (name/email/property), plan, role,
//               status (active/suspended/cancelled), propertyType, from, to
adminRouter.get('/users', (req, res) => {
  try {
    const { page, limit, search, plan, role, status, propertyType, from, to } = req.query;
    const conditions = [];
    const params     = [];

    if (search) {
      const pattern = `%${search}%`;
      if (/^\d+$/.test(search)) {
        const numId = Number(search);
        conditions.push(`(u.name LIKE ? OR u.email LIKE ? OR p.name LIKE ? OR p.id = ?
          OR EXISTS (SELECT 1 FROM properties p3 WHERE p3.owner_id = u.id AND p3.id = ?))`);
        params.push(pattern, pattern, pattern, numId, numId);
      } else {
        conditions.push('(u.name LIKE ? OR u.email LIKE ? OR p.name LIKE ?)');
        params.push(pattern, pattern, pattern);
      }
    }
    if (plan && plan !== 'all') {
      conditions.push('u.plan = ?');
      params.push(plan);
    }
    if (role && role !== 'all') {
      conditions.push('u.role = ?');
      params.push(role);
    }
    if (propertyType && propertyType !== 'all') {
      conditions.push('p.type = ?');
      params.push(propertyType);
    }
    if (from) {
      conditions.push('date(u.created_at) >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('date(u.created_at) <= ?');
      params.push(to);
    }
    if (status === 'active') {
      conditions.push('u.suspended = 0');
      conditions.push("(s.status = 'active' OR s.id IS NULL)");
    } else if (status === 'suspended') {
      conditions.push('u.suspended = 1');
    } else if (status === 'cancelled') {
      conditions.push("s.status = 'cancelled'");
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const BASE_SELECT = `
      SELECT u.id, u.name, u.email, u.role, u.plan, u.created_at,
             u.discount_code, u.suspended, u.email_verified,
             u.subscription_status, u.past_due_since,
             p.id as property_id, p.name as property_name, p.type as property_type, p.country,
             s.stripe_customer_id, s.stripe_subscription_id,
             s.status as sub_status, s.current_period_end,
             s.notes as sub_notes, s.cancel_at_period_end,
             (SELECT GROUP_CONCAT(CAST(p2.id AS TEXT) || ':' || p2.name, '|')
              FROM properties p2 WHERE p2.owner_id = u.id ORDER BY p2.id) as owned_properties
      FROM users u
      LEFT JOIN properties p ON p.id = u.property_id
      LEFT JOIN subscriptions s ON s.user_id = u.id
    `;

    const COUNT_FROM = `
      FROM users u
      LEFT JOIN properties p ON p.id = u.property_id
      LEFT JOIN subscriptions s ON s.user_id = u.id
      ${where}
    `;

    if (page) {
      const pageNum   = Math.max(1, Number(page));
      const pageLimit = Math.min(100, Math.max(1, Number(limit) || 25));
      const offset    = (pageNum - 1) * pageLimit;

      const total = db.prepare(`SELECT COUNT(*) as n ${COUNT_FROM}`).get(...params).n;
      const rows  = db.prepare(
        `${BASE_SELECT} ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
      ).all(...params, pageLimit, offset);

      return res.json({ users: rows, total, page: pageNum, totalPages: Math.ceil(total / pageLimit) });
    }

    res.json(db.prepare(`${BASE_SELECT} ${where} ORDER BY u.created_at DESC`).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/users/:id/set-plan ────────────────────────────────────────
// Sets a user's plan directly in the DB — no Stripe interaction.
adminRouter.post('/users/:id/set-plan', (req, res) => {
  const { plan } = req.body;
  if (!['free', 'pro', 'multi'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }
  const userId = Number(req.params.id);

  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);

  const existing = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare('UPDATE subscriptions SET plan = ? WHERE user_id = ?').run(plan, userId);
  } else if (plan !== 'free') {
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, status)
      VALUES (?, ?, 'active')
    `).run(userId, plan);
  }

  res.json({ success: true, plan });
});

// ── POST /api/admin/users/:id/comp ────────────────────────────────────────────
// Sets plan to Pro with "Complimentary" note. Cancels any active Stripe sub.
adminRouter.post('/users/:id/comp', async (req, res) => {
  const userId = Number(req.params.id);

  // Cancel any active Stripe subscription immediately
  const sub = db.prepare('SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ?').get(userId);
  if (stripe && sub?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      console.warn('[admin/comp] Stripe cancel failed:', err.message);
    }
  }

  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('pro', userId);

  const existing = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare(`
      UPDATE subscriptions
      SET plan = 'pro', status = 'active', notes = 'Complimentary',
          stripe_subscription_id = NULL, cancel_at_period_end = 0
      WHERE user_id = ?
    `).run(userId);
  } else {
    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, status, notes)
      VALUES (?, 'pro', 'active', 'Complimentary')
    `).run(userId);
  }

  res.json({ success: true });
});

// ── POST /api/admin/users/:id/cancel-subscription ────────────────────────────
// Cancels Stripe subscription at period end. Keeps access until then.
adminRouter.post('/users/:id/cancel-subscription', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured.' });

  const userId = Number(req.params.id);
  const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);

  if (!sub?.stripe_subscription_id) {
    return res.status(400).json({ error: 'No active Stripe subscription found for this user.' });
  }

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
    db.prepare('UPDATE subscriptions SET cancel_at_period_end = 1 WHERE user_id = ?').run(userId);
    res.json({ success: true, cancel_at: sub.current_period_end });
  } catch (err) {
    console.error('[admin/cancel-sub]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/users/:id/refund ─────────────────────────────────────────
// Issues a Stripe refund. Body: { amount? } — amount in euros; omit for full refund.
adminRouter.post('/users/:id/refund', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured.' });

  const userId = Number(req.params.id);
  const sub = db.prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?').get(userId);

  if (!sub?.stripe_customer_id) {
    return res.status(400).json({ error: 'No Stripe customer found for this user.' });
  }

  const { amount } = req.body; // euros, optional

  try {
    const invoices = await stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 1 });
    const invoice  = invoices.data[0];
    if (!invoice?.payment_intent) {
      return res.status(400).json({ error: 'No recent payment found for this customer.' });
    }

    const pi       = await stripe.paymentIntents.retrieve(invoice.payment_intent);
    const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
    if (!chargeId) return res.status(400).json({ error: 'No charge found on payment.' });

    const refundParams = { charge: chargeId };
    if (amount) refundParams.amount = Math.round(Number(amount) * 100); // euros → cents

    const refund = await stripe.refunds.create(refundParams);
    res.json({ refund_id: refund.id, amount: refund.amount / 100, status: refund.status });
  } catch (err) {
    console.error('[admin/refund]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/discount-codes ────────────────────────────────────────────
adminRouter.get('/discount-codes', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM discount_codes ORDER BY created_at DESC
  `).all();
  res.json(rows);
});

// ── POST /api/admin/discount-codes ───────────────────────────────────────────
// Creates a discount code and a corresponding Stripe coupon.
adminRouter.post('/discount-codes', async (req, res) => {
  const { code, discount_percent, duration, duration_months, max_uses } = req.body;

  if (!code?.trim()) return res.status(400).json({ error: 'Code is required.' });
  if (!discount_percent || discount_percent < 1 || discount_percent > 100) {
    return res.status(400).json({ error: 'Discount percent must be 1–100.' });
  }
  if (!['once', 'repeating', 'forever'].includes(duration)) {
    return res.status(400).json({ error: 'Invalid duration.' });
  }
  if (duration === 'repeating' && !duration_months) {
    return res.status(400).json({ error: 'duration_months required for repeating discount.' });
  }

  const upperCode = code.trim().toUpperCase();

  const existing = db.prepare('SELECT id FROM discount_codes WHERE code = ?').get(upperCode);
  if (existing) return res.status(409).json({ error: `Code "${upperCode}" already exists.` });

  let stripeCouponId = null;
  if (stripe) {
    try {
      const couponParams = {
        id:           upperCode,
        name:         upperCode,
        percent_off:  Number(discount_percent),
        duration,
        ...(duration === 'repeating' ? { duration_in_months: Number(duration_months) } : {}),
      };
      const coupon = await stripe.coupons.create(couponParams);
      stripeCouponId = coupon.id;
    } catch (err) {
      console.warn('[admin/discount-codes] Stripe coupon create failed:', err.message);
      // Continue — code still works for manual application even without Stripe coupon
    }
  }

  db.prepare(`
    INSERT INTO discount_codes
      (code, discount_percent, duration, duration_months, max_uses, stripe_coupon_id, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(
    upperCode,
    Number(discount_percent),
    duration,
    duration_months ? Number(duration_months) : null,
    max_uses ? Number(max_uses) : null,
    stripeCouponId,
  );

  const row = db.prepare('SELECT * FROM discount_codes WHERE code = ?').get(upperCode);
  res.status(201).json(row);
});

// ── DELETE /api/admin/discount-codes/:id ─────────────────────────────────────
// Deactivates a discount code (and archives the Stripe coupon).
adminRouter.delete('/discount-codes/:id', async (req, res) => {
  const row = db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Discount code not found.' });

  db.prepare('UPDATE discount_codes SET active = 0 WHERE id = ?').run(req.params.id);

  if (stripe && row.stripe_coupon_id) {
    try { await stripe.coupons.del(row.stripe_coupon_id); } catch (_) {}
  }

  res.json({ success: true });
});

// ── GET /api/admin/properties ─────────────────────────────────────────────────
// Query params: page (default 1), limit (default 25), search (name/country)
adminRouter.get('/properties', (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const conditions = [];
    const params     = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push('(p.name LIKE ? OR p.country LIKE ?)');
      params.push(pattern, pattern);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const BASE_SELECT = `
      SELECT p.id, p.name, p.type, p.country, p.created_at, p.is_demo,
             u.email as owner_email, u.plan,
             (SELECT COUNT(*) FROM rooms    r WHERE r.property_id = p.id) as rooms_count,
             (SELECT COUNT(*) FROM bookings b WHERE b.property_id = p.id) as bookings_count
      FROM properties p
      LEFT JOIN users u ON u.property_id = p.id AND u.role = 'owner'
    `;

    if (page) {
      const pageNum   = Math.max(1, Number(page));
      const pageLimit = Math.min(100, Math.max(1, Number(limit) || 25));
      const offset    = (pageNum - 1) * pageLimit;

      const total = db.prepare(`SELECT COUNT(*) as n FROM properties p ${where}`).get(...params).n;
      const rows  = db.prepare(
        `${BASE_SELECT} ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
      ).all(...params, pageLimit, offset);

      return res.json({ properties: rows, total, page: pageNum, totalPages: Math.ceil(total / pageLimit) });
    }

    res.json(db.prepare(`${BASE_SELECT} ${where} ORDER BY p.created_at DESC`).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/properties/:id/demo ─────────────────────────────────────
adminRouter.patch('/properties/:id/demo', (req, res) => {
  try {
    const { is_demo } = req.body;
    db.prepare(`UPDATE properties SET is_demo = ? WHERE id = ?`).run(is_demo ? 1 : 0, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// ── POST /api/admin/users/:id/verify-email ───────────────────────────────────
// Manually marks a user's email as verified. Useful for test/demo accounts.
adminRouter.post('/users/:id/verify-email', (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  db.prepare('UPDATE users SET email_verified = 1, email_verification_token = NULL WHERE id = ?').run(userId);
  res.json({ success: true });
});

// ── POST /api/admin/users/:id/suspend ────────────────────────────────────────
// Blocks the user from logging in. Does not cancel their subscription.
adminRouter.post('/users/:id/suspend', (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  db.prepare('UPDATE users SET suspended = 1 WHERE id = ?').run(userId);
  res.json({ success: true });
});

// ── POST /api/admin/users/:id/unsuspend ──────────────────────────────────────
adminRouter.post('/users/:id/unsuspend', (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  db.prepare('UPDATE users SET suspended = 0 WHERE id = ?').run(userId);
  res.json({ success: true });
});

// ── POST /api/admin/users/:id/reset-password ─────────────────────────────────
adminRouter.post('/users/:id/reset-password', async (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const digits = Math.floor(100000 + Math.random() * 900000);
  const tempPassword = `Temp${digits}`;
  const hash = await bcrypt.hash(tempPassword, 10);

  db.prepare(
    'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?'
  ).run(hash, userId);

  console.log(`[admin/reset-password] Temp password set for user ${userId} (${user.email})`);
  res.json({ success: true, tempPassword });
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
// GDPR account deletion: cancels Stripe sub, wipes all user data from the DB.
adminRouter.delete('/users/:id', async (req, res) => {
  const userId = Number(req.params.id);
  console.log('[admin/delete-user] Request for user:', userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Cancel any active Stripe subscription immediately (best effort)
  const sub = db.prepare('SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ?').get(userId);
  if (stripe && sub?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      console.warn('[admin/delete] Stripe cancel failed:', err.message);
    }
  }

  // Collect ALL properties owned by this user (multi-property owners may have more than one)
  const ownedProps = db.prepare('SELECT id FROM properties WHERE owner_id = ?').all(userId);
  const propIds    = ownedProps.map((p) => p.id);

  try {
    db.exec('BEGIN');

    if (propIds.length > 0) {
      const ph = propIds.map(() => '?').join(',');
      // 1. Nullify FK self-references (no CASCADE on these columns)
      db.prepare(`UPDATE users SET property_id = NULL WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`UPDATE guests SET property_id = NULL WHERE property_id IN (${ph})`).run(...propIds);
      // 2. Delete all tables referencing property_id or room_id with no CASCADE
      db.prepare(`DELETE FROM audit_log WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM property_expenses WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM error_reports WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM room_photos WHERE room_id IN (SELECT id FROM rooms WHERE property_id IN (${ph}))`).run(...propIds);
      db.prepare(`DELETE FROM room_charges WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM bookings WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM service_categories WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM rate_periods WHERE property_id IN (${ph})`).run(...propIds);
      // 3. Now safe to delete rooms then the properties
      db.prepare(`DELETE FROM rooms WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM properties WHERE id IN (${ph})`).run(...propIds);
    }

    // Clean orphaned guests
    db.prepare(
      'DELETE FROM guests WHERE id NOT IN (SELECT DISTINCT guest_id FROM bookings WHERE guest_id IS NOT NULL)'
    ).run();

    // room_charges.charged_by / voided_by → users(id) no CASCADE
    db.prepare('UPDATE room_charges SET charged_by = NULL WHERE charged_by = ?').run(userId);
    db.prepare('UPDATE room_charges SET voided_by = NULL WHERE voided_by = ?').run(userId);
    // audit_log.user_id → users(id) no CASCADE
    db.prepare('DELETE FROM audit_log WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    db.exec('COMMIT');
    console.log('[admin/delete-user] Successfully deleted user:', userId);
    res.json({ success: true });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[admin/delete-user] Error:', err.message);
    res.status(500).json({ error: 'Failed to delete account: ' + err.message });
  }
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

// ── GET /api/admin/bi ────────────────────────────────────────────────────────
// Full business intelligence dashboard data: MRR, growth, churn, trials, etc.
adminRouter.get('/bi', (req, res) => {
  try {
    // Current plan distribution
    const planRows = db.prepare(`
      SELECT plan, COUNT(*) as count FROM users GROUP BY plan
    `).all();
    const proCount   = planRows.find(p => p.plan === 'pro')?.count   ?? 0;
    const multiCount = planRows.find(p => p.plan === 'multi')?.count ?? 0;
    const freeCount  = planRows.find(p => p.plan === 'free')?.count  ?? 0;
    const mrr        = proCount * PLAN_MRR.pro + multiCount * PLAN_MRR.multi;

    // Active paid subscriptions
    const activeSubscriptions = db.prepare(`
      SELECT COUNT(*) as n FROM subscriptions WHERE status = 'active' AND plan IN ('pro','multi')
    `).get().n;

    // Signups by plan per month — last 12 months
    const signupsByMonth = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const rows = db.prepare(`
        SELECT plan, COUNT(*) as count FROM users
        WHERE strftime('%Y-%m', created_at) = ?
        GROUP BY plan
      `).all(key);
      signupsByMonth.push({
        month: key,
        free:  rows.find(r => r.plan === 'free')?.count  ?? 0,
        pro:   rows.find(r => r.plan === 'pro')?.count   ?? 0,
        multi: rows.find(r => r.plan === 'multi')?.count ?? 0,
      });
    }

    // MRR trend — last 6 months (cumulative active paid subs created up to that month)
    const mrrTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const rows = db.prepare(`
        SELECT plan, COUNT(*) as count FROM subscriptions
        WHERE status = 'active' AND plan IN ('pro','multi')
        AND strftime('%Y-%m', created_at) <= ?
        GROUP BY plan
      `).all(key);
      const p = rows.find(r => r.plan === 'pro')?.count   ?? 0;
      const m = rows.find(r => r.plan === 'multi')?.count ?? 0;
      mrrTrend.push({ month: key, pro: p, multi: m, mrr: p * PLAN_MRR.pro + m * PLAN_MRR.multi });
    }

    // Conversions in last 30 days (new paid subs)
    const newPaidLast30  = db.prepare(`
      SELECT COUNT(*) as n FROM subscriptions
      WHERE plan IN ('pro','multi') AND status = 'active'
      AND datetime(created_at) >= datetime('now','-30 days')
    `).get().n;
    const newUsersLast30 = db.prepare(`
      SELECT COUNT(*) as n FROM users
      WHERE datetime(created_at) >= datetime('now','-30 days')
    `).get().n;
    const conversionRate = newUsersLast30 > 0 ? Math.round((newPaidLast30 / newUsersLast30) * 100) : 0;

    // Churn — total cancelled subscriptions
    const churned = db.prepare(`
      SELECT COUNT(*) as n FROM subscriptions WHERE status = 'cancelled'
    `).get().n;

    // Net new revenue this month
    const newThisMonth = db.prepare(`
      SELECT plan, COUNT(*) as count FROM subscriptions
      WHERE status = 'active' AND plan IN ('pro','multi')
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m','now')
      GROUP BY plan
    `).all();
    const newProThisMonth   = newThisMonth.find(r => r.plan === 'pro')?.count   ?? 0;
    const newMultiThisMonth = newThisMonth.find(r => r.plan === 'multi')?.count ?? 0;
    const netNewRevenue     = newProThisMonth * PLAN_MRR.pro + newMultiThisMonth * PLAN_MRR.multi;

    // Trials / subscriptions ending in next 7 days
    const trialsEndingSoon = db.prepare(`
      SELECT COUNT(*) as n FROM subscriptions
      WHERE status = 'active' AND plan IN ('pro','multi')
      AND current_period_end IS NOT NULL
      AND date(current_period_end) BETWEEN date('now') AND date('now','+7 days')
    `).get().n;

    // Failed payments
    const failedPayments = db.prepare(`
      SELECT COUNT(*) as n FROM subscriptions WHERE status = 'past_due'
    `).get().n;

    res.json({
      mrr, proCount, multiCount, freeCount,
      activeSubscriptions,
      signupsByMonth, mrrTrend,
      conversionRate, newPaidLast30, newUsersLast30,
      churned, trialsEndingSoon, failedPayments,
      netNewRevenue, newProThisMonth, newMultiThisMonth,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/export ─────────────────────────────────────────────────────
// Accountant export data. Query params: from (YYYY-MM-DD), to (YYYY-MM-DD)
// Returns: { subscriptions, monthlySummary, customerList }
adminRouter.get('/export', (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

    const PLAN_AMOUNT = { pro: 19, multi: 39 };

    // Per-subscription rows created in the date range
    const subRows = db.prepare(`
      SELECT
        s.id, s.stripe_subscription_id, s.plan, s.status,
        s.created_at, s.current_period_end, s.cancel_at_period_end,
        u.name, u.email,
        p.country
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN properties p ON p.owner_id = s.user_id
      WHERE s.plan IN ('pro','multi')
        AND date(s.created_at) BETWEEN date(?) AND date(?)
      ORDER BY s.created_at ASC
    `).all(from, to);

    const subscriptions = subRows.map(r => ({
      id:             r.id,
      stripeId:       r.stripe_subscription_id,
      plan:           r.plan,
      status:         r.status,
      createdAt:      r.created_at,
      periodEnd:      r.current_period_end,
      name:           r.name,
      email:          r.email,
      country:        r.country ?? '',
      amount:         PLAN_AMOUNT[r.plan] ?? 0,
    }));

    // Monthly summary: for each calendar month between from → to,
    // count new subs, cancellations, total active at end of month, MRR
    const monthlySummary = [];
    const fromDate = new Date(from);
    const toDate   = new Date(to);
    fromDate.setDate(1);
    let cur = new Date(fromDate);
    while (cur <= toDate) {
      const key = cur.toISOString().slice(0, 7);

      const newSubs = db.prepare(`
        SELECT plan, COUNT(*) as count FROM subscriptions
        WHERE plan IN ('pro','multi') AND strftime('%Y-%m', created_at) = ?
        GROUP BY plan
      `).all(key);

      const cancelled = db.prepare(`
        SELECT COUNT(*) as n FROM subscriptions
        WHERE status = 'cancelled' AND strftime('%Y-%m', created_at) = ?
      `).get(key).n;

      const activeRows = db.prepare(`
        SELECT plan, COUNT(*) as count FROM subscriptions
        WHERE status = 'active' AND plan IN ('pro','multi')
          AND strftime('%Y-%m', created_at) <= ?
        GROUP BY plan
      `).all(key);

      const proNew   = newSubs.find(r => r.plan === 'pro')?.count   ?? 0;
      const multiNew = newSubs.find(r => r.plan === 'multi')?.count ?? 0;
      const proAct   = activeRows.find(r => r.plan === 'pro')?.count   ?? 0;
      const multiAct = activeRows.find(r => r.plan === 'multi')?.count ?? 0;
      const mrr      = proAct * PLAN_AMOUNT.pro + multiAct * PLAN_AMOUNT.multi;
      const revenue  = proNew * PLAN_AMOUNT.pro + multiNew * PLAN_AMOUNT.multi;

      monthlySummary.push({
        month:       key,
        newPro:      proNew,
        newMulti:    multiNew,
        cancelled,
        activePro:   proAct,
        activeMulti: multiAct,
        mrr,
        revenue,
      });

      cur.setMonth(cur.getMonth() + 1);
    }

    // Customer list: all currently paying customers (active pro/multi) with country etc.
    const custRows = db.prepare(`
      SELECT
        u.name, u.email, u.plan, u.created_at as userCreated,
        s.created_at as subStart,
        p.country
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN properties p ON p.owner_id = s.user_id
      WHERE s.status = 'active' AND s.plan IN ('pro','multi')
      ORDER BY s.created_at ASC
    `).all();

    const customerList = custRows.map(r => ({
      name:     r.name,
      email:    r.email,
      country:  r.country ?? '',
      plan:     r.plan,
      amount:   PLAN_AMOUNT[r.plan] ?? 0,
      subStart: r.subStart,
    }));

    res.json({ subscriptions, monthlySummary, customerList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/mailing-list ───────────────────────────────────────────────
// Returns filtered users for the mailing list / export tool.
// Never exposes passwords or sensitive auth data.
// Query params: plan, propertyType, country, language, status,
//               registeredFrom (YYYY-MM-DD), registeredTo (YYYY-MM-DD),
//               verifiedOnly, page (default 1), limit (default 50, max 5000 for export)
adminRouter.get('/mailing-list', (req, res) => {
  try {
    const {
      plan, propertyType, country, language, status,
      registeredFrom, registeredTo, verifiedOnly,
      page, limit,
    } = req.query;

    const conditions = [];
    const params     = [];

    if (plan && plan !== 'all') {
      conditions.push('u.plan = ?');
      params.push(plan);
    }

    if (propertyType && propertyType !== 'all') {
      conditions.push('p.type = ?');
      params.push(propertyType);
    }

    // Country — flexible LIKE match to handle free-text input
    if (country && country !== 'all') {
      if (country === 'other') {
        conditions.push(
          `(p.country IS NULL OR p.country = '' OR (p.country NOT LIKE '%UK%' AND p.country NOT LIKE '%United Kingdom%' AND p.country NOT LIKE '%France%' AND p.country NOT LIKE '%Spain%' AND p.country NOT LIKE '%Germany%' AND p.country NOT LIKE '%Deutschland%' AND p.country NOT LIKE '%Netherlands%' AND p.country NOT LIKE '%Nederland%'))`
        );
      } else {
        const COUNTRY_PATTERNS = {
          UK:          ['%UK%', '%United Kingdom%', '%Britain%'],
          France:      ['%France%'],
          Spain:       ['%Spain%', '%España%'],
          Germany:     ['%Germany%', '%Deutschland%'],
          Netherlands: ['%Netherlands%', '%Nederland%', '%Holland%'],
        };
        const patterns = COUNTRY_PATTERNS[country] ?? [`%${country}%`];
        const likeClause = patterns.map(() => 'p.country LIKE ?').join(' OR ');
        conditions.push(`(${likeClause})`);
        params.push(...patterns);
      }
    }

    if (language && language !== 'all') {
      conditions.push('p.locale = ?');
      params.push(language);
    }

    if (verifiedOnly === 'true') {
      conditions.push('u.email_verified = 1');
    }

    if (registeredFrom) {
      conditions.push("date(u.created_at) >= ?");
      params.push(registeredFrom);
    }
    if (registeredTo) {
      conditions.push("date(u.created_at) <= ?");
      params.push(registeredTo);
    }

    // Status filter
    if (status === 'active') {
      conditions.push('u.suspended = 0');
      conditions.push("(s.status = 'active' OR s.id IS NULL)");
    } else if (status === 'suspended') {
      conditions.push('u.suspended = 1');
    } else if (status === 'cancelled') {
      conditions.push("s.status = 'cancelled'");
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const BASE_FROM = `
      FROM users u
      LEFT JOIN properties p ON p.id = u.property_id
      LEFT JOIN subscriptions s ON s.user_id = u.id
      ${where}
    `;

    const pageNum   = Math.max(1, Number(page) || 1);
    const pageLimit = Math.min(5000, Math.max(1, Number(limit) || 50));
    const offset    = (pageNum - 1) * pageLimit;

    const total = db.prepare(`SELECT COUNT(*) as n ${BASE_FROM}`).get(...params).n;
    const rows  = db.prepare(`
      SELECT u.id, u.name, u.email, u.plan, u.created_at, u.email_verified,
             u.suspended,
             p.type AS property_type, p.country, p.locale AS language
      ${BASE_FROM}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageLimit, offset);

    res.json({ users: rows, total, page: pageNum, totalPages: Math.ceil(total / pageLimit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/audit-log ──────────────────────────────────────────────────
// Cross-property activity log for super admins.
// Query params: property_id, category, action, from, to, page, limit
adminRouter.get('/audit-log', (req, res) => {
  try {
    const { property_id, category, action, from, to, user, page, limit } = req.query;

    const conditions = [];
    const params     = [];

    if (property_id) { conditions.push('a.property_id = ?');     params.push(Number(property_id)); }
    if (category)    { conditions.push('a.category = ?');         params.push(category); }
    if (action)      { conditions.push('a.action = ?');           params.push(action); }
    if (from)        { conditions.push("date(a.timestamp) >= ?"); params.push(from); }
    if (to)          { conditions.push("date(a.timestamp) <= ?"); params.push(to); }
    if (user)        { conditions.push('u.email = ?');            params.push(user); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const pageNum   = Math.max(1, Number(page) || 1);
    const pageLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const offset    = (pageNum - 1) * pageLimit;

    const total = db.prepare(
      `SELECT COUNT(*) as n
       FROM audit_log a
       LEFT JOIN users u ON a.user_id = u.id
       ${where}`
    ).get(...params).n;
    const rows  = db.prepare(
      `SELECT a.*, p.name as property_name, u.email as user_email, u.name as user_name
       FROM audit_log a
       LEFT JOIN properties p ON a.property_id = p.id
       LEFT JOIN users u ON a.user_id = u.id
       ${where} ORDER BY a.timestamp DESC LIMIT ? OFFSET ?`
    ).all(...params, pageLimit, offset);

    const oldest  = db.prepare(`SELECT MIN(timestamp) as ts FROM audit_log`).get()?.ts ?? null;
    const todayCt = db.prepare(`SELECT COUNT(*) as n FROM audit_log WHERE date(timestamp) = date('now')`).get().n;

    res.json({ logs: rows, total, page: pageNum, totalPages: Math.ceil(total / pageLimit), oldest, todayCount: todayCt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/audit-log/export ──────────────────────────────────────────
// Downloads all matching audit log entries as a CSV file (no pagination).
adminRouter.get('/audit-log/export', (req, res) => {
  try {
    const { propertyId, property_id, category, action, from, to, search } = req.query;
    const propId = propertyId || property_id;

    const conditions = [];
    const params     = [];

    if (propId)   { conditions.push('a.property_id = ?');      params.push(Number(propId)); }
    if (category) { conditions.push('a.category = ?');         params.push(category); }
    if (action)   { conditions.push('a.action = ?');           params.push(action); }
    if (from)     { conditions.push('date(a.timestamp) >= ?'); params.push(from); }
    if (to)       { conditions.push('date(a.timestamp) <= ?'); params.push(to); }
    if (search) {
      conditions.push('(a.user_name LIKE ? OR a.user_email LIKE ? OR p.name LIKE ? OR a.detail LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const rows = db.prepare(
      `SELECT a.*, p.name as property_name
       FROM audit_log a
       LEFT JOIN properties p ON a.property_id = p.id
       ${where} ORDER BY a.timestamp DESC`
    ).all(...params);

    const headers = ['Date & Time', 'Property', 'Staff Member', 'Role', 'Action', 'Category', 'Details', 'IP Address'];
    const csvRows = rows.map((e) => [
      fmtCsvTimestamp(e.timestamp),
      e.property_name || '',
      e.user_name || 'System',
      e.user_role || '',
      e.action || '',
      e.category || '',
      e.detail || '',
      e.ip_address || '',
    ]);

    const csv = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="nestbook-audit-log-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function fmtCsvTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'UTC',
  });
}

// ── GET /api/admin/business/stats ─────────────────────────────────────────────
adminRouter.get('/business/stats', (req, res) => {
  try {
    const proCount   = db.prepare("SELECT COUNT(*) as n FROM users WHERE plan = 'pro'").get().n;
    const multiCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE plan = 'multi'").get().n;
    const freeCount  = db.prepare("SELECT COUNT(*) as n FROM users WHERE plan = 'free'").get().n;
    const totalUsers = proCount + multiCount + freeCount;
    const mrr        = proCount * PLAN_MRR.pro + multiCount * PLAN_MRR.multi;
    const arr        = mrr * 12;
    const conversionPct = totalUsers > 0 ? +((proCount + multiCount) / totalUsers * 100).toFixed(1) : 0;
    const atRisk = db.prepare(
      "SELECT COUNT(*) as n FROM subscriptions WHERE cancel_at_period_end = 1 AND status = 'active'"
    ).get().n;
    res.json({ mrr, arr, proCount, multiCount, freeCount, totalUsers, conversionPct, atRisk, vatRolling12: arr });
  } catch (e) {
    console.error('[admin/business/stats]', e);
    res.status(500).json({ error: 'Database error.' });
  }
});

// ── GET /api/admin/business/month?month=YYYY-MM ───────────────────────────────
adminRouter.get('/business/month', (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return res.status(400).json({ error: 'month required (YYYY-MM)' });
  try {
    const proCount       = db.prepare("SELECT COUNT(*) as n FROM users WHERE plan = 'pro'").get().n;
    const multiCount     = db.prepare("SELECT COUNT(*) as n FROM users WHERE plan = 'multi'").get().n;
    const revenue        = proCount * PLAN_MRR.pro + multiCount * PLAN_MRR.multi;
    const subscriberCount = proCount + multiCount;
    const stripeFees     = +(revenue * 0.015 + subscriberCount * 0.20).toFixed(2);
    const expenses       = db.prepare(
      `SELECT id, category, description, amount_gbp, receipt_ref, miles FROM nestbook_expenses WHERE month = ? ORDER BY id`
    ).all(month);
    res.json({ revenue, stripeFees, subscriberCount, expenses });
  } catch (e) {
    console.error('[admin/business/month]', e);
    res.status(500).json({ error: 'Database error.' });
  }
});

// ── POST /api/admin/business/expenses ─────────────────────────────────────────
// Body: { month, expenses: [{category, description, amount_gbp}] }
adminRouter.post('/business/expenses', (req, res) => {
  const { month, expenses } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month) || !Array.isArray(expenses))
    return res.status(400).json({ error: 'month and expenses[] required' });
  try {
    db.prepare(`DELETE FROM nestbook_expenses WHERE month = ?`).run(month);
    const insert = db.prepare(
      `INSERT INTO nestbook_expenses (month, category, description, amount_gbp, receipt_ref, miles) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const e of expenses) {
      insert.run(
        month,
        String(e.category),
        String(e.description ?? ''),
        Number(e.amount_gbp) || 0,
        e.receipt_ref ? String(e.receipt_ref) : null,
        e.miles != null ? Number(e.miles) || null : null,
      );
    }
    res.json({ saved: expenses.length });
  } catch (e) {
    console.error('[admin/business/expenses POST]', e);
    res.status(500).json({ error: 'Database error.' });
  }
});

// ── GET /api/admin/business/annual?taxYear=YYYY ───────────────────────────────
// Returns 12 months of UK tax year (April–March) with revenue, expenses, Stripe fees, P&L.
adminRouter.get('/business/annual', (req, res) => {
  const taxYear = parseInt(req.query.taxYear) || new Date().getFullYear();
  try {
    const proCount        = db.prepare("SELECT COUNT(*) as n FROM users WHERE plan = 'pro'").get().n;
    const multiCount      = db.prepare("SELECT COUNT(*) as n FROM users WHERE plan = 'multi'").get().n;
    const mrr             = proCount * PLAN_MRR.pro + multiCount * PLAN_MRR.multi;
    const subscriberCount = proCount + multiCount;

    const months = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(taxYear, 3 + i, 1); // April = index 3
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const rows = months.map(month => {
      const expRow   = db.prepare(`SELECT COALESCE(SUM(amount_gbp),0) as total FROM nestbook_expenses WHERE month = ?`).get(month);
      const expenses = expRow.total || 0;
      const revenue    = mrr;
      const stripeFees = +(revenue * 0.015 + subscriberCount * 0.20).toFixed(2);
      const netProfit  = +(revenue - expenses - stripeFees).toFixed(2);
      const corpTax    = +(Math.max(0, netProfit) * 0.19).toFixed(2);
      return { month, revenue, expenses: +expenses.toFixed(2), stripeFees, netProfit, corpTax };
    });

    const totals = rows.reduce((acc, r) => ({
      revenue:    +(acc.revenue    + r.revenue).toFixed(2),
      expenses:   +(acc.expenses   + r.expenses).toFixed(2),
      stripeFees: +(acc.stripeFees + r.stripeFees).toFixed(2),
      netProfit:  +(acc.netProfit  + r.netProfit).toFixed(2),
      corpTax:    +(acc.corpTax    + r.corpTax).toFixed(2),
    }), { revenue: 0, expenses: 0, stripeFees: 0, netProfit: 0, corpTax: 0 });

    res.json({ taxYear, rows, totals });
  } catch (e) {
    console.error('[admin/business/annual]', e);
    res.status(500).json({ error: 'Database error.' });
  }
});

// ── App settings (key-value config) ──────────────────────────────────────────

adminRouter.get('/app-settings/:key', (req, res) => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Setting not found.' });
  res.json({ key: req.params.key, value: row.value });
});

adminRouter.put('/app-settings/:key', (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value required' });
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    .run(req.params.key, String(value));
  res.json({ success: true });
});

// ── Error reports ─────────────────────────────────────────────────────────────

adminRouter.get('/error-reports/count', (req, res) => {
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM error_reports WHERE status = 'new'`).get();
  res.json({ count });
});

adminRouter.get('/error-reports', (req, res) => {
  try {
    const { status, category, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const conditions = [];
    const params     = [];
    if (status)   { conditions.push('status = ?');   params.push(status); }
    if (category) { conditions.push('category = ?'); params.push(category); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) as count FROM error_reports ${where}`)
      .get(...params).count;

    const reports = db.prepare(`
      SELECT * FROM error_reports ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset);

    const newCount        = db.prepare(`SELECT COUNT(*) as n FROM error_reports WHERE status='new'`).get().n;
    const inProgressCount = db.prepare(`SELECT COUNT(*) as n FROM error_reports WHERE status='in_progress'`).get().n;
    const resolvedCount   = db.prepare(`SELECT COUNT(*) as n FROM error_reports WHERE status='resolved'`).get().n;

    res.json({ reports, total, page: Number(page), pages: Math.ceil(total / Number(limit)), newCount, inProgressCount, resolvedCount });
  } catch (e) {
    console.error('[admin/error-reports]', e);
    res.status(500).json({ error: 'Database error.' });
  }
});

adminRouter.patch('/error-reports/:id', (req, res) => {
  const { status, admin_notes } = req.body;
  db.prepare('UPDATE error_reports SET status = ?, admin_notes = ? WHERE id = ?')
    .run(status ?? 'new', admin_notes ?? null, req.params.id);
  res.json({ success: true });
});

// ── Database maintenance ──────────────────────────────────────────────────────

adminRouter.get('/maintenance/stats', (req, res) => {
  try {
    const logCount  = db.prepare('SELECT COUNT(*) as n FROM audit_log').get().n;
    const pageCount = db.prepare('PRAGMA page_count').get().page_count;
    const pageSize  = db.prepare('PRAGMA page_size').get().page_size;
    const dbSizeBytes = pageCount * pageSize;
    res.json({ logCount, dbSizeBytes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post('/maintenance/cleanup', (req, res) => {
  try {
    const del30 = db.prepare(`
      DELETE FROM audit_log
      WHERE timestamp < datetime('now', '-30 days') AND property_id IS NOT NULL
    `).run();
    const del90 = db.prepare(`
      DELETE FROM audit_log WHERE timestamp < datetime('now', '-90 days')
    `).run();
    const deleted = del30.changes + del90.changes;
    db.exec('VACUUM');
    res.json({
      deleted,
      message: `Removed ${deleted} old log entries and optimised database`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/blog-images — list all blog posts with image status ────────
adminRouter.get('/blog-images', (req, res) => {
  try {
    const files = fs.readdirSync(BLOG_DIR)
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .sort();

    const posts = files.map(filename => {
      const slug = filename.replace('.html', '');
      const html = fs.readFileSync(join(BLOG_DIR, filename), 'utf8');

      const titleMatch = html.match(/<title>([^<]+)/);
      const rawTitle = titleMatch ? titleMatch[1].trim() : slug;
      const title = rawTitle.replace(/ [—–|] NestBook.*$/, '').trim();

      const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
      const description = descMatch ? descMatch[1] : '';

      const imgPath = join(BLOG_IMG_DIR, `${slug}.jpg`);
      const hasImage = fs.existsSync(imgPath);
      const imgSize = hasImage
        ? Math.round(fs.statSync(imgPath).size / 1024) + 'KB'
        : null;

      return { slug, title, description, hasImage, imgSize, filename };
    });

    res.json({ posts });
  } catch (e) {
    console.error('[blog-images]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/admin/blog-images/:slug — upload and process image ──────────────
adminRouter.post('/blog-images/:slug', async (req, res) => {
  // Run multer manually so any error returns JSON (not HTML via Express default handler)
  const multerErr = await new Promise(resolve =>
    blogImageUpload.single('image')(req, res, resolve)
  );
  if (multerErr) {
    return res.status(400).json({ error: multerErr.message || 'Upload failed' });
  }

  try {
    const { slug } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const outputPath = join(BLOG_IMG_DIR, `${slug}.jpg`);

    await sharp(req.file.path)
      .resize(1200, 630, { fit: 'cover', position: 'centre', withoutEnlargement: false })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    try { fs.unlinkSync(req.file.path); } catch (_) {}

    const imgSize = Math.round(fs.statSync(outputPath).size / 1024) + 'KB';
    console.log(`[blog-images] Uploaded image for: ${slug} (${imgSize})`);
    res.json({ success: true, slug, imgSize });
  } catch (e) {
    console.error('[blog-images]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/admin/blog-images/:slug — remove image ───────────────────────
adminRouter.delete('/blog-images/:slug', (req, res) => {
  try {
    const imgPath = join(BLOG_IMG_DIR, `${req.params.slug}.jpg`);
    if (fs.existsSync(imgPath)) {
      fs.unlinkSync(imgPath);
      console.log(`[blog-images] Deleted image for: ${req.params.slug}`);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Landing image upload setup ────────────────────────────────────────────────
const LANDING_IMG_DIR = join(__dirname, '../public/images/landing');
fs.mkdirSync(LANDING_IMG_DIR, { recursive: true });

const LANDING_SLOTS = [
  { id: 'dashboard', label: 'Dashboard screenshot' },
  { id: 'calendar',  label: 'Calendar screenshot' },
];

const landingImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, '/tmp'),
    filename:    (req, file, cb) => cb(null, `landing-${Date.now()}.tmp`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('JPEG, PNG or WebP only'));
    }
  },
});

// GET /api/admin/landing-images — list slots with status
adminRouter.get('/landing-images', (req, res) => {
  const slots = LANDING_SLOTS.map(slot => {
    const filePath = join(LANDING_IMG_DIR, `${slot.id}.jpg`);
    const exists   = fs.existsSync(filePath);
    const stat     = exists ? fs.statSync(filePath) : null;
    return {
      ...slot,
      exists,
      size:     stat ? Math.round(stat.size / 1024) + 'KB' : null,
      modified: stat ? stat.mtime.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      }) : null,
    };
  });
  res.json({ slots });
});

// POST /api/admin/landing-images/:id — upload image for a slot
adminRouter.post('/landing-images/:id', landingImageUpload.single('image'), async (req, res) => {
  try {
    const slot = LANDING_SLOTS.find(s => s.id === req.params.id);
    if (!slot)     return res.status(404).json({ error: 'Unknown slot' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const outputPath = join(LANDING_IMG_DIR, `${slot.id}.jpg`);
    await sharp(req.file.path)
      .resize(1600, null, { withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    const size = Math.round(fs.statSync(outputPath).size / 1024) + 'KB';
    console.log(`[landing-images] Uploaded ${slot.id}: ${size}`);
    res.json({ success: true, size });
  } catch (e) {
    console.error('[landing-images]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/landing-images/:id — remove image
adminRouter.delete('/landing-images/:id', (req, res) => {
  try {
    const filePath = join(LANDING_IMG_DIR, `${req.params.id}.jpg`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/phone-prospects ────────────────────────────────────────────
adminRouter.get('/phone-prospects', (req, res) => {
  const { region, town, status, search } = req.query;

  let query = `
    SELECT * FROM prospects
    WHERE phone IS NOT NULL AND phone != ''
  `;
  const params = [];

  if (region && region !== 'all') { query += ` AND region = ?`;  params.push(region); }
  if (town   && town   !== 'all') { query += ` AND town = ?`;    params.push(town); }
  if (status && status !== 'all') { query += ` AND phone_status = ?`; params.push(status); }
  if (search) {
    query += ` AND (company LIKE ? OR name LIKE ? OR town LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += `
    ORDER BY
      CASE phone_status
        WHEN 'not_called'     THEN 1
        WHEN 'call_back'      THEN 2
        WHEN 'no_answer'      THEN 3
        WHEN 'voicemail'      THEN 4
        WHEN 'interested'     THEN 5
        WHEN 'not_interested' THEN 6
        WHEN 'signed_up'      THEN 7
        WHEN 'do_not_call'    THEN 8
        ELSE 9
      END,
      region ASC, town ASC, company ASC
  `;

  const prospects = db.prepare(query).all(...params);

  const regions = db.prepare(`
    SELECT DISTINCT region FROM prospects
    WHERE region IS NOT NULL AND region != ''
    ORDER BY region ASC
  `).all().map(r => r.region);

  const towns = db.prepare(`
    SELECT DISTINCT town, region FROM prospects
    WHERE town IS NOT NULL AND town != ''
    ORDER BY region ASC, town ASC
  `).all();

  const stats = db.prepare(`
    SELECT phone_status, COUNT(*) as count
    FROM prospects
    WHERE phone IS NOT NULL AND phone != ''
    GROUP BY phone_status
  `).all();

  res.json({ prospects, regions, towns, stats });
});

// ── PATCH /api/admin/phone-prospects/:id ─────────────────────────────────────
adminRouter.patch('/phone-prospects/:id', (req, res) => {
  const { phone, phone_status, phone_notes, call_back_at } = req.body;
  const updates = [];
  const params  = [];

  if (phone        !== undefined) { updates.push('phone = ?');        params.push(phone); }
  if (phone_status !== undefined) { updates.push('phone_status = ?'); params.push(phone_status); }
  if (phone_notes  !== undefined) { updates.push('phone_notes = ?');  params.push(phone_notes); }
  if (call_back_at !== undefined) { updates.push('call_back_at = ?'); params.push(call_back_at); }

  const activeStatuses = ['no_answer', 'voicemail', 'interested', 'not_interested'];
  if (phone_status && activeStatuses.includes(phone_status)) {
    updates.push(`last_called_at = datetime('now')`);
  }

  if (updates.length === 0) return res.json({ success: true });

  params.push(req.params.id);
  db.prepare(`UPDATE prospects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// ── Content flags ─────────────────────────────────────────────────────────────
const PROP_UPLOAD_DIR = join(__dirname, '../uploads/properties');

const FLAG_SELECT = `
  SELECT cf.*, p.name AS property_name, u.email AS owner_email,
         u.name AS owner_name, u.language AS owner_language
  FROM content_flags cf
  JOIN properties p ON p.id = cf.property_id
  LEFT JOIN users u ON u.id = p.owner_id
`;

adminRouter.get('/content-flags/count', (req, res) => {
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM content_flags WHERE status = 'pending'`).get().n;
  res.json({ pending });
});

adminRouter.get('/content-flags', (req, res) => {
  const { status = 'pending' } = req.query;
  let rows;
  if (status === 'history') {
    rows = db.prepare(`${FLAG_SELECT} WHERE cf.status IN ('verified','removed') ORDER BY cf.reviewed_at DESC`).all();
  } else {
    rows = db.prepare(`${FLAG_SELECT} WHERE cf.status = ? ORDER BY cf.created_at DESC`).all(status);
  }
  res.json(rows);
});

adminRouter.post('/content-flags/:id/verify', (req, res) => {
  const flag = db.prepare('SELECT * FROM content_flags WHERE id = ?').get(req.params.id);
  if (!flag) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE content_flags SET status = 'verified', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`)
    .run(req.user.userId, req.params.id);
  res.json({ ok: true });
});

adminRouter.post('/content-flags/:id/remove', async (req, res) => {
  const flag = db.prepare(`${FLAG_SELECT} WHERE cf.id = ?`).get(req.params.id);
  if (!flag) return res.status(404).json({ error: 'Not found' });
  const { sendEmail = false, reason = '' } = req.body;

  try {
    if (flag.content_type === 'room_photo') {
      const photo = db.prepare('SELECT * FROM room_photos WHERE filename = ? AND room_id = ?').get(flag.content_ref, flag.room_id);
      if (photo) {
        db.prepare('DELETE FROM room_photos WHERE id = ?').run(photo.id);
        try { fs.unlinkSync(join(ROOM_UPLOAD_DIR, photo.filename)); } catch {}
        if (photo.thumb_filename) { try { fs.unlinkSync(join(ROOM_UPLOAD_DIR, photo.thumb_filename)); } catch {} }
      }
    } else if (flag.content_type === 'hero_photo') {
      const prop = db.prepare('SELECT hero_photo FROM properties WHERE id = ?').get(flag.property_id);
      if (prop?.hero_photo === flag.content_ref) {
        db.prepare('UPDATE properties SET hero_photo = NULL WHERE id = ?').run(flag.property_id);
        try { fs.unlinkSync(join(PROP_UPLOAD_DIR, prop.hero_photo)); } catch {}
      }
    } else if (flag.content_type === 'property_description') {
      db.prepare('UPDATE properties SET description = NULL WHERE id = ?').run(flag.property_id);
    } else if (flag.content_type === 'room_description') {
      db.prepare('UPDATE rooms SET description = NULL WHERE id = ?').run(flag.room_id);
    }

    db.prepare(`UPDATE content_flags SET status = 'removed', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`)
      .run(req.user.userId, req.params.id);

    if (sendEmail && flag.owner_email) {
      await sendContentRemovedEmail(flag.owner_email, flag.owner_name, flag.property_name, reason || null, flag.owner_language);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
