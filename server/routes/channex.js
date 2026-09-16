// server/routes/channex.js
//
// Channex integration — Phase 2, slice 5. INBOUND webhook receiver.
//
// Channex POSTs here whenever a reservation is created / modified / cancelled on
// any connected property. This router is mounted PUBLIC (before requireAuth) —
// Channex's servers have no NestBook session. It has ZERO relation to the Stripe
// webhook: Channex webhooks are NOT HMAC-signed. Authentication is a
// shared-secret header (CHANNEX_WEBHOOK_SECRET) that we set when registering the
// webhook and validate on every request here.
//
// The webhook body is only a pointer ({ event, payload: { booking_id,
// property_id, revision_id } }). Channex delivery is unordered, so we always
// PULL the authoritative reservation state from the API and act on that — never
// trust the body's contents or ordering (research §12).

import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import db from '../db/database.js';
import { fetchRevision, syncReservationFromRevision } from '../utils/channexInboundSync.js';
import { randomUUID } from 'node:crypto';
import {
  createWebhook, listWebhooks, deleteWebhook, ChannexError,
  listChannelAdapters, listChannelsForProperty, listGroups, getChannel,
  testChannelConnection, getMappingDetails, getConnectionDetails,
  createChannel, checkChannelReadiness, activateChannel,
  generateAirbnbConnectionLink, listAirbnbListings, getAirbnbListingDetails,
  createAirbnbMapping,
} from '../utils/channexClient.js';

export const channexRouter = Router();

const BOOKING_EVENTS = new Set([
  'booking', 'booking_new', 'booking_modification', 'booking_cancellation',
  // Channex re-sends this ~30 min after a booking it still sees as un-acked.
  // Its payload carries booking_revision_id, so we re-run the (idempotent) pull
  // → sync → ack path: the safety net if the inline ack after the first webhook
  // ever failed every retry or was lost to a process restart before it ran.
  'non_acked_booking',
]);

/**
 * Every property we've connected shares the one Channex "group" auto-created
 * for our account (confirmed live, CA-1/CA-2/CA-3) — required on both
 * POST /channels (CA-2) and POST /meta/airbnb/connection_link (CA-3). Never
 * guesses which group when there's more than one; that's a real stop, not a
 * default to fall back on.
 * @returns {Promise<{groupId: string}|{error: string}>}
 */
