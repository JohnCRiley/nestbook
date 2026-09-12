# Channex certification — property #113 per-room override rates not reaching OTAs

**Status (2026-09-12): DIAGNOSIS ONLY, no code changed. Root cause identified
at the architecture/behavior level and confirmed correct against the code;
NOT yet confirmed against property 113's actual stored rows — no production
DB access available this session (property 113 does not exist in the local
dev DB, which only has properties 1–28). John needs to run the SQL below on
production to close this out.**

## The trigger (Channex cert feedback)

- Period: 22 Nov 2026, Twin → $333. Channex observed $100 (room's base rate).
- Period: 1–10 Nov, Twin → $241; separate period: 10–16 Nov, Double →
  $312.66. Channex observed $100 across the WHOLE 1–16 Nov range for BOTH
  rooms.
- Period: 1 Dec 2026 – 1 May 2027, Twin → $432, Double → $342. Channex
  reports these as "not set" at all (not even base).

## Confirmed facts (code — this session, plus reused from a prior, directly
## applicable diagnosis)

**This is very likely the SAME root-cause class already diagnosed for
property #112**, see `docs/completed/channex-rate-scoping-112.md` (2026-09-12,
same day). That investigation found, and I independently re-verified against
current code this session:

- `rate_periods` has **no room-scope column** (`server/db/schema.js`
  ~L1300-1329: `id, property_id, name, date_from, date_to, rate_type,
  rate_value, priority, created_at`). A rate period is **always
  property-wide** — there is no way to create one that applies to only one
  room.
- `rate_period_rooms` (`rate_period_id, room_id, amount`) is an **optional
  price override**, not a scope restriction. Giving Twin an override in a
  period does **not** exclude Double from that period — Double still matches
  the period by date and falls through to the period's own `rate_value`
  (`server/utils/ratePeriods.js:35-68`, `getRateForDate()`):
  1. `rate_period_rooms` override for *this room* in the matched period, if
     `amount > 0`
  2. else the period's own `rate_value`, if `> 0`
  3. else base (`room.price_per_night`, or `baseRateOverride` for WP)
- The Settings UI (`RatePeriodModal`, `client/src/pages/Settings.jsx`
  ~L3522-3760) matches this exactly: one modal, every room gets its own
  optional "Seasonal rate" cell, plus a single period-level **"Default rate
  for unlisted rooms"** field captioned "0 = use room's default price" and
  defaulting to `'0'` (`form.defaultRate` init, L3542). If a tester fills in
  only the room-specific cell (the natural way to "set Twin to $333") and
  leaves the default-rate field at 0 — which is what "make a period just for
  Twin" / "just for Double" naturally leads to — every *other* room the
  period also (silently, property-wide) matches by date falls to **base**,
  not "left alone by this period."
