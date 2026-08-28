# Media Library — Phase 1a (backend foundation)

Status: **in progress** (started 2026-08-29)
Scope: schema + endpoints only. **No new page.** Phase 1b builds the UI on top.

---

## Confirmed facts (verified — do not re-check)

### room_photos (live schema, `server/nestbook.db`)
Columns in order: `id, room_id, property_id, filename, display_order, created_at, thumb_filename, is_sample_data`
- `room_id` was `INTEGER NOT NULL`, FK → `rooms(id) ON DELETE CASCADE`
- `property_id` `INTEGER NOT NULL`, FK → `properties(id) ON DELETE CASCADE`
- `display_order INTEGER DEFAULT 0` (not NOT NULL)
- `is_sample_data INTEGER NOT NULL DEFAULT 0`
- only index: `idx_room_photos_room (room_id)` — non-unique
- 24 rows live, 0 with NULL room_id

### content_flags (live schema)
Columns: `id, property_id, room_id, content_type, content_ref, preview_text, status, created_at, reviewed_at, reviewed_by`
- `room_id` nullable, FK → `rooms(id) ON DELETE CASCADE`
- `content_type` CHECK: room_photo, hero_photo, property_description, room_description, guest_note, partnership_link, custom_section
- `status` CHECK: pending / verified / removed, default pending
- indexes: `idx_content_flags_status`, `idx_content_flags_property`
- 22 rows live

### The one INSERT point
`server/utils/processRoomPhoto.js` — the ONLY place that inserts into `room_photos`, and the place that inserts the `content_flags` row (`content_type='room_photo'`, `content_ref=filename`, status defaults pending). `attachRoomPhotoFromUrl.js` fetches a URL to a temp file then calls it.

### Photo limits
`PHOTO_LIMITS = { free: 3, pro: 5, multi: 10 }` per IR/WP room, by owner plan. Hardcoded `1` for any room on a `rental_type='units'` property (units + internal rooms alike). No total-per-property cap exists today.

### Static serving
One mount: `server/index.js:102` — `app.use('/uploads', express.static('uploads'))`.
- room photos + thumbs: `/uploads/rooms/{filename}` , `/uploads/rooms/thumb_{filename}`
- hero: `/uploads/properties/{hero_photo}` (NO thumbnail generated)
- property + unit access photos: `/uploads/access/{access_photo}` (NO thumbnail; shared dir, prefix-namespaced `access-{propId}-` vs `access-room-{roomId}-`)

### Router mounts (`server/index.js`)
- `/api/properties` → propertiesRouter
- `/api/rooms` → roomsRouter **then** roomPhotosRouter (both same prefix)
- `/api/admin` → adminRouter (super-admin session)
- roomsRouter has NO patch routes → `PATCH /photos/:photoId` is safe to add on roomPhotosRouter

### Every room/unit delete path (from investigation)
1. `rooms.js:1395` `DELETE /api/rooms/:id` — single room/unit (real user action)
2. `rooms.js:1123` units-importer empty-unit cleanup — failed partial import, **leave as hard delete**
3. `admin.js:560` rental-mode-switch — deletes ALL rooms of a property
4. `admin.js:~841` `DELETE /api/admin/users/:id` bulk account delete (inline, duplicates deleteUserAccount.js)
5. `properties.js:522` owner deletes own property
6. `properties.js:582` `DELETE /:id/sample-data` — already collects filenames + cleans files, scoped `is_sample_data=1`
7. `deleteUserAccount.js:29` — self-serve + admin + unverified-cleanup scheduler
8. `seed.js:86` `reseedDemoProperty()` — demo only

---

## Decisions

