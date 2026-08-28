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

// Free: 3, Pro: 5, Multi: 10 — per IR/WP room, by the property owner's plan.
// Lives here (a leaf util with no router/multer imports) so both roomPhotos.js
// and utils/mediaPool.js can read it without a circular import. roomPhotos.js
// re-exports it, so `import { PHOTO_LIMITS } from './roomPhotos.js'` still works.
export const PHOTO_LIMITS = { free: 3, pro: 5, multi: 10 };

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
export async function processRoomPhoto(filePath, roomId, propertyIdOverride = null) {
  // roomId null/undefined → this is an unassigned-pool photo: property_id must
  // be supplied directly, room_id is stored NULL, and display_order is counted
  // over the pool rather than a room.
  let propertyId = propertyIdOverride;
  if (roomId != null) {
    const room = db.prepare('SELECT property_id FROM rooms WHERE id = ?').get(roomId);
    if (!room) throw new Error('Room not found');
    propertyId = room.property_id;
  }
  if (propertyId == null) {
    throw new Error('processRoomPhoto requires a roomId or a propertyIdOverride');
  }

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

  const maxOrder = roomId != null
    ? db.prepare('SELECT MAX(display_order) as m FROM room_photos WHERE room_id = ?').get(roomId)
    : db.prepare('SELECT MAX(display_order) as m FROM room_photos WHERE property_id = ? AND room_id IS NULL').get(propertyId);
  const displayOrder = (maxOrder?.m ?? -1) + 1;

  const result = db.prepare(
    `INSERT INTO room_photos (room_id, property_id, filename, thumb_filename, display_order) VALUES (?, ?, ?, ?, ?)`
  ).run(roomId ?? null, propertyId, fileName, thumbName, displayOrder);

  // Moderation queue entry. room_photos_id is the permanent, move-proof handle —
  // the old (filename + room_id) lookup breaks the moment a photo is reassigned.
  db.prepare(
    `INSERT INTO content_flags (property_id, room_id, room_photos_id, content_type, content_ref) VALUES (?, ?, ?, 'room_photo', ?)`
  ).run(propertyId, roomId ?? null, result.lastInsertRowid, fileName);

  return { id: result.lastInsertRowid, filename: fileName, thumbName, displayOrder };
}
