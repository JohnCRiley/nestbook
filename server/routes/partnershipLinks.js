import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import db from '../db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '../uploads/partnerships');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const iconStorage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const name = `partner-${req.params.propertyId || 'new'}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    cb(null, name);
  },
});

const iconUpload = multer({
  storage: iconStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

function canAccess(userId, role, propertyId) {
  if (role === 'owner') {
    if (db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?').get(propertyId, userId)) return true;
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
    return Number(u?.property_id) === propertyId;
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return Number(u?.property_id) === propertyId;
}

function isPro(userId) {
  const u = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
  return u?.plan === 'pro' || u?.plan === 'multi';
}

function cleanup(path) { try { fs.unlinkSync(path); } catch {} }

export const partnershipLinksRouter = Router();

// GET /:propertyId — all links (any status) for the owner's settings UI
partnershipLinksRouter.get('/:propertyId', (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!canAccess(req.user.userId, req.user.role, propertyId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const links = db.prepare(
      `SELECT * FROM partnership_links WHERE property_id = ? ORDER BY display_order ASC, id ASC`
    ).all(propertyId);
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:propertyId — create a new link with optional icon
partnershipLinksRouter.post('/:propertyId', iconUpload.single('icon'), async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!canAccess(req.user.userId, req.user.role, propertyId)) {
      if (req.file) cleanup(req.file.path);
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!isPro(req.user.userId)) {
      if (req.file) cleanup(req.file.path);
      return res.status(403).json({ error: 'Pro or Multi plan required.' });
    }

    const { label, description, url } = req.body;
    if (!label?.trim() || !url?.trim()) {
      if (req.file) cleanup(req.file.path);
      return res.status(400).json({ error: 'Label and URL are required.' });
    }

    let iconUrl = null;
    if (req.file) {
      const tmpPath = req.file.path + '.tmp';
      await sharp(req.file.path)
        .resize(80, 80, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 85 })
        .toFile(tmpPath);
      cleanup(req.file.path);
      fs.renameSync(tmpPath, req.file.path);
      iconUrl = `/uploads/partnerships/${req.file.filename}`;
    }

    const maxOrder = db.prepare(`SELECT MAX(display_order) as m FROM partnership_links WHERE property_id = ?`).get(propertyId);
    const nextOrder = (maxOrder?.m ?? -1) + 1;

    const result = db.prepare(`
      INSERT INTO partnership_links (property_id, label, description, url, icon_url, display_order, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(propertyId, label.trim(), description?.trim() || null, url.trim(), iconUrl, nextOrder);

    const linkId = result.lastInsertRowid;

    db.prepare(`INSERT INTO content_flags (property_id, content_type, content_ref, preview_text) VALUES (?, 'partnership_link', ?, ?)`)
      .run(propertyId, String(linkId), `${label.trim()} — ${url.trim()}`);

    res.status(201).json(db.prepare('SELECT * FROM partnership_links WHERE id = ?').get(linkId));
  } catch (err) {
    if (req.file?.path) cleanup(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// PUT /:propertyId/:id — update label/description/url
partnershipLinksRouter.put('/:propertyId/:id', (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    const id         = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, propertyId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!isPro(req.user.userId)) {
      return res.status(403).json({ error: 'Pro or Multi plan required.' });
    }
    const link = db.prepare('SELECT * FROM partnership_links WHERE id = ? AND property_id = ?').get(id, propertyId);
    if (!link) return res.status(404).json({ error: 'Not found.' });

    const { label, description, url } = req.body;
    db.prepare(`UPDATE partnership_links SET label = ?, description = ?, url = ? WHERE id = ?`)
      .run(label?.trim() ?? link.label, description?.trim() || null, url?.trim() ?? link.url, id);

    res.json(db.prepare('SELECT * FROM partnership_links WHERE id = ?').get(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:propertyId/:id/icon — replace the icon on an existing link
partnershipLinksRouter.post('/:propertyId/:id/icon', iconUpload.single('icon'), async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    const id         = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, propertyId)) {
      if (req.file) cleanup(req.file.path);
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!isPro(req.user.userId)) {
      if (req.file) cleanup(req.file.path);
      return res.status(403).json({ error: 'Pro or Multi plan required.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const link = db.prepare('SELECT * FROM partnership_links WHERE id = ? AND property_id = ?').get(id, propertyId);
    if (!link) {
      cleanup(req.file.path);
      return res.status(404).json({ error: 'Not found.' });
    }

    if (link.icon_url) {
      cleanup(join(UPLOAD_DIR, link.icon_url.split('/').pop()));
    }

    const tmpPath = req.file.path + '.tmp';
    await sharp(req.file.path)
      .resize(80, 80, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85 })
      .toFile(tmpPath);
    cleanup(req.file.path);
    fs.renameSync(tmpPath, req.file.path);

    const iconUrl = `/uploads/partnerships/${req.file.filename}`;
    db.prepare('UPDATE partnership_links SET icon_url = ? WHERE id = ?').run(iconUrl, id);
    res.json({ icon_url: iconUrl });
  } catch (err) {
    if (req.file?.path) cleanup(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:propertyId/:id
partnershipLinksRouter.delete('/:propertyId/:id', (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    const id         = Number(req.params.id);
    if (!canAccess(req.user.userId, req.user.role, propertyId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const link = db.prepare('SELECT * FROM partnership_links WHERE id = ? AND property_id = ?').get(id, propertyId);
    if (!link) return res.status(404).json({ error: 'Not found.' });

    if (link.icon_url) {
      cleanup(join(UPLOAD_DIR, link.icon_url.split('/').pop()));
    }
    db.prepare('DELETE FROM partnership_links WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:propertyId/reorder — { order: [id, id, ...] }
partnershipLinksRouter.put('/:propertyId/reorder', (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!canAccess(req.user.userId, req.user.role, propertyId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array.' });
    order.forEach((id, i) => {
      db.prepare('UPDATE partnership_links SET display_order = ? WHERE id = ? AND property_id = ?')
        .run(i, Number(id), propertyId);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
