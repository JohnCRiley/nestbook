import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/database.js';

export const usersRouter = Router();

// Password hashes are never returned in API responses.
const SAFE_SELECT = 'SELECT id, property_id, name, email, role, created_at FROM users';

// ── GET /api/users?property_id=1 ──────────────────────────────────────────
usersRouter.get('/', (req, res) => {
  try {
    const { property_id } = req.query;

    if (property_id) {
      const rows = db.prepare(`${SAFE_SELECT} WHERE property_id = ? ORDER BY id`).all(property_id);
      return res.json(rows);
    }

    const rows = db.prepare(`${SAFE_SELECT} ORDER BY id`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/users/:id ────────────────────────────────────────────────────
usersRouter.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`${SAFE_SELECT} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/users ───────────────────────────────────────────────────────
// Accepts plaintext `password` and hashes it server-side.
usersRouter.post('/', (req, res) => {
  try {
    const { property_id, name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required.' });
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

    const result = db.prepare(`
      INSERT INTO users (property_id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      property_id ?? null,
      name,
      normalEmail,
      hash,
      role ?? 'reception'
    );

    res.status(201).json(
      db.prepare(`${SAFE_SELECT} WHERE id = ?`).get(result.lastInsertRowid)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/me/password ────────────────────────────────────────────
// Authenticated user changes their own password.
// req.user is set by requireAuth middleware ({ userId, role, propertyId }).
usersRouter.put('/me/password', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/:id/password ──────────────────────────────────────────
// Owner resets another user's password. No current-password check required.
usersRouter.put('/:id/password', (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can reset staff passwords.' });
    }

    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: 'newPassword is required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/:id ────────────────────────────────────────────────────
// Updates name, email and role only — password changes go through /me/password.
usersRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const { name, email, role } = req.body;

    db.prepare(`
      UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?
    `).run(name, email, role, req.params.id);

    res.json(db.prepare(`${SAFE_SELECT} WHERE id = ?`).get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/users/:id ─────────────────────────────────────────────────
usersRouter.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
