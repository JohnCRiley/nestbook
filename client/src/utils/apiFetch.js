/**
 * Authenticated fetch wrapper.
 * Adds the Bearer token to every request, and redirects to /login on 401.
 * Automatically sets Content-Type: application/json for requests with a body,
 * unless the body is FormData (which requires the browser to set its own
 * multipart boundary) or the caller has already supplied a Content-Type.
 */
export function apiFetch(url, options = {}) {
  const token = localStorage.getItem('nb_token');

  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, { ...options, headers }).then((res) => {
    if (res.status === 401) {
      localStorage.removeItem('nb_token');
      localStorage.removeItem('nb_user');
      window.location.href = '/app/login';
      // Return a promise that never resolves — the redirect is in progress.
      return new Promise(() => {});
    }
    return res;
  });
}
