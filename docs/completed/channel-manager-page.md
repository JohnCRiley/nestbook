# Dedicated "Channel Manager" page (nav item, gated by addon + plan)

**Shipped 2026-09-15.** Replaces the earlier Settings "Connect to Channel
Manager" card (docs/in-progress/channex-owner-settings-panel.md, now deleted —
fully superseded) with its own nav item + page, and adds real visibility
(mapping status, sync activity) that Settings never had.

## What was built

1. **Gating flag** — `users.has_channel_manager_addon` (INTEGER DEFAULT 0),
   exact same pattern as `has_charges_addon`: included in `/api/auth/me`'s
   SELECT, flippable via the existing dev-only `PATCH /api/auth/dev/switch-plan`
   endpoint, checkbox added next to "Charges & Bar add-on" in Settings' Dev
   Tools panel. **No Stripe/billing wiring** — deliberately out of scope per
   the task (billing for this add-on doesn't exist yet), matches the
   established "don't over-engineer gating ahead of real billing work"
   instruction.
2. **Nav item + route**: `client/src/components/Sidebar.jsx` — new
   `channelManager` entry (positioned between Billing and Settings),
   `ownerOnly: true`, gated by a new `requiresChannelManagerAddon` flag via
   `canSeeChannelManager()`: visible only when `has_channel_manager_addon` is
   true **AND** plan is `pro` or `multi` (an AND, not charges' OR pattern —
   this was a deliberate spec difference, confirmed against the task text).
   **Confirmed with John: no-addon state hides the nav item entirely, no
   upsell teaser** (unlike Charges' `UpgradeGate`) — matches the earlier
   Settings-panel decision of no upsell messaging for a not-yet-billable
   feature. `client/src/pages/ChannelManager.jsx` also self-guards (`if
   (!allowed) return null`) so a direct URL visit renders nothing, same
   pattern as `Billing.jsx`'s owner-only guard.
3. **Connect/disconnect relocated** — moved verbatim from Settings.jsx (same
   `POST /api/properties/:id/channex-connect` / `channex-disconnect` calls,
   same success/error handling) into the new page. The Settings card + its
   `channexBusy` state were deleted entirely, not just hidden.
4. **Server gate renamed + widened**
   (`server/routes/properties.js:requireOwnerMultiPlanAccess` →
   `requireOwnerChannelManagerAccess`): was Multi-only, now checks
   `has_channel_manager_addon` AND `plan IN ('pro','multi')`. Both
   `channex-connect` and `channex-disconnect` (and the new status route below)
   share this one function — no duplicated gate logic.
5. **New `GET /api/properties/:id/channex-status`** — the only new backend
   surface. Returns `{ units, last_availability_sync_at, last_rate_sync_at }`.
   `units` reuses `buildTargets(property)` (the exact same "what should be
   mapped" list `pushInitialInventory()` already computes — no new business
   logic) cross-referenced against real `channex_room_mappings` rows for
   `mapped`/`orphaned` state. Connection state + timezone are read from the
   `property` object already in `useLocale()` context (`SELECT *` shaped),
   not duplicated in this response.
6. **Last-synced timestamps — genuinely new persistence, not new logging.**
   Investigated first (per the task's explicit instruction to check what's
   queryable before adding anything): Phase 2 slice 9b's "task-ID logging" is
   `console.log` only, never written to the DB — nothing to query. Rather than
   build a new logging system, added two nullable columns
   (`properties.channex_last_availability_sync_at` /
   `channex_last_rate_sync_at`) written at the exact point
   `runAvailabilitySync()` / `runRateSync()` / `pushInitialInventory()`
   (`server/utils/channexPushInventory.js`) already log a successful push —
   purely persisting a timestamp that was previously computed and thrown away.
   Also cleared (`NULL`) by `disconnectChannexProperty()` so a stale timestamp
   never survives a disconnect/reconnect cycle.
7. **Page sections** (`ChannelManager.jsx`): Connection Status (badge + small
   muted Channex property ID for support/debug + connect/disconnect button) →
   Timezone nudge (only when `!property.timezone`, reusing the vendor-neutral
   `settings.timezoneChannexNudge` copy from the earlier white-label fix, plus
   a link to Settings) → Room Mapping (only when connected; lists every
   `buildTargets()` unit with Mapped/Not mapped/Removed-from-NestBook badges)
   → Recent Activity (only when connected; "Availability last updated X ago" /
   "Rates last updated X ago" via a new `formatRelativeTime()` helper in
   `client/src/utils/format.js`, using `Intl.RelativeTimeFormat` — free,
   correct pluralization/phrasing in all 5 languages, no per-language strings
   needed for the relative-time part itself) → minimal troubleshooting note
   (only shown when connected AND every unit is unmapped — "disconnect and
   reconnect to re-sync from scratch"; no new reconnect mechanism built, reuses
   the existing disconnect+connect cycle since no other repair path exists).
8. **i18n**: `channelManager` (nav label) + ~24 `cm*` keys, all 5 languages
   (en/fr/es/de/nl), inserted after each language's Activity Log section in
   `client/src/i18n/index.js`.

## Confirmed facts (don't re-check)

- `GET /api/properties` (list) and `GET /api/properties/:id` are both
  `SELECT *` — `channex_property_id`, `timezone`, and the two new sync-
  timestamp columns all arrive in the `property` object client-side with zero
  extra endpoint work.
- `buildTargets(property)` (exported from `channexPushInventory.js`) is pure
  DB reads, safe to call from a GET route with no side effects.
- The owner ↔ property relationship has a known pre-existing quirk (unrelated
  to this feature, not touched): some properties' actual owner (`owner_id`)
  differs from which user account you'd expect from the demo data — verified
  during testing, not a bug introduced here.

## Verified (2026-09-15, live dev stack)

- Schema: `has_channel_manager_addon` on `users`,
  `channex_last_availability_sync_at`/`channex_last_rate_sync_at` on
  `properties` all confirmed present after a real server boot; existing rows
  unaffected (additive).
- **Gating** (real curl calls against `GET /channex-status`, cycling the dev
  switch-plan endpoint): free+addon → 403 "add-on is required"; pro+no-addon →
  403 same message; pro+addon → 200; multi+addon (real UI click, not curl) →
  200. All four combinations behave exactly as specified.
- **Nav visibility**: absent by default (fresh demo user), appears
  immediately after flipping the addon checkbox to Multi+addon in Settings'
  Dev Tools, disappears again after reverting — confirmed via `find` in the
  live browser, not just code reading.
- **Real connected property** (#1 "Local Dev", live Channex staging data from
  earlier Phase 2 testing): page showed "Connected", the real Channex UUID,
  all 5 real room mappings (341–344, 361) correctly all "Mapped" — cross-
  checked directly against `channex_room_mappings` in the DB, exact match.
  "Availability: not synced yet" / "Rates: not synced yet" correctly shown
  (the two new columns are genuinely NULL — no historical backfill was done,
  correct behavior, not a bug).
- **Real unconnected property** (#3 "Dev Test Inn", 0 rooms): page showed
  "Not Connected", the explainer sentence, no Mapping/Activity sections at
  all — and rendered natively in **Dutch** (the property's own locale),
  confirming the new i18n keys work end-to-end in a non-English language, not
  just English.
- Settings.jsx: confirmed the old "Connect to Channel Manager" card is gone
  (`grep` for its exact heading text across `client/src` → zero hits); the
  Timezone field's own separate nudge (unrelated location) is untouched.
- **White-label check**: `grep -i channex` across the new page, Sidebar.jsx,
  Icons.jsx, and every new i18n value → zero rendered-text hits (only route
  paths, JS field names, and one i18n *key name* — none of which a user ever
  sees).
- `cd client && npm run build` clean both before and after the final round of
  edits. `node --check` clean on every touched server file.
- Dev server stopped cleanly afterward (root `npm run dev` process tree
  killed via `taskkill /T /F`); all temporary DB edits made purely for
  verification (owner_id reassignments, plan/addon flips) reverted to their
  original values.

## Deliberately out of scope (per the task)

- Stripe/billing wiring for the add-on itself — flag exists, nothing charges
  for it yet.
- Onboarding wizard — untouched.
- A dedicated "reconnect" action distinct from disconnect+connect — no such
  mechanism existed before this page either; kept minimal as instructed.
- Backfilling the two new sync-timestamp columns for historical activity —
  they start genuinely empty (`NULL`) for every existing connected property
  and will populate from the next real sync onward.
