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
//
// Slice 9 (certification prep): ARI writes and object CRUD here route through
// channexQueue.submitChannexJob() — a per-property ARI rate limiter + retry/
// backoff (cert test 12). channexRequest() itself stays a single raw request
// (with a hard timeout so a stalled call can never wedge the queue's one
// worker). GET reads (booking revisions, webhook list) call it directly so a
// webhook pull never waits behind a queued ARI burst; the booking ack
// (acknowledgeBookingRevision) also calls it directly, with its own retry, for
// the same reason — it must never be stalled behind ARI.

import { submitChannexJob } from './channexQueue.js';

const DEFAULT_BASE_URL = 'https://staging.channex.io';

/** Error type for every Channex failure — missing key, network, non-2xx, bad body. */
export class ChannexError extends Error {
  constructor(message, { status = null, code = null, details = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'ChannexError';
    this.status = status;      // HTTP status, or null for a network failure
    this.code = code;          // Channex errors.code, e.g. 'http_too_many_requests'
    this.details = details;
    this.retryAfter = retryAfter; // seconds, from a Retry-After header if present
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
 * @param {number} [opts.timeoutMs=30000] abort (and throw a network-class
 *                                 ChannexError) if Channex has not responded in
 *                                 this long. A hung request must NEVER stall
 *                                 forever — every write goes through the single
 *                                 channexQueue worker, so one wedged fetch would
 *                                 otherwise block every later ARI push AND the
 *                                 booking acknowledgment behind it.
 * @returns {Promise<object|null>} the parsed `data` (or the full body when raw)
 * @throws {ChannexError}          on missing key, network failure, timeout,
 *                                 non-2xx, or an unparseable body — it never
 *                                 resolves silently
 */
export async function channexRequest(path, { method = 'GET', body, query, raw = false, timeoutMs = 30_000 } = {}) {
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
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new ChannexError(
      timedOut
        ? `Channex request timed out after ${timeoutMs}ms (${method} ${path})`
        : `Channex request failed (${method} ${path}): ${err.message}`
    );
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
    const retryAfter = Number(res.headers.get('retry-after')) || null;
    throw new ChannexError(
      `Channex ${res.status} — ${e.title || 'request failed'} (${method} ${path})` +
      (e.details ? `: ${JSON.stringify(e.details)}` : ''),
      { status: res.status, code: e.code ?? null, details: e.details ?? null, retryAfter }
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
/** Route one outbound WRITE through the queue (rate-limit + retry/backoff). */
function queuedWrite(label, run, extra = {}) {
  return submitChannexJob({ kind: 'other', label, run, ...extra });
}

export async function createProperty(attributes) {
  return queuedWrite(`create property "${attributes.title ?? '?'}"`, () =>
    channexRequest('/api/v1/properties', {
      method: 'POST',
      body: { property: attributes },
    }));
}

/**
 * Update an existing property in Channex (PUT — confirmed against
 * docs.channex.io/api-v.1-documentation/hotels-collection: accepts the same
 * attribute set as create, including `timezone` and `country`). Callers
 * should prefer utils/createChannexProperty.js's updateChannexProperty(),
 * which builds the attributes from the current NestBook property record —
 * this lets an already-connected property be corrected/re-synced (e.g. a
 * timezone set after the initial connect) without disconnecting first.
 *
 * @param {string} channexPropertyId
 * @param {object} attributes
 * @returns {Promise<object>}   the updated property's `data` object
 */
export async function updateProperty(channexPropertyId, attributes) {
  return queuedWrite(`update property ${channexPropertyId}`, () =>
    channexRequest(`/api/v1/properties/${channexPropertyId}`, {
      method: 'PUT',
      body: { property: attributes },
    }));
}

/**
 * Create a Room Type. Required attributes: property_id, title, count_of_rooms,
 * occ_adults, occ_children, occ_infants, default_occupancy.
 * Availability of a new room type defaults to 0 — push real values with
 * updateAvailability().
 * @returns {Promise<object>} the created room type's `data` (includes `id`)
 */
export async function createRoomType(attributes) {
  return queuedWrite(`create room type "${attributes.title ?? '?'}"`, () =>
    channexRequest('/api/v1/room_types', {
      method: 'POST',
      body: { room_type: attributes },
    }));
}

/**
 * Create a Rate Plan. Required attributes: title (unique per property),
 * property_id, room_type_id, options (array of { occupancy, is_primary, rate }).
 * Rate defaults to 0 — push real values with updateRates().
 * @returns {Promise<object>} the created rate plan's `data` (includes `id`)
 */
export async function createRatePlan(attributes) {
  return queuedWrite(`create rate plan "${attributes.title ?? '?'}"`, () =>
    channexRequest('/api/v1/rate_plans', {
      method: 'POST',
      body: { rate_plan: attributes },
    }));
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
  return queuedWrite(`update room type ${id}`, () =>
    channexRequest(`/api/v1/room_types/${id}`, {
      method: 'PUT',
      body: { room_type: attributes },
    }));
}

/**
 * Update a Rate Plan in place. `title` IS updatable (≤255 chars). Pass just the
 * fields to change.
 * @returns {Promise<object>} the updated rate plan's `data`
 */
export async function updateRatePlan(id, attributes) {
  return queuedWrite(`update rate plan ${id}`, () =>
    channexRequest(`/api/v1/rate_plans/${id}`, {
      method: 'PUT',
      body: { rate_plan: attributes },
    }));
}

/**
 * Delete a Room Type. Without `force` Channex REFUSES if the room type is
 * associated with a channel; `force: true` un-maps it from the channel first.
 * Docs are silent on what happens to existing bookings/ARI history, so slice 7's
 * reconciliation never calls this automatically — an owner-deleted room's
 * mapping is orphan-marked and a human force-removes here if needed.
 */
export async function deleteRoomType(id, { force = false } = {}) {
  return queuedWrite(`delete room type ${id}`, () =>
    channexRequest(`/api/v1/room_types/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }));
}

/** Delete a Rate Plan. `force` un-maps from the channel first. IRREVERSIBLE —
 *  "once Rate Plan was removed we can't restore it" (docs). Not called
 *  automatically by reconciliation. */
export async function deleteRatePlan(id, { force = false } = {}) {
  return queuedWrite(`delete rate plan ${id}`, () =>
    channexRequest(`/api/v1/rate_plans/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }));
}

/**
 * Create a Photo (dedicated Photos API — Slice A, see
 * docs/completed/channex-photo-parity-slice-a.md). `attributes` = { property_id,
 * room_type_id, url, position, kind }. `url` must be a real, publicly
 * fetchable address — Channex downloads it themselves and re-hosts it on
 * their own CDN (the returned `url` is THEIRS, not the one submitted).
 *
 * CONFIRMED LIVE (2026-09-15, staging) that the *room-type* endpoint's
 * embedded `content.photos` field only ever ADDS photos — a PUT that omits a
 * previously-pushed photo does NOT remove it, and Channex has no concept of
 * "this is the complete list" for that field. The dedicated Photos API
 * (create/update/delete, one call per photo) is therefore the ONLY reliable
 * way to keep NestBook and Channex's photo lists in sync with no drift —
 * genuinely used for every photo create/update/delete in this integration,
 * not just as a fallback.
 * @returns {Promise<object>} the created photo's `data` (includes `id`)
 */
export async function createPhoto(attributes) {
  return queuedWrite(`create photo (room_type ${attributes.room_type_id ?? '?'})`, () =>
    channexRequest('/api/v1/photos', {
      method: 'POST',
      body: { photo: attributes },
    }));
}

/**
 * Update a Photo in place — confirmed live that a position-only PUT works
 * correctly when there is more than one photo on the room type (a lone
 * photo's position is otherwise normalised back to 0 regardless of what's
 * sent, which is harmless — there's nothing to reorder against).
 * @returns {Promise<object>} the updated photo's `data`
 */
export async function updatePhoto(id, attributes) {
  return queuedWrite(`update photo ${id}`, () =>
    channexRequest(`/api/v1/photos/${id}`, {
      method: 'PUT',
      body: { photo: attributes },
    }));
}

/** Delete a Photo. Confirmed live: removes exactly that photo, leaves every
 *  other photo on the room type untouched. */
export async function deletePhoto(id) {
  return queuedWrite(`delete photo ${id}`, () =>
    channexRequest(`/api/v1/photos/${id}`, { method: 'DELETE' }));
}

/**
 * Push availability for room types — ONE call, `values` may span many
 * room_type_id (cert "1 API call with multiple details inside"). Routed through
 * the queue as an `availability` ARI job: per-property rate-limited, retried on
 * 429/5xx.
 * @param {Array} values  [{ property_id, room_type_id, date_from, date_to, availability }, …]
 * @param {{propertyId?: string|number, dedupeKey?: string}} [opts]
 */
export async function updateAvailability(values, { propertyId, dedupeKey } = {}) {
  return submitChannexJob({
    kind: 'ari', ariType: 'availability', propertyId, dedupeKey,
    label: `POST /availability (${values.length} row(s), property ${propertyId ?? '?'})`,
    run: () => channexRequest('/api/v1/availability', { method: 'POST', body: { values }, raw: true }),
  });
}

/**
 * Push rates / restrictions for rate plans — ONE call, `values` may span many
 * rate_plan_id. `rate` must be > 0 (decimal string or minor units). Validation
 * problems come back as `meta.warnings` on a 200. Routed through the queue as a
 * `restrictions` ARI job.
 * @param {Array} values  [{ property_id, rate_plan_id, date_from, date_to, rate }, …]
 * @param {{propertyId?: string|number, dedupeKey?: string}} [opts]
 */
export async function updateRates(values, { propertyId, dedupeKey } = {}) {
  return submitChannexJob({
    kind: 'ari', ariType: 'restrictions', propertyId, dedupeKey,
    label: `POST /restrictions (${values.length} row(s), property ${propertyId ?? '?'})`,
    run: () => channexRequest('/api/v1/restrictions', { method: 'POST', body: { values }, raw: true }),
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
  return queuedWrite('register webhook', () =>
    channexRequest('/api/v1/webhooks', { method: 'POST', body: { webhook: attributes } }));
}

/** List every webhook registered on the account. Returns the full body ({ data, meta }). */
export async function listWebhooks() {
  return channexRequest('/api/v1/webhooks', { raw: true });
}

/** Delete a webhook by id. */
export async function deleteWebhook(id) {
  return queuedWrite(`delete webhook ${id}`, () =>
    channexRequest(`/api/v1/webhooks/${id}`, { method: 'DELETE' }));
}

/**
 * Retrieve the authoritative current state of a booking revision. The webhook
 * body is only a pointer — Channex delivery is unordered and unsigned, so the
 * receiver must always PULL (research §12). Read — called directly, NOT queued
 * (a webhook pull must not wait behind a backed-up ARI burst).
 * @returns {Promise<object>} the revision's `attributes`
 */
export async function getBookingRevision(revisionId) {
  const data = await channexRequest(`/api/v1/booking_revisions/${encodeURIComponent(revisionId)}`);
  return data?.attributes ?? data;
}

/**
 * Acknowledge receipt of a booking revision — REQUIRED for certification
 * (cert test 11). POST /api/v1/booking_revisions/:id/ack, empty body, success
 * `200 { meta: { message: "Success" } }`. Once acked, the revision drops out of
 * Channex's non-acked feed and the 30-minute reminder email stops.
 *
 * NOT routed through channexQueue: the queue is a single-worker FIFO built for
 * per-property ARI rate limiting, and a slow/failing ARI push there would stall
 * the ack behind it — exactly the bug this call must not have (the ack is the
 * one write Channex actively watches for during certification). `/ack` is not
 * ARI-rate-limited and fires at most once per reservation, so it runs directly
 * with its own small bounded retry on transient failures.
 * @returns {Promise<object>} the `{ meta }` body
 */
// ── Channel API (Slice CA-1 — groundwork only) ────────────────────────────────
// Self-service OTA connect (Booking.com, Airbnb, …) is a genuinely different
// Channex resource family from everything above — see
// docs/in-progress/channex-channel-api-investigation.md. CA-1 adds ONLY the
// read-only listing calls needed for a Super Admin debug view; the actual
// connect flow (test_connection, mapping_details, create, activate) is CA-2.
// Both calls below are GETs — like listWebhooks()/getBookingRevision() above,
// they run directly, not through channexQueue (a read must never queue behind
// a backed-up ARI burst).

// CA-7 fix (2026-09-17): `GET /channels/list` — despite Channex's own docs
// claiming it returns "every supported channel adapter" — genuinely omits
// at least Klook, Traveloka, and HRS. Confirmed live: all three return a
// clean 200 with a full, well-formed descriptor from
// `GET /channels/adapter?code=`, and all three are listed with no
// tier/access restrictions on Channex's own public integrations page
// (which advertises 68 OTA channels total — 11 more than the 57
// `/channels/list` returns to this account). Ruled out: Super Admin/CA-4
// aren't filtering anything client-side (both call sites pass this
// function's return value straight through); a separate `/channels/codes`
// endpoint returns 739 entries that DOES include these three by name, but
// under a completely different 3-letter code namespace (`KHS` for Klook,
// not `Klook`) with zero overlap with `/channels/list`'s codes — a
// different Channex reference table entirely, not a fix for this gap.
// Root cause on Channex's side is unconfirmed (a real API bug, a staging-
// vs-production difference, or something account-specific) — flagged for
// Evan, not something this codebase can fix upstream. This merge papers
// over it defensively: any of these three showing up naturally in
// `/channels/list` later (if Channex fixes it) is deduped by code, not
// double-added.
const SUPPLEMENTAL_ADAPTER_CODES = ['Klook', 'Traveloka', 'HRS'];

/**
 * List every Channel API adapter Channex supports (57 as of 2026-09-16 on
 * staging via `/channels/list` alone — Booking.com, Airbnb, Agoda, … — plus
 * Klook/Traveloka/HRS merged in below, since Channex's own endpoint omits
 * them). Each entry's `params`/`rate_params` is a self-describing form
 * schema for that adapter's connect flow (CA-2 will render a form from it);
 * CA-1 just surfaces the raw list.
 *
 * The three supplemental lookups run in parallel, each wrapped in its own
 * `.catch` so a rejection never propagates to the outer `Promise.all` — a
 * bad day on Channex's side for one of
 * them (or all three) degrades to "just don't merge that one in," never to
 * a broken adapter list for everyone. Not queued — same reasoning as the
 * base call: a read must never wait behind a backed-up ARI burst.
 * @returns {Promise<Array>} the adapter array
 */
export async function listChannelAdapters() {
  const base = await channexRequest('/api/v1/channels/list');
  const list = Array.isArray(base) ? base : [];

  const existingCodes = new Set(list.map((a) => a?.code));
  const missingCodes = SUPPLEMENTAL_ADAPTER_CODES.filter((code) => !existingCodes.has(code));
  if (missingCodes.length === 0) return list;

  const fetched = await Promise.all(
    missingCodes.map((code) =>
      channexRequest('/api/v1/channels/adapter', { query: { code } }).catch((e) => {
        console.warn(`[channex] supplemental adapter fetch failed for code "${code}" — omitting from the list:`, e.message);
        return null;
      })
    )
  );

  return [...list, ...fetched.filter(Boolean)];
}

/**
 * List Channel API connections already created for one Channex property.
 * Confirmed live (2026-09-16, staging): paginated,
 * `{ data: [...], meta: { total, limit, page, order_by, order_direction } }`.
 * Empty until CA-2 builds the create flow — an empty list here is the
 * expected, correct result for every property today.
 * @param {string} channexPropertyId  Channex's property UUID
 *                                    (properties.channex_property_id) — NOT
 *                                    the NestBook property id.
 * @returns {Promise<object>} the full body ({ data, meta })
 */
export async function listChannelsForProperty(channexPropertyId) {
  return channexRequest('/api/v1/channels', {
    query: { 'filter[property_id]': channexPropertyId },
    raw: true,
  });
}

/**
 * List Channex "groups" for our account. A `group_id` is required on
 * `createChannel()` below — confirmed live (Slice CA-1 investigation, and
 * re-confirmed for CA-2) that our staging account has exactly one group, auto-
 * created by Channex, shared by every connected property. GET — not queued.
 * @returns {Promise<object>} the full body ({ data, meta })
 */
export async function listGroups() {
  return channexRequest('/api/v1/groups', { raw: true });
}

/**
 * Every property we've connected shares the one Channex "group" auto-created
 * for our account (confirmed live, CA-1/CA-2/CA-3) — required on both
 * POST /channels (CA-2) and POST /meta/airbnb/connection_link (CA-3). Never
 * guesses which group when there's more than one; that's a real stop, not a
 * default to fall back on. Shared by the Super Admin debug routes (CA-2/CA-3)
 * and the owner-facing connect routes (CA-4) — moved here from
 * routes/channex.js so both can import it from one place.
 * @returns {Promise<{groupId: string}|{error: string}>}
 */
export async function resolveSingleGroupId() {
  const groupsBody = await listGroups();
  const groups = groupsBody?.data ?? [];
  if (groups.length !== 1) {
    return {
      error: `Expected exactly one Channex group on this account, found ${groups.length} — ` +
             `refusing to guess which one. Resolve manually before retrying.`,
    };
  }
  return { groupId: groups[0].id };
}

// ── Channel API (Slice CA-2 — Booking.com connect flow) ───────────────────────
// Field names/shapes below are taken verbatim from
// https://docs.channex.io/channel-api-examples/booking.com (re-fetched fresh
// for this slice, not assumed from CA-1's earlier summary) and
// https://docs.channex.io/api-v.1-documentation/channel-api (check_readiness,
// which the Booking.com-specific page doesn't mention at all). Debug/Super-
// Admin use only — no owner-facing wizard yet (CA-4). These ARE queued
// (`kind: 'other'`, same as createProperty/createRoomType): unlike the CA-1
// reads above, every one of these either mutates real Channex state
// (createChannel, activate) or is the credential-probing step immediately
// before one, so they get the same retry/backoff protection as every other
// outbound write in this file.

/**
 * Test whether `settings` (e.g. `{ hotel_id }` for Booking.com) are valid for
 * `channelCode` (e.g. "BookingCom") — confirmed live: a wrong hotel_id fails
 * cleanly (`{success:false, errors:null}`, 200, never throws for a bad
 * credential). Does not create anything on Channex's side.
 * @returns {Promise<{success: boolean, errors: any}>}
 */
export async function testChannelConnection(channelCode, settings) {
  return queuedWrite(`test channel connection (${channelCode})`, () =>
    channexRequest('/api/v1/channels/test_connection', {
      method: 'POST',
      body: { channel: channelCode, settings },
    }));
}

/**
 * Fetch the OTA-side rooms/rates available to map, for `channelCode` +
 * `settings`. Booking.com's shape (confirmed live via docs):
 * `{ pricing_type: "OBP"|"Standard", rooms: [{ id, title, rates: [{ id,
 * title, occupancies, ... }] }] }`. This is the OTA's own numeric ids (not
 * Channex UUIDs) — used as `room_type_code`/`rate_plan_code` in
 * `createChannel()`'s `rate_plans[].settings` below.
 *
 * NOT queued (CA-7 fix) — same reasoning as the GET reads above
 * (listChannelAdapters/listChannelsForProperty/getChannel): this is a
 * best-effort, read-only probe during the connect wizard's settings step,
 * already with its own "unavailable → fall back to manual entry" handling
 * at the route level (server/routes/properties.js). Confirmed live during
 * CA-7 that a bad-but-plausible Agoda credential returns a real Channex
 * 500 here, which `channexQueue`'s `isRetryable()` correctly treats as
 * transient and retries with the full backoff (~100s) — since this call
 * used to share the queue's single worker with ARI pushes, one bad detail
 * call could block every OTHER property's pending Channex writes for the
 * whole retry window. This call has nothing to do with ARI rate limits or
 * write ordering, so it has no reason to share that queue or its retry
 * budget — a failure here already resolves to "unavailable" at the caller,
 * same outcome whether it fails fast or after 5 queued retries.
 * @returns {Promise<object>}
 */
export async function getMappingDetails(channelCode, settings) {
  return channexRequest('/api/v1/channels/mapping_details', {
    method: 'POST',
    body: { channel: channelCode, settings },
  });
}

/**
 * Fetch the OTA-side connection state (currency, connection types) for
 * `channelCode` + `settings`. Booking.com's shape: `{ currency, ... }`.
 *
 * NOT queued (CA-7 fix) — same reasoning as getMappingDetails() above.
 * @returns {Promise<object>}
 */
export async function getConnectionDetails(channelCode, settings) {
  return channexRequest('/api/v1/channels/connection_details', {
    method: 'POST',
    body: { channel: channelCode, settings },
  });
}

/**
 * Create a Channel API connection — POST /api/v1/channels. `attributes`
 * (confirmed live shape, Booking.com example):
 *   { channel, group_id, title, properties: [channexPropertyId],
 *     settings: { hotel_id }, rate_plans: [{ rate_plan_id, settings:
 *     { room_type_code, rate_plan_code, occupancy, pricing_type,
 *       primary_occ, readonly } }] }
 * `rate_plan_id` is NestBook's OWN Channex rate-plan UUID (from
 * channex_room_mappings, i.e. Phase 2's existing pairing) — NOT a
 * Booking.com id. `room_type_code`/`rate_plan_code` ARE the OTA's numeric
 * ids, from getMappingDetails() above. Created with `is_active: false`;
 * activateChannel() below turns sync on.
 * @returns {Promise<object>} the created channel's `data` (includes `id`)
 */
export async function createChannel(attributes) {
  return queuedWrite(`create channel "${attributes.title ?? '?'}"`, () =>
    channexRequest('/api/v1/channels', {
      method: 'POST',
      body: { channel: attributes },
    }));
}

/**
 * List the problems blocking activation for a channel (empty = ready).
 * `POST /api/v1/channels/{id}/check_readiness`, no request body — confirmed
 * via docs.channex.io/api-v.1-documentation/channel-api (this endpoint is
 * NOT documented on the Booking.com-specific page at all).
 * @returns {Promise<object>} the full body — shape not documented in detail
 *                            by Channex; callers should treat any non-empty
 *                            array/list as blockers and log the raw response
 */
export async function checkChannelReadiness(channelId) {
  return queuedWrite(`check readiness (channel ${channelId})`, () =>
    channexRequest(`/api/v1/channels/${channelId}/check_readiness`, { method: 'POST', raw: true }));
}

/**
 * Turn on sync for a channel — `POST /api/v1/channels/{id}/activate`, no
 * request body. Per docs: "requires the connection to have at least one
 * property and at least one rate plan mapping" (both already true by the
 * time createChannel() above has succeeded). Triggers Channex's own full
 * resync using whatever ARI Phase 2's existing push already put on the
 * mapped rate plans — no new NestBook-side sync logic needed.
 * @returns {Promise<object>}
 */
export async function activateChannel(channelId) {
  return queuedWrite(`activate channel ${channelId}`, () =>
    channexRequest(`/api/v1/channels/${channelId}/activate`, { method: 'POST', raw: true }));
}

/**
 * Fetch a single Channel API connection's current, authoritative state —
 * `GET /api/v1/channels/{id}`. Not queued (a read). Used after the Airbnb
 * OAuth callback lands to confirm what Channex actually created, and
 * generally useful anywhere a single channel_id (not a property filter) is
 * the only thing on hand.
 * @returns {Promise<object>} the channel's `data` (id, attributes, relationships)
 */
export async function getChannel(channelId) {
  return channexRequest(`/api/v1/channels/${channelId}`);
}

/**
 * Stop sync for a channel without deleting the connection —
 * `POST /api/v1/channels/{id}/deactivate`, no request body. Per Channex's
 * docs (docs.channex.io/api-v.1-documentation/channel-api): "Stop the
 * exchange with the channel" — the connection record and its mappings stay
 * intact, only `is_active` flips. This is a DIFFERENT endpoint from
 * deleteChannel() below, not two names for the same call — confirmed via a
 * live request against a real-but-nonexistent channel id (clean `404
 * resource_not_found`, not a 405/redirect to the delete route), see the
 * investigation doc's CA-6 section. Deactivating against a real live
 * channel was NOT possible this slice — the shared staging account had zero
 * connections at build time (sandbox exhaustion, same finding as CA-2/CA-4).
 * @returns {Promise<object>}
 */
export async function deactivateChannel(channelId) {
  return queuedWrite(`deactivate channel ${channelId}`, () =>
    channexRequest(`/api/v1/channels/${channelId}/deactivate`, { method: 'POST', raw: true }));
}

/**
 * Permanently delete a channel connection — `DELETE /api/v1/channels/{id}`.
 * Per Channex's docs, the connection must already be deactivated ("Remove
 * deactivated channel") — deactivate → delete is a two-step sequence, not a
 * single destructive call; callers should call deactivateChannel() first if
 * the channel is still active rather than relying on Channex to reject an
 * out-of-order delete cleanly. Endpoint existence/shape confirmed the same
 * way as deactivateChannel() above (live 404 against a nonexistent id); a
 * real delete against a real live channel was NOT possible this slice —
 * same sandbox-exhaustion reason.
 * @returns {Promise<object|null>}
 */
export async function deleteChannel(channelId) {
  return queuedWrite(`delete channel ${channelId}`, () =>
    channexRequest(`/api/v1/channels/${channelId}`, { method: 'DELETE', raw: true }));
}

// ── Channel API (Slice CA-3 — Airbnb OAuth flow) ──────────────────────────────
// Field names/shapes re-confirmed fresh for this slice (not reused from CA-1's
// summary) against https://docs.channex.io/channel-api-examples/airbnb AND a
// real live call — the fetched doc page claimed the connection_link request
// body is wrapped under a `"connection_link"` key and that the adapter code
// is lowercase `"airbnb"`; BOTH were live-tested and found wrong (see the
// investigation doc's CA-3 section for the full discrepancy write-up). The
// shapes below are the ones that actually work against staging.
//
// Unlike Booking.com, Channex itself creates the channel resource server-side
// during the OAuth exchange (step 2 of the redirect, before the browser ever
// comes back to us) — there is no NestBook-initiated createChannel() call for
// Airbnb. getChannel() above is how the callback route confirms what Channex
// created. checkChannelReadiness()/activateChannel() above are channel-
// agnostic and reused as-is for Airbnb — no Airbnb-specific versions needed.

/**
 * Generate an Airbnb OAuth authorization URL — confirmed live: this does NOT
 * create any Channex-side state (`GET /channels` stays empty until the owner
 * actually completes the OAuth grant), so it's always safe to call, including
 * speculatively. `attributes`: `{ group_id, properties: [channexPropertyId],
 * redirect_uri, failure_redirect_uri, token }` — a FLAT object, NOT wrapped
 * under a `connection_link` key (contradicts the docs page fetched for this
 * slice; the flat shape is what staging actually accepts). `token` is
 * NestBook's own opaque value, confirmed live to be echoed back verbatim as a
 * query param on the final redirect — see `channex_channel_oauth_links`.
 * @returns {Promise<{url: string}>}
 */
export async function generateAirbnbConnectionLink(attributes) {
  return queuedWrite('generate Airbnb connection link', () =>
    channexRequest('/api/v1/meta/airbnb/connection_link', {
      method: 'POST',
      body: attributes,
    }));
}

/**
 * List the real Airbnb listings on an already-OAuth-connected channel —
 * `GET /api/v1/channels/{channel_id}/action/listings`. Per docs, response
 * shape is `{ listing_id_dictionary: { values: [{ id, title, occupancies,
 * city, country_code, quality_status, ... }] } }` — NOT independently
 * re-verified live for this slice (needs a real Airbnb account to complete
 * the OAuth grant first — see investigation doc §5).
 * @returns {Promise<object>}
 */
export async function listAirbnbListings(channelId) {
  return channexRequest(`/api/v1/channels/${channelId}/action/listings`);
}

/**
 * Fetch one Airbnb listing's full metadata (booking_settings,
 * pricing_settings, availability_rules, …) —
 * `GET /api/v1/channels/{channel_id}/action/listing_details?listing_id=`.
 * Not independently re-verified live (same reason as listAirbnbListings).
 * @returns {Promise<object>}
 */
export async function getAirbnbListingDetails(channelId, listingId) {
  return channexRequest(`/api/v1/channels/${channelId}/action/listing_details`, {
    query: { listing_id: listingId },
  });
}

/**
 * Map a NestBook/Channex rate plan to a real Airbnb listing —
 * `POST /api/v1/channels/{channel_id}/mappings`, body `{ mapping: {
 * rate_plan_id, settings: { listing_id } } }`. Per docs this is submitted to
 * Airbnb immediately (an Airbnb-side rejection cancels the mapping) and is
 * ASYNCHRONOUS (~30s for Airbnb's own confirmation) — callers should treat a
 * success response here as "submitted", not "confirmed live on Airbnb", and
 * poll/re-fetch the channel afterward. Not independently re-verified live
 * (needs a real Airbnb account — see investigation doc §5).
 * @returns {Promise<object>} the created mapping's `data`
 */
export async function createAirbnbMapping(channelId, { ratePlanId, listingId }) {
  return queuedWrite(`create Airbnb mapping (channel ${channelId})`, () =>
    channexRequest(`/api/v1/channels/${channelId}/mappings`, {
      method: 'POST',
      body: { mapping: { rate_plan_id: ratePlanId, settings: { listing_id: listingId } } },
    }));
}

export async function acknowledgeBookingRevision(revisionId) {
  const path = `/api/v1/booking_revisions/${encodeURIComponent(revisionId)}/ack`;
  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await channexRequest(path, { method: 'POST', raw: true });
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const transient = status == null || status === 429 || (status >= 500 && status <= 599);
      if (!transient || attempt === maxAttempts) throw err;
      const backoffMs = Number(err?.retryAfter) > 0 ? Number(err.retryAfter) * 1000 : attempt * 2_000;
      console.warn(
        `[channex] ack booking revision ${revisionId} — attempt ${attempt}/${maxAttempts} ` +
        `failed ("${err.message}"); retrying in ${Math.ceil(backoffMs / 1000)}s`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}
