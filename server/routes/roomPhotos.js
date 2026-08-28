import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import db from '../db/database.js';
import { cleanupFile } from '../utils/fileCleanup.js';
import { processRoomPhoto, PHOTO_LIMITS } from '../utils/processRoomPhoto.js';
import { computePoolCap, poolCount } from '../utils/mediaPool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOM_UPLOAD_DIR = join(__dirname, '../uploads/rooms');

fs.mkdirSync(ROOM_UPLOAD_DIR, { recursive: true });

// Free: 3, Pro: 5, Multi: 10. Defined in utils/processRoomPhoto.js (a leaf
// module) to avoid a circular import with utils/mediaPool.js; re-exported here
// so existing `import { PHOTO_LIMITS } from './roomPhotos.js'` call sites (and
// the CSV room-import path in routes/rooms.js) keep working unchanged.
export { PHOTO_LIMITS };

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

// Property-level access check (mirrors canAccessRoom's owner/staff logic) for
// endpoints that address a photo directly rather than via its room.
function canAccessPropertyId(userId, role, propId) {
  if (role === 'owner'
      && db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?').get(propId, userId)) {
    return true;
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return Number(u?.property_id) === propId;
}

// The per-context photo limit for a room: 1 for any room on a units-mode
// property (units + internal rooms), otherwise the owner-plan cap. Single
// source of truth — used by the upload route and the move route.
function photoLimitForRoom(roomId, userId) {
  const roomRow = db.prepare('SELECT property_id FROM rooms WHERE id = ?').get(roomId);
  if (!roomRow) return 1;
  const isUnitsModeRoom = db.prepare('SELECT rental_type FROM properties WHERE id = ?')
    .get(roomRow.property_id)?.rental_type === 'units';
  if (isUnitsModeRoom) return 1;
  return PHOTO_LIMITS[getOwnerPlan(userId)] ?? 1;
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
    const roomRow = db.prepare('SELECT property_id FROM rooms WHERE id = ?').get(roomId);
    const isUnitsModeRoom = roomRow
      ? db.prepare('SELECT rental_type FROM properties WHERE id = ?').get(roomRow.property_id)?.rental_type === 'units'
      : false;
    // Units and their internal rooms are capped at exactly 1 photo regardless
    // of plan tier -- the per-plan limit only applies to IR/WP rooms.
    const limit = isUnitsModeRoom ? 1 : (PHOTO_LIMITS[plan] ?? 1);
    const count = db.prepare('SELECT COUNT(*) as n FROM room_photos WHERE room_id = ?').get(roomId).n;
    if (count >= limit) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({
        error: isUnitsModeRoom
          ? 'Photo limit reached (1 per room).'
          : `Photo limit reached for ${plan} plan (${limit} per room). Upgrade to add more photos.`,
      });
    }

    // Resize + thumbnail + room_photos + content_flags — shared with the CSV
    // room-import photo-from-URL path (server/utils/processRoomPhoto.js).
    const { id, filename, displayOrder } = await processRoomPhoto(req.file.path, roomId);

    res.status(201).json({
      id,
      url: `/uploads/rooms/${filename}`,
      displayOrder,
    });
  } catch (err) {
    if (req.file?.path) {
      cleanupFile(req.file.path);
      cleanupFile(req.file.path + '.tmp');
      cleanupFile(join(ROOM_UPLOAD_DIR, `thumb_${req.file.filename}`));
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
    cleanupFile(join(ROOM_UPLOAD_DIR, photo.filename));
    if (photo.thumb_filename) {
      cleanupFile(join(ROOM_UPLOAD_DIR, photo.thumb_filename));
    }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /photos/:photoId  { roomId: <id> | null }
// Media Library move/reassign. roomId null → unassigned pool (Part 4 cap
// enforced). roomId <id> → that room/unit (its own per-context limit enforced).
// The content_flags.room_photos_id link is unaffected by the move, so a photo's
// moderation state survives being reassigned.
roomPhotosRouter.patch('/photos/:photoId', (req, res) => {
  try {
    const photoId = Number(req.params.photoId);
    const photo = db.prepare('SELECT * FROM room_photos WHERE id = ?').get(photoId);
    if (!photo) return res.status(404).json({ error: 'Photo not found.' });
    if (!canAccessPropertyId(req.user.userId, req.user.role, photo.property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const body = req.body || {};
    if (!('roomId' in body)) {
      return res.status(400).json({ error: 'roomId is required (a room id, or null for the unassigned pool).' });
    }
    const destRoomId = body.roomId === null ? null : Number(body.roomId);
    if (destRoomId !== null && !Number.isInteger(destRoomId)) {
      return res.status(400).json({ error: 'roomId must be an integer or null.' });
    }

    if (destRoomId === null) {
      if (photo.room_id === null) return res.json(shapeMovedPhoto(photo));
      const cap = computePoolCap(photo.property_id);
      if (poolCount(photo.property_id) >= cap) {
        return res.status(403).json({ error: `The unassigned pool is full (${cap} max for this property).` });
      }
      const m = db.prepare('SELECT MAX(display_order) AS m FROM room_photos WHERE property_id = ? AND room_id IS NULL').get(photo.property_id);
      db.prepare('UPDATE room_photos SET room_id = NULL, display_order = ? WHERE id = ?').run((m?.m ?? -1) + 1, photoId);
    } else {
      const destRoom = db.prepare('SELECT id, property_id FROM rooms WHERE id = ?').get(destRoomId);
      if (!destRoom || destRoom.property_id !== photo.property_id) {
        return res.status(400).json({ error: 'Destination room is not part of this property.' });
      }
      if (photo.room_id === destRoomId) return res.json(shapeMovedPhoto(photo));
      const limit = photoLimitForRoom(destRoomId, req.user.userId);
      const count = db.prepare('SELECT COUNT(*) AS n FROM room_photos WHERE room_id = ?').get(destRoomId).n;
      if (count >= limit) {
        return res.status(403).json({ error: `Destination photo limit reached (${limit}).` });
      }
      const m = db.prepare('SELECT MAX(display_order) AS m FROM room_photos WHERE room_id = ?').get(destRoomId);
      db.prepare('UPDATE room_photos SET room_id = ?, display_order = ? WHERE id = ?').run(destRoomId, (m?.m ?? -1) + 1, photoId);
    }

    const updated = db.prepare('SELECT * FROM room_photos WHERE id = ?').get(photoId);
    res.json(shapeMovedPhoto(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function shapeMovedPhoto(p) {
  return {
    id: p.id,
    roomId: p.room_id,
    url: `/uploads/rooms/${p.filename}`,
    thumbUrl: `/uploads/rooms/${p.thumb_filename || p.filename}`,
    displayOrder: p.display_order,
  };
}
