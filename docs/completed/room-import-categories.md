# Room Import Wizard — Room Categories mode

**Status:** in progress — started 2026-08-28
Second half of the IR Room Import feature. The Named Rooms importer already shipped
(`docs/in-progress/room-import-named-rooms.md`, 4 commits). This adds the Categories-mode
path: one endpoint, a shared photo helper, a mode branch in the existing modal.

---

## Confirmed facts (verified — do not re-check)

- `room_categories`: `id, property_id (NOT NULL), name (TEXT NOT NULL), buffer (INTEGER NOT NULL
  DEFAULT 0), display_order (INTEGER NOT NULL DEFAULT 0), created_at, amenities (TEXT null),
  description (TEXT null)`.
- `buffer` = a **room-count reserve** held back from automatic online booking (not time-based),
  default 0. Not in the CSV template — new categories get `buffer = 0`, owner sets it later in Settings.
- `amenities` / `description` live on `room_categories` and are the guest-facing source in this mode
  (`bookingPage.js` `categoryShowcase()`). Free comma-separated text, same as `rooms.amenities`.
- **No uniqueness constraint** on `room_categories.name` (only a non-unique index on `property_id`).
  The importer dedupes category names itself, case-insensitively + trimmed.
- `price_per_night`, `bed_config`, `capacity`, `max_occupancy` are all **per-room**. Intra-category
  price variation is expected: booking page shows a `€min–€max` range (or "From €X" when uniform);
  bed row only shown when every room in the category has an identical `bed_config`.
- Category booking assigns the **lowest-id available room** and charges **that room's** rate.
- `rooms.name` NOT NULL, required, owner-visible only (admin Rooms page groups RoomCards under each
  category), never shown to guests (guests see "Room 1/2/3" ordinals in the photo overlay).
- `rooms.type` NOT NULL DEFAULT `'double'` — not in the Categories template; imported rooms default to `'double'`.
- Free-plan room limit check (`rooms.js`, `FREE_PLAN_ROOM_LIMIT = 5`) counts **all** rows in `rooms`
  for the property regardless of `category_id`. Reuse as-is.
- Category creation and room creation are always two separate steps today. No existing path creates both.
- `POST /api/properties/:id/room-categories` currently reads only `{ name, buffer, display_order }` and
  **silently drops `amenities`/`description`** sent on create — a real bug (Part 1 fixes it).
- **No categories-mode property exists in the local DB.** All 9 are `ir_room_mode='named'`. Must flip
  a test property to `'categories'` to build/verify.
- Photos attach to the **room** (`room_photos.room_id`). Categories have no photo pipeline — correct
  per how the booking page reads photos (per-room, flattened into the category showcase).

---

## Decisions

1. **Part 1** — extract `createRoomCategory(propertyId, {...})` into `roomCategories.js`, used by both
   the fixed POST route and the bulk importer, so category-create logic lives in one place.
2. **Photo helper** — extract the URL fetch/validate/attach loop body from the Named importer into
   `server/utils/attachRoomPhotoFromUrl.js` (`attachRoomPhotoFromUrl(roomId, url, label)` →
   `{ attached, error }`, never throws). Named importer refactored to call it (identical messages).
   Categories importer uses the same helper. No duplication.
3. **New endpoint** `POST /api/rooms/bulk-import-categories` — sibling of `/bulk-import`, same file,
   reuses `parseBedConfigCsv`, `FREE_PLAN_ROOM_LIMIT`, `PHOTO_LIMITS`, `canAccessProperty`.
   Inverse gate: `403` unless `rental_type='rooms' && ir_room_mode='categories'`.
4. **Two-pass**: pass 1 resolves the distinct category names (existing → id; new → `createRoomCategory`
   with first-row amenities/description, `buffer=0`, `display_order` = current max + 1, incrementing);
   pass 2 inserts rooms with the resolved `category_id`, `type='double'`.
5. **Category detail conflict** — later row with different `category_amenities`/`category_description`
   for an already-seen name → non-blocking `category_warnings` entry, first row's values kept.
6. **Price variance** — after import, for each touched category compute min/max `price_per_night`
   across ALL its rooms (existing + imported). If spread ≥ 5% of the min, add an informational
   `price_notes` entry ("category 'X' now has rooms priced €min–€max — normal, shows as a range").
   Not a warning, not an error.
7. **Client** — one `ImportRoomsModal.jsx`, `mode` prop branches template/validation/preview.
   Categories preview groups rows under their resolved category (fetched existing categories tagged
   "existing" vs "new"). Result step adds categories-created / conflict / price-note sections.
8. **Entry point** — widen the Rooms.jsx button condition to `ir_room_mode` ∈ {named, categories};
   pass `mode` to the modal, which posts to the right endpoint.

---

## Files

### New
- `docs/in-progress/room-import-categories.md` (this file)
- `server/utils/attachRoomPhotoFromUrl.js` — shared single-URL photo attach helper

### Modified
- `server/routes/roomCategories.js` — Part 1 fix + `createRoomCategory` export
- `server/routes/rooms.js` — refactor `/bulk-import` photo loop onto the helper; new `/bulk-import-categories`
- `client/src/pages/rooms/ImportRoomsModal.jsx` — `mode` branch (template, validation, preview, result)
- `client/src/pages/Rooms.jsx` — button visible for named|categories; pass `mode`
- `client/src/i18n/index.js` — `importRoomsCat*` keys ×5 locales

---

## Ruled out
- A separate modal component — task says branch the existing one.
- A `category_buffer` CSV column — not in the spec's template; buffer stays 0 on import.
- Room-level amenities/description in Categories mode — not guest-facing here; left null.
- A category photo pipeline — photos are per-room, correct as-is.

---

## What was built (2026-08-28)

