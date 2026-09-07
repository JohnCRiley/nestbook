# payment_status ↔ stripe_payment_status sync

**Trigger:** live booking id 241 / property 97 — `stripe_payment_status = 'paid'`
(verified against Stripe dashboard, payment succeeded 5 Sept) but
`payment_status` still `'unpaid'`. Caused a genuinely-paid booking to read as
unpaid in the owner UI.

## Confirmed facts (do not re-investigate)

### The two columns
- `bookings.payment_status` — `TEXT DEFAULT 'unpaid'`, schema.js:1582
  ("WP payment tracking columns"). Observed values: **only `'unpaid'` and
  `'paid'`** — binary, no `partial`/`refunded`/etc anywhere in the codebase.
  `bookings.paid_at` (TEXT, nullable) is its companion timestamp.
- `bookings.stripe_payment_status` — `TEXT` (null default), schema.js:1920.
  Values: `null` → `'pending'` (payment-link created) → `'paid'`.
- They are **not** independent state machines — `payment_status` has no deposit/
  balance semantics (that's `deposit_paid` / `balance_paid`, separate columns
  and separate flow). It is a plain "has this booking been settled" flag.

### Who sets `payment_status = 'paid'` (before this fix)
- **Only** `POST /api/bookings/:id/mark-paid` (bookings.js:1649) — WP,
  `status = 'checked_out'`, owner/reception manual action, sets
  `payment_status='paid', paid_at=<ISO now>` and fires the receipt email.
- `mark-paid-full` (bookings.js:1400, deposit+balance shortcut) does **not**
  touch `payment_status` — it only sets `deposit_paid`/`balance_paid`.

### Who reads `payment_status`
- Server: `mark-paid` guard (bookings.js:1644); nowhere else. **reports.js /
  revenue / `/api/bookings/counts` do NOT read it.**
- Client: `BookingPanel.jsx` only — `b.payment_status !== 'paid'` at :1258,
  gating the "Payment outstanding" banner + "Mark as paid — send receipt"
  button vs "Payment received · Receipt sent to guest" (shows `b.paid_at`
  date), for `isWP && b.status === 'checked_out'`.
- So the blast radius of the bug is narrower than first feared (not "everywhere
  revenue is shown"), but it is real: a WP booking paid online sits showing
  "Payment outstanding" with a Mark-as-paid button forever.

### The gap (root cause)
`checkout.session.completed` in `server/routes/stripe.js` — the connected-account
branch (`if (event.account)`) — has 3 sub-branches that each set
`stripe_payment_status = 'paid'` and **never** set `payment_status`:
1. widget confirmed  (was ~stripe.js:732) `status='confirmed'`
2. confirmed_conflict (was ~stripe.js:701)
3. payment-link / recovery (was ~stripe.js:758) `else if (bookingId)`
Plus the webhook fallback `GET /api/widget/verify-session` (widget.js:1141).
None of these had a matching `payment_status` write. That's the whole bug.

### Decision
`payment_status` should **mirror** `stripe_payment_status` once a Stripe payment
succeeds — a successful online payment is the same fact `mark-paid` records
manually. Use the existing value `'paid'` (no new status invented) and set
`paid_at = COALESCE(paid_at, <ISO now>)` (don't stomp an earlier manual mark).

## Changes made this session

- `server/routes/stripe.js` — added `const paidAt = new Date().toISOString();`
  at the top of the `event.account` block; all 3 branches now also set
  `payment_status = 'paid', paid_at = COALESCE(paid_at, ?)`.
- `server/routes/widget.js` — verify-session fallback (~:1141) now sets
  `payment_status = 'paid', paid_at = COALESCE(paid_at, ?)` alongside
  `stripe_payment_status`.
- `backfill-payment-status.mjs` (repo root) — **standalone, DRY-RUN by default**
  one-time backfill. Deliberately NOT in schema.js (would run silently on every
  boot; this touches live payment data and John wants to review rows first).
  `--apply` writes, wrapped in BEGIN/COMMIT. Only sets `payment_status='paid'`
  where `stripe_payment_status='paid' AND payment_status != 'paid'`. Does NOT
  set `paid_at` for historical rows (real payment time unknown; UI tolerates
  NULL paid_at). Does NOT touch deposit_paid/balance_paid/stripe_*.

## Verified locally
- BEGIN/ROLLBACK harness drove `stripeWebhookHandler` with a synthetic
  `checkout.session.completed` (no webhook secret → JSON path): **widget branch
  and payment-link branch both** end with `status` correct + `stripe_payment_status
  = 'paid'` + `payment_status = 'paid'` + `paid_at` set + `stripe_payment_amount`
  correct. Rolled back clean. (Stripe is stubbed locally — see memory
  `stripe-not-configured-locally`.)
- `node --check` clean on both files.
- Backfill dry-run against `server/nestbook.db`: 0 mismatches (local seed DB has
  no Stripe-paid bookings, no booking 241 / property 97 — that data is prod
  only).

## Remaining — John, on production

1. **Report the rows first (don't run silently):**
   ```
   node backfill-payment-status.mjs --db /opt/nestbook/server/nestbook.db
   ```
   (dry run — prints every affected id incl. 241). Sanity-check the list.
2. **Apply:**
   ```
   node backfill-payment-status.mjs --db /opt/nestbook/server/nestbook.db --apply
   ```
   Report the count corrected. Expect booking 241 among them.
3. **Verify 241:** open it in the app → WP checked-out view should now show
   "Payment received" not "Payment outstanding" (or, if not WP/checked_out,
   just confirm `payment_status='paid'` in the DB).
4. **Fresh sandbox payment:** `STRIPE_MODE=test`, run a widget pay-now booking
   through Stripe test checkout → confirm the resulting booking row has BOTH
   `stripe_payment_status='paid'` AND `payment_status='paid'` AND `paid_at` set.
5. Once 3 + 4 are green in prod, **delete this file** and
   `backfill-payment-status.mjs`.

## Known limitation (pre-existing, not worsened)
An owner-generated payment link can be for a *partial* amount (bookings.js:1583,
`amount` is editable). Completing it sets `stripe_payment_status='paid'` today
already — and the PaymentLinkButton already shows "Paid" — so mirroring to
`payment_status='paid'` doesn't introduce a new inaccuracy. `stripe_payment_amount`
still records the actual sum. Flagged only so it isn't mistaken for a regression.

## Ruled out
- Touching `deposit_paid` / `balance_paid` / `deposit_amount` / `balance_amount`
  — different flow, not affected by this root cause (per task scope).
- Putting the backfill in schema.js — rejected, see above.
- `db.transaction()` — not available (node:sqlite); backfill uses raw
  BEGIN/COMMIT/ROLLBACK.
