# Room Import Wizard — Units mode (Self-Catering: Aparthotel / Glamping / Serviced Apartment)

**Status:** in progress — started 2026-08-28
Fourth and final Room Import mode, after Named Rooms, Categories, WP (all shipped).
Most structurally complex: two levels (unit → internal rooms), per-unit access fields,
mode-specific caps and a 1-photo limit.

---

## Confirmed facts (verified — do not re-check)

- Gate: `rental_type === 'units'`. `un_sub_type` is irrelevant — all sub-type behaviour lives
  on `properties`. One importer covers all three sub-types.
- A unit = `rooms` row, `parent_unit_id IS NULL`. Internal room = `rooms` row,
  `parent_unit_id` = the unit's id. Self-referencing FK, `ON DELETE CASCADE`.
- `rooms.type` has a real 32-value CHECK — invalid insert 500s. **Coerce**, don't just warn:
  unit type unknown → `'apartment'`; internal-room type unknown → `'other'`.
- Unit type vocab: `single, double, twin, suite, apartment, other`.
  Internal-room type: the WP 28-value list (already in the modal as `WP_ROOM_TYPES`).
- Price is unit-only, required real value. Internal rooms hardcode `price_per_night = 0`.
- No `bed_config` in this mode.
- Capacity: unit has a default; internal rooms advisory (bedroom types only, never warn).
- Caps: Free → max 5 units/property (`parent_unit_id IS NULL` count). All plans → max 5
  internal rooms/unit (structural). **Separate counts from `FREE_PLAN_ROOM_LIMIT`** — do not reuse it.
- Photo limit: **1 per row** (unit or internal room), all plans. Pass a hardcoded `1` to the
  photo-attach loop, not `PHOTO_LIMITS[plan]`.
- Access fields (`access_method`, `access_code`, `arrival_instructions`) — units only.
  `access_method` ∈ `none/code/keybox/keyed/app/other`; invalid/blank → `'none'`. The bulk
  endpoint writes them directly on INSERT (it's server-side, not bound by the POST route's
  field allowlist) but validates the whitelist itself.
- `staffed_checkin_available` (INTEGER, default 0) — per-unit. Accepts `yes/no/1/0`
  case-insensitive; blank/invalid → 0.

---

## Decisions

1. `UNIT_TYPES = ['single','double','twin','suite','apartment','other']`,
   `VALID_ACCESS_METHODS = ['none','code','keybox','keyed','app','other']`,
   `UNIT_PHOTO_LIMIT = 1` consts in `rooms.js`. Reuse `WP_ROOM_TYPES` for internal rooms.
2. `POST /api/rooms/bulk-import-units` — sibling of the other three in `rooms.js`. Gate `403`
   unless `rental_type === 'units'`.
3. Two-pass, mirroring the Categories importer:
   - **Pass 1** — rows with blank `room_name` define units. Group by `unit_name`
     (lower+trim). First occurrence → INSERT unit (type coerced, price required, capacity,
     amenities, description, `access_method` validated, `access_code`, `arrival_instructions`,
     `staffed_checkin_available` parsed). Free-plan 5-unit cap here. A later unit-defining row
     for the same name with a differing non-blank unit field → non-blocking `unit_warnings`
     entry, first row wins (exact Categories "later row ignored" pattern).
   - **Pass 2** — rows with `room_name` filled → INSERT internal room under the resolved
     unit id (`parent_unit_id`), type coerced to `'other'` default, capacity advisory,
     `price_per_night = 0`. 5-internal-rooms-per-unit cap here (all plans). If such a row also
     carries unit-only fields (price / access_* / staffed) → `warnings` "ignored on a room row".
4. Photos: single `photo_url` column; `attachRoomPhotoFromUrl(roomId, url, label)` with the
   cap check `attached >= 1` in the caller. Attaches to the unit row or the internal-room row
   depending on which the CSV row created.
5. Empty-unit cleanup: any unit THIS import created that ends with zero internal rooms AND had
   zero pre-existing rooms → delete it, drop from `units_created` — same as Categories.
