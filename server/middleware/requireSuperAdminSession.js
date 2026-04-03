import jwt from 'jsonwebtoken';

const JWT_SECRET     = process.env.JWT_SECRET || 'nestbook-dev-secret-change-in-production';
const SA_JWT_EXPIRES = '2h';

/**
 * Protects /api/admin routes.
 *
 * - Verifies the SA-specific JWT (must have isSuperAdmin: true).
 * - Returns 404 on ALL failures so the panel is invisible to outsiders.
 * - On every valid request, issues a fresh 2-hour token in the
 *   X-SA-Token-Refresh response header (sliding inactivity window).
 *
 * Intentionally does NOT depend on requireAuth — it is a completely
 * separate authentication path.
 */
export function requireSuperAdminSession(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(404).json({ error: 'Not found.' });
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(404).json({ error: 'Not found.' });
  }

  if (!payload.isSuperAdmin) {
    return res.status(404).json({ error: 'Not found.' });
  }

  // Slide the session window: issue a fresh 2-hour token
  const refreshed = jwt.sign(
    { userId: payload.userId, isSuperAdmin: true },
    JWT_SECRET,
    { expiresIn: SA_JWT_EXPIRES }
  );
  res.setHeader('X-SA-Token-Refresh', refreshed);

  req.user = payload;
  next();
}
