# Owner-facing "Connect to Channel Manager" panel (Settings, Multi plan only)

**Goal:** give Multi-plan owners a one-click connect/disconnect for Channex
directly from Settings, for Channex certification Stage 4 live testing (demo
of the real owner workflow). Reuses all existing Channex business logic —
no new Channex/DB logic, just an owner-facing route + a Settings panel.

## Confirmed facts (don't re-check)

- **Super Admin's existing Channex routes** (`server/routes/admin.js`,
  mounted under `requireSuperAdminSession`):
  - `POST /api/admin/properties/:id/channex-create` (~L732) — calls
    `createChannexProperty(property)` (`server/utils/createChannexProperty.js`),
    stores `channex_property_id`. 409 if already connected.
  - `POST /api/admin/properties/:id/channex-push` (~L785) — calls
    `pushInitialInventory(property)` (`server/utils/channexPushInventory.js`).
    400 if not connected yet, 409 if `channex_room_mappings` rows already
    exist, 422 if no bookable rooms.
  - `POST /api/admin/properties/:id/channex-disconnect` (~L852) — calls
    `disconnectChannexProperty(property)` (same file). Pure DB, NO Channex API
    call — clears `channex_property_id` + deletes `channex_room_mappings`
    rows. Channex-side objects left intact by design (standing rule since
    slice 8, never auto-destroy OTA-side history).
  - `client/src/admin/pages/Properties.jsx` — the UI these back. "Connected" =
    `channex_property_id` is set (regardless of mapping count).
- **Plan lives on `users.plan`** (`'free' | 'pro' | 'multi'`), not on
  `properties`. Fetched client-side via `usePlan()` hook
  (`client/src/hooks/usePlan.js`) → `GET /api/stripe/subscription`. Existing
  Multi-only gating pattern in Settings.jsx: `plan === 'multi'` (e.g. L950
  Multi-property panel, L1792 Service Categories).
- **Ownership check pattern** (`server/routes/properties.js`, `canAccess()`
  ~L120): owner role validated via `properties.owner_id === userId`
  (+ legacy `users.property_id` fallback). Existing property-scoped owner
  routes all do `canAccess(req.user.userId, req.user.role, propId)` +
  `req.user.role !== 'owner'` checks (e.g. `POST /api/properties` L202-210
  does exactly this plus a `user.plan !== 'multi'` check — same shape reused
  here).
- **`property` state in Settings.jsx** (L122, set via
  `GET /api/properties/:id`, `SELECT *`) already includes
  `channex_property_id` — no new GET endpoint needed to know connect status.
- **i18n**: `t()` (`client/src/i18n/LocaleContext.jsx`) falls back to the
  English string keyed in `client/src/i18n/index.js`'s giant `LANGS.en` dict,
  or the raw key if missing anywhere — no crash on a missing key, but ugly.
  Decision: **hardcoded English strings for this panel**, not `t()` keys —
  matches the task's own framing ("not a real feature launch yet", no
  beta/temporary chrome) and avoids touching the multi-language dict for a
  cert-demo-only surface. Same pattern already used for the loadError screen
  in `LocaleContext.jsx` (hardcoded, not translated).

## Decisions

- New owner-facing routes live in `server/routes/properties.js` (not a new
  file) — sits next to `canAccess()` and every other property-scoped owner
  route.
- `POST /api/properties/:id/channex-connect` — combines create+push into one
  call (owner's single button = both Super Admin buttons in sequence). Guards
  mirror admin.js's own guards (skip create if already connected, 409 if
  mappings already exist). Server-side plan/ownership check is NOT just a
  client-side gate — enforced independently since the route is real.
- `POST /api/properties/:id/channex-disconnect` — thin wrapper around
  `disconnectChannexProperty()`, same guard as admin.js.
- Both call the exact same underlying utils as admin.js
  (`createChannexProperty`, `pushInitialInventory`, `disconnectChannexProperty`,
  `ChannexError`) — zero duplicated Channex/DB logic. admin.js is untouched.
- Audit log: same `action` values (`CHANNEX_PROPERTY_CREATED`,
  `CHANNEX_INVENTORY_PUSHED`, `CHANNEX_DISCONNECTED`), `category: 'owner'`
  instead of `'admin'`, detail string suffixed "— via Settings" so the audit
  trail distinguishes the trigger source.
- Settings.jsx: new panel inserted as the very first child of the left column
  `<div>` (L635), above the sample-data banner and Property Details — gated
  `user?.role === 'owner' && plan === 'multi'`.

## Files touched

- `server/routes/properties.js` — new imports + 2 new routes.
- `client/src/pages/Settings.jsx` — new panel + state.

## Verified (2026-09-14)

- **Build:** `cd client && npm run build` clean, `node --check` clean on
  `server/routes/properties.js`.
- **Real Channex round-trip** (curl + a manually-signed JWT for user #3
  `dev@test.example`, plan `multi`, owns property #3 "Dev Test Inn", 0 rooms —
  chosen specifically because it was NOT connected and has no Phase 2 history
  to disturb, unlike property #1 `a50e441f`):
  - `POST /api/properties/3/channex-connect` → create step succeeded (real
    Channex staging property `d904e894-9550-4d9d-9b73-d26ed8b8c11e` created,
    `properties.channex_property_id` set), push step correctly 422'd
    ("no bookable rooms/units/categories" — property 3 has 0 real rooms).
  - `POST /api/properties/3/channex-disconnect` → 200, cleared
    `channex_property_id`, 0 mappings deleted (none existed). Property 3
    confirmed back to `channex_property_id: null` — exact original state.
    The now-orphaned empty Channex property `d904e894…` is John's to remove
    manually (same standing convention as every other Phase 2 test artifact).
  - Second disconnect → 400 "not connected" (idempotency guard works).
- **Auth/plan gating** (curl):
  - Free-plan owner (demo user #73) on their own property → 403 "A Multi plan
    is required to use Channel Manager."
  - Multi-plan owner (#3) on a property they don't own (#2) → 403
    "Access denied."
- **UI** (Browser pane, demo user logged in via `demo@nestbook.io`/`demo1234`,
  plan flipped with Settings' own dev-only Plan Switcher):
  - Multi plan → panel renders at the very top of the left column, above
    Property Details, showing "Disconnect" (property #1 is already
    Channex-connected from Phase 2 testing) — did NOT click it, to avoid
    disturbing property #1's real mapping history.
  - Free plan → panel absent entirely (not greyed out), confirmed via
    screenshot.
  - No new console/network errors attributable to this change (pre-existing
    unrelated 403/500 noise from Stripe-not-configured / analytics, confirmed
    by `read_network_requests` showing zero channex-related failures).
- **Super Admin surface untouched:** `git diff --stat` shows only
  `client/src/pages/Settings.jsx` and `server/routes/properties.js` changed —
  `server/routes/admin.js` and `client/src/admin/pages/Properties.jsx` are
  byte-for-byte unmodified.

## Remaining steps

- Commit + push to main.
- Feature is demo-ready for Channex certification Stage 4. Delete this file
  (or move to `docs/completed/`) once John confirms the live demo works.

## Ruled out

- No new backend business logic — everything routes through existing
  `channexPushInventory.js` / `createChannexProperty.js` functions.
- No plan gating framework changes — reuses the existing `plan === 'multi'`
  pattern verbatim.
- No i18n dict changes (see decision above).
