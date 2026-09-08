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
 * @param {boolean} [opts.raw=false] return the whole parsed body ({ data, meta })
 *                                 instead of just `data` — needed for the ARI
 *                                 endpoints, which report per-row problems in
 *                                 `meta.warnings` on an otherwise-200 response
 * @returns {Promise<object|null>} the parsed `data` (or the full body when raw)
 * @throws {ChannexError}          on missing key, network failure, non-2xx, or an
 *                                 unparseable body — it never resolves silently
 */
export async function channexRequest(path, { method = 'GET', body, query, raw = false } = {}) {
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

  if (raw) return parsed ?? null;
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

/**
 * Create a Room Type. Required attributes: property_id, title, count_of_rooms,
 * occ_adults, occ_children, occ_infants, default_occupancy.
 * Availability of a new room type defaults to 0 — push real values with
 * updateAvailability().
 * @returns {Promise<object>} the created room type's `data` (includes `id`)
 */
export async function createRoomType(attributes) {
  return channexRequest('/api/v1/room_types', {
    method: 'POST',
    body: { room_type: attributes },
  });
}

/**
 * Create a Rate Plan. Required attributes: title (unique per property),
 * property_id, room_type_id, options (array of { occupancy, is_primary, rate }).
 * Rate defaults to 0 — push real values with updateRates().
 * @returns {Promise<object>} the created rate plan's `data` (includes `id`)
 */
export async function createRatePlan(attributes) {
  return channexRequest('/api/v1/rate_plans', {
    method: 'POST',
    body: { rate_plan: attributes },
  });
}

/**
 * Update a Room Type in place. `attributes` mirrors createRoomType's (title,
 * count_of_rooms, occ_adults/children/infants, default_occupancy, …) minus
 * property_id. `title` IS updatable this way (docs.channex.io "Room Types
 * Collection", confirmed 2026-09-08). Removing a *channel-mapped* occupancy
 * option would 422 — we never drop options, only bump the title/count/occupancy.
 * @returns {Promise<object>} the updated room type's `data`
 */
export async function updateRoomType(id, attributes) {
  return channexRequest(`/api/v1/room_types/${id}`, {
    method: 'PUT',
    body: { room_type: attributes },
  });
}

/**
 * Update a Rate Plan in place. `title` IS updatable (≤255 chars). Pass just the
 * fields to change.
 * @returns {Promise<object>} the updated rate plan's `data`
 */
export async function updateRatePlan(id, attributes) {
  return channexRequest(`/api/v1/rate_plans/${id}`, {
    method: 'PUT',
    body: { rate_plan: attributes },
  });
}

/**
 * Delete a Room Type. Without `force` Channex REFUSES if the room type is
 * associated with a channel; `force: true` un-maps it from the channel first.
 * Docs are silent on what happens to existing bookings/ARI history, so slice 7's
 * reconciliation never calls this automatically — an owner-deleted room's
 * mapping is orphan-marked and a human force-removes here if needed.
 */
export async function deleteRoomType(id, { force = false } = {}) {
  return channexRequest(`/api/v1/room_types/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
}

/** Delete a Rate Plan. `force` un-maps from the channel first. IRREVERSIBLE —
 *  "once Rate Plan was removed we can't restore it" (docs). Not called
 *  automatically by reconciliation. */
export async function deleteRatePlan(id, { force = false } = {}) {
  return channexRequest(`/api/v1/rate_plans/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
}

/**
 * Push availability for room types. `values` is an array of
 * { property_id, room_type_id, date | (date_from & date_to), availability }.
 * Channex processes this asynchronously (returns task ids). Past dates rejected.
 */
export async function updateAvailability(values) {
  return channexRequest('/api/v1/availability', {
    method: 'POST',
    body: { values },
    raw: true,
  });
}

/**
 * Push rates / restrictions for rate plans. `values` is an array of
 * { property_id, rate_plan_id, date | (date_from & date_to), rate?, min_stay_arrival?, … }.
 * `rate` must be > 0; accepts a decimal string ("120.00") or integer minor units.
 * Validation problems come back as `meta.warnings` on a 200, not as an error.
 */
export async function updateRates(values) {
  return channexRequest('/api/v1/restrictions', {
    method: 'POST',
    body: { values },
    raw: true,
  });
}

// ── Webhooks (Phase 2, slice 5 — inbound reservation sync) ───────────────────
// Channex webhooks are NOT HMAC-signed. Authentication is a shared-secret header
// we set here at registration time and the receiver validates on every request
// (docs.channex.io "Webhook Collection", confirmed 2026-09-08). For a
// multi-property account (NestBook at the platform level) Channex recommends ONE
// global webhook (property_id: null, is_global: true) rather than one per
// property.

/**
 * Register a webhook. `attributes`:
 *   { callback_url, event_mask, property_id, is_global, headers, is_active, send_data }
 * @returns {Promise<object>} the created webhook's `data` (includes `id`)
 */
export async function createWebhook(attributes) {
  return channexRequest('/api/v1/webhooks', {
    method: 'POST',
    body: { webhook: attributes },
  });
}

/** List every webhook registered on the account. Returns the full body ({ data, meta }). */
export async function listWebhooks() {
  return channexRequest('/api/v1/webhooks', { raw: true });
}

/** Delete a webhook by id. */
export async function deleteWebhook(id) {
  return channexRequest(`/api/v1/webhooks/${id}`, { method: 'DELETE' });
}

/**
 * Retrieve the authoritative current state of a booking revision. The webhook
 * body is only a pointer — Channex delivery is unordered and unsigned, so the
 * receiver must always PULL (research §12).
 * @returns {Promise<object>} the revision's `attributes`
 */
export async function getBookingRevision(revisionId) {
  const data = await channexRequest(`/api/v1/booking_revisions/${encodeURIComponent(revisionId)}`);
  return data?.attributes ?? data;
}

/** Retrieve a booking (latest state) by its stable booking_id. Fallback when a
 *  webhook payload carries only booking_id. @returns {Promise<object>} attributes */
export async function getBooking(bookingId) {
  const data = await channexRequest(`/api/v1/bookings/${encodeURIComponent(bookingId)}`);
  return data?.attributes ?? data;
}
