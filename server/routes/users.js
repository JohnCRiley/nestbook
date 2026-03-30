import { Router } from 'express';
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
// NOTE: In production the caller must pass a pre-hashed password.
// A dedicated /api/auth endpoint with proper bcrypt hashing will be built
// when the authentication feature is implemented.
usersRouter.post('/', (req, res) => {
  try {
    const { property_id, name, email, password_hash, role } = req.body;

    if (!name || !email || !password_hash) {
      return res.status(400).json({ error: 'name, email and password_hash are required' });
    }

    const result = db.prepare(`
      INSERT INTO users (property_id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      property_id ?? null,
      name, email,
      password_hash,
      role ?? 'reception'
    );

    res.status(201).json(
      db.prepare(`${SAFE_SELECT} WHERE id = ?`).get(result.lastInsertRowid)
    );
  } catch (err) {
    // Unique constraint on email produces a clear message already.
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/:id ────────────────────────────────────────────────────
// Updates name, email and role only — password changes need a separate flow.
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
