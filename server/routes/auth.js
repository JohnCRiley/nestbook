import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Stripe from 'stripe';
import db from '../db/database.js';
import { sendWelcomeEmail, sendVerificationEmail } from '../email/emailService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { logAction, getIp } from '../utils/auditLog.js';

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
    user: { id: user.id, name: user.name, email: user.email, role: user.role, property_id: user.property_id, email_verified: !!user.email_verified },
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
      `INSERT INTO properties (name, type) VALUES (?, ?)`
    ).run(propertyName, propertyType);
    propId = Number(prop.lastInsertRowid);

    const user = db.prepare(
      `INSERT INTO users (property_id, name, email, password_hash, role, discount_code, email_verified, email_verification_token)
       VALUES (?, ?, ?, ?, 'owner', ?, 0, ?)`
    ).run(propId, name, normalEmail, hash, validCode ?? null, verificationToken);
    userId = Number(user.lastInsertRowid);

    db.prepare('UPDATE properties SET owner_id = ? WHERE id = ?').run(userId, propId);

    // Seed default service categories for new property
    const seedCat = db.prepare(
      `INSERT INTO service_categories (property_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)`
    );
    const defaultCategories = [
      ['Food & Drink', '#f97316', '🍽️', 0],
      ['Bar',          '#8b5cf6', '🍺', 1],
      ['Laundry',      '#0ea5e9', '🧺', 2],
      ['Spa & Wellness','#10b981','💆', 3],
      ['Activities',   '#f59e0b', '⛷️', 4],
      ['Transport',    '#6366f1', '🚗', 5],
      ['Other',        '#64748b', '📌', 6],
    ];
    for (const [name, color, icon, sort_order] of defaultCategories) {
      seedCat.run(propId, name, color, icon, sort_order);
    }

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

// ── GET /api/auth/verify-email?token=xxx ─────────────────────────────────
authRouter.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required.' });

  const user = db.prepare(
    'SELECT id FROM users WHERE email_verification_token = ?'
  ).get(token);

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification link.' });
  }

  db.prepare(
    'UPDATE users SET email_verified = 1, email_verification_token = NULL WHERE id = ?'
  ).run(user.id);

  res.json({ success: true });
});

// ── DELETE /api/auth/account ──────────────────────────────────────────────
// Self-service GDPR account deletion. Requires valid Bearer token.
// Cancels Stripe sub, deletes all properties/rooms/bookings, then the user.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

authRouter.delete('/account', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const user   = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Cancel any active Stripe subscription (best-effort)
  const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
  if (stripe && sub?.stripe_subscription_id) {
    try { await stripe.subscriptions.cancel(sub.stripe_subscription_id); } catch (_) {}
  }

  try {
    db.exec('BEGIN');

    // Collect all property IDs owned by this user
    const ownedPropIds = db.prepare('SELECT id FROM properties WHERE owner_id = ?')
      .all(userId).map(p => p.id);

    // Also include legacy property_id link if not already covered
    if (user.property_id && !ownedPropIds.includes(user.property_id)) {
      ownedPropIds.push(user.property_id);
    }

    // Nullify property_id for any staff on these properties (before deleting)
    for (const propId of ownedPropIds) {
      db.prepare('UPDATE users SET property_id = NULL WHERE property_id = ? AND id != ?')
        .run(propId, userId);
      db.prepare('DELETE FROM bookings WHERE property_id = ?').run(propId);
      db.prepare('DELETE FROM properties WHERE id = ?').run(propId); // rooms cascade
    }

    // Clean orphaned guests
    db.prepare(
      'DELETE FROM guests WHERE id NOT IN (SELECT DISTINCT guest_id FROM bookings WHERE guest_id IS NOT NULL)'
    ).run();

    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT');

    res.json({ success: true });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('[auth/delete-account]', err.message);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});
