# Channel Manager parity — Slice C: facilities push — SHIPPED

**Shipped 2026-09-15.** The final piece of Slice C: pushes `structured_amenities`
(rooms/categories) and `properties.amenities` to Channex as `facilities` —
completing the structured-amenities prerequisite built earlier the same day
(`docs/completed/channex-structured-amenities.md`).

## What was built

- **`buildTargets()`** (`server/utils/channexPushInventory.js`) now resolves
  each target's `facilities: string[]` (Channex UUIDs) alongside the existing
  `description`/`photos`:
  - **Named Rooms / Units**: the room's own `structured_amenities`, resolved
    directly via `ROOM_AMENITIES`.
  - **Categories mode**: the category's own `structured_amenities` — same
    "no representative-room fallback" reasoning as `description` already
    uses at this level.
  - **Whole Property mode**: the **union** of every bedroom's
    `structured_amenities`, deduplicated — there's no per-bedroom Channex
    room type to attach individual amenities to (the property itself is the
    one bookable unit), so this mirrors the "combine across every room"
    approach already used for WP photos, rather than picking one
    representative bedroom.
- **`roomTypeAttributes()`** now always includes `facilities: target.facilities
  ?? []` as a plain top-level key (not nested under `content`, confirmed via
  the investigation) — always sent explicitly, even `[]`, same
  always-full-payload convention `description` already uses.
- **`buildChannexPropertyAttributes()`** (`server/utils/createChannexProperty.js`)
  resolves `properties.amenities` via `PROPERTY_AMENITIES` and always
  includes `attributes.facilities`, same convention.
- **`resolveFacilityIds(keys, catalog)`** (new, `amenityCatalog.js`) — maps
  stored catalog keys to their Channex UUIDs, deduplicated, silently
  dropping any key not in the catalog (defense in depth; `normalizeAmenityKeys`
  already filters at write time).
- **New dedicated push path**, deliberately lighter than the existing
  `pushRoomTypeReconcile()` (which also touches title/occupancy/rate-plan/ARI):
  - `pushRoomTypeFacilities(propertyId, refType, refId)` — the
    room/category-level twin of the existing `pushRoomTypePhotos()`. Reuses
    `affectedMappings()` exactly the same way (including WP mode's
    single-mapping resolution), and does a direct `updateRoomType(id, {
    facilities })` against an already-mapped room type only — never creates
    or orphans one.
  - `scheduleRoomTypeFacilitiesPush()` (new, `channexDebounce.js`) — the
    debounced wrapper, same shape as `scheduleRoomTypePhotosPush()`, new
    `'facilities'` batch key so it coalesces independently of rates/
    availability/photos.
  - Property-level facilities reuse the **existing** `schedulePropertyDetailsPush()`
    (no new function needed — `pushPropertyDetails()` already calls
    `updateChannexProperty()`, which now carries `facilities` automatically).
- **Trigger wiring**:
  - `rooms.js` PUT — compares the normalized `structured_amenities` value
    actually written to the raw stored value, fires
    `scheduleRoomTypeFacilitiesPush(propertyId, 'room', id)` on a real change.
  - `roomCategories.js` PUT — same comparison, fires
    `scheduleRoomTypeFacilitiesPush(propertyId, 'category', id)`.
  - `properties.js` PUT — same comparison against `properties.amenities`,
    fires the existing `schedulePropertyDetailsPush(propertyId)`.

## Confirmed field behavior (live staging, differs slightly from description)

- `facilities` is a **plain top-level array**, not nested under `content`.
- Genuine **replace** semantics (sending a new array overwrites the old set,
  confirmed via a live 3-step test: set → replace → clear).
- Unlike `description`'s "omit does NOT clear" quirk, `facilities` behaves
  like an **ordinary field** — omitting the key on a PUT leaves the old value
  untouched. This makes no practical difference here: `roomTypeAttributes()`/
  `buildChannexPropertyAttributes()` are always-full-payload functions (every
  field is always included, every call), so `facilities` is always sent
  explicitly regardless of which omit-behavior it has.

## Verified (2026-09-15, real Channex staging — not just local reasoning)

- **Room-level, real API + real Channex GET**: set `[wifi, tv, safe]` →
  fresh GET on the actual Channex room type confirmed exactly those 3 UUIDs;
  replaced with `[balcony]` → confirmed the old 3 were gone and only balcony
  remained (genuine replace, not additive); cleared to `[]` → confirmed
  empty on Channex.
- **Property-level, real API + real Channex GET**: same 3-step set/clear
  cycle against the real Channex property, confirmed via fresh GET.
- **Browser walkthrough**: logged in as the demo owner, opened a real room's
  edit panel, checked WiFi + TV in the picker, clicked Save — confirmed via
  a fresh Channex GET (not just the save response) that both UUIDs actually
  landed on the room type; cleared them the same way and confirmed removal.
- **Unconnected / nonexistent property**: called `pushRoomTypeFacilities()`
  and `scheduleRoomTypeFacilitiesPush()` directly against an unconnected
  property (`channex_property_id IS NULL`) and a nonexistent property id —
  both resolved in ~1-2ms with no error and no network call.
- **`buildTargets()` resolution logic**, verified directly against the DB
  (wrapped in `BEGIN`/`ROLLBACK` so no data persisted — `node:sqlite` has no
  `.transaction()` helper): Named Rooms resolves each room's own keys;
  simulated Whole Property mode correctly unions two bedrooms' amenities
  into one deduplicated list; simulated Categories mode correctly resolves
  a category's own keys independently per category.
- **No regression**: re-ran a real room price edit through the actual PUT
  route — Channex returned real rate-sync task ids for both the bump and
  the restore, confirming `pushRateUpdate`/`scheduleRatePush` are unaffected.
  `cd client && npm run build` produced an **identical** bundle hash to
  before this slice (expected — this slice is server-only, no client files
  touched). `node --check` clean on every touched server file.
- All test data (room/property amenities) cleared back to `[]` on both
  NestBook and Channex afterward.

## Deliberately out of scope / not re-verified

- Categories-mode's PUT-route trigger (`roomCategories.js`) was verified
  structurally (identical code shape to the proven `rooms.js` trigger, same
  `affectedMappings()` category-branch already exercised by the existing
  rate/availability pushes) and via a direct `buildTargets()` resolution
  test, but not re-verified against a **live, Channex-mapped** category —
  the only Categories-mode property in the dev DB isn't Channex-connected,
  and the one connected property (`property #1`) is Named Rooms mode.
