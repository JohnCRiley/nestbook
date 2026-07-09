import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db/database.js';
import { stripe } from '../lib/stripeClient.js';
import { sendWelcomeEmail, sendFreeWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail, sendProWelcomeEmail } from '../email/emailService.js';
import { checkAndConvertProspect } from './outreach.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { logAction, getIp } from '../utils/auditLog.js';
import { seedCategories } from '../utils/categories.js';
import { deleteUserAccount } from '../utils/deleteUserAccount.js';

export const authRouter = Router();

const JWT_SECRET  = process.env.JWT_SECRET || 'nestbook-dev-secret-change-in-production';
const JWT_EXPIRES = '7d';

// Apply a discount code at email verification time.
// Only runs once per user — guarded by discount_applied_at being NULL.
async function applyDiscountCodeOnRegistration(user) {
  try {
    // Re-fetch a full row so stripe_customer_id and all migrated columns are present.
    const fullUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!fullUser?.discount_code) return;

    const code = db.prepare(`
      SELECT * FROM discount_codes
      WHERE UPPER(code) = UPPER(?)
        AND active = 1
        AND (max_uses IS NULL OR max_uses = 0 OR current_uses < max_uses)
    `).get(fullUser.discount_code);

    if (!code) {
      console.log(`[discount] Code "${fullUser.discount_code}" not valid — ${fullUser.email} stays on Free`);
      return;
    }

    if (code.discount_percent === 100) {
      const hasDuration = code.duration_months && code.duration_months > 0;

      if (hasDuration) {
        const trialEnd = new Date();
        trialEnd.setMonth(trialEnd.getMonth() + code.duration_months);
        db.prepare(`
          UPDATE users
          SET plan = 'pro', trial_ends_at = ?, discount_applied_at = datetime('now')
          WHERE id = ?
        `).run(trialEnd.toISOString(), fullUser.id);
        db.prepare(`UPDATE discount_codes SET current_uses = current_uses + 1 WHERE id = ?`).run(code.id);
        sendProWelcomeEmail(fullUser, code, trialEnd).catch(() => {});
        console.log(`[discount] ${fullUser.email} upgraded to Pro via "${fullUser.discount_code}" until ${trialEnd.toISOString().split('T')[0]}`);
      } else {
        // No duration — permanent Pro, no trial expiry
        db.prepare(`
          UPDATE users
          SET plan = 'pro', trial_ends_at = NULL, discount_applied_at = datetime('now')
          WHERE id = ?
        `).run(fullUser.id);
        db.prepare(`UPDATE discount_codes SET current_uses = current_uses + 1 WHERE id = ?`).run(code.id);
        sendProWelcomeEmail(fullUser, code, null).catch(() => {});
        console.log(`[discount] ${fullUser.email} upgraded to permanent Pro via "${fullUser.discount_code}"`);
      }
      return;
    }

    // Partial discount — apply via Stripe if the user already has a customer ID
    if (stripe && code.stripe_coupon_id && fullUser.stripe_customer_id) {
      const sub = await stripe.subscriptions.create({
        customer:           fullUser.stripe_customer_id,
        items:              [{ price: process.env.STRIPE_PRO_PRICE_ID }],
        discounts:          [{ coupon: code.stripe_coupon_id }],
        trial_period_days:  30,
      });
      db.prepare(`
        UPDATE users SET plan = 'pro', discount_applied_at = datetime('now') WHERE id = ?
      `).run(fullUser.id);
      db.prepare(`UPDATE discount_codes SET current_uses = current_uses + 1 WHERE id = ?`).run(code.id);
      console.log(`[discount] Stripe subscription ${sub.id} created for ${fullUser.email}`);
    }
  } catch (e) {
    console.error('[discount] applyDiscountCodeOnRegistration error:', e.message);
  }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────
authRouter.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logAction(db, {
      propertyId: user?.property_id ?? null,
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      userEmail: email.toLowerCase().trim(),
      userRole: user?.role ?? null,
      action: 'LOGIN_FAILED',
      category: 'auth',
      detail: 'Invalid email or password',
      ipAddress: getIp(req),
    });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.suspended) {
    return res.status(403).json({ error: 'Your account has been suspended. Please contact support@nestbook.io' });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role, propertyId: user.property_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  logAction(db, {
    propertyId: user.property_id,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    action: 'LOGIN',
    category: 'auth',
    ipAddress: getIp(req),
  });

  res.json({
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      property_id: user.property_id, email_verified: !!user.email_verified,
      subscription_status: user.subscription_status ?? 'active',
      plan: user.plan ?? 'free',
      trial_ends_at: user.trial_ends_at ?? null,
      stripe_subscription_id: user.stripe_subscription_id ?? null,
      language: user.language ?? 'en',
    },
  });
});

