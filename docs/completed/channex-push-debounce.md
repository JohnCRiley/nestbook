# Channex rate/availability push debouncing — certification follow-up

**Status: DONE (2026-09-12), built and verified in one session.**

## The problem

Channex certification feedback (a human reviewer, not the automated checker)
flagged that NestBook fires one API call per individual change — two rate
periods saved back-to-back (their own example: Tests #3/#4/#9/#10) produced
two separate `/restrictions` calls instead of one — and asked how we intend
to stay under their real production limits (10 requests/minute for both
Update Restrictions and Update Availability).

## The fix

A new short-window debounce/coalescing layer,
[`server/utils/channexDebounce.js`](../../server/utils/channexDebounce.js),
sitting **between** every call site and the existing
`pushRateUpdate()`/`pushAvailabilityUpdate()` (`channexPushInventory.js`) —
which themselves are unchanged and still submit through `channexQueue.js`
exactly as before. `channexQueue.js`'s own per-minute sliding window and
retry/backoff logic were **not touched** — this layer only reduces how many
calls reach it.

### Design

- Pending changes merge per `(propertyId, pushType)` — `pushType` is
  `'rates'` or `'availability'` — into one batch in an in-memory `Map`. Each
  new arrival for the same key resets a short timer (`cfg.debounceMs`,
  default **2500ms** — provisional, confirm the final value once Channex
  replies to the follow-up); when it elapses with no new arrivals, the batch
  flushes as exactly one call. A hard `cfg.maxDebounceMs` cap (default
  **10000ms**) forces a flush even if changes keep arriving, so a busy
  property is never starved. Both are named constants at the top of the
  file, not inlined, per the request.
- **Scope merging:** as long as every pending change in a batch targets the
  same `(refType, refId)` — e.g. two edits to the same room's price — the
  flush keeps that exact scope, so an isolated single-scope burst still only
  touches the mapping(s) it always would have (preserves the narrow-scope
  behavior from [[channex-rate-scoping-112.md]]). The moment a second,
  *different* scope lands in the same window (e.g. a rate-period save —
  always property-wide by the data model — next to a room-price edit), the
  batch widens to `refType:'property'` — the universal safe superset, already
  the pattern `pushRateUpdateForRanges()` and a CSV bulk-import's
  availability refresh use — so one call still covers everything pending.
- **Date-range merging:** a plain min/max union; `null` on either side
  ("full window") always dominates, matching the clamp semantics already in
  `runRateSync()`/`runAvailabilitySync()`. A broader-than-strictly-necessary
  range is always safe — the underlying push recomputes the correct current
  value for every date it covers from the DB, never a stale one. **This is
  why the fix cannot change correctness, only call volume/timing:** every
  flush still resolves through the exact same `getRateForDate()` /
  `buildTargets()` machinery as before, just once instead of N times.
- Ephemeral, like `channexQueue.js`: an in-memory `Map` only. A pending
  batch lost to a process restart isn't specially re-sent — same accepted
  tradeoff the queue itself already documents, since the next real NestBook
  change re-pushes fresh state from the DB regardless.

### `pushRateUpdateForRanges()` — reused, not duplicated

`ratePeriods.js`'s three handlers already resolve a rate period's raw
`date_from`/`date_to` (which may be annual `MM-DD` or one-off `YYYY-MM-DD`,
see [[rate-periods-date-format]]) into real calendar segments via
`pushRateUpdateForRanges()`. Rather than re-implement that resolution inside
`channexDebounce.js` (which would duplicate `dateInRange()`/window logic and
risk drifting out of sync), `pushRateUpdateForRanges()` gained an optional
third parameter, `pushFn = pushRateUpdate` — every existing caller keeps its
exact prior behavior (immediate push) by not passing one; `ratePeriods.js`
now passes `scheduleRatePush` explicitly. Injected rather than imported
directly inside `channexPushInventory.js` to avoid a circular import
(`channexDebounce.js` itself imports `pushRateUpdate`/`pushAvailabilityUpdate`
from `channexPushInventory.js`).

### Call sites updated

Every place that called `pushRateUpdate()`/`pushAvailabilityUpdate()`
directly now calls `scheduleRatePush()`/`scheduleAvailabilityPush()`
(`channexDebounce.js`) instead — same fire-and-forget `.catch(() => {})`
pattern at every site, unchanged:

- `server/routes/ratePeriods.js` — all 3 handlers (via the injected `pushFn`
  above)
- `server/routes/rooms.js` — the direct room-price-edit push
- `server/routes/bookings.js` — all 8 call sites (create, import, decline,
  the `PUT /:id` old+new range, `_wp_action` decline/`wp_departure`,
  `DELETE /:id`)
- `server/routes/enquiries.js`, `server/routes/stripe.js`,
  `server/routes/widget.js` — their availability call sites
- `server/utils/channexInboundSync.js` — the webhook loop-prevention push
  (`pushForRooms()`); the `await` there now resolves once the change is
  enqueued, not once Channex has actually replied — fine, since nothing
  downstream depended on that completion (the webhook handler was already
  treating this as best-effort/non-blocking)

**Deliberately NOT touched:** `pushRoomTypeReconcile()`'s internal calls
(`channexPushInventory.js` `syncTarget()`, wired to room/category
create/rename in `rooms.js`/`roomCategories.js`) still call
`pushAvailabilityUpdate()`/`pushRateUpdate()` directly, immediately. Routing
them through the debounce layer would require `channexPushInventory.js` to
import from `channexDebounce.js` — the reverse of the existing one-way
dependency — and reconciliation (a rarer, heavier, already-efficient
operation, not the "rapid successive user edits" scenario the reviewer
flagged) wasn't in the requested scope. `pushInitialInventory()` (the
one-time initial-connect push) is likewise untouched.

