# Channex rate push scoping — property #112 diagnosis + room-price fix

**Status (2026-09-12): DIAGNOSIS COMPLETE (session 1) — the 2-rate-plan push
on property #112 is expected/correct, not a bug, see below.
FOLLOW-UP BUILT + VERIFIED (session 2) — the diagnosis identified a genuine
gap (editing a room's base price never reached Channex at all); that gap is
now closed, see "Session 2" below. No production DB access was available in
either session; both the diagnosis and the fix are derived/verified from the
schema + code + local Channex staging, not property-112-specific data.

## The trigger

Seasonal Pricing → new period on property #112 ("The Orchard Rooms", IR-Named,
2 rooms: Twin + Double), 2026-11-15, one night. Logged:
`property #112 property: 2026-11-15..2026-11-15 rates — 2 segment(s) across 2
rate plan(s)`.

## Confirmed facts (code, `server/db/schema.js` ~L1300-1329)

- `rate_periods` columns: `id, property_id, name, date_from, date_to,
  rate_type, rate_value, priority, created_at`. **No `room_id` and no
  equivalent scoping column exists.** A rate period is *always* property-wide
  by schema design — there is no way to create one that applies to only one
  room and not others.
- The only per-room concept is a **separate** table, `rate_period_rooms`
  (`rate_period_id, room_id, amount`, UNIQUE per pair) — an optional **price
  override**, not a scope restriction. Setting an override for Twin does not
  exclude Double from the period; Double still matches the period by date and
  falls through to the period's own `rate_value` (or, if that's 0, to its own
  base `price_per_night`) — see `getRateForDate()` priority order,
  `server/utils/ratePeriods.js:35-68`.
- The Settings UI (`SeasonalPricingSection` / `RatePeriodModal`,
  `client/src/pages/Settings.jsx` ~L3520-3715) reflects this exactly: every
  room on the property gets its own optional "Seasonal rate" input row in the
  same modal. There is no room picker / no way to attach the period to just
  one room — confirming the schema-level finding isn't a leftover gap, it's
  what the UI offers too.

## Confirmed facts (push logic)

- `ratePeriods.js` (create/edit/delete) always calls
  `pushRateUpdateForRanges(propertyId, ranges)` — never passes a room/category
  ref, because rate_periods rows have no room ref to pass.
- `pushRateUpdateForRanges()` (`server/utils/channexPushInventory.js:631`)
  resolves the period's real affected calendar nights via `dateInRange()`
  (annual MM-DD vs one-off YYYY-MM-DD, year-wrap — see
  [[rate-periods-date-format]]), then for each contiguous affected span calls
  `pushRateUpdate(propertyId, 'property', null, from, to)` — **`refType` is
  hardcoded to `'property'`**, regardless of whether the period has 0, 1, or 2
  `rate_period_rooms` override rows.
- `runRateSync()` → `affectedMappings(property, mappings, 'property', null)`
  (`channexPushInventory.js:326`): `if (refType === 'property') return
  mappings;` — **every** `channex_room_mappings` row for the property, no
  filtering. For an IR-Named property with 2 rooms mapped 1:1 to 2 rate plans,
  that's always both.
- This is deliberate, not an oversight — same file's slice-6 doc comment:
  "No diffing: Channex Last-Win means a full re-push inherently reverts a
  stale segment left by an edited/deleted period." The design intentionally
  re-sends every mapped rate plan's current correct value on any rate_periods
  change, rather than trying to compute which room(s) actually changed value.

## Answering the task's 3 checks

1. **Stored `room_id`/scope value on the new row:** no such column exists to
   query — confirmed from `schema.js`, not property-112-specific. (Did not
   query production; not needed to reach this conclusion. If John wants the
   *price override* detail — whether Twin got a `rate_period_rooms` row — that
   needs a prod query, see "Follow-up" below, but it wouldn't change the
   verdict.)
2. **Is the push logic filtering correctly for room-scoped periods, or always
   resolving property-wide regardless of scope?** N/A as phrased — there is no
   room-scoped case for `rate_periods` to filter correctly *or* incorrectly.
   It always resolves property-wide, which is the period's only possible
   actual scope.
3. **Property-wide → expected, no bug, redo cert test with a room-scoped
   period:** correct call, but **not currently possible** — this data model
   has no mechanism to create a rate-period push scoped to a single room.
   `rate_period_rooms` overrides only change the *amount* for a room within an
   already property-wide push; they don't narrow which rate plans get pushed
   (`affectedMappings` ignores them entirely, per above).

## If a single-room-scoped rate push is actually needed for cert

Not a fix for a bug — a new capability. Two directions, not attempted:
- Have `pushRateUpdateForRanges`/`ratePeriods.js` pass `refType:'room'`
  per affected room (derived from which rooms have a `rate_period_rooms`
  override vs. none) instead of hardcoding `'property'` — but then a room
  *without* an override still needs re-pushing whenever its effective rate
  changes because of priority/ordering interactions with other periods, which
  gets complicated fast.
- Simpler: there's a separate, currently-unused gap — editing a room's own
  `price_per_night` (`server/routes/rooms.js`) never calls `pushRateUpdate` at
  all today (grep-confirmed, no matches). That path would be genuinely
  single-room by construction if wired up. Untouched, not investigated further
  — flagging only because it's the one place in the codebase where a true
  single-room rate change already exists without a seasonal period.