- **PHOTO_LIMITS moves to `processRoomPhoto.js`** (pure util) and is re-exported from `roomPhotos.js` for back-compat. Avoids a circular import between `roomPhotos.js` and the new `mediaPool.js`. `rooms.js` still imports it from `./roomPhotos.js` unchanged.
- **New util `server/utils/mediaPool.js`**: `computePoolCap(propertyId)`, `poolCount(propertyId)`, `adoptFileIntoPool({ srcPath, propertyId })`.
- **`processRoomPhoto(filePath, roomId, propertyIdOverride = null)`** — 3rd arg lets pool uploads pass `property_id` directly. When `roomId` is null: `room_id` stored NULL, `display_order` computed over the pool (`property_id = ? AND room_id IS NULL`), `content_flags` row still inserted with `room_id = NULL`.
- **`content_flags.room_photos_id`** added via plain `ALTER TABLE ADD COLUMN` with `REFERENCES room_photos(id) ON DELETE SET NULL`. Backfilled for existing `room_photo` flags via `filename + room_id` match. The remove handler prefers it, falls back to the old `filename + room_id` lookup when null.
- **`content_flags.room_id` FK left as CASCADE** (not changed to SET NULL). Task scope. Consequence: deleting a *room* still cascades away the flags for photos it had — even though those photos now survive in the pool. The scenario Part 1.3 explicitly cares about (photo *moved* via the PATCH endpoint) is unaffected because a move fires no cascade. See "Known limitations".
- **Pool cap enforced only on: direct-to-pool upload (Part 5) + move-into-pool (Part 7).** NOT on hero/access swap-to-pool (Part 3) — you must never be blocked from changing your hero photo.
- **rental-mode-switch (admin.js:560)**: detach non-sample photos to pool; hard-delete + file-cleanup `is_sample_data=1` photos (the "reset" scenario is a sample-data teardown; sample photos should not pollute the pool).
- **adoptFileIntoPool** moves the already-resized source file into `/uploads/rooms/`, derives a 400px thumb, inserts a pool `room_photos` row. **No `content_flags` insert** — relocating an already-reviewed asset.
- Added `idx_room_photos_property` during the table rebuild — the new `/media` endpoint and several teardown paths now query by `property_id`.

---

## Files touched — ALL DONE (built + verified 2026-08-29)

- [x] `server/db/schema.js` — 2 migrations. `room_photos` rebuilt with nullable `room_id` (+ new `idx_room_photos_property`); `content_flags.room_photos_id` added (`REFERENCES room_photos(id) ON DELETE SET NULL`) + backfilled for existing room_photo flags via filename+room_id match.
- [x] `server/utils/processRoomPhoto.js` — `PHOTO_LIMITS` now defined+exported here; `processRoomPhoto(filePath, roomId, propertyIdOverride=null)` — roomId null ⇒ pool photo (room_id NULL, display_order over the pool); content_flags insert now also writes `room_photos_id`.
- [x] `server/utils/attachRoomPhotoFromUrl.js` — private `fetchImageToTmp()` helper; `attachRoomPhotoFromUrl` unchanged signature; new `attachPoolPhotoFromUrl(propertyId, url, label)`.
- [x] `server/utils/mediaPool.js` — NEW: `computePoolCap` / `poolCount` / `adoptFileIntoPool`.
- [x] `server/routes/roomPhotos.js` — re-exports `PHOTO_LIMITS`; `canAccessPropertyId` + `photoLimitForRoom` helpers; `PATCH /photos/:photoId { roomId }`.
- [x] `server/routes/properties.js` — hero + property-access swap-to-pool; `GET /:id/media`; `POST /:id/media/upload` (+ `mediaPoolUpload` multer); `POST /:id/media/upload-url`; `DELETE /:id` now `DELETE FROM room_photos WHERE property_id=?` + post-commit file cleanup.
- [x] `server/routes/rooms.js` — `DELETE /:id` detaches this room's + its internal rooms' photos to the pool; `POST /:id/access-photo` swap-to-pool.
- [x] `server/routes/admin.js` — `/content-flags/:id/remove` room_photo branch prefers `flag.room_photos_id`; `rental-mode-switch` detaches non-sample photos + hard-deletes sample ones with file cleanup; `DELETE /users/:id` scoped by property_id + post-commit file cleanup.
- [x] `server/utils/deleteUserAccount.js` — room_photos delete scoped by property_id + post-commit file cleanup.
- [x] `server/db/seed.js` — `reseedDemoProperty` explicit `DELETE FROM room_photos` + file cleanup.

---

## Verification results (2026-08-29, against a copy of the live DB, restored after)

