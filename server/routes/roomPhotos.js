import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import db from '../db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOM_UPLOAD_DIR = join(__dirname, '../uploads/rooms');

fs.mkdirSync(ROOM_UPLOAD_DIR, { recursive: true });

// Free: 1, Pro: 5, Multi: 10
const PHOTO_LIMITS = { free: 1, pro: 5, multi: 10 };

function getOwnerPlan(userId) {
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
  return user?.plan ?? 'free';
}

function canAccessRoom(userId, role, roomId) {
  const room = db.prepare('SELECT property_id FROM rooms WHERE id = ?').get(roomId);
  if (!room) return false;
  const propId = room.property_id;
  if (role === 'owner') {
    if (db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?').get(propId, userId)) return true;
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
    return Number(u?.property_id) === propId;
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return Number(u?.property_id) === propId;
}

const storage = multer.diskStorage({
  destination: ROOM_UPLOAD_DIR,
  filename: (req, file, cb) => {
    const name = `${req.params.roomId}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

export const roomPhotosRouter = Router();

// GET /:roomId/photos
roomPhotosRouter.get('/:roomId/photos', (req, res) => {
  try {
    const roomId = Number(req.params.roomId);
    if (!canAccessRoom(req.user.userId, req.user.role, roomId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const photos = db.prepare(
      `SELECT id, filename, display_order FROM room_photos WHERE room_id = ? ORDER BY display_order ASC, id ASC`
    ).all(roomId);
    res.json(photos.map(p => ({
      id: p.id,
      url: `/uploads/rooms/${p.filename}`,
      displayOrder: p.display_order,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:roomId/photos
roomPhotosRouter.post('/:roomId/photos', upload.single('photo'), async (req, res) => {
  try {
    const roomId = Number(req.params.roomId);
    if (!canAccessRoom(req.user.userId, req.user.role, roomId)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const plan  = getOwnerPlan(req.user.userId);
    const limit = PHOTO_LIMITS[plan] ?? 1;
    const count = db.prepare('SELECT COUNT(*) as n FROM room_photos WHERE room_id = ?').get(roomId).n;
    if (count >= limit) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({
        error: `Photo limit reached for ${plan} plan (${limit} per room). Upgrade to add more photos.`,
      });
    }

    // Generate full-size (1200px) and thumbnail (400px)
    const baseName  = req.file.filename;
    const thumbName = `thumb_${baseName}`;
    const thumbPath = join(ROOM_UPLOAD_DIR, thumbName);
    const tmpPath   = req.file.path + '.tmp';
    await sharp(req.file.path)
      .resize(1200, null, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(tmpPath);
    await sharp(req.file.path)
      .resize(400, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);
    fs.unlinkSync(req.file.path);
    fs.renameSync(tmpPath, req.file.path);

    const room     = db.prepare('SELECT property_id FROM rooms WHERE id = ?').get(roomId);
    const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM room_photos WHERE room_id = ?').get(roomId);
    const nextOrder = (maxOrder?.m ?? -1) + 1;

    const result = db.prepare(
      `INSERT INTO room_photos (room_id, property_id, filename, thumb_filename, display_order) VALUES (?, ?, ?, ?, ?)`
    ).run(roomId, room.property_id, req.file.filename, thumbName, nextOrder);

    db.prepare(`INSERT INTO content_flags (property_id, room_id, content_type, content_ref) VALUES (?, ?, 'room_photo', ?)`)
      .run(room.property_id, roomId, req.file.filename);

    res.status(201).json({
      id: result.lastInsertRowid,
      url: `/uploads/rooms/${req.file.filename}`,
      displayOrder: nextOrder,
    });
  } catch (err) {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
      try { fs.unlinkSync(req.file.path + '.tmp'); } catch {}
      try { fs.unlinkSync(join(ROOM_UPLOAD_DIR, `thumb_${req.file.filename}`)); } catch {}
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /:roomId/photos/reorder — must come before /:roomId/photos/:photoId
roomPhotosRouter.put('/:roomId/photos/reorder', (req, res) => {
  try {
    const roomId = Number(req.params.roomId);
    if (!canAccessRoom(req.user.userId, req.user.role, roomId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of IDs.' });

    db.exec('BEGIN');
    try {
      const update = db.prepare(`UPDATE room_photos SET display_order = ? WHERE id = ? AND room_id = ?`);
      for (let i = 0; i < order.length; i++) update.run(i, order[i], roomId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:roomId/photos/:photoId
roomPhotosRouter.delete('/:roomId/photos/:photoId', (req, res) => {
  try {
    const roomId  = Number(req.params.roomId);
    const photoId = Number(req.params.photoId);
    if (!canAccessRoom(req.user.userId, req.user.role, roomId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const photo = db.prepare('SELECT * FROM room_photos WHERE id = ? AND room_id = ?').get(photoId, roomId);
    if (!photo) return res.status(404).json({ error: 'Photo not found.' });

    db.prepare('DELETE FROM room_photos WHERE id = ?').run(photoId);
    try { fs.unlinkSync(join(ROOM_UPLOAD_DIR, photo.filename)); } catch {}
    if (photo.thumb_filename) {
      try { fs.unlinkSync(join(ROOM_UPLOAD_DIR, photo.thumb_filename)); } catch {}
    }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
