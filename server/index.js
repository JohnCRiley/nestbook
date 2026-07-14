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
import { icalRouter, syncFeed }      from './routes/ical.js';
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
import { guestMailerRouter }         from './routes/guestMailer.js';
import { sendDowngradeEmail, sendAccessEmail, sendBalanceDueEmail, sendMissedArrivalReminder, sendMissedDepartureReminder, sendPromoExpiryReminderEmail, sendPromoExpiredEmail } from './email/emailService.js';
import { runUnverifiedCleanup } from './schedulers/unverifiedCleanup.js';
import { cleanupAbandonedPendingPayments } from './schedulers/pendingPaymentCleanup.js';
import { getBalanceDueDate } from './utils/deposits.js';
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
app.use('/api/guest-mailer', guestMailerRouter);

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

// ── WP balance due reminders ──────────────────────────────────────────────────
async function sendPendingBalanceReminders() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const properties = db.prepare(`
      SELECT p.*, u.email AS owner_email
      FROM properties p
      JOIN users u ON u.id = p.owner_id AND u.role = 'owner'
      WHERE p.rental_type = 'whole_property'
        AND p.deposit_enabled = 1
        AND p.deposit_balance_auto_email = 1
    `).all();

    for (const property of properties) {
      const bookings = db.prepare(`
        SELECT b.*, g.email AS guest_email, g.first_name AS guest_first_name, g.last_name AS guest_last_name
        FROM bookings b
        JOIN guests g ON g.id = b.guest_id
        WHERE b.property_id = ?
          AND b.status IN ('confirmed', 'arriving')
          AND b.deposit_paid = 1
          AND b.balance_amount > 0
          AND b.balance_paid = 0
          AND b.balance_email_sent IS NULL
      `).all(property.id);

      for (const booking of bookings) {
        const dueDate = getBalanceDueDate(property, booking.check_in_date);
        if (!dueDate || dueDate > today) continue;

        await sendBalanceDueEmail(booking, property);
        db.prepare(`UPDATE bookings SET balance_email_sent = datetime('now') WHERE id = ?`).run(booking.id);
      }
    }
  } catch (err) {
    console.error('[balance-reminder] Scheduler error:', err.message);
  }
}

// ── Missed-action owner reminders (WP mode) ───────────────────────────────────
async function sendMissedActionReminders() {
  try {
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Missed arrival — check-in was yesterday, auto-advanced to in_house
    const missedArrivals = db.prepare(`
      SELECT b.*,
        g.first_name AS guest_first_name, g.last_name AS guest_last_name,
        p.name AS property_name,
        u.email AS owner_email
      FROM bookings b
      JOIN properties p ON p.id = b.property_id
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN guests g ON g.id = b.guest_id
      WHERE b.status = 'in_house'
        AND b.check_in_date = ?
        AND p.rental_type = 'whole_property'
        AND b.missed_arrival_email_sent IS NULL
    `).all(yesterday);

    for (const booking of missedArrivals) {
      await sendMissedArrivalReminder(booking);
      db.prepare(`UPDATE bookings SET missed_arrival_email_sent = datetime('now') WHERE id = ?`).run(booking.id);
      console.log(`[missed-action] Arrival reminder sent for booking #${booking.id}`);
    }

    // Missed departure — check-out is today, still in_house
    const missedDepartures = db.prepare(`
      SELECT b.*,
        g.first_name AS guest_first_name, g.last_name AS guest_last_name,
        p.name AS property_name,
        u.email AS owner_email
      FROM bookings b
      JOIN properties p ON p.id = b.property_id
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN guests g ON g.id = b.guest_id
      WHERE b.status = 'in_house'
        AND b.check_out_date = ?
        AND p.rental_type = 'whole_property'
        AND b.missed_departure_email_sent IS NULL
    `).all(today);

    for (const booking of missedDepartures) {
      await sendMissedDepartureReminder(booking);
      db.prepare(`UPDATE bookings SET missed_departure_email_sent = datetime('now') WHERE id = ?`).run(booking.id);
      console.log(`[missed-action] Departure reminder sent for booking #${booking.id}`);
    }
  } catch (err) {
    console.error('[missed-action] Scheduler error:', err.message);
  }
}

// ── Auto-advance booking statuses ────────────────────────────────────────────
function autoAdvanceBookings() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // confirmed → arriving on check-in day
    const toArriving = db.prepare(
      `UPDATE bookings SET status = 'arriving' WHERE status = 'confirmed' AND check_in_date = ?`
    ).run(today);
    if (toArriving.changes > 0) {
      console.log(`[auto-advance] ${toArriving.changes} booking(s) → arriving`);
    }

    // arriving → in_house the day AFTER check-in (owner forgot to tap "Guests arrived")
    const toInHouse = db.prepare(
      `UPDATE bookings SET status = 'in_house' WHERE status = 'arriving' AND check_in_date < ?`
    ).run(today);
    if (toInHouse.changes > 0) {
      console.log(`[auto-advance] ${toInHouse.changes} booking(s) arriving → in_house (auto)`);
    }

    // Reset missed_arrival_actioned daily for recent bookings so "Remind me later" re-prompts next day
    db.prepare(`
      UPDATE bookings
      SET missed_arrival_actioned = 0
      WHERE missed_arrival_actioned = 1
        AND status = 'in_house'
        AND check_in_date < date('now', '-1 day')
        AND check_in_date > date('now', '-3 days')
    `).run();
  } catch (err) {
    console.error('[auto-advance] Error:', err.message);
  }
}

