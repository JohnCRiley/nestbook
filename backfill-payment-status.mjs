// backfill-payment-status.mjs
// One-time backfill: bring bookings.payment_status into step with
// bookings.stripe_payment_status for bookings that were genuinely paid via
// Stripe but never had payment_status flipped (the webhook handler used to set
// only stripe_payment_status — fixed in server/routes/stripe.js). Symptom:
// booking id 241 / property 97 showed stripe_payment_status='paid' but
// payment_status='unpaid'.
//
// SAFETY:
//   - DRY RUN by default: prints every affected row and changes NOTHING.
//   - Pass --apply to actually write. Wrapped in BEGIN/COMMIT (ROLLBACK on error).
//   - Only touches rows where stripe_payment_status = 'paid'
//     AND payment_status IS DISTINCT FROM 'paid'.
//   - Only sets payment_status = 'paid'. Does NOT set paid_at (we don't know the
//     real payment time for historical rows; mark-paid's date display tolerates
//     a NULL paid_at). Does NOT touch deposit_paid / balance_paid / stripe_*.
//
// Usage:
//   node backfill-payment-status.mjs                       # dry run, default DB
//   node backfill-payment-status.mjs --apply               # write
//   node backfill-payment-status.mjs --db /path/to.db --apply
//   DB_PATH=/opt/nestbook/server/nestbook.db node backfill-payment-status.mjs --apply

import { DatabaseSync } from 'node:sqlite';

const args   = process.argv.slice(2);
const apply  = args.includes('--apply');
const dbFlag = args.indexOf('--db');
const dbPath = dbFlag !== -1 ? args[dbFlag + 1]
             : process.env.DB_PATH
             || 'server/nestbook.db';

console.log(`[backfill] DB: ${dbPath}`);
console.log(`[backfill] Mode: ${apply ? 'APPLY (will write)' : 'DRY RUN (no changes)'}\n`);

const db = new DatabaseSync(dbPath);

const SELECT = `
  SELECT b.id, b.property_id, p.rental_type, b.status, b.source,
         b.payment_status, b.paid_at, b.stripe_payment_status,
         b.stripe_payment_amount, b.total_price, b.created_at
  FROM bookings b
  LEFT JOIN properties p ON p.id = b.property_id
  WHERE b.stripe_payment_status = 'paid'
    AND (b.payment_status IS NULL OR b.payment_status != 'paid')
  ORDER BY b.id
`;

const rows = db.prepare(SELECT).all();

if (rows.length === 0) {
  console.log('[backfill] No mismatched bookings found. Nothing to do.');
  db.close();
  process.exit(0);
}

console.log(`[backfill] ${rows.length} booking(s) to correct (stripe_payment_status='paid', payment_status != 'paid'):\n`);
console.table(rows.map(r => ({
  id: r.id, property: r.property_id, rental_type: r.rental_type, status: r.status,
  source: r.source, payment_status: r.payment_status,
  stripe_payment_status: r.stripe_payment_status,
  stripe_amount: r.stripe_payment_amount, total_price: r.total_price,
  created_at: r.created_at,
})));
console.log(`\n[backfill] Affected ids: ${rows.map(r => r.id).join(', ')}\n`);

if (!apply) {
  console.log('[backfill] DRY RUN — re-run with --apply to write these changes.');
  db.close();
  process.exit(0);
}

try {
  db.exec('BEGIN');
  const upd = db.prepare(`
    UPDATE bookings
    SET payment_status = 'paid'
    WHERE stripe_payment_status = 'paid'
      AND (payment_status IS NULL OR payment_status != 'paid')
  `);
  const { changes } = upd.run();
  db.exec('COMMIT');
  console.log(`[backfill] ✅ Committed. payment_status set to 'paid' on ${changes} booking(s).`);

  const still = db.prepare(SELECT).all();
  console.log(`[backfill] Remaining mismatches after backfill: ${still.length} (expected 0).`);
} catch (e) {
  try { db.exec('ROLLBACK'); } catch {}
  console.error('[backfill] ❌ Error — rolled back, no changes written:', e.message);
  process.exitCode = 1;
}

db.close();