### Test hooks

Mirrors `channexQueue.js`'s own pattern: `__setChannexDebounceConfig(overrides)`
and `__resetChannexDebounce()`, both clearly marked TEST HOOK / production
always uses the real defaults.

## Verified (2026-09-12)

**Unit-level** (harness script against `channexDebounce.js` directly, real
Channex staging, property #1 `a50e441f`, `debounceMs`/`maxDebounceMs`
shortened via the test hook for speed):
- Two `scheduleRatePush()` calls for the **same** room 100ms apart → **one**
  `[channex-sync]` line, narrow scope (1 rate plan), date range the union of
  both (`2026-10-01..2026-10-06`).
- Two calls for **different** rooms (341 then 342) 100ms apart → **one**
  line, widened to `property:` scope (4 rate plans), union range
  (`2026-10-20..2026-10-23`).
- An isolated single call → flushed after ~`debounceMs`, not immediately,
  not delayed further.
- 8 `scheduleAvailabilityPush()` calls 200ms apart (1.6s of continuous
  arrivals against a 300ms/1000ms test config) → exactly one flush, forced
  by the max-delay cap partway through, not delayed past it.
- `scheduleRatePush()` against an **unconnected** property (#13) → zero
  `[channex-sync]` lines, confirming no batch/timer is ever created for the
  ~99% unconnected case.

**End-to-end** (real dev server, real HTTP route, real Channex staging push,
property #1, demo user temporarily bumped free→multi plan to pass the
seasonal-pricing plan gate, reverted after):
- `POST /api/rate-periods` twice, 0.5s apart (room 341 override $241, room
  342 override $312.66, adjacent Nov date ranges) → server log shows
  **exactly one** `[channex-sync] property #1 property: 2026-11-01..2026-11-10
  rates — 6 segment(s) across 4 rate plan(s)` line — not two — matching the
  reviewer's own back-to-back-saves scenario end to end through the real
  route, not just the internal function.
- `DELETE /api/rate-periods/:id` on both test periods → again exactly
  **one** combined revert push (`4 segment(s) across 4 rate plan(s)`,
  correctly coalescing to fewer segments once every room is back to a flat
  base), not two.
- Cleanup: both test periods deleted (Channex staging reverted to flat base
  for the test range as part of that), demo user's plan restored to `free`.
  No leftover local DB or Channex-side state.

`node --check` clean on every changed/new file. Server boots with no import
errors.

## Files in play

- `server/utils/channexDebounce.js` — new
- `server/utils/channexPushInventory.js` — `isChannexConnected()` exported;
  `pushRateUpdateForRanges()` gained the optional `pushFn` parameter
- `server/routes/ratePeriods.js`, `server/routes/rooms.js`,
  `server/routes/bookings.js`, `server/routes/enquiries.js`,
  `server/routes/stripe.js`, `server/routes/widget.js`,
  `server/utils/channexInboundSync.js` — call sites switched to the
  `schedule*Push()` wrappers

Related: [[channex-rate-sync-scoping]], [[rate-periods-date-format]].
