# Stripe webhook signature verification failures

**Status:** code change shipped (multi-secret support + startup logging). ROOT
CAUSE CONFIRMATION + the actual Connect signing-secret value are manual Stripe
Dashboard / production-`.env` steps — see "Remaining (John)" below.

## Symptom

PM2 error log, repeated back-to-back on webhook receipt:

> Webhook signature error: No signatures found matching the expected signature
> for payload. Are you passing the raw request body you received from Stripe?

Downstream impact already seen: `account.updated` for two live Connect accounts
(`acct_1U7g6MECH1E3rH63`, `acct_1U5oMOEIMcTUX7yW`) never landed → Connect status
stuck `pending` (fixed separately in commit 335cd13, and the new reconcile job
will self-heal those two on next deploy/boot).

## Investigation findings (this session)

### 1. How many webhook handlers / which secret

**Exactly one.** `stripeWebhookHandler` in `server/routes/stripe.js`, mounted in
`server/index.js:89` as `app.post('/api/stripe/webhook', express.raw({type:'*/*'}), handler)`.
`stripeRouter` (mounted at `/api/stripe`, after `requireAuth`) has **no** webhook
route. No `constructEvent` call anywhere else.

Before this change it verified against a **single** secret:
`STRIPE_WEBHOOK_SECRET` (live) / `STRIPE_TEST_WEBHOOK_SECRET` (test).

### 2. Two secrets needed?

**Very likely yes, and only one was configured.** The handler processes both:
- platform events: `customer.subscription.*`, `invoice.payment_*`
- **connected-account events**: `account.updated`, and `checkout.session.completed`
  / `checkout.session.expired` where `event.account` is set

A Stripe account can have a **main-account webhook endpoint** *and* a separate
**"Connected accounts" webhook endpoint**, both pointing at the same URL, each
with its **own** signing secret. Stripe signs each event with the secret of the
endpoint it was delivered from. Verifying every event against just the main
secret makes **every event from the other endpoint** fail with exactly the
observed error. The Connect-account symptom fits: connected-account events fail,
platform billing keeps working (which is why nobody noticed until Connect).

`server/.env` on this machine has Stripe stubbed out ("not in scope"), so the
production `.env` could not be inspected from here. Whether a second endpoint
exists, and its secret, must be read from the live Dashboard.

### 3. Middleware order — **correct, not the cause**

`server/index.js`: `cors()` → `app.post('/api/stripe/webhook', express.raw(...), handler)`
→ **then** `app.use(express.json({limit:'15mb'}))` → static → routers →
`requireAuth`. The raw route is registered before any JSON parser and before
auth; the handler always responds so `express.json` never runs for that path.
`express.raw({type:'*/*'})` hands `constructEvent` the exact Buffer. No
compression / rewrite middleware touches the body. Reviewed, left as-is.

### 4. Nginx — **not the cause** (for the file in-repo)

`server/nginx.conf` `location /api/`: `proxy_request_buffering off`,
`proxy_buffering off`, `proxy_pass` straight to `127.0.0.1:3001`, no `rewrite`,
no `sub_filter`, no request gzip. Body bytes pass through unaltered.
Caveat: this file is `listen 80` only. If production terminates TLS in a
separate 443 server block (certbot) or behind Cloudflare, that layer wasn't
visible here — but plain proxy buffering does not mutate bytes, so this is a
low-probability cause. `sudo nginx -T` on the box would confirm.

## Change made this session (safe, non-guessing, backward-compatible)

`server/routes/stripe.js`:
- New `getWebhookSecrets()` — returns every configured secret:
  live `[STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET]`,
  test `[STRIPE_TEST_WEBHOOK_SECRET, STRIPE_TEST_CONNECT_WEBHOOK_SECRET]`
  (blank/absent filtered out).
- `stripeWebhookHandler` now **tries each configured secret** and accepts the
  event if any verifies; logs which one matched
  (`[stripe] webhook <type> — verified with <VAR> — account=…`). Only 400s when
  **all** fail, with a clearer message listing what was tried.
- Startup logging now prints **both** secrets, masked, with sha256 prefix:
  `[STRIPE] Main webhook secret (STRIPE_WEBHOOK_SECRET): SET (whsec_xxxxx… sha256=…)`
  `[STRIPE] Connect webhook secret (STRIPE_CONNECT_WEBHOOK_SECRET): NOT SET`
  plus a line stating how many secrets will be tried and the route.
- `STRIPE_CONNECT_WEBHOOK_SECRET` is **optional** — unset ⇒ behaviour identical
  to before. No secret value guessed or written. `stripeClient.js` untouched.

`webhook-diag.mjs`: environment block now reports the Connect secret var too.

Verified locally: 9/9 assertions (a `Stripe` instance signing test events) —
main-signed and connect-signed events both verify when both secrets are present;
a connect-signed event **fails with only the main secret** (reproduces the
reported bug); rogue-signed rejected; main-only path unchanged (no regression);
`getWebhookSecrets()` env parsing. Startup log lines confirmed by booting the
module.

## Remaining (John — needs live Dashboard + prod server)

1. **Confirm the cause.** Dashboard → Developers → Webhooks. Is there a separate
   endpoint listening on **"Events on Connected accounts"** as well as the main
   one? Note each endpoint's URL and "Signing secret" (click *Reveal*).
2. If yes: on the prod box add to `/opt/nestbook/server/.env`:
   `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_…` (the **Connected accounts** endpoint's
   secret — do NOT reuse the main one), then `pm2 restart nestbook-api`.
   Startup log should then show both secrets SET and "try 2 secret(s)".
   - If instead the *main* secret on the box is simply wrong (sha256 in the
     startup log ≠ Dashboard), fix `STRIPE_WEBHOOK_SECRET` — same restart.
3. Run `node --env-file=server/.env webhook-diag.mjs` on the box — confirms which
   secrets are loaded and that the SDK verifies them.
4. Dashboard → each endpoint → **Send test webhook** (do one from the main
   endpoint and one from the Connect endpoint). PM2 log should show
   `verified with STRIPE_WEBHOOK_SECRET` and `verified with STRIPE_CONNECT_WEBHOOK_SECRET`
   respectively, **no** signature error for either.
5. Also resend a couple of the recent failed live `account.updated` events for
   the two stuck accounts (or just let the reconcile job fix them).
6. Sanity-check nginx once: `sudo nginx -T | grep -B2 -A25 "listen 443"` — confirm
   `/api/` has `proxy_request_buffering off` there too (or that TLS is fronted by
   Cloudflare, in which case check Cloudflare isn't buffering/altering POST bodies).

## Ruled out / not changed

- Middleware order (correct), `express.raw` type (`*/*` is fine), `stripeClient.js`
  (untouched), any secret **value** (not touched — awaiting Dashboard).
- `db.transaction()` — n/a here.

## When done

Delete this file (or move to `docs/completed/`) once steps 1–5 are verified in
production.
