import db from '../db/database.js';

// Belt-and-braces backup for the checkout.session.expired webhook.
// Stripe retries webhooks on failure, but if events are ever missed this job
// ensures pending_payment bookings don't block room dates indefinitely.
// Runs every 30 minutes; deletes any pending_payment booking older than 1 hour.
export function cleanupAbandonedPendingPayments() {
  try {
    const stale = db.prepare(`
      SELECT id FROM bookings
      WHERE status = 'pending_payment'
        AND created_at <= datetime('now', '-1 hour')
    `).all();

    if (stale.length === 0) return;

    for (const { id } of stale) {
      db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
      console.log(`[pending-payment-cleanup] Deleted abandoned booking #${id} (> 1 hour old)`);
    }
  } catch (err) {
    console.error('[pending-payment-cleanup] Error:', err.message);
  }
}
