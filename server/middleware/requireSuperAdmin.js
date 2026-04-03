import db from '../db/database.js';

/**
 * Legacy middleware — kept for reference only.
 * The active super-admin protection is now requireSuperAdminSession.js.
 *
 * Must run after requireAuth (which sets req.user).
 * Restricts access to users with is_super_admin = 1.
 * Returns 404 (not 403) to keep the panel invisible.
 */
export function requireSuperAdmin(req, res, next) {
  const user = db
    .prepare('SELECT is_super_admin FROM users WHERE id = ?')
    .get(req.user.userId);

  if (!user?.is_super_admin) {
    return res.status(404).json({ error: 'Not found.' });
  }
  next();
}