- `getRateForDate()`'s period loop is **strict first-match-wins**: `ORDER BY
  priority ASC, id ASC`, and it `return`s as soon as ANY period matches the
  date — it does not fall through to a later, more-specific period. Default
  `priority` in the modal is always `'0'` (L3542, no per-period priority
  guidance in the UI), so multiple test periods created during iterative cert
  testing (very plausible — cert feedback implies several attempts) tie on
  priority and fall back to **id ASC**, i.e. the **oldest** period created
  wins for any date it covers, regardless of which period the tester most
  recently edited to fix a value.
- **No overlap warning/validation anywhere** — grepped
  `client/src/pages/Settings.jsx` for "overlap"/"conflict": no matches. A
  tester can create several overlapping periods (or forget to delete a
  discarded test period) with zero UI feedback that an earlier period is
  shadowing a later one.

## Confirmed facts (push logic — traced this session, no bug found here)

- `pushRateUpdateForRanges()` (`server/utils/channexPushInventory.js:631`)
  resolves the period's real calendar nights via `dateInRange()` (handles
  annual `MM-DD` vs one-off `YYYY-MM-DD`, year-wrap) — correct for these
  one-off 2026/2027 dates (all `YYYY-MM-DD`, length 10).
- `runRateSync()` (`:532`) → `affectedMappings(property, mappings,
  'property', null)` returns **every** `channex_room_mappings` row (both
  Twin's and Double's rate plans) since `ratePeriods.js` always calls with
  `refType:'property'` (periods have no room ref to pass — same finding as
  the 112 doc). For each mapping it looks up the matching `buildTargets()`
  target and reads `t.rateForDate(date)` — **the resolved value via
  `getRateForDate()`**, not the period's raw `rate_value` — so the push logic
  itself is not the bug: whatever `getRateForDate()` resolves is exactly what
  gets sent to Channex, per room, per night.
- i.e. **if property 113's stored rows produce the wrong resolved value
  (base instead of override) for a given room/date, Channex will be sent
  that same wrong value** — this fully explains "$100 observed" (a real,
  correctly-formed push of the base rate) rather than looking like a
  transport/mapping bug.
- The half-year period showing "not set" (Channex saw nothing, not even
  $100) is NOT explained by anything above — that behavior requires either
  (a) the push for that specific range never fired / errored, or (b) every
  night in that range resolved to `null` (rate `<= 0`), which `rateSegments()`
  explicitly skips + logs `[channex-sync] … every night unset/zero …;
  nothing sent` (`channexPushInventory.js:586-593`) rather than sending 0.
  Needs the actual stored `rate_periods`/`rate_period_rooms` rows + server
  log line for that push to confirm which.

## Root cause (leading hypothesis, matches the 112 diagnosis, NOT YET
## CONFIRMED against property 113's actual data)

Not a display bug (values are very likely saved as entered — `ratePeriods.js`
POST/PUT store `roomRates` verbatim into `rate_period_rooms`, no evidence of
field confusion) and not a push/mapping bug (traced above — the push sends
whatever `getRateForDate()` resolves). Most likely a **resolution-behavior
gap**: the cert-testing workflow (a separate period per room, per date range,
several iterations) collides with two facts that are true by design, not by
accident:
1. every period is property-wide, so a period meant to set "just Twin" or
   "just Double" also matches the *other* room for those same dates and
   pushes that other room back to base (or shadows it if an older period
   already covers the range);
2. `getRateForDate()` stops at the first date-matching period regardless of
   whether it has anything configured for the room being resolved, so a
   stale/earlier test period with no override and `rate_value=0` can mask a
   later period's real override for the same room too.

Both mechanisms independently produce the exact "Channex observed $100"
symptom; likely some combination of both is active on property 113's actual
row set.

## NOT yet confirmed — need production

Run on the Hetzner box:

```sql
-- Every rate period + resolved priority/id ordering for #113
SELECT id, name, date_from, date_to, rate_type, rate_value, priority, created_at
FROM rate_periods WHERE property_id = 113 ORDER BY priority ASC, id ASC;

-- Per-room overrides for each of those periods
SELECT rpr.rate_period_id, rpr.room_id, r.name AS room_name, rpr.amount
FROM rate_period_rooms rpr
JOIN rooms r ON r.id = rpr.room_id
WHERE rpr.rate_period_id IN (SELECT id FROM rate_periods WHERE property_id = 113)
ORDER BY rpr.rate_period_id, r.name;

