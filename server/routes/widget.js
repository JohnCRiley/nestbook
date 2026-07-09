// Public widget API — no authentication required.
// These endpoints are called by the embedded booking widget from guest-facing
// websites. They expose only the minimum data needed for public availability
// checks and booking creation.
import crypto from 'crypto';
import { Router } from 'express';
import db from '../db/database.js';
import { stripe } from '../lib/stripeClient.js';
import { getRateForDate } from '../utils/ratePeriods.js';
import {
  sendBookingConfirmation,
  sendApprovalRequestEmail,
  sendBookingApprovedEmail,
  sendBookingDeclinedEmail,
} from '../email/emailService.js';


// ── Demo mode rooms (static, never blocked, no DB dependency) ─────────────────
// These match the Domaine des Lavandes demo property rooms shown on widget-test.html.
// The demo booking endpoint returns a fake ref and never writes to the DB.
const DEMO_ROOMS = [
  { id: 'D1', property_id: 0, name: 'Chambre Lavande',  type: 'double', price_per_night: 95,  capacity: 2, amenities: 'wifi,ensuite,balcony',        status: 'available' },
  { id: 'D2', property_id: 0, name: 'Chambre Mistral',  type: 'twin',   price_per_night: 85,  capacity: 2, amenities: 'wifi,ensuite',                 status: 'available' },
  { id: 'D3', property_id: 0, name: 'Suite Provence',   type: 'suite',  price_per_night: 145, capacity: 4, amenities: 'wifi,ensuite,terrace,minibar', status: 'available' },
  { id: 'D4', property_id: 0, name: 'Chambre Olivier',  type: 'single', price_per_night: 65,  capacity: 1, amenities: 'wifi',                         status: 'available' },
];

export const widgetRouter = Router();

// ── Widget property guard ─────────────────────────────────────────────────────
// Returns the property row augmented with owner plan/suspended if valid for
// widget use (Pro or Multi, owner not suspended). Returns null otherwise.
function widgetPropertyGuard(property_id) {
  const row = db.prepare(`
    SELECT p.id, u.plan, u.suspended
    FROM properties p
    LEFT JOIN users u ON u.id = p.owner_id AND u.role = 'owner'
    WHERE p.id = ?
  `).get(property_id);
  if (!row || !row.plan || row.suspended || !['pro', 'multi'].includes(row.plan)) return null;
  return row;
}

