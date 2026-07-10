import db from '../db/database.js';
import { sendPaymentAssistanceEmail } from '../email/emailService.js';

// Belt-and-braces backup for the checkout.session.expired webhook.
// Stripe retries webhooks on failure, but if events are ever missed this job
// ensures pending_payment bookings don't block room dates indefinitely.
// Runs every 30 minutes; soft-cancels any pending_payment booking older than 1 hour.
export async function cleanupAbandonedPendingPayments() {
  try {
    const stale = db.prepare(`
      SELECT b.id, b.room_id, b.check_in_date, b.check_out_date, b.property_id,
             g.email AS guest_email, g.first_name AS guest_first_name, g.last_name AS guest_last_name
      FROM bookings b
      LEFT JOIN guests g ON g.id = b.guest_id
      WHERE b.status = 'pending_payment'
        AND b.created_at <= datetime('now', '-1 hour')
    `).all();

    if (stale.length === 0) return;

    for (const booking of stale) {
      db.prepare(`UPDATE bookings SET status = 'cancelled_unpaid' WHERE id = ?`).run(booking.id);
      console.log(`[pending-payment-cleanup] Soft-cancelled abandoned booking #${booking.id} (> 1 hour old)`);

      if (booking.guest_email) {
        const prior = db.prepare(`
          SELECT COUNT(*) as n FROM bookings b
          JOIN guests g ON g.id = b.guest_id
          WHERE b.id != ?
            AND b.room_id = ?
            AND b.check_in_date = ?
            AND b.check_out_date = ?
            AND g.email = ?
            AND b.status = 'cancelled_unpaid'
        `).get(booking.id, booking.room_id, booking.check_in_date, booking.check_out_date, booking.guest_email);

        if (prior.n >= 1) {
          const property = db.prepare(`
            SELECT p.*, u.email AS owner_email FROM properties p
            LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?
          `).get(booking.property_id);
          await sendPaymentAssistanceEmail(booking, property)
            .catch(err => console.error(`[pending-payment-cleanup] Assistance email failed (booking #${booking.id}):`, err.message));
        }
      }
    }
  } catch (err) {
    console.error('[pending-payment-cleanup] Error:', err.message);
  }
}