async function resolveSingleGroupId() {
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

function getConfiguredSecret() {
  return (process.env.CHANNEX_WEBHOOK_SECRET ?? '').trim();
}

/** Constant-time compare of the shared-secret header. */
function secretOk(req) {
  const expected = getConfiguredSecret();
  if (!expected) return false; // never process anything if no secret is configured
  const got = String(req.headers['x-channex-webhook-secret'] ?? '');
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── POST /api/channex/webhook — the receiver ─────────────────────────────────
channexRouter.post('/webhook', async (req, res) => {
  if (!secretOk(req)) {
    console.warn('[channex-webhook] rejected: missing/invalid X-Channex-Webhook-Secret' +
      (getConfiguredSecret() ? '' : ' (CHANNEX_WEBHOOK_SECRET not set)'));
    return res.status(401).json({ error: 'unauthorized' });
  }

  const body    = (req.body && typeof req.body === 'object') ? req.body : {};
  const event   = body.event ?? null;
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};
  const revisionId = payload.revision_id ?? payload.booking_revision_id ?? null;

  // Non-booking events (ari, review, channel lifecycle, …) — ack and ignore.
  if (event && !BOOKING_EVENTS.has(event)) {
    return res.status(200).json({ ok: true, ignored: event });
  }
  // A booking webhook always carries revision_id (research §12). We pull the
  // authoritative state from GET /booking_revisions/:id — never GET /bookings
  // (cert test 11 forbids the bookings endpoint).
  if (!revisionId) {
    return res.status(400).json({ error: 'payload missing revision_id' });
  }

  try {
    const revision = await fetchRevision({ revisionId });
    const result   = await syncReservationFromRevision(revision);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    // 5xx → Channex retries with backoff (up to ~24h). Transient pull/DB failures
    // are worth a retry; a bad secret or malformed body (handled above) is not.
    console.error('[channex-webhook] processing failed:', err.message);
    return res.status(500).json({ error: 'processing_failed' });
  }
});

// ── GET /api/channex/airbnb/callback — Slice CA-3 (Airbnb OAuth) ─────────────
// PUBLIC, same reasoning as the webhook above but for a different reason: the
// browser arrives here after two hops off NestBook's origin (Airbnb, then
// Channex's own auth_redirect) with no session it can prove — identity is
// resolved via `token` (channex_channel_oauth_links), single-use, deleted the
// moment it's read. See investigation doc §1.3 for the full redirect chain.
// This mirrors the /webhook receiver's "public route, non-session identity"
// pattern, not the owner-facing Stripe Connect return (single-hop, session
// already durable before redirecting).
channexRouter.get('/airbnb/callback', async (req, res) => {
  const token = String(req.query.token ?? '');
  const success = String(req.query.success ?? '') === 'true';
  const channelId = req.query.channel_id ? String(req.query.channel_id) : null;

  const link = token
    ? db.prepare('SELECT * FROM channex_channel_oauth_links WHERE token = ?').get(token)
    : null;
  if (link) {
    db.prepare('DELETE FROM channex_channel_oauth_links WHERE token = ?').run(token);
  }
  db.prepare(`DELETE FROM channex_channel_oauth_links WHERE created_at < datetime('now', '-4 hours')`).run();

  const debugPageUrl = '/app/super-admin/channex-channel-api';

  if (!link) {
    console.warn(`[channex-airbnb-callback] unknown/expired token (success=${success}, channel_id=${channelId})`);
    return res.redirect(`${debugPageUrl}?airbnb=failed&reason=unknown_token`);
  }
  if (!success || !channelId) {
    return res.redirect(`${debugPageUrl}?airbnb=failed&property_id=${link.property_id}`);
  }

  try {
    // Never trust the redirect's own query params as the final state — pull
    // the authoritative resource, same "recompute from source" discipline as
    // every other Channex write in this codebase.
    const channel = await getChannel(channelId);
    const groupId = channel?.relationships?.group?.data?.id ?? null;

    db.prepare(`
      INSERT INTO channex_channels (property_id, channex_channel_id, channex_group_id, channel_code, title, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(channex_channel_id) DO UPDATE SET
        title = excluded.title, is_active = excluded.is_active, updated_at = datetime('now')
    `).run(
      link.property_id, channelId, groupId ?? '', link.channel_code,
      channel?.attributes?.title ?? null, channel?.attributes?.is_active ? 1 : 0
    );

    console.log(`[channex-airbnb-callback] confirmed channel ${channelId} for property #${link.property_id}`);
    return res.redirect(`${debugPageUrl}?airbnb=success&channel_id=${encodeURIComponent(channelId)}&property_id=${link.property_id}`);
  } catch (err) {
    console.error('[channex-airbnb-callback] confirm-state failed:', err.message);
    return res.redirect(`${debugPageUrl}?airbnb=failed&reason=confirm_failed&property_id=${link.property_id}`);
  }
});

// ── Super Admin: register / list / delete the global webhook ─────────────────
// Not owner-facing. Mounted (below, under requireSuperAdminSession) so John can
// wire up the single global webhook once a public HTTPS callback URL exists
// (research §9/§13 — the local/staging public-endpoint gap). Same "Super Admin
// manual trigger" pattern as slices 2–4.
export const channexAdminRouter = Router();

channexAdminRouter.get('/webhooks', async (_req, res) => {
  try {
    const body = await listWebhooks();
    res.json({ webhooks: body?.data ?? [] });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message });
  }
});

