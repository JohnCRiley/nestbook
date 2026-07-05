import db from '../db/database.js';

export function requireVerified(req, res, next) {
  const user = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(req.user.userId);

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (!user.email_verified) {
    return res.status(403).json({
      error: 'Please verify your email address to continue.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  next();
}
