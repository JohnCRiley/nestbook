import db from '../db/database.js';

/**
 * Seeds sample rooms, guests and bookings for a freshly registered property.
 * Called fire-and-forget from the onboarding completion hook.
 * Skips silently if the property already has any sample data.
 */
export async function seedSampleData(userId, propertyId, rentalType, unSubType) {
  // Skip if sample data already exists for this property
  const existing = db.prepare(
    'SELECT 1 FROM rooms WHERE property_id = ? AND is_sample_data = 1 LIMIT 1'
  ).get(propertyId);
  if (existing) return;

  try {
    if (rentalType === 'rooms') {
      _seedIR(propertyId);
    } else if (rentalType === 'whole_property') {
      _seedWP(propertyId);
    } else if (rentalType === 'units') {
      _seedUn(propertyId, unSubType);
    }

    _seedGuestsAndBookings(propertyId, rentalType);
  } catch (e) {
    console.error('[seedSampleData] Failed for property', propertyId, e.message);
  }
}

// ── IR: 2 guest rooms ─────────────────────────────────────────────────────────

function _seedIR(propertyId) {
  db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, max_guests, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(propertyId, 'Garden Room', 'bedroom', 85, 2);

  db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, max_guests, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(propertyId, 'Orchard Room', 'bedroom', 95, 2);
}

// ── WP: 2 showcase rows (component type, price 0) ────────────────────────────

function _seedWP(propertyId) {
  db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, max_guests, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(propertyId, 'Farmhouse Kitchen', 'component', 0, 0);

  db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, max_guests, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(propertyId, 'The Garden', 'component', 0, 0);

  // Set whole_property_rate if not already configured
  const prop = db.prepare('SELECT whole_property_rate FROM properties WHERE id = ?').get(propertyId);
  if (!prop?.whole_property_rate) {
    db.prepare('UPDATE properties SET whole_property_rate = 120 WHERE id = ?').run(propertyId);
  }
}

// ── Un: 2 top-level units + 1 internal child room ────────────────────────────

function _seedUn(propertyId, unSubType) {
  const unitType = unSubType === 'glamping' ? 'glamping_pod'
    : unSubType === 'serviced_apartment' ? 'apartment'
    : 'apartment';

  const { lastInsertRowid: unit1Id } = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, max_guests, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(propertyId, 'Unit 1', unitType, 110, 4);

  db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, max_guests, parent_unit_id, is_sample_data)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(propertyId, 'Double Room', 'bedroom', 0, 2, unit1Id);

  db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, max_guests, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(propertyId, 'Unit 2', unitType, 110, 4);
}

// ── Guests + bookings ─────────────────────────────────────────────────────────

function _seedGuestsAndBookings(propertyId, rentalType) {
  const { lastInsertRowid: guest1Id } = db.prepare(`
    INSERT INTO guests (property_id, name, email, is_sample_data)
    VALUES (?, ?, ?, 1)
  `).run(propertyId, 'Emma Clarke', 'emma.clarke@example.com');

  const { lastInsertRowid: guest2Id } = db.prepare(`
    INSERT INTO guests (property_id, name, email, is_sample_data)
    VALUES (?, ?, ?, 1)
  `).run(propertyId, 'Michael Dupont', 'm.dupont@example.com');

  // Pick a room to attach bookings to (first sample room for this property)
  const firstRoom = db.prepare(
    'SELECT id FROM rooms WHERE property_id = ? AND is_sample_data = 1 AND (parent_unit_id IS NULL) ORDER BY id ASC LIMIT 1'
  ).get(propertyId);
  if (!firstRoom) return;

  const secondRoom = db.prepare(
    'SELECT id FROM rooms WHERE property_id = ? AND is_sample_data = 1 AND (parent_unit_id IS NULL) AND id != ? ORDER BY id ASC LIMIT 1'
  ).get(propertyId, firstRoom.id);

  // Booking 1: last month (check-in 28 days ago, 3 nights)
  const today = new Date();
  const ci1 = _offsetDate(today, -28);
  const co1 = _offsetDate(today, -25);
  db.prepare(`
    INSERT INTO bookings (property_id, room_id, guest_id, check_in, check_out, status, total_price, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 'checked_out', ?, 1)
  `).run(propertyId, firstRoom.id, guest1Id, ci1, co1,
    rentalType === 'whole_property' ? 360 : 255);

  // Booking 2: upcoming (check-in 14 days from now, 2 nights)
  const ci2 = _offsetDate(today, 14);
  const co2 = _offsetDate(today, 16);
  const roomForB2 = secondRoom ?? firstRoom;
  db.prepare(`
    INSERT INTO bookings (property_id, room_id, guest_id, check_in, check_out, status, total_price, is_sample_data)
    VALUES (?, ?, ?, ?, ?, 'confirmed', ?, 1)
  `).run(propertyId, roomForB2.id, guest2Id, ci2, co2,
    rentalType === 'whole_property' ? 240 : 190);
}

function _offsetDate(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
