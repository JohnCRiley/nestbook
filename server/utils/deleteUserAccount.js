/**
 * Permanently deletes a user account and all owned properties/data.
 *
 * Ordering is fragile — FK constraints require this exact sequence.
 * Fixed twice this year; do not inline or duplicate — call this function.
 *
 * node:sqlite: no db.transaction() — BEGIN/COMMIT/ROLLBACK used explicitly.
 * Stripe cancellation is the caller's responsibility (callers that have it:
 * auth.js DELETE /account, admin.js DELETE /users/:id).
 */
import db from '../db/database.js';

export function deleteUserAccount(userId) {
  const ownedProps = db.prepare('SELECT id FROM properties WHERE owner_id = ?').all(userId);
  const propIds    = ownedProps.map((p) => p.id);

  db.exec('BEGIN');
  try {
    if (propIds.length > 0) {
      const ph = propIds.map(() => '?').join(',');
      // 1. Nullify FK self-references (no CASCADE on these columns)
      db.prepare(`UPDATE users  SET property_id = NULL WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`UPDATE guests SET property_id = NULL WHERE property_id IN (${ph})`).run(...propIds);
      // 2. Delete all tables referencing property_id or room_id with no CASCADE
      db.prepare(`DELETE FROM audit_log          WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM property_expenses  WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM error_reports      WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM room_photos        WHERE room_id IN (SELECT id FROM rooms WHERE property_id IN (${ph}))`).run(...propIds);
      db.prepare(`DELETE FROM room_charges       WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM bookings           WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM service_categories WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM rate_periods       WHERE property_id IN (${ph})`).run(...propIds);
      // 3. Now safe to delete rooms then the properties
      db.prepare(`DELETE FROM rooms      WHERE property_id IN (${ph})`).run(...propIds);
      db.prepare(`DELETE FROM properties WHERE id          IN (${ph})`).run(...propIds);
    }

    // Clean orphaned guests (no property_id — keyed via booking reference)
    db.prepare(
      'DELETE FROM guests WHERE id NOT IN (SELECT DISTINCT guest_id FROM bookings WHERE guest_id IS NOT NULL)'
    ).run();

    // room_charges.charged_by / voided_by → users(id) no CASCADE
    db.prepare('UPDATE room_charges SET charged_by = NULL WHERE charged_by = ?').run(userId);
    db.prepare('UPDATE room_charges SET voided_by  = NULL WHERE voided_by  = ?').run(userId);
    // audit_log.user_id → users(id) no CASCADE
    db.prepare('DELETE FROM audit_log    WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users         WHERE id      = ?').run(userId);

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}
