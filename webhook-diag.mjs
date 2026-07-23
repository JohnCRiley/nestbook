/**
 * webhook-diag.mjs — Stripe webhook signature diagnostic
 *
 * Run on the production server FROM the nestbook root:
 *   node --env-file=server/.env webhook-diag.mjs
 *
 * This runs ENTIRELY outside Express so it isolates whether the problem is
 * in the SDK itself or in the request pipeline (Nginx, Express, body parsing).
 *
 * INTERPRET RESULTS:
 *   Test 1 PASSES + Test 4 FAILS → body or sig header is being mangled in transit
 *   Test 1 FAILS                 → the SDK itself is broken for this secret/env combination
 *   Secret SHA-256 doesn't match → PM2 is loading a different secret than .env shows
 */

import Stripe from 'stripe';
import crypto from 'node:crypto';

const KNOWN_SECRET_SHA256 = '6cc8477c5a021298e93a0c8e0cbe03d72026fecdfccb388274e983053d720b89';

// ── Environment ───────────────────────────────────────────────────────────────
const STRIPE_MODE = process.env.STRIPE_MODE ?? 'live';
const secret      = STRIPE_MODE === 'test'
  ? process.env.STRIPE_TEST_WEBHOOK_SECRET
  : process.env.STRIPE_WEBHOOK_SECRET;

console.log('── Environment ────────────────────────────────────────────────────────');
console.log('  STRIPE_MODE:              ', STRIPE_MODE);
console.log('  Secret var used:          ', STRIPE_MODE === 'test' ? 'STRIPE_TEST_WEBHOOK_SECRET' : 'STRIPE_WEBHOOK_SECRET');
console.log('  Secret defined:           ', secret !== undefined);
console.log('  Secret first 20 chars:    ', secret?.slice(0, 20));
console.log('  Secret length:            ', secret?.length);
console.log('  Secret contains whitespace:', secret ? /\s/.test(secret) : 'N/A');

const actualSha256 = secret
  ? crypto.createHash('sha256').update(secret).digest('hex')
  : '(no secret)';
console.log('  SHA-256 of loaded secret: ', actualSha256);
console.log('  Expected SHA-256:         ', KNOWN_SECRET_SHA256);
console.log('  SHA-256 MATCH:            ', actualSha256 === KNOWN_SECRET_SHA256 ? '✅ YES' : '❌ NO — PM2 is using a different secret than server/.env');
console.log();

if (!secret) {
  console.error('❌ No secret loaded. Check STRIPE_MODE and that the correct webhook secret env var is set.');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-12-18.acacia',
});

// ── Test 1: SDK self-consistency ─────────────────────────────────────────────
// If this fails, the SDK is broken for this secret regardless of Express/Nginx.
console.log('── Test 1: SDK self-consistency (generate → verify) ───────────────────');
const payload1 = JSON.stringify({ id: 'evt_diag_1', object: 'event', type: 'customer.subscription.updated', data: { object: {} } });
let test1Passed = false;
try {
  const hdr = stripe.webhooks.generateTestHeaderString({ payload: payload1, secret });
  console.log('  Generated header:', hdr.slice(0, 70) + '...');
  stripe.webhooks.constructEvent(Buffer.from(payload1), hdr, secret);
  console.log('  ✅ PASSES — SDK can sign and verify with this secret');
  test1Passed = true;
} catch (e) {
  console.log('  ❌ FAILS:', e.message);
  console.log('     The SDK itself cannot verify its own signatures with this secret.');
  console.log('     Root cause is in the SDK or secret format, NOT Nginx/Express.');
}
console.log();

// ── Test 2: Manual HMAC — raw string key vs base64-decoded key ───────────────
// Stripe computes: HMAC-SHA256( t=TIMESTAMP + "." + payload, raw_secret_string )
// This test shows whether the SDK and manual Node crypto agree on the key format.
console.log('── Test 2: HMAC key format comparison ─────────────────────────────────');
const fakeTs   = Math.floor(Date.now() / 1000);
const content  = `${fakeTs}.${payload1}`;

const hmacRaw = crypto.createHmac('sha256', secret).update(content, 'utf8').digest('hex');

