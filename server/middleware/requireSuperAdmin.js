import db from '../db/database.js';

/**
 * Must run after requireAuth (which sets req.user).
 * Restricts access to users with role = 'owner' AND email = 'demo@nestbook.io'.
 */
export function requireSuperAdmin(req, res, next) {
  const user = db.prepare('SELECT email, role FROM users WHERE id = ?').get(req.user.userId);
  if (!user || user.role !== 'owner' || user.email !== 'demo@nestbook.io') {
    return res.status(403).json({ error: 'Super admin access required.' });
  }
  next();
}
