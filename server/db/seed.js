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
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@nestbook.io');
  if (!existing) {
    const hash = bcrypt.hashSync('demo1234', 10);
    db.prepare(
      `INSERT INTO users (property_id, name, email, password_hash, role, is_super_admin) VALUES (?, ?, ?, ?, 'owner', 1)`
    ).run(propertyId, 'Demo Owner', 'demo@nestbook.io', hash);
    console.log('  ✓ Demo user created  (demo@nestbook.io / demo1234)');
  } else {
    // Ensure is_super_admin is set on existing databases
    db.prepare('UPDATE users SET is_super_admin = 1 WHERE email = ?').run('demo@nestbook.io');
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

// ── Guard ───────────────────────────────────────────────────────────────────
const { count } = db.prepare('SELECT COUNT(*) AS count FROM properties').get();
if (count > 0) {
  // Ensure demo user and admin test data are present even on an already-seeded database.
  const prop = db.prepare('SELECT id FROM properties LIMIT 1').get();
  ensureDemoUser(prop.id);
  ensureAdminTestData();
  console.log('Database already contains data — skipping main seed.');
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
    INSERT INTO rooms (property_id, name, type, price_per_night, capacity, amenities, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const rooms = [
    // [name,                  type,        price, capacity, amenities,                          status]
    ['La Suite Lavande',      'suite',       180,    2, 'wifi,ensuite,balcony,minibar',          'available'],
    ['La Chambre Mistral',    'double',      120,    2, 'wifi,ensuite',                          'available'],
    ['La Chambre Garrigue',   'double',      110,    2, 'wifi,ensuite',                          'available'],
    ['Le Nid',                'single',       75,    1, 'wifi',                                  'available'],
    ["L'Appartement",         'apartment',   220,    4, 'wifi,kitchenette,terrace,parking',      'available'],
    ['La Chambre Familiale',  'twin',        155,    4, 'wifi,ensuite',                          'maintenance'],
  ];

  const roomIds = rooms.map(([name, type, price, capacity, amenities, status]) =>
    insertRoom.run(propertyId, name, type, price, capacity, amenities, status).lastInsertRowid
  );
  // roomIds[0] = Suite Lavande, [1] = Mistral, [2] = Garrigue,
  // [3] = Le Nid, [4] = Appartement, [5] = Familiale

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
  // Today is 2026-03-30. Dates are spread around that anchor point.
  const insertBooking = db.prepare(`
    INSERT INTO bookings
      (property_id, room_id, guest_id, check_in_date, check_out_date,
       num_guests, status, source, notes, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const bookings = [
    // [room_idx, guest_idx, check_in,    check_out,   guests, status,        source,       notes,                    price]
    [1, 0, '2026-03-20', '2026-03-23', 2, 'checked_out', 'direct',      null,                                          360],
    [2, 2, '2026-03-22', '2026-03-26', 2, 'checked_out', 'booking_com', null,                                          440],
    [0, 1, '2026-03-28', '2026-04-02', 2, 'arriving',    'direct',      'Champagne on arrival requested',              900],
    [3, 3, '2026-03-30', '2026-04-01', 1, 'arriving',    'phone',       null,                                          150],
    [4, 4, '2026-04-05', '2026-04-10', 3, 'confirmed',   'airbnb',      'Late check-in agreed',                       1100],
    [5, 5, '2026-04-08', '2026-04-12', 4, 'confirmed',   'email',       null,                                          620],
    [1, 0, '2026-04-15', '2026-04-18', 2, 'confirmed',   'direct',      'Repeat guest — same room as last time',       360],
    [0, 2, '2026-04-01', '2026-04-05', 2, 'cancelled',   'booking_com', 'Guest cancelled — full refund issued',        720],
  ];

  bookings.forEach(([ri, gi, checkIn, checkOut, numGuests, status, source, notes, price]) => {
    insertBooking.run(propertyId, roomIds[ri], guestIds[gi], checkIn, checkOut, numGuests, status, source, notes, price);
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
  console.log(`  1 property   (id ${propertyId})`);
  console.log(`  ${roomIds.length} rooms`);
  console.log(`  ${guestIds.length} guests`);
  console.log(`  ${bookings.length} bookings`);
  console.log('  2 users');

} catch (err) {
  db.exec('ROLLBACK');
  console.error('Seed failed — rolled back.', err);
  process.exit(1);
}