| Check | Result |
|---|---|
| Migration: room_id nullable, 24 rows preserved, `PRAGMA foreign_key_check` clean, `room_photos_id` col + 12/15 flags backfilled | ✅ |
| Single room delete → photos survive with room_id NULL, visible in `/media` `pool` | ✅ |
| Unit delete → unit + internal-room photos both detach | ✅ (query covers `parent_unit_id = ?`) |
| Rental-mode switch → non-sample detached, 6 sample photos hard-deleted + files removed | ✅ |
| Moderation "Remove" on a photo that was pool-uploaded then moved twice (flag room_id NULL, legacy lookup would fail) | ✅ deleted via `room_photos_id`, file cleaned, flag → removed |
| Hero swap → old file moved `uploads/properties/` → `uploads/rooms/`, thumb generated, pool row, **no new content_flag** | ✅ |
| Unit access-photo swap → old file moved `uploads/access/` → `uploads/rooms/`, pool row, no flag | ✅ |
| `GET /:id/media` shape (hero/propertyAccessPhoto/rooms[{limit,photos}]/unitAccessPhotos/pool{cap,count,photos}) | ✅ IR (cap = rooms×planlimit+12) and units (cap = rooms×1 + 1 + 1 + units + 10, room limit 1) |
| `POST /media/upload` (multipart) + `POST /media/upload-url` (bad URL → "webpage link" msg) | ✅ 201 / 400 |
| Pool cap: blocks `/media/upload`, `/media/upload-url`, and `PATCH …{roomId:null}` at cap | ✅ 403 each |
| `PATCH /photos/:photoId` both directions + destination per-room limit (4th into a 3-cap room → 403) | ✅ |
| Legacy `POST/GET/DELETE /api/rooms/:roomId/photos*` unchanged | ✅ (new upload also writes room_photos_id) |
| Server boots — no circular import (roomPhotos ↔ mediaPool resolved via PHOTO_LIMITS in processRoomPhoto) | ✅ |

**CSV importers — real end-to-end pass (2026-08-29, follow-up):** ran one live import through each of the 4 wizards with a photo URL (`http://localhost:3001/uploads/importtest.jpg`) in the CSV, against a copy of the live DB (restored after). Every one returned `photos_attached: 1`, `photo_errors: []`, and DB-level checks confirmed the `room_photos` row (filename + thumb, both files on disk) and the `content_flags` row with `room_photos_id` correctly set:

| Importer | Endpoint | Result |
|---|---|---|
| Named Rooms | `POST /api/rooms/bulk-import` | ✅ photo attached, flag.room_photos_id set |
| Room Categories | `POST /api/rooms/bulk-import-categories` | ✅ photo attached, flag.room_photos_id set |
| Whole Property | `POST /api/rooms/bulk-import-wp` | ✅ photo attached, flag.room_photos_id set |
| Units (unit row) | `POST /api/rooms/bulk-import-units` | ✅ photo attached, flag.room_photos_id set |
| Units (internal-room row, pass 2) | same | ✅ photo attached, flag.room_photos_id set |

`deleteUserAccount` / `DELETE /users/:id` / demo reseed file-cleanup code was read-reviewed, not executed (destructive).

---

## Known limitations (documented, deliberate — for Phase 1b / later)

- Deleting a *room/unit* cascades away `content_flags` rows for its photos (photos survive in pool, flags don't). Moving a photo is safe. If flag preservation on room-delete is wanted, migrate `content_flags.room_id` → `ON DELETE SET NULL`.
- Unit/property access photos are NOT sent to the pool when the unit/property is *deleted* (only on *replace*, per Part 3). Their files are orphaned on disk the same as today.
- `deleteUserAccount.js` / bulk delete clean up `room_photos` files but not orphaned hero/access files (pre-existing; out of scope).
- Photos detached to the pool by a room delete keep their old per-room `display_order` values (no re-sequencing over the pool), so pool order can have duplicate ordinals — `/media` still sorts deterministically (`display_order ASC, id ASC`). Phase 1b can re-sequence on the page if it matters.
- Orphan `content_flags` rows: hard-deleting a photo (moderation remove, sample cleanup, mode-switch) nulls the flag's `room_photos_id` (SET NULL) but leaves the flag row. Pre-existing behaviour — the remove handler's `if (photo)` guard makes acting on such a flag a safe no-op.

---

## Phase 1b (the actual page) — starting points

- Single call: `GET /api/properties/:id/media`.
- Mutations: `PATCH /api/rooms/photos/:photoId {roomId|null}` (move), `POST /api/properties/:id/media/upload` + `/media/upload-url` (add to pool), plus the existing `POST/DELETE /api/rooms/:roomId/photos*` for room-attached add/remove.
- Frontend components that exist to lean on: `RoomPhotosSection` (RoomPanel.jsx) — per-room strip, no drag; `PropertyHeroPhoto` (Settings.jsx); `ContentReview.jsx` FlagCard grid (`repeat(auto-fill, minmax(260px,1fr))`). **No drag/drop infra anywhere in client/src** — build fresh (`@dnd-kit` or HTML5 DnD).
- `/media` gives `rooms[].limit` and `pool.cap`/`pool.count` so the UI can show "n of m" without recomputing.
