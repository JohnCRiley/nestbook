# Channex certification failure — property 111 rate-plan mapping + payload batching

**Status (2026-09-11): finding #4 (500-day rate-sync flood) FIXED — see below.
The primary hypothesis (stale `channex_room_mappings` IDs) is still DIAGNOSIS
ONLY, no code changed there. Still awaiting production data from John (queries
#1–#3 below) to confirm/rule that out.**

Channex certification review rejected the submission. Every rate-related test failure
cites: our pushes targeted `def240dc-832a-4377-8c94-1f1d3a8200b3` and
`b093be03-6918-4866-998b-76cb404bc359`, Channex expected
`09e78da6-b971-46dc-a414-c85b9dddef45` ("Twin Best Available Rate") and
`d45f4bc4-ecc8-4033-acf5-1b1667fc86f1` ("Double Best Available Rate"). One test
showed ~500 days of updates for a single intended date/rate. Two availability
tests expected quantities 7 / 3 / 4; we sent 0 / 1.

NestBook property **111** → Channex property **`4bd43d5e-8ba8-4176-8f46-cccbafb8a282`**.

---

## Confirmed facts (live Channex staging API, read-only, 2026-09-11)

The local `server/.env` `CHANNEX_API_KEY` (staging) can see property `4bd43d5e`.
Queried it directly. Current live state:

| Kind | ID | Title | Links to | notes |
|---|---|---|---|---|
| room_type | `d45f4bc4-ecc8-4033-acf5-1b1667fc86f1` | "Room 1" | — | `count_of_rooms: 1`, occ_adults 2 |
| room_type | `09e78da6-b971-46dc-a414-c85b9dddef45` | "Room 2" | — | `count_of_rooms: 1`, occ_adults 2 |
| rate_plan | `def240dc-832a-4377-8c94-1f1d3a8200b3` | "Room 1 — Standard" | room_type `d45f4bc4` | rate 98.00 currently |
| rate_plan | `b093be03-6918-4866-998b-76cb404bc359` | "Room 2 — Standard" | room_type `09e78da6` | rate 105.00 currently |

- **The reviewer's two "expected" IDs (`09e78da6`, `d45f4bc4`) are ROOM TYPE ids on
  this property.** The two "wrong" IDs (`def240dc`, `b093be03`) are the RATE PLAN
  ids — and each rate plan is correctly attached to the expected room type
  (`def240dc`⇄`d45f4bc4`, `b093be03`⇄`09e78da6`).
- Titles "Twin/Double Best Available Rate" appear **nowhere** on the property.
  Our code names rate plans `"<title> — Standard"`. "Best Available Rate" is
  Booking.com channel terminology → the reviewer was describing the
  Channex↔Booking.com **channel mapping screen**, which is keyed on room_type_id.
- Current availability IS set on the room_type_ids (correct); current rates ARE
  set on the rate_plan_ids (correct). The live property is internally consistent
  **right now**.
- `acc_channels_count: 0` — no channel connected now (was during cert).
- 1 booking on the property: "Emma Johnson", `OFL-TEST#11`, ota_name "Offline",
  status cancelled, inserted 2026-09-10, room_type `09e78da6` + rate_plan
  `b093be03` (correct pairing).
- Availability currently carries 0-blocks on `09e78da6` (2026-09-18..21) and
  `d45f4bc4` (2026-09-12..15) that do NOT match that one cancelled booking →
  they came from **real NestBook-side bookings/ical_blocks on property 111** that
  synced out. Property 111 is a live property with real activity, not inert.
- Only 2 Channex properties exist on the key: `a50e441f` (Local Dev / prop #1)
  and `4bd43d5e` (prop #111). No orphan/duplicate Channex property.

## Confirmed facts (code)

- `channex_room_mappings` row stores BOTH `channex_room_type_id` and
  `channex_rate_plan_id`. Its own `channex_property_id` column is **written but
  never read** — every push uses `properties.channex_property_id` (current) for
  the payload `property_id`, plus `m.channex_room_type_id` / `m.channex_rate_plan_id`
  from the row. No code cross-checks the two.
- **No code path ever UPDATEs `channex_room_type_id` / `channex_rate_plan_id` on
  an existing mapping row.** Writers: INSERT (`pushInitialInventory` L985,
  slice-7 `syncTarget` L690), UPDATE `orphaned_at` only (L749), DELETE
  (`disconnectChannexProperty` L1091, initial-push rollback L1013). Slice-7
  reconcile of an *existing* mapping does `PUT /room_types/:id` in place — keeps
  the same IDs, never regenerates them.
- `channex-create` → 409 if `channex_property_id` already set.
  `channex-push` → 409 if any `channex_room_mappings` rows exist.
  UNIQUE index `(property_id, nestbook_ref_type, IFNULL(nestbook_ref_id,-1))`.
  ⇒ a supported reconnect REQUIRES `channex-disconnect` first (deletes all
  mapping rows). A re-push with stale rows still present throws on the INSERT →
  rollback.
- ⇒ **Stale mapping IDs can only persist on prod if the Channex side was rebuilt
  WITHOUT NestBook's disconnect→create→push** — e.g. room types/rate plans
  deleted & recreated in the Channex dashboard, `properties.channex_property_id`
  edited via SQL, or mapping rows hand-deleted then re-pushed onto a property
  that already had objects. Nothing in the app reconciles the stored IDs against
  what Channex actually has.

### Payload shape (finding #4) — CONFIRMED batched, not per-date

`coalesce()` merges per-night values into contiguous `{date_from,date_to,value}`
segments. ONE `POST /availability` with a `values[]` array spanning every
affected room_type; ONE `POST /restrictions` with `values[]` spanning every
affected rate_plan. Never one object per date.

**500-day flood cause — FIXED (2026-09-11).** `ratePeriods.js` always called
`pushRateUpdate(pid, 'property', null, null, null)`. In `runRateSync` the clamp
`if (refType !== 'property' && dateFrom && dateTo)` was skipped for
`refType==='property'` → `from/to` = full 500-day window → every rate plan
re-pushed across 500 days on ANY rate-period create/edit/delete.

Fix: the clamp now applies whenever `dateFrom`/`dateTo` are given, regardless of
`refType` (`server/utils/channexPushInventory.js` `runRateSync`). A genuine full
sync still passes `null, null` explicitly (initial connect, slice-7 reconcile's
`syncTarget`, the Super Admin "Push Inventory" button's `pushInitialInventory` —
none of those call sites were touched) and still gets the full window.
`ratePeriods.js`'s three handlers now call a new
`pushRateUpdateForRanges(propertyId, ranges)` instead of `pushRateUpdate`
directly — it resolves the period's real affected calendar nights via the same
`dateInRange()` the rate engine uses (now exported from
`server/utils/ratePeriods.js`), correctly handling the annual `MM-DD` vs
one-off `YYYY-MM-DD` distinction (see [[rate-periods-date-format]]) and
year-wrap, then pushes one narrow `pushRateUpdate()` call per contiguous
affected span. An edit passes BOTH the pre- and post-update ranges (so a night
that leaves the period's range on a shrink/move still gets re-resolved, not
just the new range) — verified locally against Channex staging (property #1)
with a shrink case (coalesces to one segment covering the old span) and a move
case (two disjoint narrow segments), plus confirming a direct
`pushRateUpdate(pid, 'property', null, null, null)` call still logs the full
~500-day window. Availability path (`pushAvailabilityUpdate` / `bookings.js` /
slice-7's `syncTarget` ARI calls) was NOT touched — it was already correctly
scoped.

### Room-type quantity (finding #5)

Live room types are `count_of_rooms: 1`. Property 111 is IR-Named, 2 rooms → 2
room types 1:1. `buildTargets` hardcodes `countOfRooms: 1` and pushes
`availability ∈ {0,1}` (`nightIsFree ? 1 : 0`). We can never emit 7/3/4. If a
cert test expected those, its room type had `count_of_rooms > 1` on the
Channex/Booking side — a mismatch with NestBook's strict 1-physical-room model.
Needs a Channex conversation; not fixable by sending pooled counts.

---

## NOT yet confirmed — need John / production

1. **Production `channex_room_mappings` for property 111** — run on the Hetzner box:
   ```sql
   SELECT id, nestbook_ref_type, nestbook_ref_id, channex_property_id,
          channex_room_type_id, channex_rate_plan_id, orphaned_at, created_at
   FROM channex_room_mappings WHERE property_id = 111;
   ```
   Compare `channex_room_type_id` / `channex_rate_plan_id` against the live IDs in
   the table above. If they differ → stale mapping confirmed as root cause.
   Also check the row's `channex_property_id` vs `properties.channex_property_id`
   for 111.

2. **Reconnect history** — `SELECT created_at, action, detail FROM audit_log
   WHERE property_id = 111 AND action LIKE 'CHANNEX%' ORDER BY created_at;`
   Looking for a CHANNEX_DISCONNECTED / second CHANNEX_PROPERTY_CREATED /
   multiple CHANNEX_INVENTORY_PUSHED — or the ABSENCE of a disconnect between two
   connects (⇒ Channex side rebuilt out of band).

3. **Concurrent activity during the cert test window (finding #6)** —
   `pm2 logs --lines 2000 --nostream | grep -E "channex|#111"` and
   `SELECT id,status,check_in_date,check_out_date,created_at,updated_at FROM
   bookings WHERE property_id = 111 ORDER BY created_at DESC LIMIT 30;` plus
   `rate_periods` edits for 111 — any booking / rate edit / manual Push Inventory
   with a timestamp inside the reviewer's window means NestBook was pushing real
   ARI on top of the reviewer's test calls.

4. Certification report itself — exact test names, timestamps, and the payloads
   Channex logged receiving.

---

## Leading hypothesis

Stale `channex_room_mappings` on production for property 111: the rows hold
room_type/rate_plan IDs from a **first, discarded connection**, and a later
reconnect (or an out-of-band Channex-side rebuild) never overwrote them because
no code path updates those columns. During cert, every availability + rate push
cited the dead IDs; Channex expected the live objects (`09e78da6`/`d45f4bc4` +
their plans). The live property looking consistent *now* suggests it was rebuilt
cleanly (disconnect + create + push) AFTER the failed submission — which would
have generated fresh, matching rows and left the old Channex objects deleted.
Confirm with query #1 + #2.

Secondary, independent issue regardless of the above: ~~the rate-sync always
pushes the full 500-day window (finding #4)~~ **FIXED 2026-09-11, see above** —
and IR-Named can only ever send 0/1 availability (finding #5), which will still
trip a cert test that expects a multi-unit quantity. Finding #5 is NOT fixed —
needs a Channex conversation, not a code change (NestBook's 1-physical-room
model can't emit pooled counts).

## Files in play

- `server/utils/channexPushInventory.js` — `buildTargets`, `runAvailabilitySync`,
  `runRateSync`, `pushInitialInventory`, `syncTarget`, `disconnectChannexProperty`,
  `pushRateUpdateForRanges` (new, 2026-09-11) — no edits made here for the
  mapping-ID issue (still open, see "NOT yet confirmed" above)
- `server/utils/channexClient.js` — `updateAvailability`, `updateRates`
- `server/routes/admin.js` L720-833 — channex-create / channex-push / channex-disconnect
- `server/routes/ratePeriods.js` — create/edit/delete now call
  `pushRateUpdateForRanges` (fixed 2026-09-11, was the `'property'` full-window
  rate push)
- `server/db/schema.js` L2586-2631 — channex_property_id column, channex_room_mappings table
