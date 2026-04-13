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
      locale          TEXT    NOT NULL DEFAULT 'en' CHECK(locale IN ('en','fr','es','de')),
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
                              CHECK(source IN ('direct','phone','email','booking_com','airbnb','other')),
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

  // Backfill owner_id for all existing properties from the users.property_id relationship.
  // Each property is owned by the user (role='owner') whose property_id points to it.
  db.exec(`
    UPDATE properties
    SET owner_id = (
      SELECT u.id FROM users u
      WHERE u.property_id = properties.id AND u.role = 'owner'
      LIMIT 1
    )
    WHERE owner_id IS NULL
  `);

  console.log('✓ Database schema ready.');
}
