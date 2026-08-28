# Room Import Wizard — WP (Whole Property) mode

**Status:** in progress — started 2026-08-28
Third and final piece of the Room Import feature, after Named Rooms and Room Categories
(both shipped — see `room-import-named-rooms.md`, `room-import-categories.md`). WP is the
simplest: showcase sections are a flat list of `rooms` rows, no price, no availability,
no grouping.

---

## Confirmed facts (verified — do not re-check)

- WP showcase sections = `rooms` rows on a `rental_type='whole_property'` property. Same table
  as IR, no separate table, no per-row WP flag.
- **No price per section** — `price_per_night` hardcoded `0` server-side, not a CSV column.
  WP pricing is property-level (`whole_property_rate`), untouched here.
- **No `bed_config`** for WP (`showBedsField` excludes it).
- `capacity` advisory — only meaningful for bedroom types (`double, twin, single, bunk, master,
  kids`). Accept any positive int, default 2, never warn.
- `type` — 28-value UI vocab, no DB CHECK. Validate case-insensitively; unknown → non-blocking
  warning + default to `'other'` (NOT `'double'`).
- No showcase-section limit beyond the shared Free-plan 5-room cap (`FREE_PLAN_ROOM_LIMIT = 5`,
  `rooms.js`). Reuse exactly.
- Photo pipeline identical to IR — reuse `processRoomPhoto.js`, `attachRoomPhotoFromUrl.js`,
  `PHOTO_LIMITS` unchanged.
- Property hero photo (`properties.hero_photo`) is separate, one-per-property, **out of scope**.
- Gate: `rental_type === 'whole_property'`.

### Type vocabulary
```
double, twin, single, bunk, master, kids,
bathroom, ensuite, shower_room, wc,
living_room, kitchen, kitchen_diner, dining_room, study, games_room, cinema_room, playroom,
garden, terrace, pool, hot_tub, sauna, gym, garage, games_area,
other
```
Bedroom types (capacity meaningful): `double, twin, single, bunk, master, kids`.

---

## Decisions

1. `WP_ROOM_TYPES` + `WP_BEDROOM_TYPES` consts in `rooms.js`. Unknown type → warn, store `'other'`.
2. `POST /api/rooms/bulk-import-wp` — sibling of the other two in `rooms.js`. Gate `403` unless
   `rental_type='whole_property'`. Flat single pass, one row = one `rooms` row. Hardcode
   `price_per_night = 0`, `status = 'available'`. Reuse `FREE_PLAN_ROOM_LIMIT`, `PHOTO_LIMITS`,
   `attachRoomPhotoFromUrl`, `canAccessProperty`, `logAction`.
