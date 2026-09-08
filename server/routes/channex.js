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
import { fetchRevision, syncReservationFromRevision } from '../utils/channexInboundSync.js';
import {
  createWebhook, listWebhooks, deleteWebhook, ChannexError,
} from '../utils/channexClient.js';

export const channexRouter = Router();

const BOOKING_EVENTS = new Set([
  'booking', 'booking_new', 'booking_modification', 'booking_cancellation',
]);

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
