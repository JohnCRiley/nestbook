import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initSchema }                from './db/schema.js';
import { requireAuth }               from './middleware/requireAuth.js';
import { requireSuperAdminSession }  from './middleware/requireSuperAdminSession.js';
import { healthRouter }              from './routes/health.js';
import { authRouter }                from './routes/auth.js';
import { superAdminAuthRouter }      from './routes/superAdminAuth.js';
import { stripeRouter, stripeWebhookHandler } from './routes/stripe.js';
import { propertiesRouter }          from './routes/properties.js';
import { roomsRouter }               from './routes/rooms.js';
import { guestsRouter }              from './routes/guests.js';
import { bookingsRouter }            from './routes/bookings.js';
import { usersRouter }               from './routes/users.js';
import { adminRouter }               from './routes/admin.js';
import { handleUnsubscribe } from './routes/outreach.js';
import { icalRouter }                from './routes/ical.js';
import { contactRouter }             from './routes/contact.js';
import { widgetRouter }              from './routes/widget.js';
import { reportsRouter }             from './routes/reports.js';
import { activityLogRouter }         from './routes/activityLog.js';
import { chargesRouter }             from './routes/charges.js';
import { marketingRouter }           from './routes/marketing.js';
import { bookingPageRouter }         from './routes/bookingPage.js';
import { ratePeriodsRouter }         from './routes/ratePeriods.js';
import { roomPhotosRouter }          from './routes/roomPhotos.js';
import { errorReportsRouter }        from './routes/errorReports.js';
import { enquiriesRouter }           from './routes/enquiries.js';
import { sendDowngradeEmail, sendAccessEmail } from './email/emailService.js';
import db from './db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Database ──────────────────────────────────────────────────────────────────
const downgradedUsers = initSchema();
// Send downgrade emails for any users demoted during this startup's dunning check
if (downgradedUsers?.length > 0) {
  for (const u of downgradedUsers) {
    sendDowngradeEmail(u.email)
      .catch(err => console.error('[dunning] Downgrade email failed:', u.email, err.message));
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: false,
}));

// ── Stripe webhook — MUST be before express.json() AND requireAuth ───────────
// Using a plain handler (not a Router) avoids Express path-stripping ambiguity.
// express.raw() captures the raw Buffer before express.json() can parse it;
// stripe.webhooks.constructEvent() requires that raw Buffer for signature check.
app.post('/api/stripe/webhook',
  express.raw({ type: '*/*' }),
  stripeWebhookHandler
);

// ── JSON body parser for all other routes ─────────────────────────────────────
app.use(express.json());

// ── Static files ──────────────────────────────────────────────────────────────
// Uploaded images — must be before the React SPA catch-all
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Landing page, widget.js, widget-test.html
// extensions:['html'] lets /about, /compare, /how-it-works etc. serve without the .html suffix
app.use(express.static(join(__dirname, 'public'), { extensions: ['html'] }));

// React SPA assets (JS, CSS, icons) — served at /app/*
app.use('/app', express.static(join(__dirname, '../client/dist')));

// ── Public routes (no auth) ───────────────────────────────────────────────────
app.use('/api',                healthRouter);
app.use('/api/auth',           authRouter);
app.use('/api/contact',        contactRouter);
app.use('/api/enquiries',      enquiriesRouter);
app.use('/api/widget',         widgetRouter);
app.use('/api/super-admin',    superAdminAuthRouter);
app.use('/api',               marketingRouter);

// Public unsubscribe endpoint — must be before requireAuth
app.get('/api/outreach/unsubscribe', handleUnsubscribe);

// Public iCal feed — Booking.com / Airbnb fetch this directly, no login required
app.use('/api/ical', icalRouter);

// ── Super-admin routes — own auth, BEFORE the global requireAuth ──────────────
// Uses a separate JWT (isSuperAdmin: true) with sliding 2-hour inactivity window.
// Returns 404 on any auth failure to keep the panel invisible.
app.use('/api/admin', requireSuperAdminSession, adminRouter);

