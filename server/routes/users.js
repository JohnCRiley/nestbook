import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/database.js';
import { logAction, getIp } from '../utils/auditLog.js';

export const usersRouter = Router();

function actorFromReq(req) {
  const u = db.prepare('SELECT name, email, role, property_id FROM users WHERE id = ?').get(req.user.userId);
  return { userId: req.user.userId, userName: u?.name, userEmail: u?.email, userRole: u?.role, propertyId: u?.property_id ?? null };
}

// Password hashes are never returned in API responses.
const SAFE_SELECT = 'SELECT id, property_id, name, email, role, created_at FROM users';

// ── Ownership helper (mirrors rooms.js / properties.js) ───────────────────
function canAccessProperty(userId, role, propId) {
  const pid = Number(propId);
  if (!pid) return false;
  if (role === 'owner') {
    if (db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?').get(pid, userId)) {
      return true;
    }
    // Fallback: legacy users whose property predates the owner_id column.
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
    if (Number(u?.property_id) === pid) {
      db.prepare('UPDATE properties SET owner_id = ? WHERE id = ? AND owner_id IS NULL').run(userId, pid);
      return true;
    }
    return false;
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return Number(u?.property_id) === pid;
}

function getUserPropertyIds(userId, role) {
  if (role === 'owner') {
    const ids = db.prepare('SELECT id FROM properties WHERE owner_id = ?').all(userId).map(p => p.id);
    if (ids.length) return ids;
    const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
    return u?.property_id ? [Number(u.property_id)] : [];
  }
  const u = db.prepare('SELECT property_id FROM users WHERE id = ?').get(userId);
  return u?.property_id ? [Number(u.property_id)] : [];
}

// ── GET /api/users?property_id=1 ──────────────────────────────────────────
usersRouter.get('/', (req, res) => {
  try {
    const { property_id } = req.query;

    if (property_id) {
      if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const rows = db.prepare(`${SAFE_SELECT} WHERE property_id = ? ORDER BY id`).all(property_id);
      return res.json(rows);
    }

    // No explicit property_id — scope to the caller's own accessible
    // property/properties rather than returning every user on the platform.
    const propIds = getUserPropertyIds(req.user.userId, req.user.role);
    if (!propIds.length) return res.json([]);
    const placeholders = propIds.map(() => '?').join(',');
    const rows = db.prepare(`${SAFE_SELECT} WHERE property_id IN (${placeholders}) ORDER BY id`).all(...propIds);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/users/:id ────────────────────────────────────────────────────
usersRouter.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`${SAFE_SELECT} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'User not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, row.property_id)) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/users ───────────────────────────────────────────────────────
// Accepts plaintext `password` and hashes it server-side.
usersRouter.post('/', (req, res) => {
  try {
    const { property_id, name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (!canAccessProperty(req.user.userId, req.user.role, property_id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const normalEmail = email.toLowerCase().trim();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    if (role === 'charges_staff') {
      const requestor = db.prepare('SELECT plan, has_charges_addon FROM users WHERE id = ?').get(req.user.userId);
      if (requestor?.plan !== 'multi' && !requestor?.has_charges_addon) {
        return res.status(403).json({ error: 'Charges Staff role requires Multi plan or the Bar & Charges add-on.' });
      }
    }

    const hash = bcrypt.hashSync(password, 10);

    const result = db.prepare(`
      INSERT INTO users (property_id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      property_id ?? null,
      name,
      normalEmail,
      hash,
      role ?? 'reception'
    );

    const created = db.prepare(`${SAFE_SELECT} WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(created);

    logAction(db, {
      ...actorFromReq(req),
      action: 'USER_CREATED',
      category: 'user',
      targetType: 'user',
      targetId: created.id,
      targetName: `${created.name} (${created.email})`,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/me/password ────────────────────────────────────────────
// Authenticated user changes their own password.
// req.user is set by requireAuth middleware ({ userId, role, propertyId }).
usersRouter.put('/me/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    console.log('[change-password] updating user:', userId);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
    console.log('[change-password] password updated for user:', userId);

    res.json({ ok: true });

    logAction(db, {
      ...actorFromReq(req),
      action: 'PASSWORD_CHANGED',
      category: 'auth',
      targetType: 'user',
      targetId: user.id,
      targetName: user.email,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/:id/password ──────────────────────────────────────────
// Owner resets another user's password. No current-password check required.
usersRouter.put('/:id/password', (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can reset staff passwords.' });
    }

    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: 'newPassword is required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const target = db.prepare('SELECT id, email, property_id FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (!canAccessProperty(req.user.userId, req.user.role, target.property_id)) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    res.json({ ok: true });

    logAction(db, {
      ...actorFromReq(req),
      action: 'STAFF_PASSWORD_RESET',
      category: 'auth',
      targetType: 'user',
      targetId: Number(req.params.id),
      targetName: target.email ?? null,
      ipAddress: getIp(req),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/:id ────────────────────────────────────────────────────
// Updates name, email and role only — password changes go through /me/password.
// Owner-only: mirrors the existing /:id/password reset endpoint's restriction.
// Owner status can never be granted through this generic edit route — the
// only supported way to add an owner-role account is POST / (Invite Staff),
// which is itself property-scoped above.
usersRouter.put('/:id', (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can edit staff accounts.' });
    }

    const existing = db.prepare('SELECT id, property_id, role FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (!canAccessProperty(req.user.userId, req.user.role, existing.property_id)) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, email, role } = req.body;
    if (role === 'owner' && existing.role !== 'owner') {
      return res.status(400).json({ error: 'Owner status cannot be granted through this endpoint.' });
    }

    db.prepare(`
      UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?
    `).run(name, email, role, req.params.id);

    res.json(db.prepare(`${SAFE_SELECT} WHERE id = ?`).get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Account deletion is handled by:
// - DELETE /api/auth/account        (self-service, auth.js)
// - DELETE /api/admin/users/:id     (super admin, admin.js)
// No bare DELETE on /api/users/:id — would leave orphaned data and active Stripe subscriptions
