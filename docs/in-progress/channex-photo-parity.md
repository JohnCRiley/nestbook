# Channel Manager parity — Slice A: room photos (investigation only, no code yet)

**Goal (multi-session "full property parity" project):** Channel-Manager-
connected properties should show photos on the OTA side, not just ARI. This
slice is investigation only — confirms the exact API shape, data source, and
trigger points so a future session can build straight from this, no
re-discovery needed. **No code was written this session.**

## 1. Channex's photo API — confirmed via their docs (WebFetch, 2026-09-15)

- Photos are set via the **existing room-type endpoints NestBook already
  calls** — `POST /api/v1/room_types` (create) / `PUT /api/v1/room_types/:id`
  (update) — nested under a `content` object:
  ```json
  "content": {
    "description": "...",
    "photos": [
      { "url": "https://...", "position": 0, "description": "...", "author": "...", "kind": "photo" }
    ]
  }
  ```
  `position: 0` = cover photo. `kind` is one of `photo` | `ad` | `menu`
  (defaults to `photo`).
- There is **also** a separate dedicated Photos API
  (`GET/POST/PUT/DELETE /api/v1/photos`, `POST /api/v1/photos/upload`) for
  managing individual photos outside a full room-type update. A photo there
  takes `property_id` (required) + optional `room_type_id`. Only documented
  constraint: **position must be unique per `(property_id, room_type_id)`
  pair.**
- **Photos are URL-based, not raw upload**, on the primary path: `url` must
  be "a valid URL address" — Channex fetches it themselves. The
  `/photos/upload` endpoint exists as an alternative (multipart file →
  Channex's own temporary hosted URL, for use when you don't already have a
  public URL) — **NestBook doesn't need this path** (see §2 — our photos are
  already publicly fetchable).
- **No documented limits** on photo count, file size, dimensions, or format,
  after checking both the room-types docs and the dedicated photos docs
  directly. The only practical ceiling comes from NestBook's own side (§4).
- **Recommended approach: use the embedded `content.photos` field on the
  room-type endpoints already in use** (not the separate Photos API) — this
  needs zero new Channex API surface, since `updateRoomType()`
  (`server/utils/channexClient.js:219`) already does a generic PUT passthrough
  of whatever attributes object it's given. Only `roomTypeAttributes()`
  (`server/utils/channexPushInventory.js:670`) — the one function that builds
  the room-type payload for BOTH initial creation and every later
  reconcile/rename — needs to grow a `content.photos` field. Everything
  downstream (`createTargetOnChannex()`, `syncTarget()`) already reuses that
  one function, so this is a single, well-contained change point.
  **Open question for the build session**: docs don't state whether a PUT's
  `content.photos` array does a full replace or an incremental merge. Given
  Channex's Last-Win pattern everywhere else in this integration
  (availability/rates), assume full-replace and confirm with one real PUT
  against staging before relying on it.

## 2. NestBook's photo data — confirmed from the codebase

- **Table**: `room_photos` (`server/db/schema.js`) — `id, room_id
  (NULLABLE), property_id (NOT NULL), filename, display_order, created_at,
  thumb_filename, is_sample_data`. `room_id IS NULL` = the Media Library
  "unassigned pool" (a room/unit was deleted or the photo was explicitly
  detached) — confirmed nullable per the "detach-not-delete" model the task
  mentioned. **`display_order` maps 1:1 onto Channex's `position`** — both
  are 0-based integers, no transformation needed, and 0 already means
  "primary/first" on both sides.
- **Two image variants already exist per photo**, both already correctly
  sized for OTA use, no new processing needed: `filename` (max 1200px wide,
  JPEG q85 — `server/utils/processRoomPhoto.js`) and `thumb_filename` (400px,
  q80, gallery-thumbnail only). **Use `filename` (the 1200px version) for
  Channex** — comfortably over the ~1024px long-edge minimum most real OTAs
  (Airbnb/Booking.com) expect; `thumb_filename` would be too small.
