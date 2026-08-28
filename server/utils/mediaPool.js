import { join } from 'path';
import fs from 'fs';
import sharp from 'sharp';
import db from '../db/database.js';
import { cleanupFile } from './fileCleanup.js';
import { ROOM_UPLOAD_DIR, PHOTO_LIMITS } from './processRoomPhoto.js';

/**
 * The "unassigned pool" is `room_photos` rows with `room_id IS NULL` (property_id
 * kept). Photos land there when their room/unit is deleted, when a hero/access
 * photo is swapped out, or via an explicit move / direct-to-pool upload.
 *
 * There is no stored total-photos-per-property cap in NestBook. The pool cap is
 * computed live so it always tracks the property's current shape and plan:
 *
 *   Σ(every room/unit's own per-context photo limit)
 *   + 1   hero photo slot
 *   + 1   property access photo slot
 *   + 1   per unit, for its unit-access photo slot   (units-mode only)
 *   + 10  flat buffer
 */
export function computePoolCap(propertyId) {
  const prop = db.prepare('SELECT owner_id, rental_type FROM properties WHERE id = ?').get(propertyId);
  if (!prop) return 0;

  const plan   = db.prepare('SELECT plan FROM users WHERE id = ?').get(prop.owner_id)?.plan ?? 'free';
  const isUnits = prop.rental_type === 'units';
  const rooms  = db.prepare('SELECT parent_unit_id FROM rooms WHERE property_id = ?').all(propertyId);

  const perRoomLimit = isUnits ? 1 : (PHOTO_LIMITS[plan] ?? 1);
  let cap = rooms.length * perRoomLimit;

  cap += 1; // hero photo
  cap += 1; // property access photo
  if (isUnits) cap += rooms.filter(r => r.parent_unit_id === null).length; // unit access photos

  cap += 10; // flat buffer
  return cap;
}

export function poolCount(propertyId) {
  return db.prepare('SELECT COUNT(*) AS n FROM room_photos WHERE property_id = ? AND room_id IS NULL')
    .get(propertyId).n;
}

/**
 * Relocates an already-processed, already-moderated image file (a hero photo or
 * an access photo being swapped out) into the unassigned pool: moves the file
 * into ROOM_UPLOAD_DIR, derives a 400px thumbnail, and inserts a pool
 * `room_photos` row (room_id NULL, appended to the end of the pool order).
 *
 * Does NOT insert a content_flags row — the asset was already reviewed in its
 * previous slot; this is a relocation, not new content. Does NOT enforce the
 * pool cap — you can never be blocked from replacing your hero/access photo.
 *
 * `srcPath` must be an absolute path to an existing file. Throws on failure
 * (caller should fall back to deleting the old file).
 */
export async function adoptFileIntoPool({ srcPath, propertyId }) {
  if (!srcPath || !fs.existsSync(srcPath)) {
    throw new Error(`adoptFileIntoPool: source file missing (${srcPath})`);
  }

  const filename  = `pool-${propertyId}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const destPath  = join(ROOM_UPLOAD_DIR, filename);
  const thumbName = `thumb_${filename}`;
  const thumbPath = join(ROOM_UPLOAD_DIR, thumbName);

  try {
    fs.renameSync(srcPath, destPath);
  } catch {
    // Cross-device or locked — fall back to copy + unlink.
    fs.copyFileSync(srcPath, destPath);
    cleanupFile(srcPath);
  }

  try {
    await sharp(destPath)
      .resize(400, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);
  } catch (err) {
    cleanupFile(destPath);
    cleanupFile(thumbPath);
    throw err;
  }

  const m = db.prepare(
    'SELECT MAX(display_order) AS m FROM room_photos WHERE property_id = ? AND room_id IS NULL'
  ).get(propertyId);
  const displayOrder = (m?.m ?? -1) + 1;

  const result = db.prepare(
    `INSERT INTO room_photos (room_id, property_id, filename, thumb_filename, display_order)
     VALUES (NULL, ?, ?, ?, ?)`
  ).run(propertyId, filename, thumbName, displayOrder);

  return { id: result.lastInsertRowid, filename, thumbName, displayOrder };
}
