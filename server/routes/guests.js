import { Router } from 'express';
import db from '../db/database.js';
import { logAction, getIp } from '../utils/auditLog.js';

export const guestsRouter = Router();

function actorFromReq(req) {
  const u = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(req.user.userId);
  return { userId: req.user.userId, userName: u?.name, userEmail: u?.email, userRole: u?.role, propertyId: req.user.propertyId ?? null };
}

// ── GET /api/guests/counts ────────────────────────────────────────────────
// Returns { total, newThisMonth } — used by the Guests page stat bar.
// Must be defined BEFORE /:id so Express doesn't treat "counts" as an id.
guestsRouter.get('/counts', (req, res) => {
  try {
    const total = db.prepare(`SELECT COUNT(*) as n FROM guests WHERE deleted = 0`).get().n;
    const newThisMonth = db.prepare(
      `SELECT COUNT(*) as n FROM guests WHERE deleted = 0 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    ).get().n;
    res.json({ total, newThisMonth });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/guests ───────────────────────────────────────────────────────
// Query params (all optional):
//   search       — filter by name or email
//   page / limit — when present returns paginated object {guests,total,page,totalPages}
//                  when absent returns plain array (backward compat for dropdowns)
guestsRouter.get('/', (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const conditions = [];
    const params     = [];

    conditions.push('deleted = 0');

    if (search) {
      const pattern = `%${search}%`;
      conditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)');
      params.push(pattern, pattern, pattern);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    if (page) {
      const pageNum   = Math.max(1, Number(page));
      const pageLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const offset    = (pageNum - 1) * pageLimit;

      const total = db.prepare(`SELECT COUNT(*) as n FROM guests ${where}`).get(...params).n;
      const rows  = db.prepare(
        `SELECT * FROM guests ${where} ORDER BY last_name, first_name LIMIT ? OFFSET ?`
      ).all(...params, pageLimit, offset);

      return res.json({ guests: rows, total, page: pageNum, totalPages: Math.ceil(total / pageLimit) });
    }

    const rows = db.prepare(`SELECT * FROM guests ${where} ORDER BY last_name, first_name`).all(...params);
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

// ── POST /api/guests/import ───────────────────────────────────────────────
// Bulk-import guests from a pre-parsed JSON array. Pro/Multi plan required.
// Body: { rows: [{ first_name, last_name, email?, phone?, notes? }, …] }
// Returns: { imported, skipped, errors }
guestsRouter.post('/import', (req, res) => {
  try {
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    if (!user || (user.plan !== 'pro' && user.plan !== 'multi')) {
      return res.status(403).json({ error: 'Pro or Multi plan required.' });
    }

    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided.' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 rows per import.' });
    }

    let imported = 0, skipped = 0, errors = 0;

    const insertStmt = db.prepare(`
      INSERT INTO guests (first_name, last_name, email, phone, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const run = db.transaction(() => {
      for (const row of rows) {
        try {
          const fn = row.first_name?.trim();
          const ln = row.last_name?.trim();
          if (!fn || !ln) { errors++; continue; }

          const email = row.email?.trim() || null;
          if (email) {
            const existing = db.prepare(
              'SELECT id FROM guests WHERE email = ? AND deleted = 0'
            ).get(email);
            if (existing) { skipped++; continue; }
          }

          insertStmt.run(fn, ln, email, row.phone?.trim() || null, row.notes?.trim() || null);
          imported++;
        } catch { errors++; }
      }
    });

    run();
    res.json({ imported, skipped, errors });

    logAction(db, {
      ...actorFromReq(req),
      action: 'GUESTS_IMPORTED',
      category: 'guest',
      detail: `Imported ${imported}, skipped ${skipped}, errors ${errors}`,
      ipAddress: getIp(req),
    });
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

    const created = db.prepare('SELECT * FROM guests WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);

    logAction(db, {
      ...actorFromReq(req),
      action: 'GUEST_CREATED',
      category: 'guest',
      targetType: 'guest',
      targetId: created.id,
      targetName: `${created.first_name} ${created.last_name}`,
      ipAddress: getIp(req),
    });
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

    const updated = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      action: 'GUEST_UPDATED',
      category: 'guest',
      targetType: 'guest',
      targetId: updated.id,
      targetName: `${updated.first_name} ${updated.last_name}`,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/guests/:id/anonymise ─────────────────────────────────────────
// GDPR right to erasure: wipe PII but keep booking history (guest row preserved).
guestsRouter.put('/:id/anonymise', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM guests WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Guest not found' });
    const before = db.prepare('SELECT first_name, last_name FROM guests WHERE id = ?').get(req.params.id);
    db.prepare(`
      UPDATE guests
      SET first_name = 'Deleted', last_name = 'Guest',
          email = NULL, phone = NULL, notes = NULL, deleted = 1
      WHERE id = ?
    `).run(req.params.id);
    res.json({ success: true });

    logAction(db, {
      ...actorFromReq(req),
      action: 'GUEST_ANONYMISED',
      category: 'guest',
      targetType: 'guest',
      targetId: Number(req.params.id),
      targetName: before ? `${before.first_name} ${before.last_name}` : null,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/guests/:id/blacklist ─────────────────────────────────────────
// Toggle blacklisted flag. Returns the updated guest record.
guestsRouter.put('/:id/blacklist', (req, res) => {
  try {
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    const newVal = guest.blacklisted ? 0 : 1;
    db.prepare(`UPDATE guests SET blacklisted = ? WHERE id = ?`).run(newVal, req.params.id);
    const updated = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
    res.json(updated);

    logAction(db, {
      ...actorFromReq(req),
      action: newVal ? 'GUEST_BLACKLISTED' : 'GUEST_UNBLACKLISTED',
      category: 'guest',
      targetType: 'guest',
      targetId: guest.id,
      targetName: `${guest.first_name} ${guest.last_name}`,
      ipAddress: getIp(req),
    });
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
