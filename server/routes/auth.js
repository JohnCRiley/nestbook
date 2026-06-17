import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Stripe from 'stripe';
import db from '../db/database.js';
import { sendWelcomeEmail, sendFreeWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail } from '../email/emailService.js';
import { checkAndConvertProspect } from './outreach.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { logAction, getIp } from '../utils/auditLog.js';
import { seedCategories } from '../utils/categories.js';

export const authRouter = Router();

const JWT_SECRET  = process.env.JWT_SECRET || 'nestbook-dev-secret-change-in-production';
const JWT_EXPIRES = '7d';

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
    },
  });
});

// ── POST /api/auth/register ───────────────────────────────────────────────
authRouter.post('/register', (req, res) => {
  const { name, email, password, confirmPassword, propertyName, propertyType, discountCode } = req.body;

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
      `INSERT INTO users (property_id, name, email, password_hash, role, discount_code, email_verified, email_verification_token)
       VALUES (?, ?, ?, ?, 'owner', ?, 0, ?)`
    ).run(propId, name, normalEmail, hash, validCode ?? null, verificationToken);
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
    user: { id: userId, name, email: normalEmail, role: 'owner', property_id: propId, email_verified: false },
  });

  // Auto-convert prospect if this email was in the outreach CRM
  checkAndConvertProspect(normalEmail, userId);

  // Fire-and-forget — must not delay the registration response
  sendWelcomeEmail(
    { name, email: normalEmail },
    { name: propertyName, type: propertyType }
  ).catch(() => {});

  sendVerificationEmail(
    { name, email: normalEmail },
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
    'SELECT id, email, name, plan, email_verified FROM users WHERE id = ?'
  ).get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(user);
});

authRouter.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required.' });

  const user = db.prepare(
    'SELECT id, name, email, plan FROM users WHERE email_verification_token = ?'
  ).get(token);

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification link.' });
  }

  db.prepare(
    'UPDATE users SET email_verified = 1, email_verification_token = NULL WHERE id = ?'
  ).run(user.id);

  // Send rich onboarding email to new Free plan users — never block verification if it fails
  if (user.plan === 'free') {
    try {
      await sendFreeWelcomeEmail(user);
      console.log(`[welcome-email] Sent to ${user.email}`);
    } catch (e) {
      console.error('[welcome-email] Failed:', e.message);
    }
  }

  res.json({ success: true });
});

// ── DELETE /api/auth/account ──────────────────────────────────────────────
// Self-service GDPR account deletion. Requires valid Bearer token.
// Cancels Stripe sub, deletes all properties/rooms/bookings, then the user.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

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
    db.exec('BEGIN');

    const ownedProps = db.prepare('SELECT id FROM properties WHERE owner_id = ?').all(userId);

    for (const prop of ownedProps) {
      // Nullify property_id for ALL users on this property (staff AND owner).
      // Must clear before deleting the property row — users.property_id → properties(id) FK.
      db.prepare('UPDATE users SET property_id = NULL WHERE property_id = ?').run(prop.id);
      // audit_log.property_id has no CASCADE — delete before the property row
      db.prepare('DELETE FROM audit_log WHERE property_id = ?').run(prop.id);
      // bookings → room_charges cascade; rooms, service_categories also cascade from property
      db.prepare('DELETE FROM bookings WHERE property_id = ?').run(prop.id);
      db.prepare('DELETE FROM properties WHERE id = ?').run(prop.id);
    }

    // Clean orphaned guests (guests table has no property_id — use booking reference)
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
    console.log('[delete-account] Successfully deleted user:', userId);
    res.json({ success: true });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[delete-account] Error:', err.message);
    res.status(500).json({ error: 'Failed to delete account: ' + err.message });
  }
});
