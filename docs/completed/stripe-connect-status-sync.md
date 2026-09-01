# Stripe Connect status sync — account.updated hardening

**Status:** code complete, locally verified. Production verification steps below are John's to run after deploy.

## The bug

`users.stripe_connect_status` could stay permanently `'pending'` after Stripe's
own account was fully Enabled (charges + payouts + details all active).
Confirmed live on user 86 / `acct_1U7g6MECH1E3rH63`: Stripe Dashboard "Enabled",
our DB `stripe_connect_status='pending'`, `stripe_connect_details_submitted=0`.

Downstream impact: the widget booking flow trusts the stored status
(`widget.js` checks `stripe_connect_status === 'active'`), so a stuck `'pending'`
made it skip Stripe Checkout and silently auto-confirm bookings with no payment.

## Root cause (evidence)

The old handler did `status = account.charges_enabled ? 'active' : 'pending'`.
The July guard (commit 9059d2f) only ever **suppresses downgrades** — it never
blocks an upgrade. So if *any* `account.updated` with `charges_enabled=true` had
been processed, the row would have flipped to `'active'`. It didn't, and
`details_submitted` was still `0`, meaning **no `account.updated` event for this
account was ever successfully processed** — i.e. a missed / silently-failed
webhook delivery, not the downgrade-race logic.

(Could not confirm from Stripe Dashboard webhook logs directly — no dashboard
access from this environment. John: check Developers → Webhooks → the Connect
endpoint → delivery attempts for `acct_1U7g6MECH1E3rH63`.)

Secondary latent bug found while in there: the handler never read
`payouts_enabled` and didn't require `details_submitted` for `'active'`. An
account with `charges_enabled=true` but payouts still under review would have
been marked `'active'` prematurely.

## The fix

### 1. `server/lib/connectStatus.js` (new) — `applyConnectAccountState()`

Single shared evaluator used by both the webhook and the reconciliation job:

- `'active'` **only** when `charges_enabled && payouts_enabled && details_submitted`
  are all true — never a partial subset.
- Never downgrades an already-`'active'` account from an incoming event
  (events arrive out of order). If one tries, logs a `console.warn` with the
  full flag breakdown — **not** silently swallowed.
- `stripe_connect_details_submitted` is ratcheted up only (1 stays 1) so a
  stale event can't flip the Billing-page flag back off.
- Idempotent: re-delivering the same event is a no-op.

### 2. `server/routes/stripe.js` — `account.updated` case

Now just calls `applyConnectAccountState(connectUser, account, 'webhook')`.
SELECT widened to also fetch `stripe_connect_details_submitted`.

### 3. `server/schedulers/connectStatusReconcile.js` (new)

`reconcilePendingConnectAccounts()` — safety net for missed webhooks. Every
non-`'active'` Connect account is spot-checked against
`stripe.accounts.retrieve()`; if Stripe reports it fully enabled it's upgraded
via the same shared evaluator. Corrects drift only, logs every correction,
notifies nobody. Wired into `server/index.js` startup: runs on boot then every
6 hours.

## Files touched

- `server/lib/connectStatus.js` (new)
- `server/schedulers/connectStatusReconcile.js` (new)
- `server/routes/stripe.js` (import + `account.updated` case)
- `server/index.js` (import + boot/interval wiring)
- `server/lib/stripeClient.js` — **not modified** (reviewed only)

## Ruled out

- Rewriting the handler to always `accounts.retrieve()` instead of trusting the
  event payload — the task asked to evaluate from the incoming event; the
  never-downgrade guard + reconciliation job cover ordering/missed deliveries.
- Any `db.transaction()` — node:sqlite; not needed here (single UPDATE).
- Emailing owners on reconciliation correction — explicitly out of scope.

## Local verification (done)

10/10 assertions passed in a BEGIN/ROLLBACK harness against the dev DB:
partial-progress stays pending, charges-without-payouts stays pending (the
original bug), all-three flips to active, idempotent re-delivery, and stale
out-of-order events cannot downgrade an active account or clear the details flag.

Could not trigger a real `account.updated` in Stripe test mode — Stripe keys are
not configured in this local env (`server/.env`: "Stripe not in scope").

## Production verification — John's steps after deploy

1. Stripe test mode: `stripe trigger account.updated` (or complete a sandbox
   onboarding) and confirm the row goes `pending → active` only when all three
   flags are true; check logs for the `status pending → active (webhook)` line.
2. Re-send an earlier, less-complete `account.updated` from the Dashboard and
   confirm the `⚠️ would downgrade active → pending ... Suppressed` warning fires
   and the row stays `'active'`.
3. Fix the stuck live account:
   `UPDATE users SET stripe_connect_status='active', stripe_connect_details_submitted=1 WHERE id=86;`
   (or just deploy and let the boot-time reconciliation job correct it — watch
   for `[connect-reconcile] Corrected user 86 ...`).
4. Drift check — run against the live DB and compare each row to the Stripe
   Dashboard status:
   `SELECT id, email, stripe_connect_account_id, stripe_connect_status FROM users WHERE stripe_connect_account_id IS NOT NULL;`
