import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sharp from 'sharp';
import db from '../db/database.js';
import { cleanupFile } from './fileCleanup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Same folder the multer room-photo route has always used.
export const ROOM_UPLOAD_DIR = join(__dirname, '../uploads/rooms');
fs.mkdirSync(ROOM_UPLOAD_DIR, { recursive: true });

/**
 * Turns an already-saved image file into a room photo. Extracted verbatim from
 * the inline logic in `routes/roomPhotos.js` so the multer upload route and the
 * CSV import's photo-from-URL path can share one implementation.
 *
 *   - full-size  (1200px wide, JPEG q85) written back over `filePath`
 *   - thumbnail  (400px wide,  JPEG q80) written as `thumb_<name>` alongside it
 *   - `room_photos` row inserted (filename, thumb_filename, next display_order)
 *   - `content_flags` row inserted so the photo enters the moderation queue
 *
 * `filePath` must already live inside ROOM_UPLOAD_DIR (the multer route saves it
 * there; the import path fetches the URL into a temp file there). The stored
 * filename is `basename(filePath)`, matching the multer route's behaviour.
 *
 * Returns `{ id, filename, thumbName, displayOrder }`. On failure it cleans up
 * its own intermediate files (tmp + thumb) and rethrows — the caller remains
 * responsible for `filePath` itself.
 */
export async function processRoomPhoto(filePath, roomId) {
  const room = db.prepare('SELECT property_id FROM rooms WHERE id = ?').get(roomId);
  if (!room) throw new Error('Room not found');

  const fileName  = basename(filePath);
  const thumbName = `thumb_${fileName}`;
  const fullPath  = join(ROOM_UPLOAD_DIR, fileName);
  const thumbPath = join(ROOM_UPLOAD_DIR, thumbName);
  const tmpPath   = fullPath + '.tmp';

  try {
    await sharp(filePath)
      .resize(1200, null, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(tmpPath);
    await sharp(filePath)
      .resize(400, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);
    fs.unlinkSync(fullPath);
    fs.renameSync(tmpPath, fullPath);
  } catch (err) {
    cleanupFile(tmpPath);
    cleanupFile(thumbPath);
    throw err;
  }

  const maxOrder     = db.prepare('SELECT MAX(display_order) as m FROM room_photos WHERE room_id = ?').get(roomId);
  const displayOrder = (maxOrder?.m ?? -1) + 1;

  const result = db.prepare(
    `INSERT INTO room_photos (room_id, property_id, filename, thumb_filename, display_order) VALUES (?, ?, ?, ?, ?)`
  ).run(roomId, room.property_id, fileName, thumbName, displayOrder);

  db.prepare(
    `INSERT INTO content_flags (property_id, room_id, content_type, content_ref) VALUES (?, ?, 'room_photo', ?)`
  ).run(room.property_id, roomId, fileName);

  return { id: result.lastInsertRowid, filename: fileName, thumbName, displayOrder };
}
