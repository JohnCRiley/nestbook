import db from './database.js';
import { generateSlug, uniqueSlug } from '../utils/slugify.js';

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
    db.exec(`ALTER TABLE subscriptions ADD COLUMN user_id INTEGER`);
    console.log('[schema] Added user_id to subscriptions');
  } catch { /* already exists */ }

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

  // Migration: scope guests to a property (privacy isolation between tenants).
  // Backfill existing guests from their earliest booking's property_id.
  try {
    db.exec(`ALTER TABLE guests ADD COLUMN property_id INTEGER REFERENCES properties(id)`);
    const backfilled = db.prepare(`
      UPDATE guests
      SET property_id = (
        SELECT b.property_id FROM bookings b
        WHERE b.guest_id = guests.id
        ORDER BY b.id LIMIT 1
      )
      WHERE property_id IS NULL
    `).run();
    console.log(`✓ Backfilled property_id for ${backfilled.changes} guest(s).`);
  } catch { /* column already exists */ }

  // Migration: flagged column on bookings (set when blacklisted guest books via widget)
  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  // Migration: is_demo flag on rooms — demo rooms cannot be deleted via the app
  try {
    db.exec(`ALTER TABLE rooms ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  // Migration: room-level breakfast setting
  try {
    db.exec(`ALTER TABLE rooms ADD COLUMN breakfast_included INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  // Migration: breakfast opted in by guest at booking time
  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN breakfast_added INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  // Migration: booking-level deposit tracking
  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN deposit_paid INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN deposit_requested_at TEXT`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN deposit_paid_at TEXT`);
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

  try {
    db.exec(`ALTER TABLE properties ADD COLUMN breakfast_price REAL NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE properties ADD COLUMN breakfast_start_time TEXT DEFAULT '07:00'`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE properties ADD COLUMN breakfast_end_time TEXT DEFAULT '11:00'`);
  } catch { /* already exists */ }

  // Migration: checkout tracking on bookings
  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN payment_method TEXT`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN checked_out_at TEXT`);
  } catch { /* already exists */ }

  // Migration: mid-stay breakfast tracking
  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN breakfast_start_date TEXT`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN breakfast_guests INTEGER DEFAULT 0`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE bookings ADD COLUMN breakfast_price_per_person REAL DEFAULT 0`);
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    TEXT    NOT NULL DEFAULT (datetime('now')),
      property_id  INTEGER REFERENCES properties(id),
      user_id      INTEGER REFERENCES users(id),
      user_name    TEXT,
      user_email   TEXT,
      user_role    TEXT,
      action       TEXT    NOT NULL,
      category     TEXT    NOT NULL,
      target_type  TEXT,
      target_id    INTEGER,
      target_name  TEXT,
      detail       TEXT,
      before_value TEXT,
      after_value  TEXT,
      ip_address   TEXT
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_property  ON audit_log(property_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_category  ON audit_log(category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_log(user_id)`);

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

  // Audit log rotation — prevent unbounded growth
  // Property-scoped entries kept 30 days; system-level entries kept 90 days.
  try {
    const del30 = db.prepare(`
      DELETE FROM audit_log
      WHERE timestamp < datetime('now', '-30 days')
        AND property_id IS NOT NULL
    `).run();
    const del90 = db.prepare(`
      DELETE FROM audit_log
      WHERE timestamp < datetime('now', '-90 days')
    `).run();
    const total = del30.changes + del90.changes;
    if (total > 0) console.log(`✓ Cleaned up ${total} old audit log entries (${del30.changes} property, ${del90.changes} system)`);
  } catch (e) {
    console.error('Audit log cleanup failed:', e.message);
  }

  // Migration: add charges_staff role to users table
  const usersSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get()?.sql ?? '';
  if (!usersSql.includes('charges_staff')) {
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`
      BEGIN;
      CREATE TABLE users_v3 (
        id                       INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id              INTEGER REFERENCES properties(id),
        name                     TEXT    NOT NULL,
        email                    TEXT    NOT NULL UNIQUE,
        password_hash            TEXT    NOT NULL,
        role                     TEXT    NOT NULL DEFAULT 'reception'
                                         CHECK(role IN ('owner','reception','charges_staff')),
        plan                     TEXT    NOT NULL DEFAULT 'free'
                                         CHECK(plan IN ('free','pro','multi')),
        created_at               TEXT    NOT NULL DEFAULT (datetime('now')),
        is_super_admin           INTEGER NOT NULL DEFAULT 0,
        password_reset_token     TEXT,
        password_reset_expires   TEXT,
        discount_code            TEXT,
        email_verified           INTEGER NOT NULL DEFAULT 1,
        suspended                INTEGER NOT NULL DEFAULT 0,
        email_verification_token TEXT
      );
      INSERT INTO users_v3 SELECT id, property_id, name, email, password_hash, role, plan, created_at,
        is_super_admin, password_reset_token, password_reset_expires, discount_code,
        email_verified, suspended, email_verification_token FROM users;
      DROP TABLE users;
      ALTER TABLE users_v3 RENAME TO users;
      COMMIT;
    `);
    db.exec(`PRAGMA foreign_keys = ON`);
    console.log('✓ users.role constraint updated to include charges_staff.');
  }

  // Room Charges — service categories per property
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      color       TEXT    NOT NULL DEFAULT '#64748b',
      icon        TEXT    NOT NULL DEFAULT '📌',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Room Charges — individual charge line items
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_charges (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES service_categories(id),
      description TEXT,
      amount      REAL    NOT NULL,
      charge_date TEXT    NOT NULL DEFAULT (date('now')),
      charged_by  INTEGER REFERENCES users(id),
      voided_at   TEXT,
      voided_by   INTEGER REFERENCES users(id),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_charges_booking  ON room_charges(booking_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_charges_property ON room_charges(property_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_charges_date     ON room_charges(charge_date)`);

  // Add tax_rate to service_categories (idempotent)
  try { db.exec(`ALTER TABLE service_categories ADD COLUMN tax_rate REAL NOT NULL DEFAULT 0`); } catch {}

  // Seed default service categories for properties that have none yet
  const propertiesWithoutCategories = db.prepare(`
    SELECT p.id FROM properties p
    WHERE NOT EXISTS (SELECT 1 FROM service_categories sc WHERE sc.property_id = p.id)
  `).all();
  if (propertiesWithoutCategories.length > 0) {
    const seedCat = db.prepare(
      `INSERT INTO service_categories (property_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)`
    );
    const defaults = [
      ['Food & Drink', '#f97316', '', 0],
      ['Bar',          '#8b5cf6', '', 1],
      ['Laundry',      '#0ea5e9', '', 2],
      ['Spa & Wellness','#10b981','', 3],
      ['Activities',   '#f59e0b', '', 4],
      ['Transport',    '#6366f1', '', 5],
      ['Other',        '#64748b', '', 6],
    ];
    for (const { id } of propertiesWithoutCategories) {
      for (const [name, color, icon, sort_order] of defaults) {
        seedCat.run(id, name, color, icon, sort_order);
      }
    }
    console.log(`✓ Seeded default service categories for ${propertiesWithoutCategories.length} propert${propertiesWithoutCategories.length === 1 ? 'y' : 'ies'}.`);
  }

  // Business expenses — per-period expense tracking for property owners (Pro/Multi)
  db.exec(`
    CREATE TABLE IF NOT EXISTS property_expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      period_from TEXT    NOT NULL,
      period_to   TEXT    NOT NULL,
      category    TEXT    NOT NULL,
      description TEXT,
      amount      REAL    NOT NULL DEFAULT 0,
      created_at  TEXT    DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_property ON property_expenses(property_id, period_from, period_to)`);

  // Refund columns on bookings (idempotent migration)
  const bookingsSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='bookings'`).get()?.sql ?? '';
  if (!bookingsSql.includes('refund_amount')) {
    db.exec(`ALTER TABLE bookings ADD COLUMN refund_amount REAL DEFAULT 0`);
    db.exec(`ALTER TABLE bookings ADD COLUMN refund_reason TEXT`);
    db.exec(`ALTER TABLE bookings ADD COLUMN refunded_at   TEXT`);
    db.exec(`ALTER TABLE bookings ADD COLUMN refunded_by   TEXT`);
    console.log('✓ Added refund columns to bookings.');
  }

  // NestBook operating expenses — per-month tracking for NestBook Ltd itself
  db.exec(`
    CREATE TABLE IF NOT EXISTS nestbook_expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      month       TEXT    NOT NULL,
      category    TEXT    NOT NULL,
      description TEXT,
      amount_gbp  REAL    NOT NULL DEFAULT 0,
      created_at  TEXT    DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_nb_expenses_month ON nestbook_expenses(month)`);

  // Migrations for nestbook_expenses (idempotent)
  try { db.exec(`ALTER TABLE nestbook_expenses ADD COLUMN receipt_ref TEXT`); } catch {}
  try { db.exec(`ALTER TABLE nestbook_expenses ADD COLUMN miles REAL`); } catch {}

  // Property theme
  try { db.exec(`ALTER TABLE properties ADD COLUMN theme TEXT NOT NULL DEFAULT 'forest'`); } catch {}

  // Whole property rental mode
  try { db.exec(`ALTER TABLE properties ADD COLUMN rental_type TEXT DEFAULT 'rooms'`); } catch {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN total_capacity INTEGER`); } catch {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN bedroom_count INTEGER`); } catch {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN bathroom_count INTEGER`); } catch {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN whole_property_rate REAL`); } catch {}

  // Expand properties.type CHECK constraint to include the full accommodation type list.
  // Detects by checking for 'cottage' (not in old constraint).
  {
    const propSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='properties'`).get()?.sql ?? '';
    if (!propSql.includes("'cottage'")) {
      db.exec(`PRAGMA foreign_keys = OFF`);
      db.exec(`BEGIN`);
      try {
        db.exec(`
          CREATE TABLE properties_v3 (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            name                 TEXT    NOT NULL,
            type                 TEXT    NOT NULL DEFAULT 'other'
                                 CHECK(type IN (
                                   'bnb','bb','guesthouse','inn','hotel','hostel',
                                   'gite','cottage','villa','apartment','lodge',
                                   'caravan','glamping','shepherds_hut','treehouse',
                                   'narrowboat','farmhouse','chateau',
                                   'ryokan','minsu','homestay','resort_villa','other'
                                 )),
            address              TEXT,
            city                 TEXT,
            country              TEXT,
            check_in_time        TEXT    NOT NULL DEFAULT '15:00',
            check_out_time       TEXT    NOT NULL DEFAULT '11:00',
            currency             TEXT    NOT NULL DEFAULT 'EUR',
            locale               TEXT    NOT NULL DEFAULT 'en' CHECK(locale IN ('en','fr','es','de','nl')),
            owner_id             INTEGER REFERENCES users(id),
            created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
            breakfast_included   INTEGER NOT NULL DEFAULT 0,
            require_deposit      INTEGER NOT NULL DEFAULT 0,
            deposit_amount       REAL    NOT NULL DEFAULT 0,
            breakfast_price      REAL    NOT NULL DEFAULT 0,
            breakfast_start_time TEXT    DEFAULT '07:00',
            breakfast_end_time   TEXT    DEFAULT '11:00',
            theme                TEXT    NOT NULL DEFAULT 'forest',
            booking_slug         TEXT,
            description          TEXT,
            hero_image_url       TEXT,
            hero_photo           TEXT,
            rental_type          TEXT    DEFAULT 'rooms',
            total_capacity       INTEGER,
            bedroom_count        INTEGER,
            bathroom_count       INTEGER,
            whole_property_rate  REAL
          )
        `);
        db.exec(`
          INSERT INTO properties_v3
            (id, name, type, address, city, country, check_in_time, check_out_time,
             currency, locale, owner_id, created_at,
             breakfast_included, require_deposit, deposit_amount, breakfast_price,
             breakfast_start_time, breakfast_end_time, theme, booking_slug,
             description, hero_image_url, hero_photo,
             rental_type, total_capacity, bedroom_count, bathroom_count, whole_property_rate)
          SELECT
            id, name, type, address, city, country, check_in_time, check_out_time,
            currency, locale, owner_id, created_at,
            COALESCE(breakfast_included, 0), COALESCE(require_deposit, 0),
            COALESCE(deposit_amount, 0), COALESCE(breakfast_price, 0),
            COALESCE(breakfast_start_time, '07:00'), COALESCE(breakfast_end_time, '11:00'),
            COALESCE(theme, 'forest'), booking_slug,
            description, hero_image_url, hero_photo,
            COALESCE(rental_type, 'rooms'), total_capacity, bedroom_count, bathroom_count, whole_property_rate
          FROM properties
        `);
        db.exec(`DROP TABLE properties`);
        db.exec(`ALTER TABLE properties_v3 RENAME TO properties`);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_booking_slug ON properties(booking_slug)`);
        db.exec(`COMMIT`);
      } catch (e) {
        db.exec(`ROLLBACK`);
        throw e;
      }
      db.exec(`PRAGMA foreign_keys = ON`);
      console.log('✓ properties.type constraint expanded to full accommodation type list.');
    }
  }

  // iCal sync token per room — unguessable URL for calendar feed export
  try { db.exec(`ALTER TABLE rooms ADD COLUMN ical_token TEXT`); } catch { /* already exists */ }
  db.prepare(`UPDATE rooms SET ical_token = lower(hex(randomblob(16))) WHERE ical_token IS NULL`).run();

  // iCal sync token for whole-property mode — one feed covering all rooms
  try { db.exec(`ALTER TABLE properties ADD COLUMN ical_token TEXT`); } catch { /* already exists */ }
  db.prepare(`UPDATE properties SET ical_token = lower(hex(randomblob(16))) WHERE ical_token IS NULL`).run();
  console.log('✓ Property iCal tokens backfilled.');

  // ── Prospect Outreach CRM ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT    NOT NULL,
      company           TEXT,
      email             TEXT    NOT NULL UNIQUE,
      source            TEXT    NOT NULL DEFAULT 'manual'
                                CHECK(source IN ('manual','csv','auto_signup','website')),
      status            TEXT    NOT NULL DEFAULT 'new'
                                CHECK(status IN ('new','contacted','replied','converted','unsubscribed')),
      notes             TEXT,
      follow_up_date    TEXT,
      unsubscribe_token TEXT    UNIQUE,
      unsubscribed_at   TEXT,
      converted_at      TEXT,
      user_id           INTEGER REFERENCES users(id),
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prospects_email  ON prospects(email)`);

  // Add country / language / website columns (idempotent)
  try { db.exec(`ALTER TABLE prospects ADD COLUMN country  TEXT`); } catch {}
  try { db.exec(`ALTER TABLE prospects ADD COLUMN language TEXT`); } catch {}
  try { db.exec(`ALTER TABLE prospects ADD COLUMN website  TEXT`); } catch {}

  // Expand source + status CHECK constraints if needed.
  // sqlite_master still holds the original CREATE TABLE sql — inspect it.
  {
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='prospects'`).get();
    const tblSql = row?.sql || '';
    if (!tblSql.includes('follow_up_sent') || !tblSql.includes("'facebook'")) {
      db.exec(`BEGIN`);
      try {
        db.exec(`
          CREATE TABLE prospects_new (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            name              TEXT    NOT NULL,
            company           TEXT,
            email             TEXT    NOT NULL UNIQUE,
            source            TEXT    NOT NULL DEFAULT 'manual'
                                      CHECK(source IN ('manual','csv','auto_signup','website','facebook','google','booking_com','airbnb','referral','other')),
            status            TEXT    NOT NULL DEFAULT 'new'
                                      CHECK(status IN ('new','contacted','follow_up_sent','replied','converted','unsubscribed')),
            notes             TEXT,
            follow_up_date    TEXT,
            country           TEXT,
            language          TEXT,
            unsubscribe_token TEXT    UNIQUE,
            unsubscribed_at   TEXT,
            converted_at      TEXT,
            user_id           INTEGER REFERENCES users(id),
            created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
          )
        `);
        db.exec(`
          INSERT INTO prospects_new
            (id,name,company,email,source,status,notes,follow_up_date,
             country,language,unsubscribe_token,unsubscribed_at,converted_at,user_id,created_at)
          SELECT id,name,company,email,source,status,notes,follow_up_date,
                 country,language,unsubscribe_token,unsubscribed_at,converted_at,user_id,created_at
          FROM prospects
        `);
        db.exec(`DROP TABLE prospects`);
        db.exec(`ALTER TABLE prospects_new RENAME TO prospects`);
        db.exec(`COMMIT`);
      } catch (e) {
        db.exec(`ROLLBACK`);
        throw e;
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_prospects_email  ON prospects(email)`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      subject    TEXT NOT NULL,
      body       TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_campaigns (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT,
      status      TEXT NOT NULL DEFAULT 'draft'
                  CHECK(status IN ('draft','active','completed')),
      sent_count  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prospect_emails (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id  INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
      campaign_id  INTEGER REFERENCES outreach_campaigns(id),
      template_id  INTEGER REFERENCES email_templates(id),
      subject      TEXT NOT NULL,
      body         TEXT NOT NULL,
      sent_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prospect_emails_prospect ON prospect_emails(prospect_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_send_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_at         TEXT    DEFAULT (datetime('now')),
      recipient_email TEXT,
      prospect_id     INTEGER,
      campaign        TEXT
    )
  `);

  // Cleanup outreach send log entries older than 7 days — only today's count matters
  try {
    db.prepare(`DELETE FROM outreach_send_log WHERE sent_at < datetime('now', '-7 days')`).run();
  } catch {}

  // Seed 5 default email templates (only if none exist yet)
  const tmplCount = db.prepare(`SELECT COUNT(*) AS n FROM email_templates`).get().n;
  if (tmplCount === 0) {
    const insertTmpl = db.prepare(
      `INSERT INTO email_templates (name, subject, body, is_default) VALUES (?, ?, ?, 1)`
    );
    insertTmpl.run(
      'Introduction — What is NestBook?',
      'Manage your B&B bookings without the chaos',
      `Hi {{name}},

I hope you don't mind me reaching out — I came across {{company}} and thought NestBook might be a great fit.

NestBook is simple property management software built for small B&Bs, gîtes, and guesthouses. It handles bookings, guests, rooms, revenue reports, and even the booking widget for your website — all in one place.

No complicated setup. No per-booking fees. Just a flat monthly subscription starting at £19.

Would you be open to a quick look? There's a 30-day free trial, no credit card required.

Best wishes,
John at NestBook`
    );
    insertTmpl.run(
      'Free Trial Offer',
      '30 days free — no card needed',
      `Hi {{name}},

Quick note to let you know that NestBook offers a completely free 30-day trial — no credit card, no commitment.

It takes about 5 minutes to set up: add your rooms, import your guests, and you're managing bookings from day one.

If you run a B&B, gîte, or small guesthouse and you're still relying on spreadsheets or paper, this was built for you.

Try it free at nestbook.io

John at NestBook`
    );
    insertTmpl.run(
      'Welcome — You Just Signed Up',
      'Great to have you on board, {{name}}',
      `Hi {{name}},

Welcome to NestBook! I noticed you just created your account and wanted to personally reach out.

If you have any questions getting started — adding rooms, setting up your calendar, or connecting your booking widget — just reply to this email and I'll help you directly.

A few things worth knowing:
- Your 30-day Pro trial starts the moment you upgrade
- The booking widget embeds directly on your website
- Revenue reports are automatically generated from your bookings

Happy to jump on a quick call if that would help.

John at NestBook`
    );
    insertTmpl.run(
      'Feature Highlight — Booking Widget',
      'Let guests book directly from your website',
      `Hi {{name}},

One of the most popular NestBook features is the booking widget — a small snippet of code you paste onto your website that lets guests check availability and book in real time.

No more back-and-forth emails asking "is the 12th available?". Guests see live availability and book instantly. You get an automatic confirmation.

It's included in the Pro plan (from £19/month), and the 30-day trial is free.

Worth a look: nestbook.io

Best,
John`
    );
    insertTmpl.run(
      'Follow-up — Checking In',
      'Still thinking about NestBook?',
      `Hi {{name}},

I sent a note a while back about NestBook — just wanted to follow up in case it got buried.

If now isn't the right time, no problem at all — just let me know and I won't bother you again. But if you're still looking for a simpler way to manage bookings at {{company}}, I'd love to help.

Free trial at nestbook.io — no card needed.

Best,
John`
    );
    console.log('✓ Seeded 5 default email templates.');
  }

  // ── Dunning / payment failure tracking ───────────────────────────────────
  try { db.exec(`ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'active'`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN past_due_since TEXT`); } catch {}

  // Downgrade users who have been past_due for more than 7 days
  const graceCutoff = new Date();
  graceCutoff.setDate(graceCutoff.getDate() - 7);
  const dunningRows = db.prepare(`
    SELECT id, email FROM users
    WHERE subscription_status = 'past_due'
      AND past_due_since < ?
      AND plan != 'free'
  `).all(graceCutoff.toISOString());
  if (dunningRows.length > 0) {
    const downgradeStmt = db.prepare(`
      UPDATE users SET plan = 'free', subscription_status = 'cancelled', past_due_since = NULL WHERE id = ?
    `);
    for (const u of dunningRows) {
      downgradeStmt.run(u.id);
      console.log(`[dunning] Downgraded user ${u.email} to free after 7-day grace period.`);
    }
  }

  // Seasonal / rate periods — property-level nightly rate overrides
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_periods (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id  INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name         TEXT    NOT NULL,
      date_from    TEXT    NOT NULL,
      date_to      TEXT    NOT NULL,
      rate_type    TEXT    NOT NULL DEFAULT 'flat'
                   CHECK(rate_type IN ('flat','multiplier')),
      rate_value   REAL    NOT NULL,
      priority     INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rate_periods_property ON rate_periods(property_id)`);

  // Per-room rate overrides for rate periods
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_period_rooms (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      rate_period_id INTEGER NOT NULL,
      room_id        INTEGER NOT NULL,
      amount         REAL    NOT NULL,
      FOREIGN KEY (rate_period_id) REFERENCES rate_periods(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      UNIQUE(rate_period_id, room_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rate_period_rooms ON rate_period_rooms(rate_period_id)`);

  // Migration: custom booking page slug (clean URL for Facebook / external links)
  // Note: SQLite does not allow UNIQUE on ALTER TABLE ADD COLUMN — add the column
  // first, then enforce uniqueness via a separate index.

  // Step 1 — Add column (safe to run on every start; ignore if already exists)
  try {
    db.exec(`ALTER TABLE properties ADD COLUMN booking_slug TEXT`);
    console.log('✓ Added booking_slug column to properties');
  } catch (e) {
    if (!e.message.includes('duplicate column name')) throw e;
  }

  // Step 2 — Ensure the unique index exists (idempotent)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_booking_slug ON properties(booking_slug)`);

  // Step 3 — Backfill any properties that don't yet have a slug
  const propertiesWithoutSlug = db.prepare('SELECT id, name FROM properties WHERE booking_slug IS NULL').all();
  for (const p of propertiesWithoutSlug) {
    const slug = uniqueSlug(db, generateSlug(p.name));
    db.prepare('UPDATE properties SET booking_slug = ? WHERE id = ?').run(slug, p.id);
  }
  if (propertiesWithoutSlug.length > 0) {
    console.log(`✓ Generated booking slugs for ${propertiesWithoutSlug.length} propert${propertiesWithoutSlug.length === 1 ? 'y' : 'ies'}.`);
  }

  // Property showcase fields
  try { db.exec(`ALTER TABLE properties ADD COLUMN description TEXT`); } catch {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN hero_image_url TEXT`); } catch {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN hero_photo TEXT`); } catch {}

  // Room description field
  try { db.exec(`ALTER TABLE rooms ADD COLUMN description TEXT`); } catch {}

  // Room photos — plan-gated (free: 1, pro: 5, multi: 10 per room)
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_photos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id       INTEGER NOT NULL,
      property_id   INTEGER NOT NULL,
      filename      TEXT    NOT NULL,
      display_order INTEGER DEFAULT 0,
      created_at    TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (room_id)     REFERENCES rooms(id)      ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_room_photos_room ON room_photos(room_id)`);

  // ── Error reports — user-submitted bug/issue reports ─────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS error_reports (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      property_id  INTEGER,
      user_name    TEXT,
      user_email   TEXT,
      plan         TEXT,
      category     TEXT,
      description  TEXT NOT NULL,
      page_url     TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      status       TEXT DEFAULT 'new',
      admin_notes  TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_error_reports_status ON error_reports(status)`);

  // ── App settings — key-value config store ────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('bug_reporting_enabled', 'true')`).run();

  console.log('✓ Database schema ready.');
  return dunningRows; // caller sends downgrade emails asynchronously
}