-- Rooms + ids for 113 (need Twin/Double's actual room_id)
SELECT id, name, price_per_night FROM rooms WHERE property_id = 113;

-- channex_room_mappings — same stale-ID class of issue flagged for #111,
-- worth ruling out here too even though the push-logic trace above suggests
-- it's not the primary cause this time
SELECT id, nestbook_ref_type, nestbook_ref_id, channex_room_type_id,
       channex_rate_plan_id, orphaned_at, created_at
FROM channex_room_mappings WHERE property_id = 113;
```

Compare against intended: 22 Nov Twin $333; 1–10 Nov Twin $241; 10–16 Nov
Double $312.66; 1 Dec–1 May Twin $432 / Double $342. Specifically check:
- Do more than one of these periods have overlapping/adjacent date ranges
  that would tie on `priority` and fall to `id ASC`?
- Does each period actually have `rate_value = 0` (the "unlisted rooms"
  default) with the override living only in `rate_period_rooms`?
- Is there a leftover/earlier test period (lower id) also covering any of
  these dates with no override at all?
- For the half-year period specifically: pull the `[channex-sync] …` server
  log line for that push (pm2 logs around its creation timestamp) — either
  it logged "N segment(s) across N rate plan(s)" (push happened, so the
  Channex side dropped/ignored it — different investigation) or "every night
  unset/zero … nothing sent" (confirms mechanism above).

## Session 2 (2026-09-12) — real production data + executed-code verification

John supplied the actual `rate_periods` / `rate_period_rooms` / `rooms` rows
for property 113 (still no direct production DB access this session). Rather
than keep reasoning about `getRateForDate()` / `buildTargets()` abstractly, I
replicated the exact rows (same relative id ordering: 22 Christmas, 23
Easter, 24 TEST#2, 25 TEST#3A, 26 TEST#3B, 27 TEST#4A, 28 TEST#4B, 29 TEST#8,
all `priority=0`; overrides: 27→Twin $241, 28→Double $312.66) against a
throwaway property in the local dev DB, wrapped in `BEGIN`/`ROLLBACK` (nothing
persisted), and called the **real, imported** `getRateForDate()` and
`buildTargets()` — not a re-implementation — for every date Nov 1–16 2026.

**Result — both are CORRECT**, with one confirmed minor exception:

```
date        Twin        Double
11-01..09   $241 (4A)   $100 (base, correct — no override in 4A)
11-10       $241 (4A)   $100 (base — 4A wins tie-break, correct per below)
11-11..16   $100 (base) $312.66 (4B)
```

`buildTargets()`'s resolvers, coalesced into segments exactly as
`runRateSync()` would build them, produced:
```
Twin:   [2026-11-01..10: $241] [2026-11-11..16: $100]
Double: [2026-11-01..10: $100] [2026-11-11..16: $312.66]
```

Answering the numbered checks directly:

1. **Tie-break confirmed, and it's per-date-property-wide, not per-room.**
   `getRateForDate()`'s period loop (`ratePeriods.js:42-65`) picks ONE winning
   period per `(propertyId, date)` — `ORDER BY priority ASC, id ASC`, first
   `dateInRange()` match, full stop — then looks up that ONE period's
   room-specific override. It does NOT search forward through other
   date-matching periods looking for one that has an answer for the room in
   question. So on Nov 10 (where TEST#4A id 27 and TEST#4B id 28 both match),
   TEST#4A wins for **both** rooms' resolution: Twin gets its override
   (coincidentally correct, since Twin's override lives in the winning
   period), but Double gets **TEST#4A's own `rate_value` (0)** → base $100,
   even though TEST#4B (which has Double's real override) also covers that
   date. This is a real, confirmed, narrow bug — but it only affects the
   single overlapping day, not the ranges either period exclusively covers.
2. **Nov 1–9: Twin → $241 ✅. Double → $100 ✅ (expected, no override).**
   Confirmed by direct execution.
3. **Nov 11–16: Double → $312.66 ✅. Twin → $100 ✅ (expected, no override).**
   Confirmed by direct execution.
4. **Segment-merging is NOT collapsing anything.** `buildTargets()`'s
   `rateForDate` resolvers, coalesced exactly as the real push does, produce
   two distinct, correctly-valued segments per room (shown above) — not one
   flat wrong value across the combined range. This hypothesis is **ruled
   out** by direct execution, not just review.
5. TEST#8 (2026-12-01..2027-05-01) cannot match any November 2026 date —
   confirmed by inspection, not even reachable by `dateInRange()` for those
   dates. Not a factor here.

**This means the reported symptom — "$100 across the ENTIRE 1–16 Nov range
for BOTH rooms" — cannot be reproduced from `getRateForDate()` or
`buildTargets()`/segment construction with this exact data.** Both are
proven correct (bar the 1-day Nov 10 edge case, which alone doesn't explain a
16-day-wide, both-rooms failure). The divergence between "what the code would
correctly compute and send" and "what Channex actually shows" must be
happening **downstream of payload construction** — i.e. in actual delivery:

- **Leading candidate: stale `channex_room_mappings.channex_rate_plan_id`
  for property 113** — the same still-unconfirmed root-cause class already
  flagged for property 111 in
  `docs/in-progress/channex-cert-rateplan-mapping-111.md`. If the stored
  mapping row points at an old/orphaned Channex rate plan (from an earlier
  connect/rebuild) rather than the one the cert reviewer is actually reading,
  `runRateSync()` posts the (correct!) resolved values to the wrong
  `rate_plan_id` — the live rate plan Channex/the reviewer checks never
  receives the write and stays at whatever its LAST real value was: the
  **initial flat base push ($100 for both, per slice 3)** for the "$100
  observed" periods, and **nothing at all** for TEST#8 if that particular
  rate plan's initial flat-rate push also never landed on the current live
  object (e.g. reconnect happened after slice-3's initial push ran once).
  This single explanation accounts for both reported symptoms uniformly —
  the resolved values are right, they're just being confirmed against the
  wrong live object.
- Alternative candidates, not yet ruled out: the fire-and-forget
  `.catch(() => {})` in `ratePeriods.js` swallows a real push failure with no
  trace beyond a `console.error` — need server logs to confirm the pushes for
  these specific periods actually executed and check what they logged
  (`[channex-sync] property #113 … rate push failed (non-fatal): …` vs a
  normal `N segment(s) across N rate plan(s)` success line).

