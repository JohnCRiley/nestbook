import db from '../db/database.js';
import { sendVerificationReminderEmail } from '../email/emailService.js';
import { deleteUserAccount } from '../utils/deleteUserAccount.js';

export async function runUnverifiedCleanup() {
  try {
    // Step 1 — Day 11-13: send a reminder to accounts that are still unverified,
    // haven't been reminded yet, and are between 11 and 14 days old.
    const toRemind = db.prepare(`
      SELECT * FROM users
      WHERE email_verified = 0
        AND verification_reminder_sent = 0
        AND created_at <= datetime('now', '-11 days')
        AND created_at >  datetime('now', '-14 days')
    `).all();

    for (const user of toRemind) {
      try {
        await sendVerificationReminderEmail(user);
        db.prepare(
          `UPDATE users SET verification_reminder_sent = 1 WHERE id = ?`
        ).run(user.id);
        console.log(`[unverified-cleanup] Reminder sent → ${user.email}`);
      } catch (e) {
        console.error(`[unverified-cleanup] Failed to remind ${user.email}:`, e.message);
      }
    }

    // Step 2 — Day 14: soft-flag accounts as expired (no deletion yet).
    // Sets verification_expired_at so the 3-day deletion buffer starts from here.
    db.prepare(`
      UPDATE users
      SET verification_expired_at = datetime('now')
      WHERE email_verified = 0
        AND verification_expired_at IS NULL
        AND created_at <= datetime('now', '-14 days')
    `).run();

    // Step 3 — Day 17 (14-day deadline + 3-day buffer): permanently delete
    // accounts that were soft-flagged at least 3 days ago and are still unverified.
    const toDelete = db.prepare(`
      SELECT id, email FROM users
      WHERE email_verified = 0
        AND verification_expired_at IS NOT NULL
        AND verification_expired_at <= datetime('now', '-3 days')
    `).all();

    for (const user of toDelete) {
      try {
        deleteUserAccount(user.id);
        console.log(`[unverified-cleanup] Deleted expired unverified account: ${user.email}`);
      } catch (e) {
        console.error(`[unverified-cleanup] Failed to delete ${user.email}:`, e.message);
      }
    }

  } catch (e) {
    console.error('[unverified-cleanup] Unexpected error:', e.message);
  }
}