// ── GET /api/widget/rooms?property_id=X ──────────────────────────────────────
// Returns rooms for a property (no guest PII).
widgetRouter.get('/rooms', (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
    const rows = db.prepare(`
      SELECT r.*, p.breakfast_included AS property_breakfast_included
      FROM rooms r
      JOIN properties p ON p.id = r.property_id
      WHERE r.property_id = ?
      ORDER BY r.id
    `).all(property_id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/rate-periods?property_id=X ───────────────────────────────
// Returns rate periods so the widget can show seasonal prices to guests.
widgetRouter.get('/rate-periods', (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
    const rows = db.prepare(
      'SELECT id, name, date_from, date_to, rate_type, rate_value, priority FROM rate_periods WHERE property_id = ? ORDER BY priority ASC, id ASC'
    ).all(property_id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/rate-range?propertyId=X&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD ──
// Returns seasonal rate total + per-segment breakdown for a date range.
// Used by WP widget to show correct price including seasonal adjustments.
widgetRouter.get('/rate-range', (req, res) => {
  try {
    const { propertyId, checkIn, checkOut } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!propertyId || !checkIn || !dateRe.test(checkIn) || !checkOut || !dateRe.test(checkOut) || checkOut <= checkIn) {
      return res.status(400).json({ error: 'propertyId, checkIn and checkOut (YYYY-MM-DD) required' });
    }

    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    if (!prop) return res.status(404).json({ error: 'Property not found' });

    const room = db.prepare('SELECT id FROM rooms WHERE property_id = ? ORDER BY id LIMIT 1').get(propertyId);
    if (!room) return res.status(404).json({ error: 'No rooms found for this property' });

    const isWP = prop.rental_type === 'whole_property';
    const baseRate = isWP ? (prop.whole_property_rate ?? 0) : 0;

    const breakdown = [];
    function addDay(iso) {
      const d = new Date(iso + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    let current = checkIn;
    while (current < checkOut) {
      const result = getRateForDate(prop.id, room.id, current, isWP ? baseRate : null);
      const rate = result?.rate ?? baseRate;
      const periodName = result?.periodName ?? null;
      const last = breakdown[breakdown.length - 1];
      if (last && last.rate === rate && last.periodName === periodName) {
        last.nights++;
      } else {
        breakdown.push({ periodName, nights: 1, rate });
      }
      current = addDay(current);
    }

    const total = Math.round(breakdown.reduce((s, seg) => s + seg.rate * seg.nights, 0) * 100) / 100;
    const nights = breakdown.reduce((s, seg) => s + seg.nights, 0);
    res.json({ total, nights, baseRate, breakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/bookings?property_id=X ────────────────────────────────────
// Returns minimal booking data needed for client-side availability checks.
// Guest PII is deliberately excluded.
widgetRouter.get('/bookings', (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    if (!widgetPropertyGuard(property_id)) {
      return res.status(403).json({ error: 'Widget not available for this property' });
    }
    const rows = db.prepare(`
      SELECT id, room_id, check_in_date, check_out_date, status
      FROM bookings
      WHERE property_id = ?
        AND status NOT IN ('cancelled', 'checked_out')
      ORDER BY check_in_date
    `).all(property_id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/widget/guests ───────────────────────────────────────────────────
// Creates a new guest record. Called during widget booking flow.
widgetRouter.post('/guests', (req, res) => {
  try {
    const { first_name, last_name, email, phone, notes } = req.body;
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }
    const result = db.prepare(`
      INSERT INTO guests (first_name, last_name, email, phone, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(first_name, last_name, email ?? null, phone ?? null, notes ?? null);
    res.status(201).json(
      db.prepare('SELECT * FROM guests WHERE id = ?').get(result.lastInsertRowid)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/widget/bookings ─────────────────────────────────────────────────
// Creates a booking from the widget. Sends confirmation email.
// If the property owner has an active Stripe Connect account, creates the
// booking as pending_payment and returns a Stripe Checkout URL instead of
// confirming instantly. The webhook advances the booking to confirmed on payment.
widgetRouter.post('/bookings', async (req, res) => {
  try {
    const {
      property_id, room_id, guest_id,
      check_in_date, check_out_date,
      num_guests, status, source, notes, total_price,
      breakfast_added, breakfast_guests, breakfast_price_per_person, breakfast_start_date,
    } = req.body;

    if (!property_id || !room_id || !guest_id || !check_in_date || !check_out_date) {
      return res.status(400).json({
        error: 'property_id, room_id, guest_id, check_in_date and check_out_date are required',
      });
    }

    // Demo properties: return fake confirmation, never write to DB
    const propCheck = db.prepare('SELECT is_demo FROM properties WHERE id = ?').get(property_id);
    if (propCheck?.is_demo === 1) {
      const ref = 'DEMO-' + String(Math.floor(1000 + Math.random() * 9000));
      console.log('[widget] Demo property booking blocked:', property_id);
      return res.status(201).json({ id: ref, demo: true, status: 'cancelled' });
    }

    if (check_out_date <= check_in_date) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    const conflict = db.prepare(`
      SELECT id FROM bookings
      WHERE room_id = ?
        AND status NOT IN ('cancelled', 'checked_out')
        AND check_in_date < ?
        AND check_out_date > ?
    `).get(room_id, check_out_date, check_in_date);
    if (conflict) {
      return res.status(409).json({ error: 'This room is no longer available for the selected dates. Please choose different dates.' });
    }

    // Also check external iCal blocks
    const icalBlock = db.prepare(`
      SELECT id FROM ical_blocks
      WHERE property_id = ?
        AND (room_id IS NULL OR room_id = ?)
        AND start_date < ?
        AND end_date > ?
    `).get(property_id, room_id, check_out_date, check_in_date);
    if (icalBlock) {
      return res.status(409).json({ error: 'This room is no longer available for the selected dates. Please choose different dates.' });
    }

    // Flag the booking if the guest's email matches a blacklisted guest
    const guestData = db.prepare('SELECT email, blacklisted FROM guests WHERE id = ?').get(guest_id);
    let flagged = guestData?.blacklisted ? 1 : 0;
    if (!flagged && guestData?.email) {
      const bl = db.prepare('SELECT id FROM guests WHERE email = ? AND blacklisted = 1').get(guestData.email);
      if (bl) flagged = 1;
    }

    // ── Stripe Connect payment branch ────────────────────────────────────────
    // Rooms-mode, non-WP bookings on properties with an active Connect account
    // are held as pending_payment. The guest completes payment via Stripe
    // Checkout; the webhook advances the booking to confirmed.
    const isWpRequest = (status === 'pending_owner_approval');
    if (!isWpRequest) {
      const ownerRow = db.prepare(`
        SELECT u.stripe_connect_account_id, u.stripe_connect_status,
               p.currency, p.name AS property_name
        FROM properties p
        JOIN users u ON u.id = p.owner_id
        WHERE p.id = ?
      `).get(property_id);

      if (ownerRow?.stripe_connect_status === 'active') {
        const result = db.prepare(`
          INSERT INTO bookings
            (property_id, room_id, guest_id, check_in_date, check_out_date,
             num_guests, status, source, notes, total_price, flagged,
             breakfast_added, breakfast_guests, breakfast_price_per_person, breakfast_start_date)
          VALUES (?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          property_id, room_id, guest_id,
          check_in_date, check_out_date,
          num_guests ?? 1,
          source     ?? 'direct',
          notes      ?? null,
          total_price ?? null,
          flagged,
          breakfast_added ? 1 : 0,
          breakfast_guests ?? 0,
          parseFloat(breakfast_price_per_person) || 0,
          breakfast_start_date ?? null,
        );
        const bookingId = result.lastInsertRowid;
        const currency  = (ownerRow.currency || 'eur').toLowerCase();
        const amount    = Math.round((total_price ?? 0) * 100);

        let session;
        try {
          const base = process.env.APP_URL ?? 'https://nestbook.io';
          session = await stripe.checkout.sessions.create(
            {
              mode: 'payment',
              // 30 minutes is Stripe's minimum — keeps room hold short.
              // On expiry Stripe fires checkout.session.expired, which the
              // webhook handler uses to delete the pending_payment booking.
              expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
              line_items: (() => {
                const items = [{
                  price_data: {
                    currency,
                    product_data: { name: `${ownerRow.property_name} — ${check_in_date} to ${check_out_date}` },
                    unit_amount: amount,
                  },
                  quantity: 1,
                }];
                if (breakfast_added && breakfast_price_per_person && breakfast_guests) {
                  const nights = Math.round((new Date(check_out_date) - new Date(check_in_date)) / 86400000);
                  const bfAmt  = Math.round(parseFloat(breakfast_price_per_person) * Number(breakfast_guests) * nights * 100);
                  if (bfAmt > 0) {
                    items.push({ price_data: { currency, product_data: { name: 'Breakfast' }, unit_amount: bfAmt }, quantity: 1 });
                  }
                }
                return items;
              })(),
              success_url: `${base}/pay/success?booking=${bookingId}&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url:  `${base}/pay/cancelled?booking=${bookingId}`,
              metadata: {
                booking_id: String(bookingId),
                source:     'widget_payment',
              },
            },
            { stripeAccount: ownerRow.stripe_connect_account_id },
          );
        } catch (stripeErr) {
          // Roll back the pending booking so dates aren't permanently blocked
          db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);
          throw stripeErr;
        }

        db.prepare('UPDATE bookings SET stripe_checkout_session_id = ? WHERE id = ?')
          .run(session.id, bookingId);

        console.log(`[widget] Booking #${bookingId} pending_payment — Stripe session ${session.id}`);
        return res.status(201).json({ checkoutUrl: session.url });
      }
    }
    // ── End Stripe Connect branch ─────────────────────────────────────────────
    const approvalToken = isWpRequest ? crypto.randomBytes(32).toString('hex') : null;

    const result = db.prepare(`
      INSERT INTO bookings
        (property_id, room_id, guest_id, check_in_date, check_out_date,
         num_guests, status, source, notes, total_price, flagged, approval_token,
         breakfast_added, breakfast_guests, breakfast_price_per_person, breakfast_start_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      property_id, room_id, guest_id,
      check_in_date, check_out_date,
      num_guests   ?? 1,
      status       ?? 'confirmed',
      source       ?? 'direct',
      notes        ?? null,
      total_price  ?? null,
      flagged,
      approvalToken,
      breakfast_added ? 1 : 0,
      breakfast_guests ?? 0,
      parseFloat(breakfast_price_per_person) || 0,
      breakfast_start_date ?? null,
    );

    const newBooking = db.prepare(`
      SELECT b.id, b.property_id, b.room_id, b.guest_id,
             b.check_in_date, b.check_out_date, b.num_guests,
             b.status, b.source, b.notes, b.total_price, b.created_at,
             g.first_name AS guest_first_name, g.last_name AS guest_last_name,
             g.email AS guest_email, g.phone AS guest_phone,
             r.name AS room_name, r.type AS room_type, r.price_per_night
      FROM bookings b
      LEFT JOIN guests g ON b.guest_id = g.id
      LEFT JOIN rooms  r ON b.room_id  = r.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newBooking);

    // Fire-and-forget emails — must not delay or break the HTTP response
    const property = db.prepare('SELECT p.*, u.email AS owner_email FROM properties p LEFT JOIN users u ON u.id = p.owner_id AND u.role = \'owner\' WHERE p.id = ?').get(newBooking.property_id);
    if (isWpRequest && approvalToken) {
      const base = process.env.APP_URL ?? 'https://nestbook.io';
      const approveUrl = `${base}/api/widget/bookings/${newBooking.id}/approve?token=${approvalToken}`;
      const declineUrl = `${base}/api/widget/bookings/${newBooking.id}/decline?token=${approvalToken}`;
      sendApprovalRequestEmail(newBooking, property, approveUrl, declineUrl).catch(() => {});
    } else {
      sendBookingConfirmation(newBooking, property).catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/bookings/:id/approve?token=... ───────────────────────────
// Public endpoint — called from the approval email link. No auth required.
widgetRouter.get('/bookings/:id/approve', (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    if (!token) return res.status(400).send(approvalPage('Missing token', false));

    const booking = db.prepare(
      `SELECT b.*, g.first_name AS guest_first_name, g.last_name AS guest_last_name,
              g.email AS guest_email, g.phone AS guest_phone
       FROM bookings b LEFT JOIN guests g ON g.id = b.guest_id
       WHERE b.id = ?`
    ).get(Number(id));
    if (!booking)                               return res.status(404).send(approvalPage('Booking not found.', false));
    if (booking.approval_token !== token)       return res.status(403).send(approvalPage('Invalid or expired link.', false));
    if (booking.status === 'confirmed')         return res.send(approvalPage('This booking has already been approved.', true));
    if (booking.status === 'declined')          return res.send(approvalPage('This booking was previously declined.', false));
    if (booking.status !== 'pending_owner_approval') return res.send(approvalPage('This booking cannot be approved.', false));

    db.prepare(`UPDATE bookings SET status = 'confirmed', approval_token = NULL WHERE id = ?`).run(Number(id));

    const property = db.prepare(
      `SELECT p.*, u.email AS owner_email FROM properties p LEFT JOIN users u ON u.id = p.owner_id AND u.role = 'owner' WHERE p.id = ?`
    ).get(booking.property_id);
    const approved = { ...booking, status: 'confirmed' };
    sendBookingApprovedEmail(approved, property).catch(() => {});

    res.send(approvalPage(`Booking approved! ${booking.guest_first_name} ${booking.guest_last_name} has been notified by email.`, true));
  } catch (err) {
    res.status(500).send(approvalPage('Server error. Please try again.', false));
  }
});

// ── GET /api/widget/bookings/:id/decline?token=... ────────────────────────────
widgetRouter.get('/bookings/:id/decline', (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    if (!token) return res.status(400).send(approvalPage('Missing token', false));

    const booking = db.prepare(
      `SELECT b.*, g.first_name AS guest_first_name, g.last_name AS guest_last_name,
              g.email AS guest_email
       FROM bookings b LEFT JOIN guests g ON g.id = b.guest_id
       WHERE b.id = ?`
    ).get(Number(id));
    if (!booking)                               return res.status(404).send(approvalPage('Booking not found.', false));
    if (booking.approval_token !== token)       return res.status(403).send(approvalPage('Invalid or expired link.', false));
    if (booking.status === 'declined')          return res.send(approvalPage('This booking has already been declined.', false));
    if (booking.status === 'confirmed')         return res.send(approvalPage('This booking has already been approved.', true));
    if (booking.status !== 'pending_owner_approval') return res.send(approvalPage('This booking cannot be declined.', false));

    db.prepare(`UPDATE bookings SET status = 'declined', approval_token = NULL WHERE id = ?`).run(Number(id));

    const property = db.prepare(`SELECT * FROM properties WHERE id = ?`).get(booking.property_id);
    const declined = { ...booking, status: 'declined' };
    sendBookingDeclinedEmail(declined, property).catch(() => {});

    res.send(approvalPage(`Booking declined. ${booking.guest_first_name} ${booking.guest_last_name} has been notified.`, false));
  } catch (err) {
    res.status(500).send(approvalPage('Server error. Please try again.', false));
  }
});

function approvalPage(message, success) {
  const colour = success ? '#1a4710' : '#dc2626';
  const icon   = success ? '✓' : '✕';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NestBook — Booking ${success ? 'Approved' : 'Declined'}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0faf0}
.card{background:#fff;border-radius:14px;padding:40px 48px;max-width:480px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.12)}
.icon{width:64px;height:64px;border-radius:50%;background:${colour}20;color:${colour};font-size:2rem;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
h1{color:${colour};font-size:1.5rem;margin:0 0 12px}p{color:#374151;line-height:1.6;margin:0 0 24px}
a{color:#1a4710;font-weight:600}</style></head>
<body><div class="card"><div class="icon">${icon}</div>
<h1>${success ? 'Booking Approved' : 'Booking Declined'}</h1>
<p>${message}</p>
<p><a href="https://nestbook.io/app">Go to your NestBook dashboard →</a></p>
</div></body></html>`;
}

// ── GET /api/widget/property?property_id=X ───────────────────────────────────
// Returns the theme for a property so the widget can style itself correctly.
// Public endpoint — no auth required.
widgetRouter.get('/property', (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id is required' });
    const row = db.prepare(`
      SELECT p.name, p.theme, p.currency, p.rental_type, p.whole_property_rate, p.total_capacity,
             p.breakfast_widget_enabled, p.breakfast_price,
             u.stripe_connect_status
      FROM properties p
      LEFT JOIN users u ON u.id = p.owner_id
      WHERE p.id = ?
    `).get(property_id);
    if (!row) return res.status(404).json({ error: 'Property not found' });
    res.json({
      theme:                    row.theme              ?? 'forest',
      name:                     row.name               ?? '',
      currency:                 row.currency           ?? 'EUR',
      rental_type:              row.rental_type        ?? 'rooms',
      whole_property_rate:      row.whole_property_rate ?? null,
      total_capacity:           row.total_capacity      ?? null,
      stripe_connect_active:    row.stripe_connect_status === 'active',
      breakfast_widget_enabled: row.breakfast_widget_enabled === 1,
      breakfast_price:          row.breakfast_price ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/widget/demo/rooms ────────────────────────────────────────────────
// Always returns all 4 demo rooms as available — no auth, no DB query.
// Used by widget-test.html in demo mode so visitor bookings never block rooms.
widgetRouter.get('/demo/rooms', (_req, res) => {
  res.json(DEMO_ROOMS);
});

// ── GET /api/widget/verify-session ───────────────────────────────────────────
// Public (no auth). Called by pay/success.html on load to confirm Stripe
// actually completed the payment before showing the success message.
// Also acts as a webhook fallback — updates DB if paid but webhook hasn't fired.
widgetRouter.get('/verify-session', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const booking = db.prepare(
    'SELECT id, stripe_payment_status, property_id FROM bookings WHERE stripe_checkout_session_id = ?'
  ).get(session_id);

  if (!booking) return res.status(404).json({ error: 'Session not found' });

  // If already marked paid (webhook already fired), return immediately
  if (booking.stripe_payment_status === 'paid') {
    return res.json({ paid: true, payment_status: 'paid', booking_id: booking.id });
  }

  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  // Look up which connected account owns this property
  const owner = db.prepare(
    'SELECT stripe_connect_account_id FROM users WHERE property_id = ? AND role = ?'
  ).get(booking.property_id, 'owner');

  if (!owner?.stripe_connect_account_id) {
    return res.status(500).json({ error: 'Owner Stripe account not found' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      session_id,
      {},
      { stripeAccount: owner.stripe_connect_account_id }
    );

    const paid = session.payment_status === 'paid';
    console.log(`[verify-session] session=${session_id} payment_status=${session.payment_status} booking=${booking.id}`);

    if (paid && booking.stripe_payment_status !== 'paid') {
      db.prepare('UPDATE bookings SET stripe_payment_status = ? WHERE id = ?').run('paid', booking.id);
      console.log(`[verify-session] Booking #${booking.id} marked paid (webhook fallback)`);
    }

    res.json({ paid, payment_status: session.payment_status, booking_id: booking.id });
  } catch (e) {
    console.error('[verify-session] Stripe error:', e.message);
    res.status(500).json({ error: 'Could not verify session' });
  }
});

// ── POST /api/widget/demo/bookings ────────────────────────────────────────────
// Accepts a booking payload, returns a realistic confirmation with a fake
// reference number, but NEVER writes to the database.
widgetRouter.post('/demo/bookings', (_req, res) => {
  const ref = 'DEMO-' + String(Math.floor(1000 + Math.random() * 9000));
  res.status(201).json({ id: ref, demo: true, status: 'cancelled' });
});