channexAdminRouter.post('/register-webhook', async (req, res) => {
  const secret = getConfiguredSecret();
  if (!secret) {
    return res.status(400).json({ error: 'CHANNEX_WEBHOOK_SECRET is not set in server/.env — set it first.' });
  }
  // Callback URL: explicit override, else APP_URL. Must be a public HTTPS URL —
  // Channex cannot reach localhost.
  const base = (process.env.CHANNEX_WEBHOOK_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
  const callbackUrl = /\/api\/channex\/webhook$/.test(base) ? base : `${base}/api/channex/webhook`;
  if (!/^https:\/\//i.test(callbackUrl) || /localhost|127\.0\.0\.1/.test(callbackUrl)) {
    return res.status(400).json({
      error: `Callback URL "${callbackUrl}" is not a public HTTPS URL. Set CHANNEX_WEBHOOK_URL in server/.env to the deployed https origin.`,
    });
  }

  try {
    const existing = (await listWebhooks())?.data ?? [];
    const dup = existing.find(w => (w.attributes?.callback_url ?? '') === callbackUrl);
    if (dup) {
      return res.status(200).json({ ok: true, alreadyRegistered: true, id: dup.id, callbackUrl });
    }
    const created = await createWebhook({
      callback_url: callbackUrl,
      event_mask: 'booking',            // one event per revision; we branch on the pulled status
      property_id: null,
      is_global: true,                  // one webhook for every NestBook property
      headers: { 'X-Channex-Webhook-Secret': secret },
      is_active: true,
      send_data: true,
    });
    console.log(`[channex] global webhook registered → ${callbackUrl} (id ${created?.id})`);
    res.json({ ok: true, id: created?.id, callbackUrl });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message });
  }
});

channexAdminRouter.delete('/webhooks/:id', async (req, res) => {
  try {
    await deleteWebhook(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message });
  }
});

// ── Slice CA-1 — Channel API groundwork, read-only debug endpoints ───────────
// See docs/in-progress/channex-channel-api-investigation.md.

channexAdminRouter.get('/adapters', async (_req, res) => {
  try {
    const adapters = await listChannelAdapters();
    res.json({ adapters: Array.isArray(adapters) ? adapters : [] });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message });
  }
});

channexAdminRouter.get('/channels', async (req, res) => {
  const propId = Number(req.query.property_id);
  if (!Number.isInteger(propId)) {
    return res.status(400).json({ error: 'property_id query param is required' });
  }
  const property = db.prepare('SELECT id, name, channex_property_id FROM properties WHERE id = ?').get(propId);
  if (!property) return res.status(404).json({ error: 'Property not found' });
  if (!property.channex_property_id) {
    return res.json({ channels: [], total: 0, notConnected: true });
  }
  try {
    const body = await listChannelsForProperty(property.channex_property_id);
    res.json({ channels: body?.data ?? [], total: body?.meta?.total ?? (body?.data?.length ?? 0) });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message });
  }
});

// ── Slice CA-2 — Booking.com Channel API connect flow ────────────────────────
// See docs/in-progress/channex-channel-api-investigation.md. Debug/Super-Admin
// only, click-through-each-step (no single "just connect it" button) so a
// failure at any step is visible in isolation. Uses Channex's shared public
// staging test hotels (5868189 OBP, 6519420 Standard) — no owner-facing UI,
// no real OTA credentials involved.

// NestBook's own room-plan mappings for a property (Phase 2's existing
// channex_room_mappings) — the debug UI needs these to pick a real
// `rate_plan_id` for the create step. Read-only, local DB only, no Channex call.
channexAdminRouter.get('/room-mappings', (req, res) => {
  const propId = Number(req.query.property_id);
  if (!Number.isInteger(propId)) {
    return res.status(400).json({ error: 'property_id query param is required' });
  }
  const rows = db.prepare(`
    SELECT id, nestbook_ref_type, nestbook_ref_id, channex_room_type_id, channex_rate_plan_id
    FROM channex_room_mappings
    WHERE property_id = ? AND orphaned_at IS NULL
    ORDER BY id
  `).all(propId);
  res.json({ mappings: rows });
});

channexAdminRouter.get('/groups', async (_req, res) => {
  try {
    const body = await listGroups();
    res.json({ groups: body?.data ?? [] });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message });
  }
});

