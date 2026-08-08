import db from '../db/database.js';
import sharp from 'sharp';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ROOM_UPLOAD_DIR } from '../routes/roomPhotos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROP_UPLOAD_DIR = join(__dirname, '../uploads/properties');
fs.mkdirSync(PROP_UPLOAD_DIR, { recursive: true });

const HERO_URL = 'https://images.pexels.com/photos/1438834/pexels-photo-1438834.jpeg?auto=compress&cs=tinysrgb&w=1260';

/**
 * Seeds sample rooms, guests, bookings and photos for a freshly registered
 * property. Called fire-and-forget from the onboarding completion hook.
 * Skips silently if the property already has any sample data.
 */
export async function seedSampleData(userId, propertyId, rentalType, unSubType) {
  const existing = db.prepare(
    'SELECT 1 FROM rooms WHERE property_id = ? AND is_sample_data = 1 LIMIT 1'
  ).get(propertyId);
  if (existing) return;

  try {
    if (rentalType === 'rooms') {
      await _seedIR(propertyId);
    } else if (rentalType === 'whole_property') {
      await _seedWP(propertyId);
    } else if (rentalType === 'units') {
      await _seedUn(propertyId, unSubType);
    }

    _seedGuestsAndBookings(propertyId, rentalType);
    await _seedHeroPhoto(propertyId, HERO_URL);
  } catch (e) {
    console.error('[seedSampleData] Failed for property', propertyId, e.message);
  }
}

// ── IR: 2 guest rooms, 3 photos each ─────────────────────────────────────────

