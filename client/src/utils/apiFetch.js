/**
 * Authenticated fetch wrapper.
 * Adds the Bearer token to every request, and redirects to /login on 401.
 */
export function apiFetch(url, options = {}) {
  const token = localStorage.getItem('nb_token');

  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return fetch(url, { ...options, headers }).then((res) => {
    if (res.status === 401) {
      localStorage.removeItem('nb_token');
      localStorage.removeItem('nb_user');
      window.location.href = '/login';
      // Return a promise that never resolves — the redirect is in progress.
      return new Promise(() => {});
    }
    return res;
  });
}
