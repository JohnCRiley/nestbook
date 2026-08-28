# Room Import Wizard — Named Rooms mode only

**Status:** in progress — started 2026-08-28
**Goal:** Owners migrating from another system/spreadsheet bulk-import rooms via CSV
instead of typing each one. **Named Rooms mode only.** Room Categories, Units, and
Whole-Property (WP) are out of scope and must be *blocked* server-side (403), not
just hidden in the UI.

---

## Confirmed facts (verified — do not re-check)

### Schema
- `rooms.amenities` — plain comma-separated `TEXT`, nullable, no transform. e.g. `"wifi,ensuite,balcony"`.
- `rooms.bed_config` — stored as a **JSON string**: array of `{ type, qty }` objects,
  e.g. `[{"type":"king","qty":1},{"type":"sofa_bed","qty":1}]`. Empty → stored `NULL`.
  Valid types (exactly six): `single, double, queen, king, sofa_bed, bunk_bed`
  (`VALID_BED_TYPES` in `server/routes/rooms.js`, mirrored `BED_TYPES` in `client/src/utils/bedTypes.js`).
- `rooms` also has: `type` (TEXT, no CHECK anymore), `price_per_night` (REAL), `capacity`
  (INTEGER default 2), `max_occupancy` (INTEGER nullable), `description` (TEXT), `category_id`,
  `parent_unit_id`, `ical_token`, `status` (`available|occupied|maintenance`).
- Named-mode room `type` vocabulary (client `NewRoomModal.jsx` `ROOM_TYPES`): `single, double,
  twin, suite, apartment, other`. Import defaults missing/invalid `type` → `double` (+ warning if non-empty-invalid).
- `properties.ir_room_mode` — exact string `'named'` (vs `'categories'`), default `'named'`.
- `properties.rental_type` — `'rooms'` for IR/Categories; `'units'`, `'whole_property'` otherwise.
- `room_photos` cols: `id, room_id, property_id, filename, display_order, created_at, thumb_filename, is_sample_data`.
- `content_flags` — moderation queue. `content_type` CHECK includes `'room_photo'`. Photo insert uses `content_ref = filename`.

### Existing enforcement (reuse, don't duplicate)
- Free-plan room limit **5** per property (IR/WP): `server/routes/rooms.js` `POST /` handler, IR/WP branch
  (was lines ~331-339). Refactored into `FREE_PLAN_ROOM_LIMIT` const + reused by bulk-import.
- Photo limits by plan: `PHOTO_LIMITS = { free: 3, pro: 5, multi: 10 }` in `server/routes/roomPhotos.js`.
  (Stale `free: 1` comment at `schema.js:1364` — code is authoritative.) Units-mode rooms hard-capped at 1 (N/A here).

### Routing / auth
- `roomsRouter` mounted at `/api/rooms` behind global `requireAuth`; `roomsRouter.use` adds
  `requireVerified` for all non-GET. So `POST /api/rooms/bulk-import` is auth + verified automatically.
- `POST` paths on roomsRouter: `/`, `/:id/access-photo`. `/bulk-import` is a distinct literal path — no `/:id` conflict.
- Server-side URL fetch pattern already exists: `server/utils/seedSampleData.js` `_seedPhoto` uses
  `fetch(url)` → `Buffer.from(await res.arrayBuffer())` → `sharp(buffer)`. Node 24 has global `fetch`.

### i18n
- `client/src/i18n/index.js` — `LANGS = { en, fr, es, de, nl }`, blocks start at lines
  en:9, fr:1470, es:2896, de:4322, nl:5748. New keys added next to the `importBookings*` group in each block.

---

## Decisions

1. **Photo-from-URL reachability:** client cannot check arbitrary photo URLs (CORS). So:
   client validation panel warns only on *malformed* URLs (not `http(s)://…`); the server
   attempts each fetch during import and returns a `photoErrors[]` list which the result step shows.
2. **bed_config CSV cell format:** `type:qty;type:qty` e.g. `king:1;sofa_bed:1`. If *any* entry has an
   invalid type, the **whole** bed_config for that row is dropped, an amber warning is shown, and the
   row still imports. Enforced identically client (preview) + server (authoritative).
