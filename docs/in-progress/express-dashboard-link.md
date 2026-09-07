# Stripe Express Dashboard link for Connect owners

**Goal:** let active-Connect owners open their own Stripe Express Dashboard
(balance / payouts / payment history) from inside NestBook, so support no longer
has to check the platform account for them.

## Confirmed facts (do not re-investigate)

- **The endpoint already existed**: `POST /api/stripe/connect/dashboard-link`
  ([server/routes/stripe.js](server/routes/stripe.js) ~:487) — calls
  `stripe.accounts.createLoginLink(accountId)`, returns `{ url }`. It was NOT
  gated on `stripe_connect_status` (only checked the account id existed).
- **A button already existed** on the Billing page — `handleManage()` in
  `StripeConnectCard` ([client/src/pages/Billing.jsx](client/src/pages/Billing.jsx)),
  labelled `billing.manageOnStripe` ("Manage on Stripe"), `window.open(url, '_blank')`.
  Same destination (Express Dashboard home — `createLoginLink` has only one).
- **Onboarding return URL** is `/app/billing?connect=success` (set in
  `connect/start`, stripe.js ~:463). There was NO success/confirmation UI — the
  Billing page just stripped the query param. So "immediately after onboarding"
  = a new confirmation state on the Billing page keyed off that param.
- `connect/status` returns `{ connected, status, detailsSubmitted }`;
  `isActive = status?.status === 'active'`.
- i18n lives in [client/src/i18n/index.js](client/src/i18n/index.js), 5 blocks
  (en ~1256 / fr ~2853 / es ~4448 / de ~6043 / nl ~7695). The `.json` files in
  that dir are a separate partial language set with no `billing.*` keys — not
  touched.
- CSS vars: `--light-green` (an off-white, themed), `--accent`, `--text-primary`,
  `--text-muted`, `--card-bg`. No `--success`.

## Changes made (all on `main`, one commit)

### Backend — [server/routes/stripe.js](server/routes/stripe.js)
`connect/dashboard-link` now also SELECTs `stripe_connect_status` and returns
`400 "Connected account is not active yet"` unless it's `'active'`. Link still
generated fresh every call, never stored.

### Frontend — [client/src/pages/Billing.jsx](client/src/pages/Billing.jsx)
- `Billing()` captures `?connect=success` into `justOnboarded` state (before the
  existing param-strip), passes it to `<StripeConnectCard justOnboarded=… />`.
- New `DashboardLink` sub-component = the "View Stripe dashboard" button (reuses
  `handleManage`) + the explanatory line (`billing.stripeDashboardHint`).
- In the `isActive` block: `manageOnStripe` button replaced by `DashboardLink`.
  When `justOnboarded`, `DashboardLink` is wrapped in a highlighted
  `.billing-connect-done` callout with a `billing.connectDoneTitle` heading.
- Both placements are inside `isActive` ⇒ never shown for pending/disconnected.

### CSS — [client/src/index.css](client/src/index.css)
`.billing-connect-hint` and `.billing-connect-done` (+ `h4`), all CSS-var colours.

### i18n — 3 new keys × 5 languages (replaced the now-unused `billing.manageOnStripe`)
`billing.viewStripeDashboard`, `billing.stripeDashboardHint`,
`billing.connectDoneTitle`.

## Verified locally (2026-09-08)

- Backend: `dashboard-link` → 400 "not active" when status pending; passes the
  guard (then 500 only because Stripe is stubbed locally — see memory
  `stripe-not-configured-locally`) when active.
- Frontend (demo owner, connect row temporarily forced active in dev DB, then
  reverted): permanent button + hint render in the active card; the
  `?connect=success` callout ("Stripe connected — you're all set" + button +
  hint) renders only when active; pending account with `?connect=success` shows
  neither. Screenshot confirmed for EN; fr/es/de/nl confirmed via DOM text.
- `npm run build --workspace=client` clean. `node --check` clean.

## Remaining — John, after deploy (needs real Stripe)

1. Log in as an owner with an **active** Connect account → Billing → click
   **View Stripe dashboard** → confirm it opens a working Express Dashboard
   session in a new tab.
2. Complete a sandbox Connect onboarding (`STRIPE_MODE=test`) → on return to
   `/app/billing?connect=success`, if the account is already active, confirm the
   "Stripe connected — you're all set" callout with the working link appears.
   (If Stripe verification is still pending on return, the callout correctly
   does not show — the permanent card button covers it once active. Known/expected.)
3. Confirm a **pending** Connect owner sees no dashboard link anywhere and the
   endpoint 400s for them.
4. Spot-check the button label + hint in all 5 languages in the live app.

Delete this file once 1–4 are green in production.

## Ruled out
- A second/separate "View dashboard" button alongside "Manage on Stripe" —
  `createLoginLink` has one destination; repurposed the existing button instead.
- Touching the `.json` i18n files — no `billing.*` keys there.
- `db.transaction()` — n/a (single SELECT).
