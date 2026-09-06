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

// ── Localised sample-data strings ────────────────────────────────────────────
// Sample data is entirely system-generated preview content (not a real owner's
// own room names), so it follows the new account's language — same principle as
// the welcome emails and onboarding wizard. Selected once at seed time.
//
// The WP `desc` strings MUST stay byte-identical to the page.sampleDesc* values
// in server/routes/bookingPage.js's I18N dict — the booking page also translates
// these live via data-i18n so a guest switching the page language sees them
// change. Room *names* are seed-time only (they also show in the owner's
// dashboard / calendar / bookings, which data-i18n can't reach).

const SAMPLE_LANGS = ['en', 'fr', 'de', 'es', 'nl'];

const SAMPLE_CONTENT = {
  en: {
    ir: ['Garden Room', 'Orchard Room'],
    wp: {
      bedrooms:     { name: 'Bedrooms',      desc: 'Comfortable bedrooms with plenty of natural light, ready to welcome your guests.' },
      livingSpaces: { name: 'Living Spaces', desc: 'A warm kitchen and living area where guests can relax and feel at home.' },
      bathroom:     { name: 'Bathroom',      desc: "A clean, well-appointed bathroom for your guests' stay." },
    },
    un: { unitA: 'Unit A', unitB: 'Unit B', double: 'Double Room', kitchen: 'Kitchen', living: 'Living Area', bathroom: 'Bathroom' },
  },
  fr: {
    ir: ['Chambre Jardin', 'Chambre Verger'],
    wp: {
      bedrooms:     { name: 'Chambres',        desc: 'Des chambres confortables et lumineuses, prêtes à accueillir vos invités.' },
      livingSpaces: { name: 'Espaces de vie',  desc: 'Une cuisine chaleureuse et un espace de vie où les invités peuvent se détendre et se sentir chez eux.' },
      bathroom:     { name: 'Salle de bains',  desc: 'Une salle de bains propre et bien équipée pour le séjour de vos invités.' },
    },
    un: { unitA: 'Logement A', unitB: 'Logement B', double: 'Chambre double', kitchen: 'Cuisine', living: 'Espace de vie', bathroom: 'Salle de bains' },
  },
  de: {
    ir: ['Gartenzimmer', 'Obstgartenzimmer'],
    wp: {
      bedrooms:     { name: 'Schlafzimmer', desc: 'Komfortable, lichtdurchflutete Schlafzimmer, bereit für Ihre Gäste.' },
      livingSpaces: { name: 'Wohnräume',    desc: 'Eine gemütliche Küche und ein Wohnbereich, in dem sich Gäste entspannen und wohlfühlen können.' },
      bathroom:     { name: 'Badezimmer',   desc: 'Ein sauberes, gut ausgestattetes Badezimmer für den Aufenthalt Ihrer Gäste.' },
    },
    un: { unitA: 'Unterkunft A', unitB: 'Unterkunft B', double: 'Doppelzimmer', kitchen: 'Küche', living: 'Wohnbereich', bathroom: 'Badezimmer' },
  },
  es: {
    ir: ['Habitación Jardín', 'Habitación Huerto'],
    wp: {
      bedrooms:     { name: 'Dormitorios',   desc: 'Dormitorios cómodos y luminosos, listos para recibir a sus huéspedes.' },
      livingSpaces: { name: 'Zonas comunes', desc: 'Una cocina acogedora y una zona de estar donde los huéspedes pueden relajarse y sentirse como en casa.' },
      bathroom:     { name: 'Baño',          desc: 'Un baño limpio y bien equipado para la estancia de sus huéspedes.' },
    },
    un: { unitA: 'Alojamiento A', unitB: 'Alojamiento B', double: 'Habitación doble', kitchen: 'Cocina', living: 'Zona de estar', bathroom: 'Baño' },
  },
  nl: {
    ir: ['Tuinkamer', 'Boomgaardkamer'],
    wp: {
      bedrooms:     { name: 'Slaapkamers',  desc: 'Comfortabele slaapkamers met veel natuurlijk licht, klaar om uw gasten te ontvangen.' },
      livingSpaces: { name: 'Woonruimtes',  desc: 'Een warme keuken en woonruimte waar gasten kunnen ontspannen en zich thuis voelen.' },
      bathroom:     { name: 'Badkamer',     desc: 'Een schone, goed uitgeruste badkamer voor het verblijf van uw gasten.' },
    },
    un: { unitA: 'Accommodatie A', unitB: 'Accommodatie B', double: 'Tweepersoonskamer', kitchen: 'Keuken', living: 'Woonruimte', bathroom: 'Badkamer' },
  },
};

