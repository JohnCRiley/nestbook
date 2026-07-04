import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/database.js';
import { sendApprovalRequestEmail } from '../email/emailService.js';
import { Resend } from 'resend';

export const enquiriesRouter = Router();

const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
const resend  = apiKey && apiKey !== 'your_key_here' ? new Resend(apiKey) : null;

if (!resend) {
  console.warn('[enquiry] RESEND_API_KEY not configured — enquiry emails will be skipped.');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── POST /api/enquiries ───────────────────────────────────────────────────────
// Public endpoint — no auth required. For Free-plan properties only.
// When roomId is provided (rooms-mode), creates a real booking with
// pending_owner_approval status and sends an approve/decline email.
// Without roomId (whole-property free plan), falls back to email-only.
enquiriesRouter.post('/', async (req, res) => {
  const { propertyId, roomId, guestName, guestEmail, checkIn, checkOut, guests, message } = req.body ?? {};

  if (!propertyId || !guestName?.trim() || !guestEmail?.trim() || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!guestEmail.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const property = db.prepare(`
    SELECT p.*, u.email AS owner_email, u.plan
    FROM properties p
    JOIN users u ON u.id = p.owner_id
    WHERE p.id = ?
  `).get(propertyId);

  if (!property) return res.status(404).json({ error: 'Property not found' });

  if (property.is_demo === 1) {
    return res.json({ success: true, demo: true, message: 'Demo property — no real enquiry sent' });
  }

  if (['pro', 'multi'].includes(property.plan)) {
    return res.status(400).json({ error: 'This property uses the full booking widget' });
  }

  // ── Rooms-mode: create a real booking with approval flow ──────────────────
  if (roomId) {
    const room = db.prepare('SELECT id, name FROM rooms WHERE id = ? AND property_id = ?').get(Number(roomId), propertyId);
    if (!room) return res.status(400).json({ error: 'Invalid room selection' });

    const nameParts = guestName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName  = nameParts.slice(1).join(' ') || '-';

    try {
      const guestResult = db.prepare(`
        INSERT INTO guests (first_name, last_name, email, notes)
        VALUES (?, ?, ?, ?)
      `).run(firstName, lastName, guestEmail.trim(), message?.trim() || null);

      const guestId       = guestResult.lastInsertRowid;
      const approvalToken = crypto.randomBytes(32).toString('hex');
      const numGuests     = parseInt(guests, 10) || 1;

      const bookingResult = db.prepare(`
        INSERT INTO bookings
          (property_id, room_id, guest_id, check_in_date, check_out_date,
           num_guests, status, source, notes, approval_token)
        VALUES (?, ?, ?, ?, ?, ?, 'pending_owner_approval', 'website', ?, ?)
      `).run(
        propertyId, room.id, guestId,
        checkIn, checkOut,
        numGuests,
        message?.trim() || null,
        approvalToken,
      );

      const bookingId = bookingResult.lastInsertRowid;

      const bookingForEmail = {
        id:               bookingId,
        guest_first_name: firstName,
        guest_last_name:  lastName,
        guest_email:      guestEmail.trim(),
        guest_phone:      null,
        check_in_date:    checkIn,
        check_out_date:   checkOut,
        num_guests:       numGuests,
        notes:            message?.trim() || null,
        room_name:        room.name,
      };

      const base       = process.env.APP_URL ?? 'https://nestbook.io';
      const approveUrl = `${base}/api/widget/bookings/${bookingId}/approve?token=${approvalToken}`;
      const declineUrl = `${base}/api/widget/bookings/${bookingId}/decline?token=${approvalToken}`;

      sendApprovalRequestEmail(bookingForEmail, property, approveUrl, declineUrl).catch(() => {});

      console.log(`[enquiry] Booking request #${bookingId} created for property ${propertyId} from ${guestEmail}`);
      return res.json({ success: true });
    } catch (err) {
      console.error('[enquiry] Failed to create booking:', err.message);
      return res.status(500).json({ error: 'Failed to create booking request' });
    }
  }

  // ── Fallback: email-only for whole-property free plan ─────────────────────
  const msgRow = message?.trim()
    ? `<tr>
        <td style="padding:8px 0;color:#64748b;vertical-align:top;">Message</td>
        <td style="padding:8px 0;">${esc(message)}</td>
       </tr>`
    : '';

  if (resend) {
    try {
      await resend.emails.send({
        from:    'NestBook <hello@nestbook.io>',
        to:      property.owner_email,
        subject: `New booking enquiry — ${guestName}`,
        replyTo: guestEmail,
        html: `
<div style="font-family:Arial,sans-serif;max-width:600px;">
  <div style="background:#1a4710;padding:20px;border-radius:8px 8px 0 0;">
    <img src="https://nestbook.io/icon-192.png"
      style="width:32px;height:32px;border-radius:6px;vertical-align:middle;">
    <span style="color:#fff;font-size:18px;font-weight:700;margin-left:10px;vertical-align:middle;">NestBook</span>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <h2 style="color:#1a4710;margin-bottom:16px;">New booking enquiry for ${esc(property.name)}</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0;color:#64748b;width:140px;">Guest name</td>
        <td style="padding:8px 0;font-weight:600;">${esc(guestName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;">Email</td>
        <td style="padding:8px 0;"><a href="mailto:${esc(guestEmail)}">${esc(guestEmail)}</a></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;">Check-in</td>
        <td style="padding:8px 0;font-weight:600;">${esc(checkIn)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;">Check-out</td>
        <td style="padding:8px 0;font-weight:600;">${esc(checkOut)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;">Guests</td>
        <td style="padding:8px 0;">${esc(String(guests ?? ''))}</td>
      </tr>
      ${msgRow}
    </table>
    <div style="margin-top:20px;padding:16px;background:#f0fdf4;border-radius:8px;
      font-size:0.85rem;color:#166534;">
      💡 Reply directly to this email to contact ${esc(guestName)}.
      To accept direct bookings with online payment,
      <a href="https://nestbook.io/app/pricing" style="color:#1a4710;font-weight:600;">upgrade to Pro</a>.
    </div>
  </div>
</div>`,
      });
    } catch (err) {
      console.error('[enquiry] Email send failed:', err.message);
    }
  } else {
    console.log(`[enquiry] Email skipped (Resend not configured). Enquiry from: ${guestEmail} for property: ${propertyId}`);
  }

  console.log(`[enquiry] Enquiry for property ${propertyId} from ${guestEmail}`);
  res.json({ success: true });
});
