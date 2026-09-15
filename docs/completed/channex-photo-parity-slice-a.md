# Channel Manager parity — Slice A: room photos — SHIPPED

**Shipped 2026-09-15.** Pushes NestBook room photos to Channex, keeping the
guest-facing photo gallery in sync with what OTAs see. First slice of the
"full property parity" project (photos only — description/facilities/etc.
are later slices).

## The plan changed mid-build — read this first

The investigation doc this was scoped from (now deleted, see git history —
`docs/in-progress/channex-photo-parity.md`) assumed the simplest possible
mechanism: embed `content.photos[]` in the room-type `POST`/`PUT` calls
NestBook already makes, resending the complete current list every time.

**That assumption was tested empirically against real Channex staging
(per the task's explicit instruction) and found wrong.** Confirmed live:

- `PUT /api/v1/room_types/:id` with `content: { photos: [...] }` is
  **add-only**. Pushing `[B]` after `[A]` was already live resulted in
  **both** `A` and `B` on Channex — not just `B`. There is no way to express
  "this is the complete list, remove anything else" through that field.
- Resending the *same* source URL again correctly no-ops (no duplicate) —
  Channex dedupes by matching the fetched image, so the field isn't purely
  naive-additive — but it genuinely has no removal mechanism at all.

This meant the original plan (§2 of the investigation: "just resend
`content.photos` — automatically covers create + reconcile") would have
**silently accumulated stale photos forever** — a real image never actually
being removed from Channex even after being deleted in NestBook, precisely
the "drift" the task's point 5 warned about. Verifying against real Channex
staging rather than trusting the docs' description of the field caught this
before it shipped.

## What was actually built instead

Photos are managed through Channex's **dedicated Photos API**
(`POST`/`PUT`/`DELETE /api/v1/photos`), which supports genuine per-photo
create, update, and delete — confirmed live to work correctly for all three
operations, including real deletion (independently confirmed via a fresh
`GET` after each delete, not just trusting the delete response).

### New tracking table: `channex_room_type_photos`

```sql
CREATE TABLE channex_room_type_photos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  channex_room_type_id  TEXT    NOT NULL,
  source_key            TEXT    NOT NULL,   -- 'room_photo:<room_photos.id>' or 'hero:<property_id>'
  channex_photo_id      TEXT    NOT NULL,
  position              INTEGER NOT NULL,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
)
-- UNIQUE (channex_room_type_id, source_key)
```

Necessary, not optional: Channex's own photo `id` is only ever returned once
(at creation) and is never derivable from the source URL again (Channex
re-hosts every photo on its own CDN and discards the original URL from the
response). Without storing it, there would be no way to identify which
Channex photo to `DELETE` when a NestBook photo is removed. A dedicated
table (rather than a `room_photos.channex_photo_id` column) was used
specifically so the same mechanism also covers Whole-Property's hero photo
(`properties.hero_image_url`), which isn't a `room_photos` row at all — no
special-casing needed.

### `server/utils/channexClient.js` — 3 new functions

`createPhoto()`, `updatePhoto()`, `deletePhoto()` — thin wrappers, same
`queuedWrite()` pattern (rate-limited + retried) as every other Channex
object CRUD call in this file.

### `server/utils/channexPushInventory.js` — the core logic

- `absoluteUrl(relativePath)` — builds a real public URL from
  `process.env.APP_URL ?? 'https://nestbook.io'`, the exact fallback pattern
  already used 7+ times elsewhere in this codebase (including once already
  in the Channex integration, `routes/channex.js`'s webhook URL). Necessary
  because Channex fetches photos by URL themselves — a relative path
  (correct for the guest-facing booking page, browser-resolved) means
  nothing to their servers.
- `photosForRoom(roomId)` / `representativeCategoryPhotos(roomIdsByPrice)` —
  resolve `{ sourceKey, url }` pairs per room. Categories mode deliberately
  pushes only the **representative room's** photos (cheapest room that
  actually has one, else just the cheapest) — matches the exact rule the
  guest-facing booking page already uses for a category's main image
  (`bookingPage.js`'s `wsAlternatingShowcase`). Combining every room's
  photos in a category is a real, deliberately deferred option (risks an
  unbounded photo count with no Channex-documented ceiling) — noted in code
  comments, not a bug.
- `buildTargets()` — each of the three mode branches (WP / Categories /
  IR-Named+Units) now also returns `photos: [{sourceKey, url}]` in display
  order. WP combines the hero photo (if set) first, then every room's
  photos — mirrors `bookingPage.js`'s `wpGallerySection()` priority order.
- `roomTypeAttributes()` — explicitly does **NOT** set `content.photos`
  (reverted after the empirical finding above; see its doc comment).
- `reconcileRoomTypePhotos(channexPropertyId, channexRoomTypeId, target)` —
  the actual sync: diffs `target.photos` against the tracked rows, deletes
  what's no longer wanted, creates what's new, repositions what moved. Called
  from:
  - `createTargetOnChannex()` — initial room-type creation (new property
    connect, or a brand-new room/category).
  - `syncTarget()`'s existing-mapping branch — every rename/capacity-change
    reconcile also re-syncs photos for free.
  - `pushRoomTypePhotos(propertyId, refType, refId)` — the **new** trigger
    for a photo-only change, same never-throws/no-op-if-unconnected contract
    as `pushAvailabilityUpdate`/`pushRateUpdate`, reusing `affectedMappings()`
    for ref resolution exactly as they do (no new resolution logic).

### `server/utils/channexDebounce.js` — `scheduleRoomTypePhotosPush()`

Third `pushType` (`'photos'`, alongside the existing `'rates'`/
`'availability'`) through the same generic coalescing `schedule()` — a
multi-photo upload or a drag-to-reorder no longer fires one outbound call
per photo/step. Confirmed live during testing that the existing "widen to
property-wide on a second distinct scope in the same window" behavior
applies for free (a Media Library move between two rooms correctly
triggered one property-wide flush touching both, not two separate narrow
ones) — no new code needed for this, it's inherited from the shared
`schedule()` infrastructure.

### `server/routes/roomPhotos.js` — 4 wired trigger points

`POST /:roomId/photos` (upload), `PUT /:roomId/photos/reorder`,
`DELETE /:roomId/photos/:photoId`, `PATCH /photos/:photoId` (Media Library
move — fires **two** pushes, source room and destination room, since a move
changes two room types' photo sets at once; moving to/from the unassigned
pool needs no push on that side, since nothing bookable shows pool photos).

## Verified (2026-09-15, real Channex staging — not just local reasoning)

- **The replace-vs-merge question itself**: proved empirically (see above) —
  this is what drove the architecture change.
- **Full reconcile algorithm**, called directly against a real connected
  room type (property #1, `a50e441f`, real staging):
  - Push `[A]` → 1 photo on Channex, tracked.
  - Push `[A, B]` → A untouched, B added (2 total) — confirmed via a fresh
    `GET /api/v1/photos`, not just the create response.
  - Push `[B]` only → **A actually deleted** from Channex (confirmed via
    `GET` showing exactly 1 remaining), B repositioned 1→0.
  - Push `[]` → B deleted, 0 remaining (confirmed via `GET`).
  - Pure reorder `[A,B]` → `[B,A]` (no add/remove) → exactly 2 `PUT`
    position calls, no create/delete calls, positions correctly swapped.
- **Real HTTP route wiring** (upload/reorder/delete/move, via curl against
  the actual running dev server): each correctly triggered the debounced
  push with the right property/room id. The Channex calls themselves 422'd
  with `"original_url": ["is not supported host"]` — expected and harmless:
  local dev's `APP_URL=http://localhost:3001` is genuinely unreachable from
  Channex's servers, not a code defect. (Separately proved real public HTTPS
  URLs — tested against Wikipedia-hosted images as a stand-in — work
  correctly; production's real `https://nestbook.io` URLs will behave the
  same way.) Confirmed via server logs that every failure was caught
  non-fatally (`(non-fatal)` logged, no crash, no unhandled rejection, no
  stale tracking rows left behind since the creates never actually
  succeeded).
- **Unconnected property** — direct call, 4ms, zero network calls (same
  cheap `isChannexConnected()` guard pattern as the existing availability/
  rate pushes, checked in both `schedule()` and the push function itself).
- **buildTargets() photo resolution correctness**, verified without
  polluting real data (`BEGIN`/`ROLLBACK` against the live dev DB, sharing
  the app's own `db` singleton so the uncommitted rows were visible to the
  code under test):
  - IR-Categories: a category with one room having a photo and a cheaper
    room having none → correctly resolved to the room *with* the photo
    (matches the "prefer the room that actually has a photo" rule).
  - IR-Categories, zero photos anywhere in the category → empty array, no
    crash.
  - WP mode (dry-run, synthetic property object over real room data, no
    mutation) → hero photo correctly resolved first with the right
    `/uploads/properties/` path.
- **Existing rate/availability push behavior is unaffected** — directly
  re-ran `pushAvailabilityUpdate`/`pushRateUpdate` against the same real
  connected property after all changes; both still returned real Channex
  task ids, confirming zero regression (`roomTypeAttributes()` is the only
  shared function touched, and it's not used by either of those paths).
- Real Channex staging independently re-verified clean (0 photos across all
  5 real room types) after every test round; local DB independently
  re-verified clean (0 test rooms/categories/photos/tracking rows) after
  every test round.
- `node --check` clean on every touched server file.

## Deliberately out of scope (per the task / investigation)

- IR-Categories "combine every room's photos" — representative-room-only is
  the shipped default; combining remains a real, deferred option.
- Property-level content (description, facilities, important information) —
  later slices of the "full property parity" project.
- A durable/persistent version of the debounce batching (still in-memory,
  same acceptable tradeoff as the existing rate/availability debounce).