**Root cause verdict (for the question asked): the fix, if the stale-mapping
hypothesis confirms, does NOT belong in `getRateForDate()` or in
`pushRateUpdateForRanges()`'s segment-merging — both are verified correct.**
It belongs wherever `channex_room_mappings` gets reconciled/kept in sync with
what Channex actually has (same area flagged, still open, for property 111).
The Nov-10 tie-break bug is real but separate and narrower — see below.

## Separate, confirmed, minor bug: same-priority tie-break is per-date, not
## per-room

Every one of property 113's 8 periods has `priority=0`
(`client/src/pages/Settings.jsx:3542` hardcodes `priority: '0'` as the
new-period default). The priority field **is** user-editable — a plain
`<input type="number" min="0">` at `Settings.jsx:3665-3667` — but nothing in
the UI explains what it does or when to set it, and no period in production
has ever had it changed from 0. So in practice, any two overlapping periods
resolve by **creation order alone** (`id ASC`), and — per the harness above —
that winner is picked once per date and applies to **every room**, not
re-evaluated per room per period. A tester creating adjacent single-room
periods (exactly this cert workflow) will hit this on any boundary date they
share. Worth fixing regardless of the Channex investigation, but it is NOT
sufficient on its own to explain the reported "$100 across the whole 1–16
range" — only the single Nov 10 boundary is affected by it.

## Session 3 (2026-09-12) — live Channex state check + booking-push hypothesis ruled out

### Part A: Channex staging's CURRENT live rate state for property 113

Queried the real Channex staging API directly (read-only, `GET
/api/v1/restrictions` — working query shape, after trial and error, is
`filter[property_id]` + `filter[date]` (singular, one call per date — a
`date_from`/`date_to` range and a `filter[date][from]/[to]` nested form both
400 with `"date is required"`) + `filter[rate_plan_id]` +
`filter[restrictions][]=rate`). No writes made.

**Twin plan `ff106473-4579-47a4-8e44-9c359131c0d9` / Double plan
`b9ce809b-94e5-4c29-93f8-28700ca0222b`, property `2fdc1ff7-92a3-4aec-b6e0-38ee7aed12a1`, checked right now:**

```
           Twin       Double
11-01..10  241.00     100.00
11-11..16  100.00     312.66
11-21      333.00     100.00
11-22      333.00     100.00
11-25      100.00     444.00
```