3. **Reuse, not duplicate:** photo pipeline extracted to `server/utils/processRoomPhoto.js` (Part 1);
   CSV parser extracted to `client/src/utils/csvParser.js` (Part 2). Both old call sites updated to import.
4. **Hard gate** in `POST /api/rooms/bulk-import`: `403` unless `ir_room_mode === 'named'` AND
   `rental_type === 'rooms'`. Checked from the DB, not trusting the client.
5. **Entry point:** "Import Rooms" button in the B&B rooms toolbar in `client/src/pages/Rooms.jsx`,
   rendered only when `!isCategoriesMode` and `rental_type === 'rooms'` (i.e. Named Rooms).
6. Row-limit pre-check on the client is advisory only (uses loaded room count); the server is authoritative
   and does a partial import, reporting which rows were skipped for the limit.

---

## Files

### New
- `docs/in-progress/room-import-named-rooms.md` (this file)
- `server/utils/processRoomPhoto.js` — extracted photo pipeline (path in → resize + thumb + room_photos + content_flags)
- `client/src/utils/csvParser.js` — extracted char-scanner CSV parser
- `client/src/pages/rooms/ImportRoomsModal.jsx` — the wizard UI

### Modified
- `server/routes/roomPhotos.js` — `POST /:roomId/photos` calls `processRoomPhoto` (behaviour unchanged)
- `server/routes/rooms.js` — `FREE_PLAN_ROOM_LIMIT` const; new `POST /bulk-import`; `parseBedConfigCsv` helper
- `client/src/admin/pages/Outreach.jsx` — import `parseCsv` from shared util (local copy removed)
- `client/src/pages/Rooms.jsx` — Import Rooms button + `ImportRoomsModal` mount
- `client/src/i18n/index.js` — `importRooms*` keys in all 5 locales

---

## Ruled out
- Adding a room-level `amenities` transform / vocabulary — it's free comma text, pass through as-is.
- Client-side photo URL HEAD checks — CORS makes the result meaningless.
- Touching the Units / Categories / WP room-creation paths — explicitly out of scope.
- A DB migration — no schema change needed; every column already exists.

---

## What was actually built (2026-08-28)

### Part 1 — `server/utils/processRoomPhoto.js` (new)
`processRoomPhoto(filePath, roomId)` — takes a path to an image already sitting in
`ROOM_UPLOAD_DIR`, does the 1200px full-size (JPEG q85, written back over the path via
`.tmp` + rename) + 400px thumb (q80, `thumb_<name>`), inserts the `room_photos` row
(next `display_order`) and the `content_flags` `'room_photo'` row, returns
`{ id, filename, thumbName, displayOrder }`. Cleans its own tmp/thumb on throw.
`ROOM_UPLOAD_DIR` is exported from here now.
`server/routes/roomPhotos.js` — `POST /:roomId/photos` now calls the helper instead of
inline sharp/INSERT logic; `import sharp` removed (unused); `PHOTO_LIMITS` is now
`export`ed so rooms.js reuses the exact map. Response shape unchanged
(`{ id, url, displayOrder }`). Verified identical behaviour (Test D).

### Part 2 — `client/src/utils/csvParser.js` (new)
`parseCsv(text)` — the char-scanner parser lifted **verbatim** from Outreach
(handles quoted fields, `""` escapes, newlines inside quotes; comma-delimited).
`client/src/admin/pages/Outreach.jsx` — local copy deleted, now
`import { parseCsv } from '../../utils/csvParser.js'`. One call site (`parseRows`), unchanged.

### Part 3 + 5 — `server/routes/rooms.js`
- `FREE_PLAN_ROOM_LIMIT = 5` const; the existing IR/WP check in `POST /` now references it
  (error string still says "5", now interpolated).
- `IMPORT_ROOM_TYPES = ['single','double','twin','suite','apartment','other']` — unknown
  CSV `type` → `'double'` + warning; empty → `'double'` silently.