// ── POST /api/auth/register ───────────────────────────────────────────────
authRouter.post('/register', (req, res) => {
  const { name, email, password, confirmPassword, propertyName, propertyType, discountCode, language } = req.body;

  if (!name || !email || !password || !propertyName || !propertyType) {
    return res.status(400).json({ error: 'All required fields must be filled in.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const normalEmail = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const hash = bcrypt.hashSync(password, 10);

  const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es', 'nl'];
  const userLang = SUPPORTED_LANGS.includes(language) ? language : 'en';

  // Validate discount code outside the transaction (read-only, safe to do first)
  const upperCode = discountCode?.trim().toUpperCase() || null;
  const validCode = upperCode
    ? db.prepare('SELECT code FROM discount_codes WHERE code = ? AND active = 1').get(upperCode)?.code
    : null;

  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Number() wrapping guards against node:sqlite returning BigInt lastInsertRowid.
  let propId, userId;
  try {
    db.exec('BEGIN');
    const prop = db.prepare(
      `INSERT INTO properties (name, type, ical_token) VALUES (?, ?, ?)`
    ).run(propertyName, propertyType, crypto.randomBytes(16).toString('hex'));
    propId = Number(prop.lastInsertRowid);

    const user = db.prepare(
      `INSERT INTO users (property_id, name, email, password_hash, role, language, discount_code, email_verified, email_verification_token)
       VALUES (?, ?, ?, ?, 'owner', ?, ?, 0, ?)`
    ).run(propId, name, normalEmail, hash, userLang, validCode ?? null, verificationToken);
    userId = Number(user.lastInsertRowid);

    db.prepare('UPDATE properties SET owner_id = ? WHERE id = ?').run(userId, propId);

    // Seed default service categories — always IP at registration (rental_type defaults to 'rooms')
    seedCategories(db, propId, 'rooms');

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }

  const token = jwt.sign(
    { userId, role: 'owner', propertyId: propId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  logAction(db, {
    propertyId: propId,
    userId,
    userName: name,
    userEmail: normalEmail,
    userRole: 'owner',
    action: 'USER_REGISTERED',
    category: 'auth',
    targetType: 'property',
    targetId: propId,
    targetName: propertyName,
    ipAddress: getIp(req),
  });

  res.status(201).json({
    token,
    user: { id: userId, name, email: normalEmail, role: 'owner', property_id: propId, email_verified: false, language: userLang },
  });

  // Auto-convert prospect if this email was in the outreach CRM
  checkAndConvertProspect(normalEmail, userId);

  // Fire-and-forget — must not delay the registration response
  sendWelcomeEmail(
    { name, email: normalEmail, language: userLang },
    { name: propertyName, type: propertyType }
  ).catch(() => {});

  sendVerificationEmail(
    { name, email: normalEmail, language: userLang },
    verificationToken
  ).catch(() => {});
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────
authRouter.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: true });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.json({ success: true }); // don't reveal whether email exists

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour

  db.prepare(
    'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?'
  ).run(token, expires, user.id);

  try {
    await sendPasswordResetEmail(user.email, token);
    console.log('[forgot-password] reset email sent to:', email);
  } catch (err) {
    console.error('[forgot-password] failed to send email:', err?.message ?? err);
  }

  res.json({ success: true });
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────
authRouter.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const user = db.prepare(
    `SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires > datetime('now')`
  ).get(token);

  if (!user) return res.status(400).json({ error: 'Invalid or expired reset link.' });

  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare(
    'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?'
  ).run(hash, user.id);

  res.json({ success: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, email, name, role, property_id, plan, email_verified, trial_ends_at, stripe_subscription_id, language FROM users WHERE id = ?'
  ).get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ ...user, email_verified: !!user.email_verified });
});

authRouter.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required.' });

  const user = db.prepare(`
    SELECT id, name, email, plan, language, discount_code, discount_applied_at
    FROM users WHERE email_verification_token = ?
  `).get(token);

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification link.' });
  }

  db.prepare(
    'UPDATE users SET email_verified = 1, email_verification_token = NULL WHERE id = ?'
  ).run(user.id);

  // Apply discount code upgrade before deciding which welcome email to send
  if (user.discount_code && !user.discount_applied_at) {
    await applyDiscountCodeOnRegistration(user);
  }

  // Re-read plan after potential upgrade so we send the right welcome email
  const { plan, trial_ends_at } = db.prepare(
    'SELECT plan, trial_ends_at FROM users WHERE id = ?'
  ).get(user.id);

  if (plan === 'free') {
    sendFreeWelcomeEmail(user).catch((e) => console.error('[welcome-email] Failed:', e.message));
  }

  res.json({ success: true, plan, trial_ends_at, email_verified: 1 });
});

// ── DELETE /api/auth/account ──────────────────────────────────────────────
// Self-service GDPR account deletion. Requires valid Bearer token.
// Cancels Stripe sub, deletes all properties/rooms/bookings, then the user.
authRouter.delete('/account', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  console.log('[delete-account] Request received from user:', userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Cancel any active Stripe subscription (best-effort, outside transaction)
  let sub = null;
  try { sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId); } catch (_) {}
  if (stripe && sub?.stripe_subscription_id) {
    try { await stripe.subscriptions.cancel(sub.stripe_subscription_id); } catch (_) {}
  }

  try {
    deleteUserAccount(userId);
    console.log('[delete-account] Successfully deleted user:', userId);
    res.json({ success: true });
  } catch (err) {
    console.error('[delete-account] Error:', err.message);
    res.status(500).json({ error: 'Failed to delete account: ' + err.message });
  }
});
