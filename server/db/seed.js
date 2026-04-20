/**
 * Seed script — populates the database with sample data.
 * Run once with:  npm run db:seed  (from the server/ folder)
 *
 * The script is idempotent: if any property already exists it exits early.
 */

import bcrypt from 'bcryptjs';
import { initSchema } from './schema.js';
import db from './database.js';

// Make sure the tables exist before we try to insert into them.
initSchema();

// ── Always ensure the demo user exists (even if db was already seeded) ───────
function ensureDemoUser(propertyId) {
  const hash = bcrypt.hashSync('demo1234', 10);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@nestbook.io');
  if (!existing) {
    db.prepare(
      `INSERT INTO users (property_id, name, email, password_hash, role, is_super_admin) VALUES (?, ?, ?, ?, 'owner', 1)`
    ).run(propertyId, 'Demo Owner', 'demo@nestbook.io', hash);
    console.log('  ✓ Demo user created  (demo@nestbook.io / demo1234)');
  } else {
    // Always reset to correct bcrypt hash — fixes DBs seeded before bcrypt was added
    db.prepare('UPDATE users SET is_super_admin = 1, password_hash = ? WHERE email = ?').run(hash, 'demo@nestbook.io');
    console.log('  ✓ Demo user updated  (demo@nestbook.io / demo1234)');
  }
}

