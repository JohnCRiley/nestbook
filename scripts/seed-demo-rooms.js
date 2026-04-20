/**
 * Restore (or verify) the four demo rooms for the Domaine des Lavandes property.
 *
 * Usage (from repo root):
 *   node scripts/seed-demo-rooms.js
 *
 * Safe to run repeatedly — skips any room whose name already exists on the property.
 * After inserting, marks all four rooms with is_demo = 1 so the app prevents deletion.
 */

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = join(__dirname, '..', 'server', 'nestbook.db');

const db = new DatabaseSync(DB_PATH);

// ── 1. Find the demo property ────────────────────────────────────────────────
// The demo property is always "Domaine des Lavandes". Fall back to property_id 1
// if the name isn't found (shouldn't happen on a seeded DB).
let prop = db.prepare(`SELECT id, name FROM properties WHERE name = ?`)
             .get('Domaine des Lavandes');

if (!prop) {
  prop = db.prepare(`SELECT id, name FROM properties ORDER BY id LIMIT 1`).get();
  if (!prop) {
    console.error('❌  No properties found in the database. Run the main seed first.');
    process.exit(1);
  }
  console.warn(`⚠️  "Domaine des Lavandes" not found — using property "${prop.name}" (id ${prop.id}) instead.`);
} else {
  console.log(`✓ Demo property: "${prop.name}" (id ${prop.id})`);
}

const propertyId = prop.id;

// ── 2. Ensure is_demo column exists ─────────────────────────────────────────
try {
  db.exec(`ALTER TABLE rooms ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0`);
  console.log('✓ Added is_demo column to rooms table.');
} catch {
  // Column already exists — that's fine.
}

// ── 3. Define the four canonical demo rooms ──────────────────────────────────
const DEMO_ROOMS = [
  { name: 'La Suite Lavande',    type: 'suite',     price: 180, capacity: 2, amenities: 'wifi,ensuite,balcony,minibar'        },
  { name: 'La Chambre Mistral',  type: 'double',    price: 120, capacity: 2, amenities: 'wifi,ensuite'                        },
  { name: 'La Chambre Garrigue', type: 'double',    price: 110, capacity: 2, amenities: 'wifi,ensuite'                        },
  { name: "L'Appartement",       type: 'apartment', price: 220, capacity: 4, amenities: 'wifi,kitchenette,terrace,parking'    },
];

const insertRoom = db.prepare(`
  INSERT INTO rooms (property_id, name, type, price_per_night, capacity, amenities, status, is_demo)
  VALUES (?, ?, ?, ?, ?, ?, 'available', 1)
`);

let inserted = 0;
let skipped  = 0;

for (const room of DEMO_ROOMS) {
  const existing = db.prepare(
    `SELECT id FROM rooms WHERE property_id = ? AND name = ?`
  ).get(propertyId, room.name);

  if (existing) {
    // Room exists — just make sure is_demo is set correctly.
    db.prepare(`UPDATE rooms SET is_demo = 1 WHERE id = ?`).run(existing.id);
    console.log(`  → Already exists: "${room.name}" (id ${existing.id}) — marked is_demo = 1`);
    skipped++;
  } else {
    const result = insertRoom.run(propertyId, room.name, room.type, room.price, room.capacity, room.amenities);
    console.log(`  ✓ Inserted: "${room.name}" (id ${result.lastInsertRowid})`);
    inserted++;
  }
}

console.log(`\n✓ Done: ${inserted} room(s) inserted, ${skipped} already existed.`);

if (inserted > 0) {
  console.log('  All four demo rooms are now protected with is_demo = 1.');
}