// ── Auth middleware — protects all regular /api routes below ──────────────────
app.use('/api', requireAuth);

// ── Customer-facing protected routes ─────────────────────────────────────────
app.use('/api/stripe',       stripeRouter);
app.use('/api/properties',   propertiesRouter);
app.use('/api/rooms',        roomsRouter);
app.use('/api/rooms',        roomPhotosRouter);
app.use('/api/guests',       guestsRouter);
app.use('/api/bookings',     bookingsRouter);
app.use('/api/users',        usersRouter);
app.use('/api/reports',      reportsRouter);
app.use('/api/activity-log', activityLogRouter);
app.use('/api/charges',      chargesRouter);
app.use('/api/rate-periods',   ratePeriodsRouter);
app.use('/api/error-reports', errorReportsRouter);

// ── Standalone per-property booking page — slug or numeric ID ────────────────
app.use('/book', bookingPageRouter);

// ── React SPA catch-all — must be after all API routes ───────────────────────
// Any /app/* path that isn't a static file is handed to React Router.
app.get('/app/*', (req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

// ── WP access code auto-send ──────────────────────────────────────────────────
async function sendPendingAccessEmails() {
  try {
    const properties = db.prepare(`
      SELECT p.*, u.email AS owner_email
      FROM properties p
      JOIN users u ON u.id = p.owner_id AND u.role = 'owner'
      WHERE p.rental_type = 'whole_property'
        AND p.access_method IS NOT NULL AND p.access_method != '' AND p.access_method != 'none'
        AND (p.arrival_instructions IS NOT NULL OR p.access_code IS NOT NULL)
    `).all();

    for (const property of properties) {
      const hoursAhead = Math.max(1, parseInt(property.send_access_hours, 10) || 48);
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() + hoursAhead);
      const cutoffDate = cutoff.toISOString().slice(0, 10);

      const bookings = db.prepare(`
        SELECT b.*, g.email AS guest_email, g.first_name AS guest_first_name, g.last_name AS guest_last_name
        FROM bookings b
        JOIN guests g ON g.id = b.guest_id
        WHERE b.property_id = ?
          AND b.status = 'confirmed'
          AND b.check_in_date <= ?
          AND b.check_in_date >= date('now')
          AND (b.access_email_sent IS NULL OR b.access_email_sent = 0)
      `).all(property.id, cutoffDate);

      for (const booking of bookings) {
        await sendAccessEmail(booking, property);
        db.prepare(`UPDATE bookings SET access_email_sent = 1 WHERE id = ?`).run(booking.id);
      }
    }
  } catch (err) {
    console.error('[access-email] Scheduler error:', err.message);
  }
}

// ── Auto-advance: confirmed → arriving on check-in date ──────────────────────
function autoAdvanceBookings() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = db.prepare(
      `UPDATE bookings SET status = 'arriving' WHERE status = 'confirmed' AND check_in_date = ?`
    ).run(today);
    if (result.changes > 0) {
      console.log(`[auto-advance] ${result.changes} booking(s) set to arriving`);
    }
  } catch (err) {
    console.error('[auto-advance] Error:', err.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NestBook server running on http://localhost:${PORT}`);
  const saPassword = (process.env.SUPER_ADMIN_PASSWORD ?? '').trim();
  console.log(`SA password loaded: ${saPassword.length > 0 ? `YES [length: ${saPassword.length}]` : 'NO — set SUPER_ADMIN_PASSWORD in .env'}`);

  // Run access email check on startup and every 6 hours
  sendPendingAccessEmails();
  setInterval(sendPendingAccessEmails, 6 * 60 * 60 * 1000);

  // Auto-advance confirmed → arriving on check-in date
  autoAdvanceBookings();
  setInterval(autoAdvanceBookings, 60 * 60 * 1000);
});