6. Client: `ImportRoomsModal.jsx` `mode === 'units'` branch. Grouped preview (units → internal
   rooms) with unit price shown prominently. Validation panel: unit conflicts, invalid types,
   invalid access_method, photo-URL warnings, over-limit (unit cap vs per-unit-room cap,
   distinct messages).
7. Entry point: `UnitsPage` toolbar gets "Import Rooms" (prop threading like WP). `Rooms.jsx`
   modal `mode` resolution gets an explicit `rental_type === 'units'` branch.

---

## CSV template
```
unit_name, room_name, type, price_per_night, capacity, amenities, description, access_method, access_code, arrival_instructions, staffed_checkin_available, photo_url
```
`room_name` blank → unit-defining row. `room_name` filled → internal room under `unit_name`.
`price_per_night` / `access_*` / `staffed_checkin_available` read from unit rows only.

---

## Files

### Modified
- `server/routes/rooms.js` — consts + `POST /bulk-import-units`
- `client/src/pages/rooms/ImportRoomsModal.jsx` — `mode='units'` branch
- `client/src/pages/Rooms.jsx` — `UnitsPage` toolbar + prop threading + modal mode resolution
- `client/src/i18n/index.js` — `importRoomsUnit*` keys ×5 locales

### New
- `docs/in-progress/room-import-units.md` (this file)

---

## Ruled out
- Reusing `FREE_PLAN_ROOM_LIMIT` — units has its own two caps.
- Multiple photo columns — 1-photo cap makes them pointless.
- A per-sub-type variant — sub-type doesn't affect unit/room creation.
- Touching `properties` sub-type fields.
- `bed_config`.

---

## What was built (2026-08-28)

### Part 1 — `server/routes/rooms.js`
- Consts: `UNIT_TYPES` (6), `VALID_UNIT_ACCESS_METHODS` (6), `UNIT_FREE_PLAN_LIMIT = 5`,
  `ROOMS_PER_UNIT_LIMIT = 5`, `UNIT_PHOTO_LIMIT = 1`, `parseYesNo()`.
- `POST /api/rooms/bulk-import-units`, gate `403` unless `rental_type === 'units'`.
  - **Pass 1** — rows with blank `room_name` define units, grouped by `unit_name` (lower+trim).
    First occurrence → INSERT unit (type coerced to `UNIT_TYPES`, default `'apartment'`; price
    required real value; capacity 1–20 default 2; amenities/description; `access_method` validated
    against the whitelist, invalid/blank → `'none'`; `access_code`; `arrival_instructions`;
    `staffed_checkin_available` via `parseYesNo`). Free-plan 5-unit cap here. Coerced type / access
    → non-blocking `warnings`. A later unit-defining row with a differing **non-blank** field →
    `unit_warnings` entry, first row wins.
  - **Pass 2** — rows with `room_name` → INSERT internal room, `parent_unit_id` = resolved unit id,
    `price_per_night = 0`, type coerced to `WP_ROOM_TYPES` default `'other'`, capacity advisory.
    5-internal-rooms-per-unit cap (all plans) → `skipped_room_rows`. Unit-only fields present on a
    room row → `warnings` "only apply to a unit row". A room row with no resolvable unit → `errors`.
  - Empty-unit cleanup: a THIS-import unit with 0 children **and** ≥1 CSV room row targeting it →
    deleted, dropped from `units_created`, added to `units_removed`. (Safety net — dormant under
    normal validation since a resolvable room row never errors, but present for direct-API edge cases.)
  - Photos: single `photo_url` per row, `attachRoomPhotoFromUrl(id, url, label)` with an
    `already >= UNIT_PHOTO_LIMIT` guard (hardcoded `1`, not `PHOTO_LIMITS[plan]`).
  - Response: `imported, units_imported, rooms_imported, units_created, units_removed, groups
    [{unit, price, room_count, rooms}], units_skipped_limit, rooms_skipped_limit,
    skipped_unit_rows, skipped_room_rows, warnings, unit_warnings, errors, photos_attached,
    photo_errors, currency_symbol, limit_message` (two messages joined when both caps hit).

