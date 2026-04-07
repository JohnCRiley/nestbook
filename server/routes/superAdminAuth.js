import { Router }                          from 'express';
import jwt                                  from 'jsonwebtoken';
import { timingSafeEqual, createHash }      from 'crypto';
import db                                   from '../db/database.js';

export const superAdminAuthRouter = Router();

const JWT_SECRET     = process.env.JWT_SECRET || 'nestbook-dev-secret-change-in-production';
const SA_JWT_EXPIRES = '2h';

// Read at call-time so it reflects the live process.env value.
// .trim() guards against accidental trailing whitespace from .env editors.
function getSuperAdminPassword() {
  return (process.env.SUPER_ADMIN_PASSWORD ?? '').trim();
}
const MAX_ATTEMPTS         = 10;
const LOCKOUT_MS           = 15 * 60 * 1000; // 15 minutes

// ── In-memory rate limiter ────────────────────────────────────────────────────
// ip → { count: number, lockedUntil: number | null }
const limiter = new Map();

function getIp(req) {
  return (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

function checkLocked(ip) {
  const e = limiter.get(ip);
  if (!e) return false;
  if (e.lockedUntil && Date.now() < e.lockedUntil) return true;
  if (e.lockedUntil) limiter.delete(ip); // expired lock
  return false;
}

function recordFail(ip) {
  const e = limiter.get(ip) ?? { count: 0, lockedUntil: null };
  e.count += 1;
  if (e.count >= MAX_ATTEMPTS) e.lockedUntil = Date.now() + LOCKOUT_MS;
  limiter.set(ip, e);
}

function clearFails(ip) {
  limiter.delete(ip);
}

function minutesRemaining(ip) {
  const e = limiter.get(ip);
  if (!e?.lockedUntil) return 0;
  return Math.ceil((e.lockedUntil - Date.now()) / 60_000);
}

// ── Logging ───────────────────────────────────────────────────────────────────
function log(ip, email, success, note) {
  try {
    db.prepare(
      'INSERT INTO super_admin_logs (ip, email, success, note) VALUES (?, ?, ?, ?)'
    ).run(ip, email ?? null, success ? 1 : 0, note ?? null);
  } catch {
    // Don't let a logging failure break the request
  }
}

// ── Timing-safe password comparison ──────────────────────────────────────────
// Hash both sides to equal-length buffers before comparing.
function safeCompare(a, b) {
  if (!a || !b) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ── POST /api/super-admin/login ───────────────────────────────────────────────
superAdminAuthRouter.post('/login', (req, res) => {
  const ip = getIp(req);

  // Return 404 on every failure so the endpoint reveals nothing
  const deny = (note, email, locked = false) => {
    log(ip, email, false, note);
    if (locked) {
      return res.status(429).json({
        error: 'Too many attempts.',
        locked: true,
        minutesRemaining: minutesRemaining(ip),
      });
    }
    return res.status(404).json({ error: 'Not found.' });
  };

  if (checkLocked(ip)) {
    return deny('rate_limited', null, true);
  }

  const { password } = req.body ?? {};

  if (!password) {
    recordFail(ip);
    return deny('missing_credentials', null);
  }

  const configuredPassword = getSuperAdminPassword();
  if (!configuredPassword || !safeCompare(password, configuredPassword)) {
    recordFail(ip);
    return deny('wrong_password', null);
  }

  // Password correct — find the super admin user for token issuance
  const user = db
    .prepare('SELECT id, email FROM users WHERE is_super_admin = 1 LIMIT 1')
    .get();

  if (!user) {
    // No super admin configured in the database
    return deny('no_super_admin_user', null);
  }

  // ── Success ──────────────────────────────────────────────────────────────
  clearFails(ip);
  log(ip, user.email, true, 'login_success');

  const token = jwt.sign(
    { userId: user.id, isSuperAdmin: true },
    JWT_SECRET,
    { expiresIn: SA_JWT_EXPIRES }
  );

  res.json({ token });
});
