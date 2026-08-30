import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/database.js';
import { sendApprovalRequestEmail, sendEnquiryReceivedEmail } from '../email/emailService.js';
import { Resend } from 'resend';
import { assignRoomForCategoryBooking } from '../utils/categoryAvailability.js';
import { calcSeasonalBreakdown } from '../utils/ratePeriods.js';

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
// When roomId (or categoryId, Room Categories mode) is provided (rooms-mode),
// creates a real booking with pending_owner_approval status and sends an
// approve/decline email. Without either (whole-property free plan), falls
// back to email-only.
enquiriesRouter.post('/', async (req, res) => {
  const { propertyId, roomId, categoryId, guestName, guestEmail, checkIn, checkOut, guests, message } = req.body ?? {};

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

  // Same rule as widget.js's booking-creation guard — a property still
  // showing seeded sample data can't accept a real enquiry either, since the
  // rooms-mode branch below writes a genuine pending_owner_approval booking.
  const hasSampleData = db.prepare(
    'SELECT 1 FROM rooms WHERE property_id = ? AND is_sample_data = 1 LIMIT 1'
  ).get(propertyId);
  if (hasSampleData) {
    return res.status(403).json({
      error: 'This property is still showing example data and can\'t accept bookings yet.',
      code: 'SAMPLE_DATA_ACTIVE',
    });
  }

  // ── Rooms-mode: create a real booking with approval flow ──────────────────
  if (roomId || categoryId) {
    let room;
    if (roomId) {
      room = db.prepare('SELECT id, name FROM rooms WHERE id = ? AND property_id = ?').get(Number(roomId), propertyId);
      if (!room) return res.status(400).json({ error: 'Invalid room selection' });
    } else {
      // Room Categories mode — categoryId sent instead of roomId. Assigns a
      // specific room synchronously, immediately before the INSERT below,
      // with no await in between (see categoryAvailability.js). respectBuffer:
      // true — guest-facing enquiries must never draw from the buffered pool.
      if (property.rental_type !== 'rooms' || property.ir_room_mode !== 'categories') {
        return res.status(400).json({ error: 'categoryId is only valid for Room Categories-mode properties.' });
      }
      const category = db.prepare('SELECT id FROM room_categories WHERE id = ? AND property_id = ?').get(Number(categoryId), propertyId);
      if (!category) return res.status(400).json({ error: 'categoryId does not belong to this property.' });
      const assignedRoomId = assignRoomForCategoryBooking(db, Number(categoryId), checkIn, checkOut, { respectBuffer: true });
      if (!assignedRoomId) {
        return res.status(409).json({ error: 'No rooms available in this category for those dates' });
      }
      room = db.prepare('SELECT id, name FROM rooms WHERE id = ?').get(assignedRoomId);
    }

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

      // Record the room-rate breakdown + total up-front so the booking has a
      // real price the moment it's created (this path used to leave both NULL,
      // so approved enquiry bookings had no total anywhere). Rooms-mode only —
      // WP free-plan enquiries never reach here.
      const { total: roomTotal, breakdown } = calcSeasonalBreakdown(
        Number(propertyId), Number(room.id), checkIn, checkOut, null
      );

      const bookingResult = db.prepare(`
        INSERT INTO bookings
          (property_id, room_id, guest_id, check_in_date, check_out_date,
           num_guests, status, source, notes, total_price, rate_breakdown, approval_token)
        VALUES (?, ?, ?, ?, ?, ?, 'pending_owner_approval', 'website', ?, ?, ?, ?)
      `).run(
        propertyId, room.id, guestId,
        checkIn, checkOut,
        numGuests,
        message?.trim() || null,
        roomTotal,
        JSON.stringify(breakdown),
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

      // Immediate receipt, separate from the approve/decline outcome email
      // above (which only fires once the owner acts) — confirms the request
      // itself was received.
      sendEnquiryReceivedEmail({
        guestFirstName: firstName,
        guestEmail:      guestEmail.trim(),
        checkInDate:     checkIn,
        checkOutDate:    checkOut,
        numGuests,
      }, property).catch(() => {});

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
        <td style="padding:8px 0;color:#405440;vertical-align:top;">Message</td>
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
  <div style="background:#405440;padding:20px;border-radius:8px 8px 0 0;">
    <img src="https://nestbook.io/icon-192.png"
      style="width:32px;height:32px;border-radius:6px;vertical-align:middle;">
    <span style="color:#fff;font-size:18px;font-weight:700;margin-left:10px;vertical-align:middle;">NestBook</span>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e0ddd6;border-top:none;border-radius:0 0 8px 8px;">
    <h2 style="color:#405440;margin-bottom:16px;">New booking enquiry for ${esc(property.name)}</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0;color:#405440;width:140px;">Guest name</td>
        <td style="padding:8px 0;font-weight:600;">${esc(guestName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#405440;">Email</td>
        <td style="padding:8px 0;"><a href="mailto:${esc(guestEmail)}">${esc(guestEmail)}</a></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#405440;">Check-in</td>
        <td style="padding:8px 0;font-weight:600;">${esc(checkIn)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#405440;">Check-out</td>
        <td style="padding:8px 0;font-weight:600;">${esc(checkOut)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#405440;">Guests</td>
        <td style="padding:8px 0;">${esc(String(guests ?? ''))}</td>
      </tr>
      ${msgRow}
    </table>
    <div style="margin-top:20px;padding:16px;background:#f0ede8;border-radius:8px;
      font-size:0.85rem;color:#405440;">
      💡 Reply directly to this email to contact ${esc(guestName)}.
      To accept direct bookings with online payment,
      <a href="https://nestbook.io/app/pricing" style="color:#405440;font-weight:600;">upgrade to Pro</a>.
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

  // Immediate receipt to the guest — this branch has no bookings row and no
  // approve/decline outcome email at all (the owner just replies directly to
  // the enquiry email above), so this is the guest's only confirmation their
  // submission arrived.
  const wpFirstName = guestName.trim().split(/\s+/)[0];
  sendEnquiryReceivedEmail({
    guestFirstName: wpFirstName,
    guestEmail:      guestEmail.trim(),
    checkInDate:     checkIn,
    checkOutDate:    checkOut,
    numGuests:       parseInt(guests, 10) || null,
  }, property).catch(() => {});

  console.log(`[enquiry] Enquiry for property ${propertyId} from ${guestEmail}`);
  res.json({ success: true });
});