- **Already publicly fetchable, zero auth, right now** — confirmed via
  `server/index.js:107`: `app.use('/uploads', express.static(...))` is
  mounted with no auth middleware in front of it, same origin the public
  booking page (`/book/:slug`) already serves these exact files from for
  guests. **No proxying or new exposure needed.** The only gap: NestBook's
  own booking-page HTML uses *relative* paths (`/uploads/rooms/<filename>`,
  browser-resolved) — there is **no existing helper that builds an absolute
  URL** for a photo. Building one is a one-line addition following the
  pattern already used everywhere else in this codebase (and already once in
  the Channex integration itself, `server/routes/channex.js:108`):
  `` `${process.env.APP_URL ?? 'https://nestbook.io'}/uploads/rooms/${filename}` ``.
- **Property-level "hero" photo is separate**: `properties.hero_image_url`
  → served from `/uploads/properties/<filename>` (different directory, same
  public static mount, same auth-free access). Relevant for Whole-Property
  mode (§3).
- **Per-plan photo caps already exist** (`server/utils/processRoomPhoto.js`):
  `PHOTO_LIMITS = { free: 3, pro: 5, multi: 10 }` per room (Units-mode rooms
  capped at 1 regardless of plan). This already bounds the "volume" question
  for IR-Named/Units/WP modes — see §4.

## 3. Which NestBook photos map to which Channex room type, per rental mode

`buildTargets()` (`server/utils/channexPushInventory.js:218`) is the existing
single source of truth for "what is a Channex room type" per mode — the
natural place to also resolve "what photos represent it":

| Mode | Channex room type = | Photo source (recommended) |
|---|---|---|
| IR-Named / Units | one `rooms` row | `room_photos WHERE room_id = ? AND is_sample_data = 0` — direct 1:1, no ambiguity |
| IR-Categories | one `room_categories` row (many physical rooms) | **Design decision needed** — see below |
| Whole Property | the property itself (`refId: null`) | `properties.hero_image_url` first (if set) → then all rooms' `room_photos`, same priority order the guest-facing booking page already uses (`wpGallerySection()`, `bookingPage.js:343`) |

