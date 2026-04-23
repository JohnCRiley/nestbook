import db from './database.js';

/**
 * Creates all NestBook tables if they don't already exist.
 * Safe to call on every server start — uses IF NOT EXISTS.
 */
export function initSchema() {
  // Each table is created in a separate exec call so error messages
  // point to the right statement.

  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      type            TEXT    NOT NULL CHECK(type IN ('bnb','gite','guesthouse','hotel','other')),
      address         TEXT,
      city            TEXT,
      country         TEXT,
      check_in_time   TEXT    NOT NULL DEFAULT '15:00',
      check_out_time  TEXT    NOT NULL DEFAULT '11:00',
      currency        TEXT    NOT NULL DEFAULT 'EUR',
      locale          TEXT    NOT NULL DEFAULT 'en' CHECK(locale IN ('en','fr','es','de','nl')),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id      INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name             TEXT    NOT NULL,
      type             TEXT    NOT NULL CHECK(type IN ('single','double','twin','suite','apartment','other')),
      price_per_night  REAL    NOT NULL,
      capacity         INTEGER NOT NULL DEFAULT 2,
      amenities        TEXT,                  -- comma-separated list e.g. "wifi,ensuite,balcony"
      status           TEXT    NOT NULL DEFAULT 'available'
                                CHECK(status IN ('available','occupied','maintenance')),
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS guests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name  TEXT NOT NULL,
      last_name   TEXT NOT NULL,
      email       TEXT,
      phone       TEXT,
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id     INTEGER NOT NULL REFERENCES properties(id),
      room_id         INTEGER NOT NULL REFERENCES rooms(id),
      guest_id        INTEGER NOT NULL REFERENCES guests(id),
      check_in_date   TEXT    NOT NULL,   -- ISO date: YYYY-MM-DD
      check_out_date  TEXT    NOT NULL,
      num_guests      INTEGER NOT NULL DEFAULT 1,
      status          TEXT    NOT NULL DEFAULT 'confirmed'
                              CHECK(status IN ('confirmed','arriving','checked_out','cancelled')),
      source          TEXT    NOT NULL DEFAULT 'direct'
                              CHECK(source IN ('direct','phone','email','booking_com','airbnb','other','walk_in','website')),
      notes           TEXT,
      total_price     REAL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id   INTEGER REFERENCES properties(id),
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'reception'
                            CHECK(role IN ('owner','reception')),
      plan          TEXT    NOT NULL DEFAULT 'free'
                            CHECK(plan IN ('free','pro','multi')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migrations — safe to run on every start, silently ignored if column exists.
  try {
    db.exec(`ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN password_reset_token TEXT`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN password_reset_expires TEXT`);
  } catch { /* already exists */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS super_admin_logs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT    NOT NULL DEFAULT (datetime('now')),
      ip        TEXT    NOT NULL,
      email     TEXT,
      success   INTEGER NOT NULL,
      note      TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                INTEGER NOT NULL UNIQUE REFERENCES users(id),
      stripe_customer_id     TEXT,
      stripe_subscription_id TEXT,
      plan                   TEXT NOT NULL DEFAULT 'free'
                                     CHECK(plan IN ('free','pro','multi')),
      status                 TEXT NOT NULL DEFAULT 'active'
                                     CHECK(status IN ('active','cancelled','past_due')),
      current_period_end     TEXT,
      created_at             TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS discount_codes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      code             TEXT    NOT NULL UNIQUE,
      discount_percent INTEGER NOT NULL CHECK(discount_percent > 0 AND discount_percent <= 100),
      duration         TEXT    NOT NULL DEFAULT 'once'
                               CHECK(duration IN ('once','repeating','forever')),
      duration_months  INTEGER,
      max_uses         INTEGER,
      current_uses     INTEGER NOT NULL DEFAULT 0,
      stripe_coupon_id TEXT,
      active           INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Additional migrations
  try {
    db.exec(`ALTER TABLE subscriptions ADD COLUMN notes TEXT`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN discount_code TEXT`);
  } catch { /* already exists */ }

  // email_verified defaults to 1 so existing users are considered verified;
  // new registrations set it to 0 explicitly until they click the link.
  try {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN email_verification_token TEXT`);
  } catch { /* already exists */ }

  // Multi-property support: owner_id on properties links each property to its owner.
  // users.property_id now means "currently active property" for multi-property owners.
  try {
    db.exec(`ALTER TABLE properties ADD COLUMN owner_id INTEGER REFERENCES users(id)`);
  } catch { /* already exists */ }

  // Backfill owner_id for any properties where it is NULL.
  // Finds the owner via users.property_id (the definitive link set at registration).
  // Runs on every startup so it self-heals properties created with a NULL owner_id bug.
  const healed = db.prepare(`
    UPDATE properties
    SET owner_id = (
      SELECT u.id FROM users u
      WHERE u.property_id = properties.id AND u.role = 'owner'
      LIMIT 1
    )
    WHERE owner_id IS NULL
  `).run();
  if (healed.changes > 0) {
    console.log(`✓ Healed owner_id for ${healed.changes} propert${healed.changes === 1 ? 'y' : 'ies'} with NULL owner_id.`);
  }

  // Migration: add 'nl' to the locale CHECK constraint.
  // SQLite can't ALTER a CHECK, so we rebuild the table if the old constraint is still in place.
  // Detect by attempting to set locale='nl' on a dummy row — if it fails, rebuild.
  try {
    const testId = db.prepare(`SELECT id FROM properties LIMIT 1`).get()?.id;
    if (testId != null) {
      const current = db.prepare(`SELECT locale FROM properties WHERE id = ?`).get(testId)?.locale;
      db.prepare(`UPDATE properties SET locale = 'nl' WHERE id = ?`).run(testId);
      db.prepare(`UPDATE properties SET locale = ? WHERE id = ?`).run(current, testId);
    }
  } catch {
    // Constraint blocks 'nl' — rebuild the table with FK checks disabled.
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`
      BEGIN;
      CREATE TABLE properties_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        type            TEXT    NOT NULL CHECK(type IN ('bnb','gite','guesthouse','hotel','other')),
        address         TEXT,
        city            TEXT,
        country         TEXT,
        check_in_time   TEXT    NOT NULL DEFAULT '15:00',
        check_out_time  TEXT    NOT NULL DEFAULT '11:00',
        currency        TEXT    NOT NULL DEFAULT 'EUR',
        locale          TEXT    NOT NULL DEFAULT 'en' CHECK(locale IN ('en','fr','es','de','nl')),
        owner_id        INTEGER REFERENCES users(id),
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO properties_new SELECT id, name, type, address, city, country, check_in_time, check_out_time, currency, locale, owner_id, created_at FROM properties;
      DROP TABLE properties;
      ALTER TABLE properties_new RENAME TO properties;
      COMMIT;
    `);
    db.exec(`PRAGMA foreign_keys = ON`);
    console.log('✓ properties.locale constraint updated to include nl.');
  }

  // Migration: make bookings.room_id nullable so rooms can be deleted while preserving history
  const bookingRoomCol = db.prepare(`PRAGMA table_info(bookings)`).all().find((c) => c.name === 'room_id');
  if (bookingRoomCol && bookingRoomCol.notnull) {
    // Check whether 'flagged' column exists yet — it may have been added before this rebuild runs
    const hasFlagged = db.prepare(`PRAGMA table_info(bookings)`).all().some((c) => c.name === 'flagged');
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`
      BEGIN;
      CREATE TABLE bookings_v2 (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id     INTEGER NOT NULL REFERENCES properties(id),
        room_id         INTEGER REFERENCES rooms(id),
        guest_id        INTEGER NOT NULL REFERENCES guests(id),
        check_in_date   TEXT    NOT NULL,
        check_out_date  TEXT    NOT NULL,
        num_guests      INTEGER NOT NULL DEFAULT 1,
        status          TEXT    NOT NULL DEFAULT 'confirmed'
                                CHECK(status IN ('confirmed','arriving','checked_out','cancelled')),
        source          TEXT    NOT NULL DEFAULT 'direct'
                                CHECK(source IN ('direct','phone','email','booking_com','airbnb','other','walk_in','website')),
        notes           TEXT,
        total_price     REAL,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        flagged         INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO bookings_v2 SELECT id, property_id, room_id, guest_id, check_in_date, check_out_date,
        num_guests, status, source, notes, total_price, created_at${hasFlagged ? ', flagged' : ', 0'} FROM bookings;
      DROP TABLE bookings;
      ALTER TABLE bookings_v2 RENAME TO bookings;
      COMMIT;
    `);
    db.exec(`PRAGMA foreign_keys = ON`);
    console.log('✓ bookings.room_id is now nullable.');
  }

  // Migration: guest soft-delete and blacklist flags
  try {
    db.exec(`ALTER TABLE guests ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE guests ADD COLUMN blacklisted INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  // Migration: flagged column on bookings (set when blacklisted guest books via widget)
  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  // Migration: is_demo flag on rooms — demo rooms cannot be deleted via the app
  try {
    db.exec(`ALTER TABLE rooms ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  // Migration: property-level breakfast and deposit settings
  try {
    db.exec(`ALTER TABLE properties ADD COLUMN breakfast_included INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE properties ADD COLUMN require_deposit INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE properties ADD COLUMN deposit_amount REAL NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  // Migration: expand bookings.source CHECK to include walk_in and website
  const bookingSourceSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='bookings'`).get()?.sql ?? '';
  if (!bookingSourceSql.includes('walk_in')) {
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`
      BEGIN;
      CREATE TABLE bookings_src (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id     INTEGER NOT NULL REFERENCES properties(id),
        room_id         INTEGER REFERENCES rooms(id),
        guest_id        INTEGER NOT NULL REFERENCES guests(id),
        check_in_date   TEXT    NOT NULL,
        check_out_date  TEXT    NOT NULL,
        num_guests      INTEGER NOT NULL DEFAULT 1,
        status          TEXT    NOT NULL DEFAULT 'confirmed'
                                CHECK(status IN ('confirmed','arriving','checked_out','cancelled')),
        source          TEXT    NOT NULL DEFAULT 'direct'
                                CHECK(source IN ('direct','phone','email','booking_com','airbnb','other','walk_in','website')),
        notes           TEXT,
        total_price     REAL,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        flagged         INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO bookings_src SELECT id, property_id, room_id, guest_id, check_in_date, check_out_date,
        num_guests, status, source, notes, total_price, created_at, flagged FROM bookings;
      DROP TABLE bookings;
      ALTER TABLE bookings_src RENAME TO bookings;
      COMMIT;
    `);
    db.exec(`PRAGMA foreign_keys = ON`);
    console.log('✓ bookings.source constraint updated to include walk_in and website.');
  }

  // Performance indexes for paginated list queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_property  ON bookings(property_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_checkin   ON bookings(check_in_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_status    ON bookings(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_room      ON bookings(room_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rooms_property     ON rooms(property_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_guests_name        ON guests(last_name, first_name)`);

  // Auto-advance: mark bookings whose check-out date has passed as checked_out
  const advanced = db.prepare(
    `UPDATE bookings SET status = 'checked_out'
     WHERE check_out_date < date('now')
       AND status NOT IN ('cancelled', 'checked_out')`
  ).run();
  if (advanced.changes > 0) console.log(`✓ Auto-advanced ${advanced.changes} past booking(s) to checked_out.`);

  console.log('✓ Database schema ready.');
}
