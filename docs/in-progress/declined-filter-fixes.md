# Fix: stale `declined` filters (owner calendar + dashboard) + decline-page rebrand miss

Status: **built + verified in-browser, committed to `main`**. 2026-08-30 (John).
Delete this file once John has eyeballed it on prod data.
Follow-on from the investigation earlier this session (declined WP booking still
blocking the owner calendar; WP-vs-Units booking-flow comparison).

## Root cause

`declined` is a first-class booking status ([bookingConstants.js], badge + label,
in `STATUS_OPTIONS`). Server availability code is all correct — either allowlists
that omit `declined`, or denylists that include it (`hasOverlap`,
`/bookings/check`, `/bookings/booked-rooms`, widget conflict + `/day-availability`,
`bookingPage.js` calendar query, iCal export, `wp-summary` `active`/`next14`/`pending`).
Only a handful of **client-side denylists predating the status** were never
updated: `status !== 'cancelled' && ... !== 'cancelled_unpaid' && ... !== 'checked_out'`
with no `!== 'declined'`.

## Changes (pure exclusion additions — no other behaviour change)

### client/src/pages/Calendar.jsx
- `cellInfo()` `active` finder (~L104) — the IR-Named / IR-Categories / Units
  week-grid cell-state resolver (via `RoomRow`). Added `b.status !== 'declined'`.
- `MonthGrid()` inline `booking` finder (~L435) — the WP month calendar
  (`WholePropertyCalendar` → `MonthGrid`). Added `&& b.status !== 'declined'`.
  (The `historical` finder below each already keys on `=== 'checked_out'`, so a
  declined booking correctly falls through to "no booking" / empty cell.)

### client/src/pages/Dashboard.jsx
- `monthRevenue` filter (~L248) — declined `total_price` was inflating the
  non-WP "revenue this month" tile.
- `occupiedRoomIds` set (~L267-270) — a declined booking overlapping today was
  marking its room occupied → dropped from Available Tonight + occupancy %.
- `flaggedBookings` (~L288).
- `inHouseToday` / `inHouseTomorrow` (~L1330-1335) — breakfast-covers counts.

### server/routes/bookings.js  — `wp-summary` statsRow (~L539)  [BEYOND the literal task list]
- `status NOT IN ('cancelled','cancelled_unpaid')` → added `'declined'`.
- Why included: this is the **only** source of the WP dashboard's
  "Bookings this month" / "Nights booked" / "Revenue this month" tiles
  (Dashboard.jsx:535-537, `wpSummary.stats.*`). The task's own verification
  bullet requires the "monthly booking stat" to exclude declined; for WP that
  stat is server-side. Same one-token class of fix. Flagged in the report.

### server/routes/widget.js  — `approvalPage()` (~L880)  [Part 3, rebrand miss]
- `body{...background:#f0faf0}` → `#F4F3F0`. The sage/stone rebrand commit
  `212e6ee` touched this function (`#1a4710` → `#405440` for the success colour
  + link) but left the pale-green page background — exactly the
  `#f0fdf4/#f9fbf8 -> #F4F3F0` mapping that commit documents.
- `approvalPage()` is a **single shared function** for both the approve and the
  decline confirmation pages (all `res.send(approvalPage(...))` in the token
  approve/decline handlers), so this one line fixes both. Success colour
  `#405440`, link `#405440`, decline colour `#dc2626` (matches the app's own
  `declined` badge, Dashboard.jsx:58) — all already correct, left as-is.

## Verification (2026-08-30, local dev stack)

Fixture: fresh account via `/api/auth/register` (declinetest@localdev.test →
property 37, rooms Rose/Ivy), email-verified in DB. Bookings: one `confirmed` +
two `declined` (one overlapping "today" 2026-08-30 and `flagged`). Property 37
flipped rooms→units→whole_property to exercise each renderer. **All fixtures,
the test property, and user 74 deleted afterward.**

- ✅ **IR-Named** (`cellInfo`): declined booking's cells render `is-empty` "+",
  confirmed still `is-booked`. Clicking a freed cell → New Booking modal
  pre-filled with that date + room (not the declined panel).
- ✅ **Units** (same `cellInfo` path): declined Sep 10–13 cells `is-empty`,
  confirmed Sep 5–8 still `is-booked`.
- ✅ **IR-Categories**: not re-tested separately — `RoomRow`/`cellInfo` is the
  identical non-WP code path (the room grid never branches on `ir_room_mode`);
  IR-Named + Units cover it.
- ✅ **WP** (`MonthGrid`): declined Sep 10–13 cells `wpc-available`, confirmed
  Sep 5–7 `wpc-booked` "Alice Confirmed". Declined 165 overlapping confirmed 163
  did not win the `bookings.find()` — "Alice Confirmed" shows. Clicking a freed
  WP cell → New Booking (WP variant) pre-filled.
- ✅ **Dashboard (non-WP)**: with 1 declined + 1 confirmed both overlapping today
  on separate rooms — Available Tonight **1** (was 0), Occupancy **50%** (was
  100%), Revenue This Month **€300** (declined's €500 excluded, was €800),
  Today/Tomorrow Breakfast **3 covers** (declined's 2 excluded, was 5), **no**
  Flagged Bookings banner (declined+flagged 166 excluded).
- ✅ **Dashboard (WP)** via `wp-summary`: Bookings This Month **1**, Nights **3**,
  Revenue **€300** — declined excluded (server fix at bookings.js:539).
- ✅ Decline + approve confirmation pages: `curl` → `body{...background:#F4F3F0}`,
  headings/links `#405440`, decline accent `#dc2626` (matches app badge).
  Success branch rendered via a real token → same cream bg, `#405440` + ✓.
- ✅ Confirmed booking panel still opens on click; confirmed/checked_out cells
  still render and block; WP "current stay" + "upcoming" still list confirmed.

- ✅ `npm run build --workspace=client` clean.

## Notes for John
- Running `npm run db:seed --workspace=server` mid-session (to get a demo login I
  ended up not needing) **replaced property 1 ("Local Dev")'s 4 rooms** with the
  seed's Chambre Lavande/Mistral/Suite Provence/Olivier + bookings 159–162. The
  seed is documented as the demo-login path and targets property id 1, but this
  did overwrite whatever custom rooms were there. Re-run the seed or restore from
  a backup if you had specific data on property 1.

## Ship
Committed + pushed to `main`. Delete this file once confirmed on prod data.