**IR-Categories is the one real design decision, not just a data lookup.**
The guest-facing booking page already has a precedent
(`bookingPage.js:716-720`, `wsAlternatingShowcase`'s category branch): it
picks one **representative room** — "the first room in category id/price
order that actually has a photo, else the cheapest room" — for the main
card image, but *separately* aggregates **all** rooms' photos across the
category for a "show all N photos" overlay. Two options for the Channex
push:
- **(a) Representative room's photos only** — simpler, matches the main
  gallery a guest sees first, small/safe payload (bounded by one room's
  plan-tier cap, i.e. max 10). **Recommended as the first build.**
- **(b) All rooms' photos in the category, combined** — matches the "show
  all" guest experience more completely, but for a category with many rooms
  could realistically reach several dozen photos (N rooms × up to 10 each on
  Multi plan) — no documented Channex limit says this is unsafe, but it's an
  unforced, avoidable risk for a first version. Worth a later slice, not
  this one.

## 4. Trigger points — what already exists vs. what's new

**Already exists and needs no new code**, because `roomTypeAttributes()` is
shared by both:
- **Initial connect** (`pushInitialInventory()` → `createTargetOnChannex()`)
  — a brand-new room type is created with its title/occupancy/etc.; adding
  `content.photos` here means a property's very first Channex push already
  includes whatever photos exist at that moment.
- **Reconcile on rename/capacity/category change**
  (`pushRoomTypeReconcile()` → `syncTarget()`'s `updateRoomType()` branch,
  already wired into `rooms.js`/`roomCategories.js` on room rename/create/
  delete) — since it also calls `roomTypeAttributes()`, a rename that
  happens to also have new photos would incidentally re-sync them too.

**Genuinely new trigger needed** — a photo-only change (upload/delete/
reorder/move) with no accompanying rename doesn't touch either path above.
`server/routes/roomPhotos.js` has exactly 4 mutation routes, all of which
already have (or can cheaply get) the `property_id` + `room_id` a push needs:
- `POST /:roomId/photos` (upload)
- `PUT /:roomId/photos/reorder`
- `DELETE /:roomId/photos/:photoId`
- `PATCH /photos/:photoId` (Media Library move between rooms / unassigned
  pool — a move needs **two** pushes, old `room_id` and new `room_id`, since
  it changes two room types' photo sets at once; moving *to* the unassigned
  pool needs no push, since nothing bookable shows those photos)

**Recommended shape for the new trigger** (naming/signature only — not
built): a `pushRoomTypePhotos(propertyId, refType, refId)` in
`channexPushInventory.js`, called exactly like every existing trigger
(`scheduleAvailabilityPush`/`scheduleRatePush`/`pushRoomTypeReconcile`) —
fire-and-forget, `.catch(() => {})`, never awaited in the response path,
silent no-op if unconnected. It should reuse `affectedMappings()`
(`channexPushInventory.js:325`) exactly as the availability/rate pushes do —
callers just say `pushRoomTypePhotos(propertyId, 'room', roomId)` regardless
of the property's actual rental mode, and the existing shared resolver
already knows how to walk a room id up to its category's mapping when
needed. No new resolution logic required.

**Debounce**: a generic coalescing debouncer already exists
(`server/utils/channexDebounce.js`, `scheduleRatePush`/
`scheduleAvailabilityPush`, 7s wait / 10s max) for exactly the "rapid
back-to-back saves" problem a drag-to-reorder UI would create. The photo
trigger should plug into the same mechanism (or a parallel one built the
same way) rather than firing one PUT per drag step.

## 5. Volume / rate-limit considerations

- **No Channex-documented limit** on photo count or payload size (checked
  directly, twice, against both the room-types and photos API docs).
- **Practical ceiling comes from NestBook's own plan caps**, already in
  place: max 10 photos per room type (Multi plan) for IR-Named/Units/WP
  targets — a small, safe payload regardless of format. IR-Categories is the
  only mode where volume could grow unbounded (§3's option (b)), which is
  exactly why (a) is the recommended first-build default.
- **Rate limiting is already handled** — `updateRoomType()` already routes
  through `channexQueue.js` as a `kind: 'other'` job (the same queue class
  as every other room-type/rate-plan CRUD call), which already has its own
  retry/backoff. Photos travel inside the same PUT call as everything else
  in `roomTypeAttributes()`, so they inherit this automatically — **no new
  rate-limit handling needed** for the embedded-photos approach. (The
  separate dedicated Photos API, if ever used instead, would need its own
  queue wiring — one more reason the embedded approach is simpler.)

## Confirmed facts (don't re-check next session)

- `display_order` (NestBook) ≡ `position` (Channex), 0-based both sides, no
  transform.
- `/uploads/*` has zero auth in front of it — already proven safe/intended
  by the public booking page using the exact same URLs.
- `roomTypeAttributes()` is the ONE function to extend; it already flows
  into both create and update paths with no divergence.
- `affectedMappings()` already solves "which Channex room type does this
  room/category/property-wide change affect" — reuse it, don't rebuild it.
- No absolute-URL-builder for photos exists yet; the `process.env.APP_URL ??
  'https://nestbook.io'` pattern is already used 7+ times elsewhere in this
  codebase (including once already in the Channex integration itself,
  `channex.js:108`) — follow it exactly, don't invent a new convention.

## Ruled out / deferred

- The separate dedicated Photos API (`/api/v1/photos`) — the embedded
  `content.photos` field on the already-used room-type endpoints does the
  same job with zero new API surface, zero new queue wiring.
- Uploading raw bytes via `/photos/upload` — unnecessary, NestBook's photos
  are already public URLs Channex can fetch directly.
- IR-Categories "all rooms' photos combined" (§3 option b) — real option,
  deliberately deferred past the first build.
- Any new image processing/resizing — the existing 1200px/q85 `filename`
  variant is already OTA-appropriate.

## Next steps (not started)

1. Extend `buildTargets()`'s per-mode branches to also expose a resolved
   photo list (or a lazy accessor, consistent with how `rateForDate`/
   `availabilityForDate` are already exposed as functions) per target.
2. Extend `roomTypeAttributes()` to build `content.photos[]` from that list,
   with the absolute-URL builder described in §2.
3. One real PUT against Channex staging to settle the full-replace-vs-merge
   question from §1 before relying on it.
4. Add `pushRoomTypePhotos()` (§4) and wire it into `roomPhotos.js`'s 4
   mutation routes, debounced.
5. Decide IR-Categories representative-room vs. all-rooms (§3) — default to
   representative-room for the first build unless directed otherwise.
