import { Navigate } from 'react-router-dom';
import { getSAToken } from './saApiFetch.js';

/**
 * Guards all /super-admin/* routes.
 *
 * - Unauthenticated visitors see the /super-admin/login page (they must
 *   know it exists — the panel doesn't redirect to customer login).
 * - The server returns 404 for all /api/admin calls without a valid SA token,
 *   so the panel is doubly invisible to anyone without credentials.
 */
export default function AdminRoute({ children }) {
  const token = getSAToken();

  if (!token) {
    return <Navigate to="/super-admin/login" replace />;
  }

  return children;
}