## Follow-up (optional, only if John wants the extra confirmation)

On production:
```sql
SELECT * FROM rate_periods WHERE property_id = 112 ORDER BY id DESC LIMIT 1;
SELECT * FROM rate_period_rooms WHERE rate_period_id = (
  SELECT id FROM rate_periods WHERE property_id = 112 ORDER BY id DESC LIMIT 1
);
```
Confirms whether Twin got a distinct override amount for this test period —
informational only, doesn't change the diagnosis above.

## Files in play (session 1 — diagnosis)

- `server/db/schema.js` ~L1300-1329 — `rate_periods` / `rate_period_rooms` DDL
- `server/utils/ratePeriods.js:35-68` — `getRateForDate()` priority order
- `server/routes/ratePeriods.js` — create/edit/delete, all call
  `pushRateUpdateForRanges` with no room ref (none exists to pass)
- `server/utils/channexPushInventory.js:326` (`affectedMappings`),
  `:511-606` (`pushRateUpdate`/`runRateSync`), `:631-645`
  (`pushRateUpdateForRanges`)
- `client/src/pages/Settings.jsx` ~L3440-3715 — `SeasonalPricingSection` /
  `RatePeriodModal`, confirms no room-picker exists in the UI either

---

## Session 2 (2026-09-12) — closed the room-price-edit gap

The diagnosis above flagged a real, separate gap: `server/routes/rooms.js`'s
room-price-edit path never called `pushRateUpdate` at all (grep-confirmed no
matches at the time) — it's also the one genuinely single-room-scoped rate
change the app has, useful for a cert demonstration. Built and verified.

**Built:** `roomsRouter.put('/:id')` (`server/routes/rooms.js`) now fires
`pushRateUpdate(updated.property_id, 'room', updated.id, null, null)`
whenever `price_per_night` actually changed, fire-and-forget
(`.catch(() => {})`, after the response). No new logic in
`channexPushInventory.js` — reused `affectedMappings()`'s existing non-
`'property'` branch exactly as-is:
- IR-Named / Units: `refType:'room'` matches the room's own mapping directly.
- IR-Categories: `refType:'room'` + a room's `category_id` — `affectedMappings`
  already looks this up itself and resolves to the *category's* shared
  mapping — no branching needed in `rooms.js`, confirmed by reading the
  function (`channexPushInventory.js:339-341`), not re-verified live locally
  (no Categories-mode property is Channex-connected in this DB — same
  limitation as every other slice) but this exact `refType:'room'` shape is
  already the one `pushAvailabilityUpdate`/`bookings.js` uses today and was
  live-verified for Categories mode back in slice 5 (production, property
  #95) — nothing new is being exercised here, just reused.
- Whole Property: rooms aren't priced independently (`whole_property_rate` is
  the property-level field; WP room rows never expose a price field in the
  Settings UI — confirmed by reading `client/src/pages/rooms/RoomPanel.jsx`,
  the price-editing form only renders for the non-WP/non-internal-unit
  branch). Not wired here — out of scope for this task, and there's nothing
  to wire (no price value to compare against).

**Deliberately NOT touched:** `properties.js`'s WP `whole_property_rate` edit
path has the identical gap (no `pushRateUpdate` call either) — not part of
this task, flagged only for awareness.

**Verified (2026-09-12, real Channex staging, property #1 "Local Dev"
`a50e441f`, room 341 → rate plan `e4f3f2a6`):**
- `node --check server/routes/rooms.js` clean.
- Started the dev stack via Bash (per [[preview_start_port_collision]]),
  logged in as `demo@nestbook.io`, `PUT /api/rooms/341` with
  `price_per_night` 95→96 → server log:
  `[channex-sync] property #1 room:341 2026-09-12..2028-01-24 rates — 1
  segment(s) across 1 rate plan(s) — task_id(s): 8be89ee9-…` — **exactly one
  rate plan**, not all four. Reverted 96→95 → matching second log line,
  confirmed on Channex (task id `bfb75945-…`).
- Called `pushRateUpdate(12, 'room', 3, null, null)` directly against
  property #12 (real property, no `channex_property_id` set) → returned in
  1ms, no throw — confirms the no-op path for an unconnected property.
- Could not exercise the *route* end-to-end for the unconnected case (demo
  user doesn't own property #12 → `canAccessProperty` 403s first, which is
  correct, unrelated access control) — the function-level no-op above is what
  actually matters and is what the route calls.
- Did not re-verify via a Channex `GET /restrictions` read-back — spent time
  on it but couldn't find the right query-param shape for this staging
  account's API version (kept 400/422ing on `filter`/`restrictions[]`
  combinations); the `pm2`-style console log naming "1 rate plan(s)" plus the
  matching Channex task id is the evidence, same as prior slices before this
  one bothered with read-back confirmation.
- Existing seasonal-period path untouched: `ratePeriods.js` still only calls
  `pushRateUpdateForRanges` (property-wide) — this is an additional call
  site, confirmed by reading the diff, not a replacement.

**Committed and pushed to `main`** (this repo's every-session convention).

## Files in play (session 2 — fix)

- `server/routes/rooms.js` — added `pushRateUpdate` import + the price-change
  call site in `PUT /:id`, right after the existing `pushRoomTypeReconcile`
  block.