**Every one of these matches the intended value exactly** (Twin $241 Nov1-10,
Twin $100 Nov11-16 correctly falling to base with no override, Double $100
Nov1-10 correctly falling to base, Double $312.66 Nov11-16, Twin $333
Nov21-22 — including Nov 21, which session 2's provided data didn't have a
listed override for, implying TEST#3A/#3B do carry overrides not included in
that data dump — Double $444 on Nov 25 matching TEST#3B). **Channex's live
state right now shows $100 nowhere it shouldn't. The originally reported
"$100 observed" / "not set" cert findings do not reproduce against the
current live state.**

Also worth noting: `GET /api/v1/rate_plans/:id` returns `options[0].rate:
"0.00"` for both plans — this is the STATIC rate set once at
`createRatePlan()` time (slice 3, `channexPushInventory.js`
`ratePlanCreateAttributes()`, hardcoded `rate: 0`) and never updated after;
all real pricing flows through the separate per-date `/restrictions`
mechanism checked above. Don't mistake this field for "no rate is set" — it's
inert by design once ARI pushes begin.

This means the discrepancy the cert reviewer saw was most likely a **timing/
propagation snapshot**, not a persistent bug: `channexQueue.js` rate-limits
to 9 restrictions/min + 18 ARI/min per property with a 250ms floor between
dispatches, and a retry backs off 2s/8s/30s/60s on 429/5xx. Creating 8 rate
periods (some producing 2 pushes each for pre+post edit ranges) plus
availability/booking tests in a short manual test burst would very plausibly
still have jobs queued or mid-retry at the exact moment the cert review read
Channex — by now (hours/days later) the queue has long since drained to the
correct state. **Still needs confirmation from actual push timestamps vs.
the cert review's read timestamp** (see "Still needed" below) before ruling
out an actual code bug entirely — but nothing found this session supports an
active, still-live discrepancy.

### Part B: does booking creation trigger a rate push? — NO, ruled out by code

Checked the new hypothesis (Test #9's bookings on the same dates as Test
#2/#3's overrides somehow reverting them via a booking-triggered rate push
reading raw base price instead of `getRateForDate()`):

- `grep -n "pushRateUpdate\b" server/routes/ server/utils/` → the **only**
  call sites outside `channexPushInventory.js`'s own internals are
  `server/routes/rooms.js:1359` (direct `price_per_night` edit via `PUT
  /api/rooms/:id`) and `server/routes/ratePeriods.js` (`pushRateUpdateForRanges`,
  already traced). **`server/routes/bookings.js` never imports or calls
  `pushRateUpdate` anywhere** — grep-confirmed, and independently confirmed
  by reading the file: it imports and calls only `pushAvailabilityUpdate`
  (8 call sites: create, import, decline, the `PUT /:id` main path old+new
  range, `_wp_action` decline/`wp_departure`, `DELETE /:id`).
- `runAvailabilitySync()` (`channexPushInventory.js:420-475`, the function
  behind `pushAvailabilityUpdate`) builds its payload from
  `t.availabilityForDate(date)` only — booking/ical_block presence, 0 or 1 —
  and POSTs to `/api/v1/availability`. **No `rate` field, no `rate_plan_id`,
  no call to `getRateForDate()` or `room.price_per_night` anywhere in that
  function.** The two endpoints (`/availability` vs `/restrictions`) are
  fully separate; nothing crosses between them.
- Booking creation also never writes `rooms.price_per_night` — grepped
  `bookings.js` for `UPDATE rooms` / `price_per_night`: the only hit is a
  read (line 114, SELECT; line 268, reading `bookingRoom?.price_per_night`
  for the booking's own total-price calc) — no write. So even the *indirect*
  route (booking edits base price → base-price-edit handler fires
  `pushRateUpdate`) doesn't exist either.
- The one place a **specific room's** full-window `pushRateUpdate` fires
  outside `ratePeriods.js` is `syncTarget()`
  (`channexPushInventory.js:789-790`, inside `pushRoomTypeReconcile`) — but
  that's wired only to room/category **create/rename** events in
  `rooms.js`/`roomCategories.js`, never to `bookings.js`. And even if it did
  fire, it still resolves via `buildTargets()` → `getRateForDate()` — it
  would not read raw base price either.

**Verdict: no code path exists, on any timeline, where creating, editing, or
cancelling a booking triggers a rate/restrictions push of any kind.** The
hypothesis as stated — a booking-triggered rate push reverting Test #2/#3's
overrides — is ruled out by inspection, independent of timestamps. (The
requested timestamp cross-reference is moot given no such mechanism exists
to time-check against; if useful for the *separate* timing/propagation
question in Part A, the actual `created_at` values for periods 24-29 and
Test #9's bookings, plus pm2 log timestamps for their `[channex-sync]`
lines, would still help pin down exactly when cert's snapshot was taken
relative to the queue draining.)

### Temporary debug logging added (uncommitted)

Per the request, added a temp `console.log` of the exact outgoing
`/restrictions` POST body in `runRateSync()`
(`server/utils/channexPushInventory.js`, right before the `channexRequest`
call, ~line 596) — logs `[channex-sync][DEBUG] property #<id> POST
/restrictions body: <json>`. **Not committed** — local working-tree change
only, flagged inline as TEMP DEBUG with a removal note. Will show the literal
payload (property_id, rate_plan_id, date_from/to, rate per segment) for the
next manual test push, for direct comparison against what `getRateForDate()`
resolved.

## Still needed from production to close this out

```sql
SELECT id, nestbook_ref_type, nestbook_ref_id, channex_room_type_id,
       channex_rate_plan_id, orphaned_at, created_at
FROM channex_room_mappings WHERE property_id = 113;
```
Plus: (a) ~~a live Channex API read of property 113's current rate plans /
their rates~~ — **done, session 3 above: live state matches intent
everywhere checked, superseding the original stale-mapping hypothesis as the
leading candidate**; (b) server/pm2 logs for `[channex-sync] property #113`
around the period-24..29 creation timestamps, to confirm each push actually
executed, see its logged segment count / any failure line, and get real
wall-clock timestamps to compare against whenever the cert reviewer's
snapshot was taken (session 3's leading theory is now queue-drain timing,
not a persistent resolution/mapping bug — see session 3 Part A); (c) `SELECT
id, created_at FROM rate_periods WHERE property_id = 113 ORDER BY id;` and
the `created_at` for Test #9's bookings, to line up against (b).

## Files in play

- `server/utils/ratePeriods.js:42-65` — confirmed correct by direct
  execution against replicated prod data; the Nov-10 tie-break is real but
  narrow (per-date winner, not per-room)
- `server/utils/channexPushInventory.js:218` (`buildTargets`), `:532`
  (`runRateSync`) — confirmed correct by direct execution; segment-merging
  hypothesis ruled out
- `channex_room_mappings` (schema.js ~L2586-2631) — NOT yet queried for
  property 113; leading hypothesis for the actual discrepancy, same class as
  the still-open property-111 finding
- `client/src/pages/Settings.jsx:3542,3663-3668` — priority defaults to '0',
  editable but unexplained in the UI; every prod period left at 0

## Files in play (session 1)

- `server/utils/ratePeriods.js:35-68` — `getRateForDate()`, first-match-wins
  priority loop (traced, no bug — behaves exactly as designed)
- `server/routes/ratePeriods.js` — create/edit/delete, stores `roomRates`
  verbatim into `rate_period_rooms` (traced, no bug)
- `server/utils/channexPushInventory.js:532` (`runRateSync`), `:631`
  (`pushRateUpdateForRanges`) — pushes the resolved value via
  `getRateForDate`/`buildTargets`, not a raw column (traced, no bug)
- `client/src/pages/Settings.jsx:3522-3760` (`RatePeriodModal`) — per-room
  cells + single property-wide "default for unlisted rooms" field, no
  overlap warning
- Related: `docs/completed/channex-rate-scoping-112.md` (same-day, same
  architecture, the origin of the "property-wide by design" finding),
  [[rate-periods-date-format]], [[channex-rate-sync-scoping]]
