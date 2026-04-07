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
import { stripeRouter }              from './routes/stripe.js';
import { propertiesRouter }          from './routes/properties.js';
import { roomsRouter }               from './routes/rooms.js';
import { guestsRouter }              from './routes/guests.js';
import { bookingsRouter }            from './routes/bookings.js';
import { usersRouter }               from './routes/users.js';
import { adminRouter }               from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Database ──────────────────────────────────────────────────────────────────
initSchema();

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: false,
}));
app.use(express.json());

// ── Static files ──────────────────────────────────────────────────────────────
// Landing page, widget.js, widget-test.html
app.use(express.static(join(__dirname, 'public')));

// React SPA assets (JS, CSS, icons) — served at /app/*
app.use('/app', express.static(join(__dirname, '../client/dist')));

// ── Stripe webhook needs raw body ─────────────────────────────────────────────
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// ── Public routes (no auth) ───────────────────────────────────────────────────
app.use('/api',                healthRouter);
app.use('/api/auth',           authRouter);
app.use('/api/super-admin',    superAdminAuthRouter);

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
app.use('/api/guests',       guestsRouter);
app.use('/api/bookings',     bookingsRouter);
app.use('/api/users',        usersRouter);

// ── React SPA catch-all — must be after all API routes ───────────────────────
// Any /app/* path that isn't a static file is handed to React Router.
app.get('/app/*', (req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NestBook server running on http://localhost:${PORT}`);
  const saPasswordLoaded = !!process.env.SUPER_ADMIN_PASSWORD;
  console.log(`Super admin password loaded: ${saPasswordLoaded ? 'YES' : 'NO'}`);
});
