import { Router } from 'express';
import Stripe from 'stripe';
import db from '../db/database.js';

export const adminRouter = Router();

const PLAN_MRR  = { pro: 19, multi: 39 };
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
      SELECT p.id, p.name, p.type, p.country, p.created_at,
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
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
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

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
// GDPR account deletion: cancels Stripe sub, wipes all user data from the DB.
adminRouter.delete('/users/:id', async (req, res) => {
  const userId = Number(req.params.id);
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

  const deleteUser = db.transaction(() => {
    if (propIds.length > 0) {
      const placeholders = propIds.map(() => '?').join(',');

      // Nullify property_id for any staff accounts on these properties
      db.prepare(`UPDATE users SET property_id = NULL WHERE property_id IN (${placeholders})`).run(...propIds);

      // audit_log references property_id with no CASCADE — must delete before properties
      db.prepare(`DELETE FROM audit_log WHERE property_id IN (${placeholders})`).run(...propIds);

      // bookings, rooms, service_categories, room_charges cascade from property_id
      db.prepare(`DELETE FROM bookings WHERE property_id IN (${placeholders})`).run(...propIds);
      db.prepare(`DELETE FROM properties WHERE id IN (${placeholders})`).run(...propIds);
    }

    // Orphaned guests
    db.prepare(
      'DELETE FROM guests WHERE id NOT IN (SELECT DISTINCT guest_id FROM bookings WHERE guest_id IS NOT NULL)'
    ).run();

    // room_charges.charged_by / voided_by reference users(id) with no CASCADE
    db.prepare('UPDATE room_charges SET charged_by = NULL WHERE charged_by = ?').run(userId);
    db.prepare('UPDATE room_charges SET voided_by = NULL WHERE voided_by = ?').run(userId);
    // audit_log.user_id references users(id) with no CASCADE
    db.prepare('DELETE FROM audit_log WHERE user_id = ?').run(userId);

    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  try {
    deleteUser();
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete account.' });
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
    const { property_id, category, action, from, to, page, limit } = req.query;

    const conditions = [];
    const params     = [];

    if (property_id) { conditions.push('a.property_id = ?');     params.push(Number(property_id)); }
    if (category)    { conditions.push('a.category = ?');         params.push(category); }
    if (action)      { conditions.push('a.action = ?');           params.push(action); }
    if (from)        { conditions.push("date(a.timestamp) >= ?"); params.push(from); }
    if (to)          { conditions.push("date(a.timestamp) <= ?"); params.push(to); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const pageNum   = Math.max(1, Number(page) || 1);
    const pageLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const offset    = (pageNum - 1) * pageLimit;

    const total = db.prepare(`SELECT COUNT(*) as n FROM audit_log a ${where}`).get(...params).n;
    const rows  = db.prepare(
      `SELECT a.*, p.name as property_name
       FROM audit_log a
       LEFT JOIN properties p ON a.property_id = p.id
       ${where} ORDER BY a.timestamp DESC LIMIT ? OFFSET ?`
    ).all(...params, pageLimit, offset);

    res.json({ logs: rows, total, page: pageNum, totalPages: Math.ceil(total / pageLimit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