// ── Ensure extra admin test properties exist ─────────────────────────────────
function ensureAdminTestData() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM properties').get();
  if (count >= 6) return; // already have extra properties

  const extraProps = [
    { name: 'The Harbour Inn',       type: 'guesthouse', city: 'Galway',    country: 'Ireland',     plan: 'pro',   months: 5 },
    { name: 'Mas de Provence',       type: 'gite',       city: 'Aix',       country: 'France',      plan: 'multi', months: 4 },
    { name: 'Schwarzwald Pension',   type: 'bnb',        city: 'Freiburg',  country: 'Germany',     plan: 'free',  months: 3 },
    { name: 'Casa del Sol',          type: 'hotel',      city: 'Seville',   country: 'Spain',       plan: 'pro',   months: 2 },
    { name: 'The Cotswold Bothy',    type: 'gite',       city: 'Chipping',  country: 'UK',          plan: 'free',  months: 1 },
  ];

  for (const p of extraProps) {
    const d = new Date();
    d.setMonth(d.getMonth() - p.months);
    const createdAt = d.toISOString();

    const propResult = db.prepare(`
      INSERT INTO properties (name, type, city, country, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(p.name, p.type, p.city, p.country, createdAt);

    const propId = propResult.lastInsertRowid;
    const email  = p.name.toLowerCase().replace(/\s+/g, '.') + '@example.com';
    const hash   = bcrypt.hashSync('pass1234', 10);

    db.prepare(`
      INSERT INTO users (property_id, name, email, password_hash, role, plan, created_at)
      VALUES (?, ?, ?, ?, 'owner', ?, ?)
    `).run(propId, 'Owner ' + p.name.split(' ').pop(), email, hash, p.plan, createdAt);

    if (p.plan !== 'free') {
      const mrr = p.plan === 'multi' ? 39 : 19;
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(`
        INSERT OR IGNORE INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
        VALUES ((SELECT id FROM users WHERE email = ?), 'cus_test', 'sub_test', ?, 'active', ?)
      `).run(email, p.plan, periodEnd);
      db.prepare("UPDATE users SET plan = ? WHERE email = ?").run(p.plan, email);
    }
  }
  console.log('  ✓ Admin test properties created (5 extra properties)');
}

// ── Reseed the demo property rooms and future bookings ───────────────────────
// Replaces all rooms and bookings for the given property with a fresh set.
// Does NOT touch any other property, user, or guest record.
function reseedDemoProperty(propertyId) {
  console.log(`\n  Reseeding demo property (id ${propertyId})…`);

  db.exec('BEGIN');
  try {
    // Wipe existing bookings and rooms for this property only
    db.prepare('DELETE FROM bookings WHERE property_id = ?').run(propertyId);
    db.prepare('DELETE FROM rooms    WHERE property_id = ?').run(propertyId);

    // Insert 4 canonical demo rooms with is_demo = 1
    const insertRoom = db.prepare(`
      INSERT INTO rooms (property_id, name, type, price_per_night, capacity, amenities, status, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, 'available', 1)
    `);

    const demoRooms = [
      ['Chambre Lavande', 'double',  95,  2, 'wifi,ensuite,balcony'],
      ['Chambre Mistral', 'twin',    85,  2, 'wifi,ensuite'],
      ['Suite Provence',  'suite',   145, 4, 'wifi,ensuite,terrace,minibar'],
      ['Chambre Olivier', 'single',  65,  1, 'wifi'],
    ];

    const roomIds = demoRooms.map(([name, type, price, cap, amenities]) =>
      insertRoom.run(propertyId, name, type, price, cap, amenities).lastInsertRowid
    );
    // roomIds[0]=Lavande, [1]=Mistral, [2]=Provence, [3]=Olivier

    // Insert demo guests (fresh — do not rely on existing guest records)
    const insertGuest = db.prepare(`
      INSERT INTO guests (first_name, last_name, email, phone)
      VALUES (?, ?, ?, ?)
    `);
    const guestIds = [
      insertGuest.run('Sophie',       'Martin',  'sophie.martin@email.fr',    '+33 6 12 34 56 78').lastInsertRowid,
      insertGuest.run('Jean-Pierre',  'Moreau',  'jp.moreau@email.fr',        '+33 6 98 76 54 32').lastInsertRowid,
      insertGuest.run('Claire',       'Bonnet',  'claire.bonnet@email.fr',    '+33 6 45 67 89 01').lastInsertRowid,
      insertGuest.run('Marcel',       'Dupont',  'marcel.dupont@email.fr',    '+33 6 23 45 67 89').lastInsertRowid,
    ];

    // Insert 4 future bookings spread over the next 2 months
    const insertBooking = db.prepare(`
      INSERT INTO bookings
        (property_id, room_id, guest_id, check_in_date, check_out_date,
         num_guests, status, source, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const futureBookings = [
      // [room_idx, guest_idx, check_in,    check_out,   guests, status,     source,  price]
      [0, 0, '2026-05-02', '2026-05-06', 2, 'confirmed', 'direct',      4 * 95],
      [2, 1, '2026-05-10', '2026-05-14', 3, 'confirmed', 'booking_com', 4 * 145],
      [1, 2, '2026-05-22', '2026-05-25', 2, 'confirmed', 'email',       3 * 85],
      [0, 3, '2026-06-07', '2026-06-12', 2, 'confirmed', 'direct',      5 * 95],
    ];

    futureBookings.forEach(([ri, gi, checkIn, checkOut, numGuests, status, source, price]) => {
      insertBooking.run(propertyId, roomIds[ri], guestIds[gi], checkIn, checkOut, numGuests, status, source, price);
    });

    db.exec('COMMIT');
    console.log(`  ✓ ${demoRooms.length} rooms inserted (is_demo = 1)`);
    console.log(`  ✓ ${futureBookings.length} future bookings inserted`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('  ✗ Reseed failed — rolled back.', err);
    throw err;
  }
}

// ── Guard ───────────────────────────────────────────────────────────────────
const { count } = db.prepare('SELECT COUNT(*) AS count FROM properties').get();
if (count > 0) {
  // Ensure demo user and admin test data are present even on an already-seeded database.
  let prop = db.prepare("SELECT id FROM properties WHERE name = 'Domaine des Lavandes'").get();
  if (!prop) prop = db.prepare('SELECT id FROM properties ORDER BY id LIMIT 1').get();
  ensureDemoUser(prop.id);
  ensureAdminTestData();
  reseedDemoProperty(prop.id);
  console.log('\n✓ Demo property reseeded. All other accounts untouched.');
  process.exit(0);
}

// ── Seed ────────────────────────────────────────────────────────────────────
// Wrap everything in a transaction so we either get all data or none.
db.exec('BEGIN');

try {

  // ── 1. Property ───────────────────────────────────────────────────────────
  const propResult = db.prepare(`
    INSERT INTO properties (name, type, address, city, country, check_in_time, check_out_time, currency, locale)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Domaine des Lavandes', 'gite',
    '47 Route de Gordes', 'Roussillon', 'France',
    '15:00', '11:00', 'EUR', 'fr'
  );
  const propertyId = propResult.lastInsertRowid;

  // ── 2. Rooms ──────────────────────────────────────────────────────────────
  const insertRoom = db.prepare(`
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, amenities, status, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, 'available', 1)
  `);

  const rooms = [
    // [name,              type,     price, capacity, amenities]
    ['Chambre Lavande', 'double',  95,  2, 'wifi,ensuite,balcony'],
    ['Chambre Mistral', 'twin',    85,  2, 'wifi,ensuite'],
    ['Suite Provence',  'suite',   145, 4, 'wifi,ensuite,terrace,minibar'],
    ['Chambre Olivier', 'single',  65,  1, 'wifi'],
  ];

  const roomIds = rooms.map(([name, type, price, capacity, amenities]) =>
    insertRoom.run(propertyId, name, type, price, capacity, amenities).lastInsertRowid
  );
  // roomIds[0]=Lavande, [1]=Mistral, [2]=Provence, [3]=Olivier

  // ── 3. Guests ─────────────────────────────────────────────────────────────
  const insertGuest = db.prepare(`
    INSERT INTO guests (first_name, last_name, email, phone, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const guests = [
    // [first, last, email, phone, notes]
    ['Sophie',  'Martin',   'sophie.martin@email.fr',       '+33 6 12 34 56 78',  'Repeat guest — prefers quiet room'],
    ['James',   'Wilson',   'j.wilson@email.co.uk',         '+44 7700 900123',    'Travelling with partner Emma'],
    ['Hans',    'Mueller',  'h.mueller@gmx.de',             '+49 171 234 5678',   null],
    ['Marie',   'Dubois',   'marie.dubois@email.be',        '+32 475 12 34 56',   'Vegetarian — note for breakfast'],
    ['Carlos',  'García',   'carlos.garcia@email.es',       '+34 612 345 678',    'Arriving late (~22:00)'],
    ['Anna',    'Kowalski', 'anna.kowalski@email.pl',       '+48 501 234 567',    'Family with 2 children'],
  ];

  const guestIds = guests.map(([first, last, email, phone, notes]) =>
    insertGuest.run(first, last, email, phone, notes).lastInsertRowid
  );
  // guestIds[0]=Sophie, [1]=James, [2]=Hans, [3]=Marie, [4]=Carlos, [5]=Anna

  // ── 4. Bookings ───────────────────────────────────────────────────────────
  // Future bookings spread across the next 2 months (from 2026-04-20).
  const insertBooking = db.prepare(`
    INSERT INTO bookings
      (property_id, room_id, guest_id, check_in_date, check_out_date,
       num_guests, status, source, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const bookings = [
    // [room_idx, guest_idx, check_in,    check_out,   guests, status,     source,       price]
    [0, 0, '2026-05-02', '2026-05-06', 2, 'confirmed', 'direct',      4 * 95],
    [2, 1, '2026-05-10', '2026-05-14', 3, 'confirmed', 'booking_com', 4 * 145],
    [1, 2, '2026-05-22', '2026-05-25', 2, 'confirmed', 'email',       3 * 85],
    [0, 3, '2026-06-07', '2026-06-12', 2, 'confirmed', 'direct',      5 * 95],
  ];

  bookings.forEach(([ri, gi, checkIn, checkOut, numGuests, status, source, price]) => {
    insertBooking.run(propertyId, roomIds[ri], guestIds[gi], checkIn, checkOut, numGuests, status, source, price);
  });

  // ── 5. Users ──────────────────────────────────────────────────────────────
  // Password hashes are placeholders — real bcrypt hashing will be added
  // when the authentication feature is built.
  const insertUser = db.prepare(`
    INSERT INTO users (property_id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertUser.run(propertyId, 'Pierre Beaumont', 'pierre@domainedeslavandes.fr', bcrypt.hashSync('pierre1234', 10), 'owner');
  insertUser.run(propertyId, 'Isabelle Renard',  'isabelle@domainedeslavandes.fr', bcrypt.hashSync('isabelle1234', 10), 'reception');

  // Demo account — always available for testing
  ensureDemoUser(propertyId);

  // ── Done ──────────────────────────────────────────────────────────────────
  db.exec('COMMIT');

  // Extra properties for admin dashboard (outside main transaction is fine)
  ensureAdminTestData();

  console.log('✓ Seed complete:');
  console.log(`  1 property  (id ${propertyId})`);
  console.log(`  ${roomIds.length} rooms (is_demo = 1)`);
  console.log(`  ${guestIds.length} guests`);
  console.log(`  ${bookings.length} future bookings`);
  console.log('  2 users + demo account');

} catch (err) {
  db.exec('ROLLBACK');
  console.error('Seed failed — rolled back.', err);
  process.exit(1);
}