function sampleStrings(lang) {
  return SAMPLE_CONTENT[SAMPLE_LANGS.includes(lang) ? lang : 'en'];
}

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

  // Match the account's language, the same way the welcome email does.
  const userRow = db.prepare('SELECT language FROM users WHERE id = ?').get(userId);
  const S = sampleStrings(userRow?.language);

  try {
    if (rentalType === 'rooms') {
      await _seedIR(propertyId, S);
    } else if (rentalType === 'whole_property') {
      await _seedWP(propertyId, S);
    } else if (rentalType === 'units') {
      await _seedUn(propertyId, unSubType, S);
    }

    _seedGuestsAndBookings(propertyId, rentalType);
    await _seedHeroPhoto(propertyId, HERO_URL);
  } catch (e) {
    console.error('[seedSampleData] Failed for property', propertyId, e.message);
  }
}

// ── IR: 2 guest rooms, 3 photos each ─────────────────────────────────────────

async function _seedIR(propertyId, S) {
  const { lastInsertRowid: r1 } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, is_sample_data)
    VALUES (?, ?, 'double', 85, 2, 1)
  `).run(propertyId, S.ir[0]);

  const { lastInsertRowid: r2 } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, is_sample_data)
    VALUES (?, ?, 'double', 95, 2, 1)
  `).run(propertyId, S.ir[1]);

  await Promise.all([
    _seedPhoto(r1, propertyId, 'https://images.pexels.com/photos/31267713/pexels-photo-31267713.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    _seedPhoto(r1, propertyId, 'https://images.pexels.com/photos/31267711/pexels-photo-31267711.jpeg?auto=compress&cs=tinysrgb&w=1260', 1),
    _seedPhoto(r1, propertyId, 'https://images.pexels.com/photos/33054913/pexels-photo-33054913.jpeg?auto=compress&cs=tinysrgb&w=1260', 2),
    _seedPhoto(r2, propertyId, 'https://images.pexels.com/photos/7746937/pexels-photo-7746937.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    _seedPhoto(r2, propertyId, 'https://images.pexels.com/photos/7746946/pexels-photo-7746946.jpeg?auto=compress&cs=tinysrgb&w=1260', 1),
    _seedPhoto(r2, propertyId, 'https://images.pexels.com/photos/7745986/pexels-photo-7745986.jpeg?auto=compress&cs=tinysrgb&w=1260', 2),
  ]);
}

// ── WP: 3 consolidated showcase rows ─────────────────────────────────────────

const WP_ROWS = [
  {
    key: 'bedrooms',
    type: 'double',
    urls: [
      'https://images.pexels.com/photos/7745932/pexels-photo-7745932.jpeg?auto=compress&cs=tinysrgb&w=1260',   // main bedroom
      'https://images.pexels.com/photos/7746571/pexels-photo-7746571.jpeg?auto=compress&cs=tinysrgb&w=1260',   // guest bedroom
      'https://images.pexels.com/photos/10099276/pexels-photo-10099276.jpeg?auto=compress&cs=tinysrgb&w=1260', // kid's bedroom
    ],
  },
  {
    key: 'livingSpaces',
    type: 'living_room',
    urls: [
      'https://images.pexels.com/photos/8186477/pexels-photo-8186477.jpeg?auto=compress&cs=tinysrgb&w=1260',  // kitchen
      'https://images.pexels.com/photos/8583743/pexels-photo-8583743.jpeg?auto=compress&cs=tinysrgb&w=1260',  // living room
    ],
  },
  {
    key: 'bathroom',
    type: 'bathroom',
    urls: [
      'https://images.pexels.com/photos/7031840/pexels-photo-7031840.jpeg?auto=compress&cs=tinysrgb&w=1260',  // bathroom
    ],
  },
];

async function _seedWP(propertyId, S) {
  const photoTasks = [];
  for (const row of WP_ROWS) {
    const str = S.wp[row.key];
    const { lastInsertRowid: rid } = db.prepare(`
      INSERT INTO rooms (property_id, name, type, price_per_night, capacity, description, is_sample_data)
      VALUES (?, ?, ?, 0, 0, ?, 1)
    `).run(propertyId, str.name, row.type, str.desc);
    row.urls.forEach((url, i) => photoTasks.push(_seedPhoto(rid, propertyId, url, i)));
  }

  const prop = db.prepare('SELECT whole_property_rate FROM properties WHERE id = ?').get(propertyId);
  if (!prop?.whole_property_rate) {
    db.prepare('UPDATE properties SET whole_property_rate = 120 WHERE id = ?').run(propertyId);
  }

  await Promise.all(photoTasks);
}

// ── Un: 2 top-level units (1 photo each) + 3 internal rooms per unit (1 photo each) ─
// Capped at 1 photo per room/unit to match the enforced Free-plan Un-mode limit.

async function _seedUn(propertyId, unSubType, S) {
  const unitType = unSubType === 'glamping' ? 'other' : 'apartment';

  // ── Unit A ────────────────────────────────────────────────────────────────
  const { lastInsertRowid: unitAId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, is_sample_data)
    VALUES (?, ?, ?, 110, 4, 1)
  `).run(propertyId, S.un.unitA, unitType);

  const { lastInsertRowid: aDoubleId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, parent_unit_id, is_sample_data)
    VALUES (?, ?, 'double', 0, 2, ?, 1)
  `).run(propertyId, S.un.double, unitAId);

  const { lastInsertRowid: aKitchenId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, parent_unit_id, is_sample_data)
    VALUES (?, ?, 'kitchen', 0, 0, ?, 1)
  `).run(propertyId, S.un.kitchen, unitAId);

  const { lastInsertRowid: aLivingId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, parent_unit_id, is_sample_data)
    VALUES (?, ?, 'living_room', 0, 0, ?, 1)
  `).run(propertyId, S.un.living, unitAId);

  // ── Unit B ────────────────────────────────────────────────────────────────
  const { lastInsertRowid: unitBId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, is_sample_data)
    VALUES (?, ?, ?, 110, 4, 1)
  `).run(propertyId, S.un.unitB, unitType);

  const { lastInsertRowid: bDoubleId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, parent_unit_id, is_sample_data)
    VALUES (?, ?, 'double', 0, 2, ?, 1)
  `).run(propertyId, S.un.double, unitBId);

  const { lastInsertRowid: bKitchenId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, parent_unit_id, is_sample_data)
    VALUES (?, ?, 'kitchen', 0, 0, ?, 1)
  `).run(propertyId, S.un.kitchen, unitBId);

  const { lastInsertRowid: bBathroomId } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, parent_unit_id, is_sample_data)
    VALUES (?, ?, 'bathroom', 0, 0, ?, 1)
  `).run(propertyId, S.un.bathroom, unitBId);

  await Promise.all([
    // Unit A — 1 photo on the unit itself
    _seedPhoto(unitAId,    propertyId, 'https://images.pexels.com/photos/29252605/pexels-photo-29252605.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    // Unit A internal rooms — 1 photo each
    _seedPhoto(aDoubleId,  propertyId, 'https://images.pexels.com/photos/7031881/pexels-photo-7031881.jpeg?auto=compress&cs=tinysrgb&w=1260',  0),
    _seedPhoto(aKitchenId, propertyId, 'https://images.pexels.com/photos/29252612/pexels-photo-29252612.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    _seedPhoto(aLivingId,  propertyId, 'https://images.pexels.com/photos/33312430/pexels-photo-33312430.jpeg?auto=compress&cs=tinysrgb&w=1260', 0),
    // Unit B — 1 photo on the unit itself
    _seedPhoto(unitBId,    propertyId, 'https://images.pexels.com/photos/8583594/pexels-photo-8583594.jpeg?auto=compress&cs=tinysrgb&w=1260',  0),
    // Unit B internal rooms — 1 photo each
    _seedPhoto(bDoubleId,  propertyId, 'https://images.pexels.com/photos/5178039/pexels-photo-5178039.jpeg?auto=compress&cs=tinysrgb&w=1260',  0),
    _seedPhoto(bKitchenId, propertyId, 'https://images.pexels.com/photos/5002326/pexels-photo-5002326.jpeg?auto=compress&cs=tinysrgb&w=1260',  0),
    _seedPhoto(bBathroomId,propertyId, 'https://images.pexels.com/photos/7031840/pexels-photo-7031840.jpeg?auto=compress&cs=tinysrgb&w=1260',  0),
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

    db.prepare('UPDATE properties SET hero_photo = ?, hero_photo_is_sample = 1 WHERE id = ?').run(fileName, propertyId);
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
