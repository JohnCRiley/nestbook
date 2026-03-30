import { Router } from 'express';
import db from '../db/database.js';

export const propertiesRouter = Router();

// ── GET /api/properties ───────────────────────────────────────────────────
propertiesRouter.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM properties ORDER BY id').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/properties/:id ───────────────────────────────────────────────
propertiesRouter.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Property not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/properties ──────────────────────────────────────────────────
propertiesRouter.post('/', (req, res) => {
  try {
    const { name, type, address, city, country, check_in_time, check_out_time, currency, locale } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }

    const result = db.prepare(`
      INSERT INTO properties (name, type, address, city, country, check_in_time, check_out_time, currency, locale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, type,
      address       ?? null,
      city          ?? null,
      country       ?? null,
      check_in_time  ?? '15:00',
      check_out_time ?? '11:00',
      currency      ?? 'EUR',
      locale        ?? 'en'
    );

    res.status(201).json(
      db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/properties/:id ───────────────────────────────────────────────
propertiesRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM properties WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Property not found' });

    const { name, type, address, city, country, check_in_time, check_out_time, currency, locale } = req.body;

    db.prepare(`
      UPDATE properties
      SET name = ?, type = ?, address = ?, city = ?, country = ?,
          check_in_time = ?, check_out_time = ?, currency = ?, locale = ?
      WHERE id = ?
    `).run(name, type, address, city, country, check_in_time, check_out_time, currency, locale, req.params.id);

    res.json(db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/properties/:id ────────────────────────────────────────────
propertiesRouter.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Property not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