// ── Promotional Pro lifecycle — reminders and auto-downgrade ─────────────────
async function runPromoLifecycle() {
  try {
    const today   = new Date().toISOString().split('T')[0];
    const in30    = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const in7     = new Date(Date.now() +  7 * 86400000).toISOString().split('T')[0];

    console.log('[promo-lifecycle] Running daily check...');

    // 30-day reminder
    const remind30 = db.prepare(`
      SELECT * FROM users
      WHERE plan = 'pro'
        AND trial_ends_at IS NOT NULL
        AND date(trial_ends_at) = ?
        AND stripe_subscription_id IS NULL
        AND promo_reminder_30_sent IS NULL
    `).all(in30);
    for (const user of remind30) {
      await sendPromoExpiryReminderEmail(user, 30);
      db.prepare(`UPDATE users SET promo_reminder_30_sent = datetime('now') WHERE id = ?`).run(user.id);
    }

    // 7-day reminder
    const remind7 = db.prepare(`
      SELECT * FROM users
      WHERE plan = 'pro'
        AND trial_ends_at IS NOT NULL
        AND date(trial_ends_at) = ?
        AND stripe_subscription_id IS NULL
        AND promo_reminder_7_sent IS NULL
    `).all(in7);
    for (const user of remind7) {
      await sendPromoExpiryReminderEmail(user, 7);
      db.prepare(`UPDATE users SET promo_reminder_7_sent = datetime('now') WHERE id = ?`).run(user.id);
    }

    // Auto-downgrade expired users
    const expired = db.prepare(`
      SELECT * FROM users
      WHERE plan = 'pro'
        AND trial_ends_at IS NOT NULL
        AND date(trial_ends_at) < ?
        AND stripe_subscription_id IS NULL
        AND promo_expired_at IS NULL
    `).all(today);
    for (const user of expired) {
      db.prepare(`
        UPDATE users SET plan = 'free', promo_expired_at = datetime('now') WHERE id = ?
      `).run(user.id);
      await sendPromoExpiredEmail(user);
      console.log(`[promo-lifecycle] Downgraded ${user.email} to Free — promo expired`);
    }

    const total = remind30.length + remind7.length + expired.length;
    if (total === 0) console.log('[promo-lifecycle] Nothing to do today');
    else console.log(`[promo-lifecycle] Done — 30d: ${remind30.length}, 7d: ${remind7.length}, expired: ${expired.length}`);
  } catch (err) {
    console.error('[promo-lifecycle] Error:', err.message);
  }
}

// ── iCal import scheduler ────────────────────────────────────────────────────
async function syncAllIcalFeeds() {
  const feeds = db.prepare(`SELECT id FROM ical_feeds WHERE active = 1`).all();
  if (feeds.length === 0) return;
  console.log(`[ical-sync] Syncing ${feeds.length} feed(s)...`);
  for (const feed of feeds) {
    try { await syncFeed(feed.id); } catch { /* error already logged in syncFeed */ }
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

  // Balance due reminders — check on startup and every 6 hours
  sendPendingBalanceReminders();
  setInterval(sendPendingBalanceReminders, 6 * 60 * 60 * 1000);

  // Auto-advance confirmed → arriving on check-in date
  autoAdvanceBookings();
  setInterval(autoAdvanceBookings, 60 * 60 * 1000);

  // Missed-action reminders — fire at 10am daily
  const now10 = new Date();
  const next10am = new Date(now10.getFullYear(), now10.getMonth(), now10.getDate(), 10, 0, 0);
  if (next10am <= now10) next10am.setDate(next10am.getDate() + 1);
  setTimeout(() => {
    sendMissedActionReminders();
    setInterval(sendMissedActionReminders, 24 * 60 * 60 * 1000);
  }, next10am - now10);

  // iCal import — sync all active feeds on boot, then every 15 minutes
  syncAllIcalFeeds();
  setInterval(syncAllIcalFeeds, 15 * 60 * 1000);

  // Promo lifecycle (reminders + auto-downgrade) — run on boot to catch missed days,
  // then daily at 9am
  runPromoLifecycle();
  const now9 = new Date();
  const next9am = new Date(now9.getFullYear(), now9.getMonth(), now9.getDate(), 9, 0, 0);
  if (next9am <= now9) next9am.setDate(next9am.getDate() + 1);
  setTimeout(() => {
    runPromoLifecycle();
    setInterval(runPromoLifecycle, 24 * 60 * 60 * 1000);
  }, next9am - now9);

  // Unverified account cleanup — reminder at day 11, soft-expire at day 14,
  // delete at day 17. Runs on boot then every 24 hours.
  runUnverifiedCleanup();
  setInterval(runUnverifiedCleanup, 24 * 60 * 60 * 1000);

  // Abandoned pending_payment cleanup — belt-and-braces backup in case
  // checkout.session.expired webhooks are ever missed. Deletes pending_payment
  // bookings older than 1 hour so room dates are released. Runs every 30 min.
  cleanupAbandonedPendingPayments();
  setInterval(cleanupAbandonedPendingPayments, 30 * 60 * 1000);
});
