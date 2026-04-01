import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initSchema }       from './db/schema.js';
import { requireAuth }      from './middleware/requireAuth.js';
import { healthRouter }     from './routes/health.js';
import { authRouter }       from './routes/auth.js';
import { stripeRouter }     from './routes/stripe.js';
import { propertiesRouter } from './routes/properties.js';
import { roomsRouter }      from './routes/rooms.js';
import { guestsRouter }     from './routes/guests.js';
import { bookingsRouter }   from './routes/bookings.js';
import { usersRouter }      from './routes/users.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Database ──────────────────────────────────────────────────────────────────
initSchema();

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;

// CORS: allow the dashboard (localhost:5173) in development, plus any origin for
// the embeddable widget (which runs on the property owner's own website domain).
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: false,
}));
app.use(express.json());

// ── Static files (serves server/public/widget.js) ────────────────────────────
app.use(express.static(join(__dirname, 'public')));

// ── Stripe webhook needs the raw body for signature verification ──────────────
// Must be registered BEFORE express.json() parses everything else.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// ── Public routes (no auth required) ─────────────────────────────────────────
app.use('/api',       healthRouter);
app.use('/api/auth',  authRouter);

// ── Auth middleware — protects everything below this line ─────────────────────
app.use('/api', requireAuth);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api/stripe',       stripeRouter);
app.use('/api/properties',   propertiesRouter);
app.use('/api/rooms',        roomsRouter);
app.use('/api/guests',       guestsRouter);
app.use('/api/bookings',     bookingsRouter);
app.use('/api/users',        usersRouter);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NestBook server running on http://localhost:${PORT}`);
});
