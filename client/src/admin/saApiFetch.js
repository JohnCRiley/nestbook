/**
 * Fetch wrapper for Super Admin API calls.
 *
 * - Reads the SA token from sessionStorage (nb_sa_token).
 * - On each successful response, checks for X-SA-Token-Refresh and stores
 *   the refreshed token — implementing a sliding 2-hour inactivity window.
 * - On 404 from an /api/admin route, clears the SA session (forces re-login).
 */

const SA_TOKEN_KEY = 'nb_sa_token';

export function getSAToken() {
  return sessionStorage.getItem(SA_TOKEN_KEY);
}

export function storeSAToken(token) {
  sessionStorage.setItem(SA_TOKEN_KEY, token);
}

export function clearSASession() {
  sessionStorage.removeItem(SA_TOKEN_KEY);
}

export async function saApiFetch(path, options = {}) {
  const token = getSAToken();
  const headers = {
    ...(options.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(path, { ...options, headers });

  // Sliding session: store refreshed token if server sent one
  const refreshed = res.headers.get('X-SA-Token-Refresh');
  if (refreshed) storeSAToken(refreshed);

  // Session expired / revoked — clear and let AdminRoute redirect
  if (res.status === 404 && path.startsWith('/api/admin')) {
    clearSASession();
  }

  return res;
}
