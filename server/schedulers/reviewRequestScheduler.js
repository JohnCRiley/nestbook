import db from '../db/database.js';
import { sendReviewRequestEmail } from '../email/emailService.js';

export async function sendReviewRequestReminders() {
  try {
    const candidates = db.prepare(`
      SELECT b.id, b.check_out_date,
             g.first_name, g.email AS guest_email,
             p.id AS property_id, p.name AS property_name, p.locale,
             p.logo_url, p.google_review_url, p.tripadvisor_review_url,
             p.review_delay_days, p.mailer_signature
      FROM bookings b
      JOIN guests g ON g.id = b.guest_id
      JOIN properties p ON p.id = b.property_id
      WHERE b.status = 'checked_out'
        AND b.review_request_sent = 0
        AND p.review_requests_enabled = 1
        AND (
              (p.google_review_url    IS NOT NULL AND TRIM(p.google_review_url)    != '')
           OR (p.tripadvisor_review_url IS NOT NULL AND TRIM(p.tripadvisor_review_url) != '')
            )
        AND g.email IS NOT NULL AND TRIM(g.email) != ''
        AND DATE(b.check_out_date) <= DATE('now', '-' || p.review_delay_days || ' days')
    `).all();

    if (candidates.length === 0) return;
    console.log(`[review-request] ${candidates.length} email(s) to send`);

    for (const row of candidates) {
      try {
        await sendReviewRequestEmail({
          booking: {
            id:           row.id,
            first_name:   row.first_name,
            guest_email:  row.guest_email,
          },
          property: {
            name:                    row.property_name,
            locale:                  row.locale,
            logo_url:                row.logo_url,
            google_review_url:       row.google_review_url,
            tripadvisor_review_url:  row.tripadvisor_review_url,
            mailer_signature:        row.mailer_signature,
          },
        });
        db.prepare(`
          UPDATE bookings
          SET review_request_sent = 1, review_request_sent_at = datetime('now')
          WHERE id = ?
        `).run(row.id);
        console.log(`[review-request] Sent → ${row.guest_email} (booking #${row.id})`);
      } catch (err) {
        console.error(`[review-request] Failed for booking #${row.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[review-request] Scheduler error:', err.message);
  }
}
