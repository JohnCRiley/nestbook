import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/database.js';
import { sendWelcomeEmail } from '../email/emailService.js';

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
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role, propertyId: user.property_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, property_id: user.property_id },
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

  db.exec('BEGIN');
  try {
    const prop = db.prepare(
      `INSERT INTO properties (name, type) VALUES (?, ?)`
    ).run(propertyName, propertyType);

    // Validate discount code if provided (store it; applied at checkout)
    const upperCode = discountCode?.trim().toUpperCase() || null;
    const validCode = upperCode
      ? db.prepare('SELECT code FROM discount_codes WHERE code = ? AND active = 1').get(upperCode)?.code
      : null;

    const user = db.prepare(
      `INSERT INTO users (property_id, name, email, password_hash, role, discount_code) VALUES (?, ?, ?, ?, 'owner', ?)`
    ).run(prop.lastInsertRowid, name, normalEmail, hash, validCode ?? null);

    db.exec('COMMIT');

    const token = jwt.sign(
      { userId: user.lastInsertRowid, role: 'owner', propertyId: prop.lastInsertRowid },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({
      token,
      user: { id: user.lastInsertRowid, name, email: normalEmail, role: 'owner', property_id: prop.lastInsertRowid },
    });

    // Fire-and-forget — must not delay the registration response
    sendWelcomeEmail(
      { name, email: normalEmail },
      { name: propertyName, type: propertyType }
    ).catch(() => {});
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});
