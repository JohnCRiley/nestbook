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

## Extended 2026-09-15 — full activity coverage + contact nudge

The initial ship above only persisted `last_availability_sync_at` /
`last_rate_sync_at`. Extended the same pattern to the other push types the
task's Recent Activity section asked for (photos, description, facilities,
contact details), plus a contact-details nudge alongside the existing
timezone one.

- **4 new nullable `properties` columns**: `channex_last_photos_sync_at`,
  `channex_last_description_sync_at`, `channex_last_facilities_sync_at`,
  `channex_last_contact_sync_at`. Same "stamp on success, don't backfill"
  convention as the original two.
- **Shared columns, last-write-wins**: description/facilities are stamped
  from BOTH the property-level push (`updateChannexProperty()`,
  `createChannexProperty.js`) AND the room/category-level push
  (`syncTarget()`'s `roomTypeAttributes()` call, which always carries both) —
  one column per concept rather than splitting by source, since either path
  genuinely means "Channex just received our current value" for that field.
  Contact details are property-only (email/phone have no room-type
  equivalent). Photos are room-level only, and unlike the others, stamped
  ONLY when `reconcileRoomTypePhotos()` actually performed a create/update/
  delete — that function is a genuine diff called on every room-type sync
  (rename, occupancy change, …) whether or not photos themselves changed, so
  stamping unconditionally would claim a sync that never happened.
- **`reconcileRoomTypePhotos()` and `createTargetOnChannex()`** both gained a
  leading `propertyId` param (threaded from all 3/2 call sites respectively)
  so they can stamp `channex_last_photos_sync_at` themselves.
- **Property-details create path also stamps now**: both `properties.js`'s
  owner-facing `channex-connect` and `admin.js`'s Super Admin equivalent
  extend their existing single `UPDATE properties SET channex_property_id =
  ?` into one statement that also stamps description/facilities/contact —
  `createChannexProperty()` sends all three on that same initial create call.
- **`disconnectChannexProperty()`** now clears all 6 sync-timestamp columns
  (was 2), so a disconnect/reconnect cycle never shows a stale timestamp from
  the prior connection.
- **Fixed a real bug found while verifying this**: `ChannelManager.jsx`'s
  `handleResync()` never called `fetchStatus()` after a successful "Update
  Property Details" — the DB stamps landed correctly (verified directly) but
  the page kept showing "not synced yet" until a manual reload. Added the
  missing `fetchStatus()` call, same as `handleConnectToggle()` already had.
- **Contact-details nudge**: shows when `!property.email && !property.phone`
  (both unset — showing it when only one is set felt noisy), same visual
  pattern and same `settings.timezoneChannexNudge`-style copy as the existing
  timezone nudge, reusing its `cmTimezoneCta` link label rather than adding a
  near-duplicate key.
- **`cmResyncHint` copy updated** (all 5 languages) — it only mentioned
  "name, currency, timezone and country" but the same button's underlying
  call has always also resent description/facilities/contact; the hint was
  stale even before this change.
- 8 new i18n keys (`cmContactNudge`, `cmPhotosUpdated`, `cmDescriptionUpdated`,
  `cmFacilitiesUpdated`, `cmContactUpdated`) × 5 languages.

### Verified (2026-09-15, live dev stack + real Channex staging)

- Schema: all 4 new columns present after a real server boot.
- **Property-details push** (clicked the real "Update Property Details"
  button against property #1, live Channex staging): toast confirmed
  success, fresh DB read showed `channex_last_description_sync_at` /
  `_facilities_` / `_contact_` all stamped to the same timestamp, and — after
  the `handleResync()` fix — the page itself showed "Description/Facilities/
  Contact details last updated 1 second ago" without a manual reload.
- **Room-level facilities push**: PUT `/api/rooms/341` with
  `structured_amenities: ['wifi','tv']` → waited for the real 7-10s debounce
  → server log confirmed `facilities re-synced … (2 facility/facilities)` →
  `channex_last_facilities_sync_at` advanced to a newer timestamp than the
  property-level push moments earlier, confirming the shared-column
  last-write-wins behavior actually works across both code paths. Reverted
  the room back to `[]` the same way and confirmed the follow-up debounced
  push landed (`… (0 facility/facilities)`) — no residue left on Channex or
  in NestBook.
- **Photos**: verified by code inspection only (all 3 call sites of
  `reconcileRoomTypePhotos()`/`createTargetOnChannex()` traced and confirmed
  to pass `propertyId` correctly) — not live-triggered this pass; same
  well-exercised diff logic Slice A already proved live.
- **Not live-tested**: `disconnectChannexProperty()`'s clearing of all 6
  columns — deliberately skipped. Property #1 carries real, non-trivial
  Channex history (5 real room mappings from earlier Phase 2 testing), and
  this codebase's own docs confirm disconnect+reconnect is NOT an equivalent
  no-op (it orphans the existing Channex property and creates a brand-new
  one) — not an acceptable action to take just for verification. Confirmed
  by code review instead: the `UPDATE` statement is unconditional and now
  lists all 6 columns.
- `cd client && npm run build` clean both before and after. `node --check`
  clean on every touched server file.
- White-label check: `grep -i channex` across the new copy → zero
  rendered-text hits (route paths and JS field names only).
- Nav item, room mapping, connect/disconnect, and the old Settings card's
  absence were all re-confirmed unaffected (none of those code paths were
  touched this pass).

## Deliberately out of scope (per the task)

- Stripe/billing wiring for the add-on itself — flag exists, nothing charges
  for it yet.
- Onboarding wizard — untouched.
- A dedicated "reconnect" action distinct from disconnect+connect — no such
  mechanism existed before this page either; kept minimal as instructed.
- Backfilling the two new sync-timestamp columns for historical activity —
  they start genuinely empty (`NULL`) for every existing connected property
  and will populate from the next real sync onward.
