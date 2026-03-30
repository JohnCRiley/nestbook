import { Router } from 'express';
import db from '../db/database.js';

export const roomsRouter = Router();

// ── GET /api/rooms?property_id=1&status=available ─────────────────────────
roomsRouter.get('/', (req, res) => {
  try {
    const { property_id, status } = req.query;
    const conditions = [];
    const params = [];

    if (property_id) { conditions.push('property_id = ?'); params.push(property_id); }
    if (status)      { conditions.push('status = ?');      params.push(status); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const rows = db.prepare(`SELECT * FROM rooms ${where} ORDER BY id`).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rooms/:id ────────────────────────────────────────────────────
roomsRouter.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Room not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rooms ───────────────────────────────────────────────────────
roomsRouter.post('/', (req, res) => {
  try {
    const { property_id, name, type, price_per_night, capacity, amenities, status } = req.body;

    if (!property_id || !name || !type || price_per_night == null) {
      return res.status(400).json({ error: 'property_id, name, type and price_per_night are required' });
    }

    const result = db.prepare(`
      INSERT INTO rooms (property_id, name, type, price_per_night, capacity, amenities, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, name, type,
      price_per_night,
      capacity  ?? 2,
      amenities ?? null,
      status    ?? 'available'
    );

    res.status(201).json(
      db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/rooms/:id ────────────────────────────────────────────────────
roomsRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM rooms WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Room not found' });

    const { property_id, name, type, price_per_night, capacity, amenities, status } = req.body;

    db.prepare(`
      UPDATE rooms
      SET property_id = ?, name = ?, type = ?, price_per_night = ?,
          capacity = ?, amenities = ?, status = ?
      WHERE id = ?
    `).run(property_id, name, type, price_per_night, capacity, amenities, status, req.params.id);

    res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/rooms/:id ─────────────────────────────────────────────────
roomsRouter.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Room not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