async function _seedIR(propertyId) {
  const { lastInsertRowid: r1 } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, is_sample_data)
    VALUES (?, 'Garden Room', 'double', 85, 2, 1)
  `).run(propertyId);

  const { lastInsertRowid: r2 } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, is_sample_data)
    VALUES (?, 'Orchard Room', 'double', 95, 2, 1)
  `).run(propertyId);

  await Promise.all([
    _seedPhoto(r1, propertyId, 'https://images.pexels.com/photos/31267713/pexels-photo-31267713.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    _seedPhoto(r1, propertyId, 'https://images.pexels.com/photos/31267711/pexels-photo-31267711.jpeg?auto=compress&cs=tinysrgb&w=1260', 1),
    _seedPhoto(r1, propertyId, 'https://images.pexels.com/photos/33054913/pexels-photo-33054913.jpeg?auto=compress&cs=tinysrgb&w=1260', 2),
    _seedPhoto(r2, propertyId, 'https://images.pexels.com/photos/7746937/pexels-photo-7746937.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    _seedPhoto(r2, propertyId, 'https://images.pexels.com/photos/7746946/pexels-photo-7746946.jpeg?auto=compress&cs=tinysrgb&w=1260', 1),
    _seedPhoto(r2, propertyId, 'https://images.pexels.com/photos/7745986/pexels-photo-7745986.jpeg?auto=compress&cs=tinysrgb&w=1260', 2),
  ]);
}

// ── WP: 6 showcase rows, 1 photo each ────────────────────────────────────────

const WP_ROWS = [
  { name: 'Bedroom',        type: 'double',      url: 'https://images.pexels.com/photos/7745932/pexels-photo-7745932.jpeg?auto=compress&cs=tinysrgb&w=1260' },
  { name: 'Kitchen',        type: 'kitchen',     url: 'https://images.pexels.com/photos/8186477/pexels-photo-8186477.jpeg?auto=compress&cs=tinysrgb&w=1260' },
  { name: 'Guest Bedroom',  type: 'double',      url: 'https://images.pexels.com/photos/7746571/pexels-photo-7746571.jpeg?auto=compress&cs=tinysrgb&w=1260' },
  { name: 'Living Room',    type: 'living_room', url: 'https://images.pexels.com/photos/8583743/pexels-photo-8583743.jpeg?auto=compress&cs=tinysrgb&w=1260' },
  { name: "Kid's Bedroom",  type: 'kids',        url: 'https://images.pexels.com/photos/10099276/pexels-photo-10099276.jpeg?auto=compress&cs=tinysrgb&w=1260' },
  { name: 'Bathroom',       type: 'bathroom',    url: 'https://images.pexels.com/photos/7031840/pexels-photo-7031840.jpeg?auto=compress&cs=tinysrgb&w=1260' },
];

async function _seedWP(propertyId) {
  const photoTasks = [];
  for (const row of WP_ROWS) {
    const { lastInsertRowid: rid } = db.prepare(`
      INSERT INTO rooms (property_id, name, type, price_per_night, capacity, is_sample_data)
      VALUES (?, ?, ?, 0, 0, 1)
    `).run(propertyId, row.name, row.type);
    photoTasks.push(_seedPhoto(rid, propertyId, row.url, 0));
  }

  const prop = db.prepare('SELECT whole_property_rate FROM properties WHERE id = ?').get(propertyId);
  if (!prop?.whole_property_rate) {
    db.prepare('UPDATE properties SET whole_property_rate = 120 WHERE id = ?').run(propertyId);
  }

  await Promise.all(photoTasks);
}

// ── Un: 2 top-level units (3 photos each) + 1 internal child room (1 photo) ─

async function _seedUn(propertyId, unSubType) {
  const unitType = unSubType === 'glamping' ? 'other' : 'apartment';

  const { lastInsertRowid: unitAId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, is_sample_data)
    VALUES (?, 'Unit A', ?, 110, 4, 1)
  `).run(propertyId, unitType);

  const { lastInsertRowid: childId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, parent_unit_id, is_sample_data)
    VALUES (?, 'Double Room', 'double', 0, 2, ?, 1)
  `).run(propertyId, unitAId);

  const { lastInsertRowid: unitBId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, is_sample_data)
    VALUES (?, 'Unit B', ?, 110, 4, 1)
  `).run(propertyId, unitType);

  await Promise.all([
    _seedPhoto(unitAId, propertyId, 'https://images.pexels.com/photos/29252605/pexels-photo-29252605.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    _seedPhoto(unitAId, propertyId, 'https://images.pexels.com/photos/29252612/pexels-photo-29252612.jpeg?auto=compress&cs=tinysrgb&w=1260', 1),
    _seedPhoto(unitAId, propertyId, 'https://images.pexels.com/photos/33312430/pexels-photo-33312430.jpeg?auto=compress&cs=tinysrgb&w=1260', 2),
    _seedPhoto(childId, propertyId, 'https://images.pexels.com/photos/7031881/pexels-photo-7031881.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    _seedPhoto(unitBId, propertyId, 'https://images.pexels.com/photos/8583594/pexels-photo-8583594.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    _seedPhoto(unitBId, propertyId, 'https://images.pexels.com/photos/5178039/pexels-photo-5178039.jpeg?auto=compress&cs=tinysrgb&w=1260', 1),
    _seedPhoto(unitBId, propertyId, 'https://images.pexels.com/photos/5002326/pexels-photo-5002326.jpeg?auto=compress&cs=tinysrgb&w=1260', 2),
  ]);
}

// ── Photo helpers ─────────────────────────────────────────────────────────────

async function _seedPhoto(roomId, propertyId, url, order) {
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const buffer = Buffer.from(await res.arrayBuffer());

    const baseName = `${roomId}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const thumbName = `thumb_${baseName}`;
    const fullPath  = join(ROOM_UPLOAD_DIR, baseName);
    const thumbPath = join(ROOM_UPLOAD_DIR, thumbName);

    await sharp(buffer).resize(1200, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(fullPath);
    await sharp(buffer).resize(400,  null, { withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(thumbPath);

    db.prepare(`
      INSERT INTO room_photos (room_id, property_id, filename, thumb_filename, display_order, is_sample_data)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(roomId, propertyId, baseName, thumbName, order);
  } catch (e) {
    console.error(`[seedSampleData] Photo failed (room ${roomId}):`, e.message);
  }
}

async function _seedHeroPhoto(propertyId, url) {
  try {
    const prop = db.prepare('SELECT hero_photo FROM properties WHERE id = ?').get(propertyId);
    if (prop?.hero_photo) return;

    const res = await fetch(url);
    if (!res.ok) return;
    const buffer = Buffer.from(await res.arrayBuffer());

    const fileName = `prop-${propertyId}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    await sharp(buffer).resize(1920, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(join(PROP_UPLOAD_DIR, fileName));

    db.prepare('UPDATE properties SET hero_photo = ? WHERE id = ?').run(fileName, propertyId);
  } catch (e) {
    console.error(`[seedSampleData] Hero photo failed (property ${propertyId}):`, e.message);
  }
}

// ── Guests + bookings ─────────────────────────────────────────────────────────

function _seedGuestsAndBookings(propertyId, rentalType) {
  const { lastInsertRowid: guest1Id } = db.prepare(`
    INSERT INTO guests (property_id, first_name, last_name, email, is_sample_data)
    VALUES (?, 'Emma', 'Clarke', 'emma.clarke@example.com', 1)
  `).run(propertyId);

  const { lastInsertRowid: guest2Id } = db.prepare(`
    INSERT INTO guests (property_id, first_name, last_name, email, is_sample_data)
    VALUES (?, 'Michael', 'Dupont', 'm.dupont@example.com', 1)
  `).run(propertyId);

  const firstRoom = db.prepare(
    'SELECT id FROM rooms WHERE property_id = ? AND is_sample_data = 1 AND parent_unit_id IS NULL ORDER BY id ASC LIMIT 1'
  ).get(propertyId);
  if (!firstRoom) return;

  const secondRoom = db.prepare(
    'SELECT id FROM rooms WHERE property_id = ? AND is_sample_data = 1 AND parent_unit_id IS NULL AND id != ? ORDER BY id ASC LIMIT 1'
  ).get(propertyId, firstRoom.id);

  const today = new Date();
  db.prepare(`
    INSERT INTO bookings (property_id, room_id, guest_id, check_in_date, check_out_date, status, total_price, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 'checked_out', ?, 1)
  `).run(propertyId, firstRoom.id, guest1Id,
    _offsetDate(today, -28), _offsetDate(today, -25),
    rentalType === 'whole_property' ? 360 : 255);

  db.prepare(`
    INSERT INTO bookings (property_id, room_id, guest_id, check_in_date, check_out_date, status, total_price, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 'confirmed', ?, 1)
  `).run(propertyId, (secondRoom ?? firstRoom).id, guest2Id,
    _offsetDate(today, 14), _offsetDate(today, 16),
    rentalType === 'whole_property' ? 240 : 190);
}

function _offsetDate(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