### Part 2 + 3 — `client/src/pages/rooms/ImportRoomsModal.jsx`
- `isUnits = mode === 'units'`. `UNIT_COLS` / `UNIT_ROWS` / `UNIT_CSV` (single `photo_url`, no
  `buildTemplate` — hand-joined since it has no photo_url_N columns). Endpoint/filename/title.
- Fetches all rooms on open → existing unit names + per-unit existing internal counts, for the
  advisory Free-cap + per-unit-cap prechecks.
- Row validation branches unit-defining vs internal-room. Warning prefixes: `type:`, `access:`,
  `stray:`, `photo:`. Internal-room bad type uses `importRoomsUnitRoomBadType` ("room type … other").
- `unitGroups` (unit → `unitRow` + `roomRows`, tagged existing), `unitConflicts` (client mirror of
  the server first-row-wins rule).
- Preview: grouped like Categories, each unit header shows its price prominently (only price in
  this mode) or a red "no unit-defining row" flag.
- Validation panel: **two** over-limit blocks (`importRoomsPanelUnitOverLimit` vs
  `importRoomsPanelRoomOverLimit`, distinct messaging), plus unit conflicts, unrecognised access
  methods, "fields ignored on internal-room rows", reused type/photo/error blocks.
- Result: `units imported` / `internal rooms` tiles, unit groups echo (with price), `units_removed`
  notice, `unit_warnings`.

### Part 4 — `client/src/pages/Rooms.jsx`
- `UnitsPage` takes `onImport`; toolbar gets "Import Rooms" `btn-secondary` next to "+ Add Unit".
- `<ImportRoomsModal mode=...>` resolves `'units'` when `rental_type === 'units'` (its `ir_room_mode`
  is the unused default `'named'`, which would otherwise route to the Named branch).

### i18n — `client/src/i18n/index.js`
27 keys ×5 locales (`importRoomsUnit*`, `importRoomsRowNoUnit`, `importRoomsPanelAccess/Stray/
UnitConflicts/UnitOverLimit/RoomOverLimit`, `importRoomsResUnits/Rooms`, `importRoomsUnitRoomBadType`).

---

## Verification (all ✅ — API + real browser UI, demo account, property 1 flipped to units)

| Check | Result |
|---|---|
| Unit + 2 internal rooms; unit real price, internal rooms `price_per_night = 0` | ✓ (unit 140, both internal 0) |
| Invalid unit type (`penthouse`) → `apartment` + warning; invalid internal type (`jacuzzi`) → `other` + warning; no 500 | ✓ |
| Invalid `access_method` (`lockbox`) → `'none'`, no error | ✓ |
| `staffed_checkin_available` `yes`/`no` case-insensitive → 1/0 | ✓ |
| 2nd unit-defining row (`pod a` vs `Pod A`) with different price → `unit_warnings`, first price (90) wins | ✓ |
| Free-plan blocked at 5 units mid-import (imported 7 units → 5 in, rows 9/11 skipped, `limit_message`) | ✓ |
| Internal-room cap of 5 enforced on **Pro** (6 rows → 5 in, row 9 skipped) | ✓ |
| Photo cap 1 per row regardless of plan | ✓ (unit + internal room = 1 each) |
| `/bulk-import-units` on an IR / WP property → 403 | ✓ |
| Named / Categories / WP importers still work unchanged | ✓ (all re-verified) |
| All 3 sub-types (Aparthotel / Glamping / Serviced Apartment) → identical behaviour | ✓ (1 unit + 1 room, no errors, for each) |
| Stray unit fields on a room row → warning, ignored | ✓ (`access_code` etc. on Bed Nook → warning, stored null/0) |
| Browser: Units toolbar "Import Rooms", grouped preview, validation panel, result step, page refresh | ✓ |
| "+ Add Unit" unaffected | ✓ |
| `vite build` | ✓ clean |
| Test data | property 1 restored to rooms/named + 4 original rooms, demo → free, `un_sub_type` NULL, no orphans |

## Status: COMPLETE — shipped 2026-08-28. All four Room Import Wizard modes (Named / Categories /
WP / Units) are now live. Safe to move all four docs to docs/completed/ or delete.