channexAdminRouter.post('/channels/test-connection', async (req, res) => {
  const { channel_code, hotel_id } = req.body ?? {};
  if (!channel_code || !hotel_id) {
    return res.status(400).json({ error: 'channel_code and hotel_id are required' });
  }
  try {
    const result = await testChannelConnection(channel_code, { hotel_id: String(hotel_id) });
    res.json({ result });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

channexAdminRouter.post('/channels/mapping-details', async (req, res) => {
  const { channel_code, hotel_id } = req.body ?? {};
  if (!channel_code || !hotel_id) {
    return res.status(400).json({ error: 'channel_code and hotel_id are required' });
  }
  try {
    const result = await getMappingDetails(channel_code, { hotel_id: String(hotel_id) });
    res.json({ result });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

channexAdminRouter.post('/channels/connection-details', async (req, res) => {
  const { channel_code, hotel_id } = req.body ?? {};
  if (!channel_code || !hotel_id) {
    return res.status(400).json({ error: 'channel_code and hotel_id are required' });
  }
  try {
    const result = await getConnectionDetails(channel_code, { hotel_id: String(hotel_id) });
    res.json({ result });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

// Creates the real Channex channel (POST /channels) AND writes the local
// channex_channels row on success. `rate_plan_id` must genuinely belong to
// the given property's existing channex_room_mappings — never trust a
// client-supplied Channex UUID blind. `group_id` is resolved live (not
// stored anywhere yet — see CA-1 notes): staging currently has exactly one
// group, so more than one is treated as a hard stop rather than a guess.
channexAdminRouter.post('/channels/create', async (req, res) => {
  const {
    property_id, channel_code, hotel_id, title,
    rate_plan_id, room_type_code, rate_plan_code,
    occupancy, pricing_type, primary_occ, readonly,
  } = req.body ?? {};

  const propId = Number(property_id);
  if (!Number.isInteger(propId)) return res.status(400).json({ error: 'property_id is required' });
  if (!channel_code || !hotel_id || !title) {
    return res.status(400).json({ error: 'channel_code, hotel_id, and title are required' });
  }
  if (!rate_plan_id || room_type_code === undefined || rate_plan_code === undefined ||
      occupancy === undefined || !pricing_type) {
    return res.status(400).json({
      error: 'rate_plan_id, room_type_code, rate_plan_code, occupancy, and pricing_type are all required',
    });
  }

  const property = db.prepare('SELECT id, name, channex_property_id FROM properties WHERE id = ?').get(propId);
  if (!property) return res.status(404).json({ error: 'Property not found' });
  if (!property.channex_property_id) {
    return res.status(400).json({ error: 'Property is not connected to Channex.' });
  }

  const mapping = db.prepare(`
    SELECT 1 FROM channex_room_mappings
    WHERE property_id = ? AND channex_rate_plan_id = ? AND orphaned_at IS NULL
  `).get(propId, rate_plan_id);
  if (!mapping) {
    return res.status(400).json({ error: "rate_plan_id does not belong to this property's channex_room_mappings." });
  }

  try {
    const groupResult = await resolveSingleGroupId();
    if (groupResult.error) return res.status(502).json({ error: groupResult.error });
    const groupId = groupResult.groupId;

    const created = await createChannel({
      channel: channel_code,
      group_id: groupId,
      title,
      properties: [property.channex_property_id],
      settings: { hotel_id: String(hotel_id) },
      rate_plans: [{
        rate_plan_id,
        settings: {
          room_type_code,
          rate_plan_code,
          occupancy: Number(occupancy),
          pricing_type,
          primary_occ: primary_occ ?? true,
          readonly: readonly ?? false,
        },
      }],
    });

    const channexChannelId = created?.id;
    if (!channexChannelId) {
      return res.status(502).json({ error: 'Channex did not return a channel id.', raw: created });
    }

    db.prepare(`
      INSERT INTO channex_channels (property_id, channex_channel_id, channex_group_id, channel_code, title, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(propId, channexChannelId, groupId, channel_code, title, created?.is_active ? 1 : 0);

    console.log(`[admin] Channel API channel created for property #${propId} (${property.name}) → ${channexChannelId} (${channel_code})`);
    res.status(201).json({ channel: created });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

channexAdminRouter.post('/channels/:channelId/check-readiness', async (req, res) => {
  try {
    const result = await checkChannelReadiness(req.params.channelId);
    res.json({ result });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

channexAdminRouter.post('/channels/:channelId/activate', async (req, res) => {
  try {
    const result = await activateChannel(req.params.channelId);
    db.prepare(`UPDATE channex_channels SET is_active = 1, updated_at = datetime('now') WHERE channex_channel_id = ?`)
      .run(req.params.channelId);
    res.json({ result });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

// Generic single-channel fetch — channel-agnostic, reused by both the
// Airbnb callback (below) and the debug UI to poll/confirm current state.
channexAdminRouter.get('/channels/:channelId', async (req, res) => {
  try {
    const channel = await getChannel(req.params.channelId);
    res.json({ channel });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

// ── Slice CA-3 — Airbnb OAuth connect flow ────────────────────────────────────
// See docs/in-progress/channex-channel-api-investigation.md §1.3/§2.2. The
// public callback (GET /api/channex/airbnb/callback, below on channexRouter,
// NOT this admin router) is the only piece that can't require a Super Admin
// session — the browser returns from Airbnb/Channex with no way to carry one.
// Everything before and after that hop is Super-Admin-gated debug tooling,
// same as CA-1/CA-2.

const OAUTH_LINK_STALE_HOURS = 4; // link itself expires after 2h per Channex's docs

function sweepStaleOauthLinks() {
  db.prepare(`DELETE FROM channex_channel_oauth_links WHERE created_at < datetime('now', ?)`)
    .run(`-${OAUTH_LINK_STALE_HOURS} hours`);
}

channexAdminRouter.post('/airbnb/connection-link', async (req, res) => {
  const propId = Number(req.body?.property_id);
  if (!Number.isInteger(propId)) return res.status(400).json({ error: 'property_id is required' });

  const property = db.prepare('SELECT id, name, channex_property_id FROM properties WHERE id = ?').get(propId);
  if (!property) return res.status(404).json({ error: 'Property not found' });
  if (!property.channex_property_id) {
    return res.status(400).json({ error: 'Property is not connected to Channex.' });
  }

  try {
    const groupResult = await resolveSingleGroupId();
    if (groupResult.error) return res.status(502).json({ error: groupResult.error });

    sweepStaleOauthLinks();

    const token = randomUUID();
    db.prepare(`
      INSERT INTO channex_channel_oauth_links (token, property_id, user_id, channel_code)
      VALUES (?, ?, ?, 'AirBNB')
    `).run(token, propId, req.user?.userId ?? null);

    // Browser-mediated redirect, not a server-to-server call (Channex's own
    // auth_redirect exchanges the code and redirects the BROWSER back here) —
    // unlike the webhook receiver, this does NOT need to be a public HTTPS
    // origin reachable by Channex's servers; it only needs to be reachable by
    // whoever's browser is doing the connecting, so a local dev origin is
    // fine for debug testing.
    const base = `${req.protocol}://${req.get('host')}`;
    const callbackUrl = `${base}/api/channex/airbnb/callback`;

    const link = await generateAirbnbConnectionLink({
      group_id: groupResult.groupId,
      properties: [property.channex_property_id],
      redirect_uri: `${callbackUrl}?token=${encodeURIComponent(token)}`,
      failure_redirect_uri: `${callbackUrl}?token=${encodeURIComponent(token)}`,
      token,
    });

    res.json({ url: link?.attributes?.url ?? link?.url ?? null, token, raw: link });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

channexAdminRouter.post('/channels/:channelId/airbnb/listings', async (req, res) => {
  try {
    const result = await listAirbnbListings(req.params.channelId);
    res.json({ result });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

channexAdminRouter.post('/channels/:channelId/airbnb/listing-details', async (req, res) => {
  const { listing_id } = req.body ?? {};
  if (!listing_id) return res.status(400).json({ error: 'listing_id is required' });
  try {
    const result = await getAirbnbListingDetails(req.params.channelId, listing_id);
    res.json({ result });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});

channexAdminRouter.post('/channels/:channelId/airbnb/mappings', async (req, res) => {
  const { property_id, rate_plan_id, listing_id } = req.body ?? {};
  const propId = Number(property_id);
  if (!Number.isInteger(propId)) return res.status(400).json({ error: 'property_id is required' });
  if (!rate_plan_id || !listing_id) {
    return res.status(400).json({ error: 'rate_plan_id and listing_id are both required' });
  }

  const mapping = db.prepare(`
    SELECT 1 FROM channex_room_mappings
    WHERE property_id = ? AND channex_rate_plan_id = ? AND orphaned_at IS NULL
  `).get(propId, rate_plan_id);
  if (!mapping) {
    return res.status(400).json({ error: "rate_plan_id does not belong to this property's channex_room_mappings." });
  }

  try {
    const result = await createAirbnbMapping(req.params.channelId, { ratePlanId: rate_plan_id, listingId: listing_id });
    res.status(201).json({ result });
  } catch (e) {
    res.status(e instanceof ChannexError && e.status ? 502 : 500).json({ error: e.message, details: e.details ?? null });
  }
});