### Part 1 — `server/routes/roomCategories.js`
- `createRoomCategory(propertyId, { name, buffer, display_order, amenities, description })` exported —
  one INSERT covering all six columns, returns the row.
- `POST /api/properties/:id/room-categories` now destructures `amenities`/`description` and calls
  `createRoomCategory` — they persist on create. **Verified via the real Settings modal**: a category
  created with amenities + description keeps both (previously dropped until a later PUT). PUT untouched.

### Shared photo helper — `server/utils/attachRoomPhotoFromUrl.js` (new)
`attachRoomPhotoFromUrl(roomId, url, label)` → `{ attached }` | `{ attached:false, error }`, never
throws. Holds the `http(s)` check, the "webpage link vs direct .jpg" discriminator, the fetch +
content-type check, temp-file write, and `processRoomPhoto` call. The Named `/bulk-import` photo loop
was refactored onto it (identical messages — `label` = `Row N ("name")`). `ROOM_UPLOAD_DIR` /
`processRoomPhoto` imports dropped from `rooms.js`.

### Part 2 + 3 — `POST /api/rooms/bulk-import-categories` (`server/routes/rooms.js`)
- Gate: `403` unless `rental_type='rooms' && ir_room_mode='categories'`.
- Reuses `parseBedConfigCsv`, `FREE_PLAN_ROOM_LIMIT`, `PHOTO_LIMITS`, `canAccessProperty`, and the
  photo helper.
- **Pass 1** — distinct `category` names (lower+trim). Existing → reuse id. New → `createRoomCategory`
  with the FIRST row's `category_amenities`/`category_description`, `buffer=0`,
  `display_order` = (max existing) + 1, incrementing. A later row with a **non-empty** differing detail
  value → `category_warnings` entry (a blank later value is fine, not a conflict). `ROOM_CATEGORY_CREATED`
  audit entry per new category.
- **Pass 2** — one room per row: `type='double'` (no CSV column), per-row
  `room_name`/`price_per_night`/`capacity`/`max_occupancy`/`bed_config`, resolved `category_id`,
  `status='available'`, fresh `ical_token`. Free-plan cap → `skipped_rows` + `limit_message`.
- Any category THIS import created that ends with zero rooms is deleted (all its rows failed).
- Photos attach to the **room** via the shared helper, per-plan cap respected.
- **Price notes** — per touched category, min/max `price_per_night` across ALL its rooms; if spread
  ≥ 5% of the min, an informational `price_notes` string (currency symbol from `properties.currency`).
- Response: `imported, categories_created[], groups[], rooms_skipped_limit, skipped_rows, warnings,
  category_warnings, price_notes, errors, photos_attached, photo_errors, limit_message`.

### Part 4 — `client/src/pages/rooms/ImportRoomsModal.jsx`
`mode` prop (`'named'` | `'categories'`). Categories mode:
- template = `category,room_name,price_per_night,capacity,max_occupancy,bed_config,category_amenities,category_description,photo_url_1..10`
- fetches existing categories on open → preview groups tagged **new** / **existing**
- preview renders one bordered table per resolved category (case-insensitive grouping)
- validation panel adds: category-detail conflicts (amber), price-range notes (blue) — plus the
  reused bed-config / photo-URL / over-limit / row-error blocks
- result step adds a "categories created" tile, per-group room counts, `category_warnings`,
  `price_notes`. `ValidationBlock`/`ResultBlock` share a `TONES` map (added `blue`, `orange`).
- posts to `/api/rooms/bulk-import-categories`.
Named mode is unchanged in behaviour (same template, same flat table, same endpoint).

### Part 5 — `client/src/pages/Rooms.jsx`
"Import Rooms" button now shows when `ir_room_mode` ∈ {`named`, `categories`}; passes
`mode={property?.ir_room_mode}` to the modal.

### i18n — `client/src/i18n/index.js`
17 new `importRoomsCat*` / shared keys ×5 locales (en/fr/es/de/nl), inserted after
`importRoomsResPhotoIssues` in each block.

---

## Verification (all ✅ — via API + real browser UI, demo account, property 1 flipped to categories)

| Check | Result |
|---|---|
| Import creates categories, rooms grouped under the right category | 4 rooms → "Double" (2), "Family" (1), "Deluxe" (1 — reused existing); `groups` echoed |
| Two rows same category name, different casing (`Double` / `double`) | merged into ONE "Double" category, 2 rooms |
| Second row's differing amenities/description ignored, warning shown, first row's values persisted | `category_warnings` entry; category stored with row-2 `"wifi,ensuite"` |
| Later row leaving detail blank | **no** false conflict warning (fixed after first browser test) |
| Rooms in a category at different prices (€95 / €105) | imported fine, `price_notes`: "priced €95–€105 … normal … price range", no error |
| `POST /bulk-import-categories` on a Named-mode property | **403** |
| `POST /bulk-import-categories` on a Units-mode property | **403** (rental_type check) |
| `POST /bulk-import` (Named) on a Categories-mode property | **403** — Named gate still correct |
| Free-plan room limit across categories | 4 existing + 1 imported = cap; rows skipped + `limit_message`; empty "Premium" category auto-removed |
| Existing category modal (create) after Part 1 fix | amenities + description now persist on create (browser-verified) |
| Named Rooms importer (previous feature) | unchanged — import works, `King:1` accepted, photo attached, no categories fields |
| Shared photo helper in categories endpoint | webpage URL → "looks like a webpage link"; dead `.jpg` → "returned HTTP 404"; valid → attached |
| `vite build` | ✓ clean |
| Test data | property 1 restored to `named`, demo → `free`, 0 stray categories/rooms/photos |

## Status: COMPLETE — shipped 2026-08-28. Safe to move to docs/completed/ or delete.
