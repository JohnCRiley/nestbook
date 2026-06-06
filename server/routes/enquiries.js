import { Router } from 'express';
import { Resend }  from 'resend';
import db from '../db/database.js';

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
enquiriesRouter.post('/', async (req, res) => {
  const { propertyId, guestName, guestEmail, checkIn, checkOut, guests, message } = req.body ?? {};

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

  if (['pro', 'multi'].includes(property.plan)) {
    return res.status(400).json({ error: 'This property uses the full booking widget' });
  }

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
