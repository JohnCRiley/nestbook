import { Router } from 'express';
import db from '../db/database.js';

export const guestsRouter = Router();

// ── GET /api/guests?search=smith ──────────────────────────────────────────
// Optional ?search= filters by name or email (case-insensitive).
guestsRouter.get('/', (req, res) => {
  try {
    const { search } = req.query;

    if (search) {
      const pattern = `%${search}%`;
      const rows = db.prepare(`
        SELECT * FROM guests
        WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
        ORDER BY last_name, first_name
      `).all(pattern, pattern, pattern);
      return res.json(rows);
    }

    const rows = db.prepare('SELECT * FROM guests ORDER BY last_name, first_name').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/guests/:id ───────────────────────────────────────────────────
guestsRouter.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Guest not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/guests ──────────────────────────────────────────────────────
guestsRouter.post('/', (req, res) => {
  try {
    const { first_name, last_name, email, phone, notes } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }

    const result = db.prepare(`
      INSERT INTO guests (first_name, last_name, email, phone, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(first_name, last_name, email ?? null, phone ?? null, notes ?? null);

    res.status(201).json(
      db.prepare('SELECT * FROM guests WHERE id = ?').get(result.lastInsertRowid)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/guests/:id ───────────────────────────────────────────────────
guestsRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM guests WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Guest not found' });

    const { first_name, last_name, email, phone, notes } = req.body;

    db.prepare(`
      UPDATE guests SET first_name = ?, last_name = ?, email = ?, phone = ?, notes = ?
      WHERE id = ?
    `).run(first_name, last_name, email, phone, notes, req.params.id);

    res.json(db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/guests/:id ────────────────────────────────────────────────
guestsRouter.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM guests WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Guest not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