- `parseBedConfigCsv(cell)` — parses `"king:1;sofa_bed:1"`; any bad type/qty discards the
  whole cell and returns `{ value: null, warning }`; row still imports.
- `POST /api/rooms/bulk-import` (new, `async`):
  - `403` unless `property.rental_type === 'rooms' && property.ir_room_mode === 'named'`
    (read from DB — Test A confirms 403 for both `categories` and `units`).
  - `canAccessProperty` check; `400` on missing `property_id`/`rows`, empty rows, or >500 rows.
  - Per-row: name required + numeric price required (else pushed to `errors`, row skipped).
    Free plan stops inserting at `FREE_PLAN_ROOM_LIMIT`, remaining rows → `skipped_rows`
    with a `limit_message` (Test C: 4 existing + 1 imported, rows 3–4 skipped).
  - `capacity` clamped 1–20 (default 2); `max_occupancy` int or null; `amenities`/`description`
    trimmed pass-through; `bed_config` via `parseBedConfigCsv`; `ical_token` generated;
    `status` always `'available'`. `logAction ROOM_CREATED` per row.
  - Photos: after all rooms inserted, for each row's `photo_url_1..3` — validates
    `^https?://`, `fetch` with 15s `AbortSignal.timeout`, checks `res.ok` + `content-type`
    starts `image/`, writes buffer to a temp file in `ROOM_UPLOAD_DIR`, calls
    `processRoomPhoto`. Respects `PHOTO_LIMITS[plan]`; a bad URL / 404 / non-image is
    pushed to `photo_errors` and skipped, never fails the row (Test B).
  - Response: `{ imported, rooms_skipped_limit, skipped_rows, warnings, errors,
    photos_attached, photo_errors, limit_message }`.

### Part 4 — `client/src/pages/rooms/ImportRoomsModal.jsx` (new)
4 steps: Instructions (+ template download, collapsible column reference, free-plan hint) →
Upload (dropzone, reuses `.import-*` CSS) → Preview + validation panel → Result.
Client mirrors server validation for the preview: name/price errors (row excluded from
send), unknown type / bad bed_config / malformed photo URL warnings, and an advisory
free-limit pre-check using `currentRoomCount` + running count of valid rows.
Validation panel = up to four coloured blocks (skipped rows / over-limit / bed warnings /
photo-URL warnings). Sends only hard-valid rows to `POST /api/rooms/bulk-import`; result
step shows imported / photos attached / skipped counts + `limit_message` + `photo_errors`.
Template columns: `name,type,price_per_night,capacity,max_occupancy,amenities,description,bed_config,photo_url_1,photo_url_2,photo_url_3`.

### Part 6 — entry point + i18n
`client/src/pages/Rooms.jsx` — "Import Rooms" `btn-secondary` in the B&B rooms toolbar,
rendered only when `property.rental_type === 'rooms' && property.ir_room_mode === 'named'`;
mounts `<ImportRoomsModal>` with `propertyId`, `currentRoomCount={rooms.length}`, `plan`;
`onImported` calls `refreshRooms()`. Confirmed visible + modal renders in-browser as demo.
`client/src/i18n/index.js` — `importRooms*` key group (40 keys, some function-valued) added
to all 5 locales (en/fr/es/nl inserted after each block's `importBookingsWPNote`; nl block
has the import group duplicated in source, block added after the later copy — the one that wins).

### Verification (all ✅)
| Check | Result |
|---|---|
| End-to-end import w/ real CSV (name/price/amenities/bed_config/photo URL) | 3 rooms, bed_config stored as `[{"type":"king","qty":1},…]`, amenities verbatim, photo full+thumb+`content_flags` on disk & DB |
| Direct `POST /bulk-import` on Categories-mode property | `403` "only available for properties in Named Rooms mode" |
| Direct `POST /bulk-import` on Units-mode property | `403` |
| Free plan blocked at 5 rooms mid-import | 1 imported, rows 3–4 in `skipped_rows`, `limit_message` set |
| Invalid `bed_config` (`emperor:1`) | warning surfaced, room imported with `bed_config = NULL` |
| Unknown room `type` (`weirdtype`) | warning, imported as `double` |
| Existing multer photo upload (`POST /:roomId/photos`) | unchanged `{id,url,displayOrder}`, photo + thumb + flag created |
| Outreach CSV import after parser extraction | client build clean; parser byte-identical (quoted commas/newlines/BOM/trailing-blank tests pass) |
| `client && npx vite build` | ✓ built, 863 modules, no errors |
| All test data removed | property 1 back to 4 original rooms, demo=free, rooms/named; no dangling photos/flags |