3. Response mirrors the Named importer's shape (`imported, rooms_skipped_limit, skipped_rows,
   warnings, errors, photos_attached, photo_errors, limit_message`) — no categories/price fields.
4. Client `ImportRoomsModal.jsx` — add `mode === 'whole_property'` alongside the existing
   `isCat` branch. Flat preview table (name/type/capacity/photos), validation panel shows only
   type warnings + photo-URL warnings + over-limit + row errors. No bed/price/category blocks.
5. Template columns: `section_name, type, capacity, amenities, description, photo_url_1..10`.
6. Entry point — `WholePropertyPage` in `Rooms.jsx` gets the "Import Rooms" button in its toolbar,
   threading `property` / `plan` / `currentRoomCount` / a show-import setter through (currently only
   `onAddBedroom` is passed). `mode='whole_property'` to the modal.

---

## Files

### Modified
- `server/routes/rooms.js` — `WP_ROOM_TYPES`, `WP_BEDROOM_TYPES`; new `POST /bulk-import-wp`
- `client/src/pages/rooms/ImportRoomsModal.jsx` — `mode='whole_property'` branch
- `client/src/pages/Rooms.jsx` — `WholePropertyPage` toolbar + prop threading
- `client/src/i18n/index.js` — `importRoomsWp*` keys ×5 locales

### New
- `docs/in-progress/room-import-wp.md` (this file)

---

## Ruled out
- Two-pass / grouping logic — WP has no categories.
- Any price or bed_config column.
- Touching `properties.hero_photo` / `whole_property_rate`.
- A separate modal component — extend the shared one, matching the other two.

---

## What was built (2026-08-28)

### Part 1 — `server/routes/rooms.js`
- `WP_ROOM_TYPES` (28 values) const.
- `POST /api/rooms/bulk-import-wp` — sibling of the other two importers. Gate: `403` unless
  `rental_type === 'whole_property'`. Flat single pass, one CSV row → one `rooms` row. INSERT
  hardcodes `price_per_night = 0` and `status = 'available'` (neither is a CSV column); no
  `bed_config`, no `category_id`, no `max_occupancy`. `section_name` required (else row error).
  Unknown `type` → non-blocking `warnings` entry + stored as `'other'`. `capacity` accepted as
  any positive int (clamped ≤ 20), default 2, **no warning** regardless of type. Reuses
  `FREE_PLAN_ROOM_LIMIT`, `PHOTO_LIMITS`, `attachRoomPhotoFromUrl`, `canAccessProperty`,
  `logAction`. Response = Named importer's shape (no categories/price fields).

### Part 2 + 3 — `client/src/pages/rooms/ImportRoomsModal.jsx`
- `isWP = mode === 'whole_property'` alongside the existing `isCat`.
- `WP_COLS` / `WP_ROWS` / `WP_ROOM_TYPES`; template `section_name, type, capacity, amenities,
  description, photo_url_1..10`, filename `nestbook-property-sections-template.csv`, endpoint
  `/api/rooms/bulk-import-wp`.
- Row validation (WP): `section_name` required; `type` checked against `WP_ROOM_TYPES`
  case-insensitively → `'type: '`-prefixed warning; **no price check, no bed_config check**.
- The `'type: '` warning prefix + a new **"Unrecognised types"** validation-panel block are
  shared — Named-mode bad-type warnings now also surface in the preview panel (previously only
  in the result step). No behaviour change to what the server does.
- WP preview = flat table **Section / Type / Sleeps / Photos** (no Price, no Beds columns).
- Validation panel for WP shows only: row errors, over-limit, unrecognised types, photo-URL
  warnings. No bed / price-variance / category-conflict blocks (all still gated on `isCat`).
- Result step: "sections imported" label when `isWP`; categories tile still `isCat`-only.
- Step-1 instructions get a WP `how-to` branch (columns / type list / capacity note / photos)
  and a WP `type` hint line in place of the `bed_config` hint.

### Part 4 — `client/src/pages/Rooms.jsx`
- `WholePropertyPage` takes an `onImport` prop; its toolbar now has an "Import Rooms"
  `btn-secondary` next to "+ Add Room".
- `<ImportRoomsModal mode=...>` computes `'whole_property'` when
  `property.rental_type === 'whole_property'`, else falls back to `ir_room_mode` (so a WP
  property whose `ir_room_mode` is the unused default `'named'` still gets the WP branch).

### i18n — `client/src/i18n/index.js`
12 keys ×5 locales (`importRoomsWp*`, `importRoomsRowNoSection`, `importRoomsColSection`,
`importRoomsColSleeps`, `importRoomsPanelTypes`, `importRoomsResSections`), inserted after
`importRoomsGroupRooms` in each block.

---

## Verification (all ✅ — API + real browser UI, demo account, property 1 flipped to whole_property)

| Check | Result |
|---|---|
| Flat showcase sections import; no price / no bed_config | 4 sections, `price_per_night=0`, `bed_config=NULL`, `category_id=NULL`, `status='available'` |
| Invalid `type` (`"jacuzzi"`) | warning "imported as 'other'", row imports with `type='other'` |
| Bedroom type + capacity → stored; non-bedroom (`bathroom`) + capacity → stored, no warning | capacity 6 and 3 both stored, no warnings |
| Case-insensitive type match (`Double`) | stored as `double` |
| Free-plan 5-room limit | 4 existing + 1 imported = cap; rows 3, 4 in `skipped_rows`; "sections" `limit_message` |
| `POST /bulk-import-wp` on an IR (named) property | **403** |
| `POST /bulk-import-wp` on a Units property | **403** |
| Existing "+ Add Room" on WP | unchanged — opens NewRoomModal |
| Property `hero_photo` / `whole_property_rate` after import | untouched |
| Photos via shared helper | valid PNG attached (+ content_flag); pexels page URL → "looks like a webpage link" |
| Named Rooms importer | unchanged — import works, `King:1` accepted, no categories fields |
| Room Categories importer | unchanged — category created, price notes correct |
| `vite build` | clean |
| Test data | property 1 restored to `rooms`/`named`, `whole_property_rate` NULL, demo → `free`, no stray rows/cats/photos |

## Status: COMPLETE — shipped 2026-08-28. All three Room Import Wizard modes (Named / Categories / WP) are now live. Safe to move all three docs to docs/completed/ or delete.
