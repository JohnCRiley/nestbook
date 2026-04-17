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
// Query params: page (default 1), limit (default 25), search (name/email)
adminRouter.get('/users', (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const conditions = [];
    const params     = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(pattern, pattern);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const BASE_SELECT = `
      SELECT u.id, u.name, u.email, u.role, u.plan, u.created_at,
             u.discount_code, u.suspended,
             p.name as property_name, p.country,
             s.stripe_customer_id, s.stripe_subscription_id,
             s.status as sub_status, s.current_period_end,
             s.notes as sub_notes, s.cancel_at_period_end
      FROM users u
      LEFT JOIN properties p ON p.id = u.property_id
      LEFT JOIN subscriptions s ON s.user_id = u.id
    `;

    if (page) {
      const pageNum   = Math.max(1, Number(page));
      const pageLimit = Math.min(100, Math.max(1, Number(limit) || 25));
      const offset    = (pageNum - 1) * pageLimit;

      const total = db.prepare(
        `SELECT COUNT(*) as n FROM users u LEFT JOIN properties p ON p.id = u.property_id ${where}`
      ).get(...params).n;
      const rows = db.prepare(
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

  // Wipe all data in dependency order: bookings → guests → rooms → properties → subscription → user
  try {
    db.exec('BEGIN');

    if (propIds.length > 0) {
      const placeholders = propIds.map(() => '?').join(',');

      // 1. Bookings (reference property_id and room_id — no CASCADE set)
      db.prepare(`DELETE FROM bookings WHERE property_id IN (${placeholders})`).run(...propIds);

      // 2. Orphaned guests (guests with no remaining bookings anywhere)
      db.prepare(
        'DELETE FROM guests WHERE id NOT IN (SELECT DISTINCT guest_id FROM bookings WHERE guest_id IS NOT NULL)'
      ).run();

      // 3. Rooms (no CASCADE without PRAGMA foreign_keys = ON)
      db.prepare(`DELETE FROM rooms WHERE property_id IN (${placeholders})`).run(...propIds);

      // 4. Nullify property_id for any staff accounts on these properties
      db.prepare(`UPDATE users SET property_id = NULL WHERE property_id IN (${placeholders})`).run(...propIds);

      // 5. Properties
      db.prepare(`DELETE FROM properties WHERE id IN (${placeholders})`).run(...propIds);
    }

    // 6. Subscription
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);

    // 7. User
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    db.exec('COMMIT');
    res.json({ success: true });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
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