## Follow-up UX fixes (2026-08-28, commit 2)

From first real use:

1. **bed_config** — case-insensitive matching was *already* in place (both `parseBedConfigCsv`
   server and `parseBedConfigCell` client trim + `.toLowerCase()` the type before comparing
   to `VALID_BED_TYPES` / `BED_TYPES`); comments made this explicit and it's now verified
   (`King:1;Sofa_Bed:1` → stored `[{"type":"king","qty":1},{"type":"sofa_bed","qty":1}]`, no warning).
   Added a visible format hint line in step 1 (`importRoomsBedHint`) and the same hint under
   the bed-warnings block in the validation panel (new `hint` prop on `ValidationBlock`).
2. **Photo URLs**:
   - Step 1 now has a `photo_url_1/2/3` line: `importRoomsPhotoDirectHint` — "Must link
     directly to an image file (ending in .jpg/.png/etc), not a webpage that displays one."
     Same hint repeated under the photo-warnings block in the validation panel.
   - Client: `IMAGE_EXT_RE` — a `photo_url` that is a valid `http(s)` URL but has no image
     extension now raises a soft amber warning (`importRoomsRowNotDirectImage`), non-blocking.
   - Server `POST /bulk-import` photo loop: `looksLikeImageUrl` (same regex) is the discriminator.
     A URL with no image extension that fails (403/HTML/non-image) → "looks like a webpage link,
     not a direct image link …". A real `.jpg` that 404s → still the plain "returned HTTP 404".
     A `.jpg` that returns 200 + non-image → "returned <ctype> instead of an image".
   - Verified: `pexels.com/photo/title/` → webpage message; `…/really-not-here.jpg` (404) → HTTP 404;
     `/about` (HTML) → webpage message; validation panel shows both hint lines in-browser.

New i18n keys (×5 locales): `importRoomsBedHint`, `importRoomsPhotoDirectHint`,
`importRoomsRowNotDirectImage`. No schema or endpoint changes.

## Follow-up: template photo columns (2026-08-28, commit 3)

Template hardcoded only `photo_url_1..3` — fine for Free (cap 3) but Pro (5) / Multi (10)
owners couldn't supply more than 3 via import.

- `ImportRoomsModal.jsx`: `MAX_PHOTO_COLS = 10` + `PHOTO_COLS` array; `TEMPLATE_COLS`
  spreads `...PHOTO_COLS`; `TEMPLATE_CSV` built from `TEMPLATE_ROWS` + 10 trailing empties.
  The CSV-row parser (`TEMPLATE_COLS.map`) and preview/validation loops now iterate
  `PHOTO_COLS` instead of the three literals — so it was NOT template-only; the parser
  and preview were also capped at 3.
- `rooms.js` bulk-import: `photoUrls` now reads `photo_url_1..10` (was `1..3`). The
  per-plan cap in the attach loop (`attached >= photoLimit` → `photo_errors`, row still
  imported) was already correct and unchanged.
- No i18n change (help text already said "up to your plan's photo limit per room").

Verified: template header has 18 cols / 10 `photo_url_*`; Free + 5 URLs → 3 attached,
2 in `photo_errors` ("not attached"), room imported; Multi + 10 URLs → all 10 attached
(display_order 0–9); Pro + 4 valid URLs → all attached, no limit flag; no-photo rows
and 3-column old templates still work unchanged.

## Status: COMPLETE — shipped 2026-08-28 (3 commits). Safe to move to docs/completed/ or delete.