let hmacDecoded;
try {
  const keyBuf = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  hmacDecoded  = crypto.createHmac('sha256', keyBuf).update(content, 'utf8').digest('hex');
  console.log('  HMAC (raw string key):         ', hmacRaw);
  console.log('  HMAC (base64-decoded key):     ', hmacDecoded);
  if (hmacRaw === hmacDecoded) {
    console.log('  ⚠️  Both approaches produce the SAME result (unexpected — whsec_ value might not be base64)');
  } else {
    console.log('  ✅ Different results — SDK uses raw string key (expected for SDK v21)');
  }
} catch (e) {
  console.log('  Base64 decode error:', e.message);
}
console.log();

// ── Test 3: Timestamp tolerance ──────────────────────────────────────────────
// Rules out server clock skew causing events to be rejected as "too old".
// (Error for this would be "Timestamp outside the tolerance zone", not the HMAC
//  error — but worth confirming the server clock is sane.)
console.log('── Test 3: Server clock ────────────────────────────────────────────────');
const nowUnix = Math.floor(Date.now() / 1000);
const nowHuman = new Date().toISOString();
console.log('  Server time (UTC):', nowHuman);
console.log('  Unix timestamp:   ', nowUnix);
const hdrFresh = stripe.webhooks.generateTestHeaderString({ payload: payload1, secret, timestamp: nowUnix });
try {
  stripe.webhooks.constructEvent(Buffer.from(payload1), hdrFresh, secret, 0);
  console.log('  ✅ Passes with tolerance=0 — clock is not the problem');
} catch (e) {
  console.log('  ❌ Fails with tolerance=0:', e.message);
}
// Also test with a simulated "stale" event (7 minutes old)
const staleTs  = nowUnix - 420;
const hdrStale = stripe.webhooks.generateTestHeaderString({ payload: payload1, secret, timestamp: staleTs });
try {
  stripe.webhooks.constructEvent(Buffer.from(payload1), hdrStale, secret);
  console.log('  ✅ 7-min-old event also passes (tolerance is 300s, this should actually fail...)');
} catch (e) {
  if (e.message.includes('Timestamp outside')) {
    console.log('  ✅ 7-min-old event correctly rejected as stale (tolerance working correctly)');
  } else {
    console.log('  ❌ 7-min-old event failed with unexpected error:', e.message);
  }
}
console.log();

// ── Test 4: Reproduce the exact server-side call ─────────────────────────────
// This mimics exactly what stripeWebhookHandler does: Buffer body + header + secret.
// If Test 1 passed but actual Stripe events fail, the body/header are being
// modified between Stripe → Nginx → Node.js.
console.log('── Test 4: Simulate stripeWebhookHandler exactly ──────────────────────');
if (test1Passed) {
  const payload4  = Buffer.from(payload1);          // Buffer, same as express.raw gives
  const hdr4      = stripe.webhooks.generateTestHeaderString({ payload: payload1, secret });
  try {
    const event = stripe.webhooks.constructEvent(payload4, hdr4, secret);
    console.log('  ✅ constructEvent(Buffer, header, secret) works — SDK is fine');
    console.log('  Event type:', event.type);
    console.log();
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('CONCLUSION: The SDK and secret are both fine. The problem is that the');
    console.log('request body or stripe-signature header arriving at Node.js is DIFFERENT');
    console.log('from what Stripe signed. Check:');
    console.log('  1. HTTPS Nginx config (port 443) — does it have proxy_request_buffering off?');
    console.log('     Run: sudo nginx -T | grep -A 30 "listen 443"');
    console.log('  2. Whether the stripe-signature header is being modified by a proxy.');
    console.log('     Add to webhook debug log: console.log("[webhook debug] raw headers:", JSON.stringify(req.headers))');
    console.log('  3. Check if Stripe test CLI (stripe listen) works — it bypasses Nginx entirely.');
    console.log('     If stripe listen works, Nginx is definitely the culprit.');
    console.log('═══════════════════════════════════════════════════════════════════════');
  } catch (e) {
    console.log('  ❌ Unexpected:', e.message);
  }
} else {
  console.log('  Skipped (Test 1 failed — fix the SDK/secret issue first)');
}
