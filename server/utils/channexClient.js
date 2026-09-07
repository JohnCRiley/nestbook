// server/utils/channexClient.js
//
// Minimal shared client for the Channex API (the planned channel-manager
// integration). Phase 2, slice 1 — foundational groundwork ONLY. Nothing in the
// app imports this yet; it is callable only from a script or the Node console.
//
// CHANNEX_API_KEY must be set in server/.env — never hardcoded, never in
// ecosystem.config.cjs (same rule as ANTHROPIC_API_KEY / SUPER_ADMIN_PASSWORD).
// If it is missing, every request helper here THROWS a clear error rather than
// silently doing nothing.
//
// Base URL defaults to Channex's STAGING host: NestBook is pre-certification and
// all Phase 2 development runs against the sandbox (see
// docs/in-progress/channex-integration-research.md sections 3 and 12). Override
// with CHANNEX_API_BASE_URL only for an eventual production cutover.
//
// Channex API conventions (https://docs.channex.io/api-v.1-documentation/api-reference):
//   - auth header is `user-api-key`
//   - request bodies are wrapped under the entity type, e.g. { "property": {...} }
//   - success: { "data": { "id", "attributes", ... } }
//   - errors:  { "errors": { "code", "title", "details"? } }
//
// This file deliberately implements only enough to support property creation
// (utils/createChannexProperty.js). The rest of the API surface — room types,
// rate plans, ARI, webhooks — is later slices.

const DEFAULT_BASE_URL = 'https://staging.channex.io';

/** Error type for every Channex failure — missing key, network, non-2xx, bad body. */
export class ChannexError extends Error {
  constructor(message, { status = null, code = null, details = null } = {}) {
    super(message);
    this.name = 'ChannexError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** True when a CHANNEX_API_KEY is present. Lets callers check without catching. */
export function isChannexConfigured() {
  return Boolean((process.env.CHANNEX_API_KEY ?? '').trim());
}

/** @throws {ChannexError} if CHANNEX_API_KEY is missing/blank. */
export function getChannexApiKey() {
  const key = (process.env.CHANNEX_API_KEY ?? '').trim();
  if (!key) {
    throw new ChannexError(
      'CHANNEX_API_KEY is not set in server/.env — the Channex integration cannot make API calls. ' +
      'Add a sandbox API key (Channex dashboard → Applications → API Keys) before using this.'
    );
  }
  return key;
}

/** Resolved API base URL (no trailing slash). */
export function getChannexBaseUrl() {
  return ((process.env.CHANNEX_API_BASE_URL ?? '').trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * Low-level request helper. Every other Channex function builds on this.
 *
 * @param {string} path            API path beginning with '/', e.g. '/api/v1/properties'
 * @param {object} [opts]
 * @param {string} [opts.method='GET']
 * @param {object} [opts.body]     plain object, JSON-encoded as-is — the caller
 *                                 wraps it under the entity key (e.g. { property: {...} })
 * @param {object} [opts.query]    query-string params (undefined/null values skipped)
 * @returns {Promise<object|null>} the parsed `data` from the Channex response
 * @throws {ChannexError}          on missing key, network failure, non-2xx, or an
 *                                 unparseable body — it never resolves silently
 */
export async function channexRequest(path, { method = 'GET', body, query } = {}) {
  const apiKey = getChannexApiKey();

  let url = `${getChannexBaseUrl()}${path}`;
  if (query && typeof query === 'object') {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'user-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ChannexError(`Channex request failed (${method} ${path}): ${err.message}`);
  }

  const rawBody = await res.text();
  let parsed = null;
  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new ChannexError(
        `Channex ${res.status} (${method} ${path}) returned a non-JSON body: ${rawBody.slice(0, 300)}`,
        { status: res.status }
      );
    }
  }

  if (!res.ok) {
    const e = parsed?.errors ?? {};
    throw new ChannexError(
      `Channex ${res.status} — ${e.title || 'request failed'} (${method} ${path})` +
      (e.details ? `: ${JSON.stringify(e.details)}` : ''),
      { status: res.status, code: e.code ?? null, details: e.details ?? null }
    );
  }

  return parsed?.data ?? parsed ?? null;
}

/**
 * Create a property in Channex.
 * Thin wrapper over channexRequest — callers should prefer
 * utils/createChannexProperty.js, which builds the attributes from a NestBook
 * property record and picks the correct property_type.
 *
 * @param {object} attributes   property attributes (title, currency, property_type, …)
 * @returns {Promise<object>}   the created property's `data` object (includes `id`)
 */
export async function createProperty(attributes) {
  return channexRequest('/api/v1/properties', {
    method: 'POST',
    body: { property: attributes },
  });
}
