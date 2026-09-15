# Channel Manager parity — Slice B: room & property descriptions — SHIPPED

**Shipped 2026-09-15.** Pushes NestBook's room, category, and property
descriptions to Channex, so a connected listing reads the same as
NestBook's own booking page instead of bare text. Second slice of the
"full property parity" project (Slice A was photos).

## Investigation findings (confirmed against real Channex staging first, per Slice A's lesson)

- **The `room_type_descriptions[]` field the task's premise referenced does
  not exist as a real, effective field.** Directly tested: `PUT
  .../room_types/:id` with `{ room_type_descriptions: [...] }` returned 200
  but the field was silently dropped — absent from the response, no error.
  The real, working field (confirmed via both the docs and a live GET) is
  **`content.description`** — a single plain string, no language array, the
  same sibling field `content.photos` already lives under. Same shape at
  the property level.
- **Unlike photos, `content.description` behaves as a genuine scalar field
  with normal REPLACE semantics** — confirmed live: pushing a new value
  overwrites the old one cleanly, never accumulates/concatenates. This is
  the opposite of Slice A's finding for `content.photos` (add-only, no
  replace) — confirming the task's explicit instruction not to assume the
  two behave the same was the right caution.
- **Also confirmed**: a `PUT` sending only `{ content: { description: X } }`
  (omitting `photos` entirely) does **not** wipe existing photos — Channex
  preserves `content`'s other sub-fields independently. This means
  `roomTypeAttributes()` (Slice A's photo-free builder) can safely gain
  `content.description` without any interaction with `reconcileRoomTypePhotos()`'s
  separate photo management.
- **One real edge case found and handled**: omitting `content.description`
  entirely on an update (rather than sending `null`) leaves the **old**
  value in place — it does not clear it. Since a NestBook description can
  legitimately be cleared back to empty, `content.description` is always
  sent (even as `null`), both at the room-type and property level — unlike
  `address`/`city`/`country`/`timezone` in `createChannexProperty.js`, which
  are still fine to omit since there's no "clear it" requirement for those
  yet.

## Where NestBook stores these (confirmed, all pre-existing columns)

- `rooms.description` — IR-Named / Units modes.
- `room_categories.description` — IR-Categories mode. Per the schema's own
  comment ("Categories mode: amenities/description move from the room
  level to the category level — guests book a category, not a specific
  physical room"), this is what the booking page already shows, and now
  what Channex gets too — not a representative room's description.
- `properties.description` — used directly for Whole Property mode's
  single Channex room type (WP's target IS the property), and for the
  Channex property's own `content.description`.

## The build

- **`server/utils/channexPushInventory.js`**: `buildTargets()`'s three
  branches now each resolve `description` from the correct source above.
  `roomTypeAttributes()` gained `content: { description: target.description ?? null }`
  (always present, per the clearing finding). New `pushPropertyDetails(propertyId)`
  — reuses `updateChannexProperty()` (the same function the existing manual
  "Update Property Details" button and its Super Admin twin call), so this
  is never a second way of building the property payload. New
  `isChannexPropertyConnected(propertyId)` — checks `channex_property_id`
  directly (no mapping rows required), since property-level details don't
  depend on any room type existing yet.
- **`server/utils/createChannexProperty.js`**: `buildChannexPropertyAttributes()`
  now always sets `content.description`.
- **`server/utils/channexDebounce.js`**: `schedule()` gained an optional
  `isConnectedFn` parameter (defaults to the existing `isChannexConnected`)
  so the new `schedulePropertyDetailsPush()` can use
  `isChannexPropertyConnected` instead — otherwise the shared debounce
  pre-check would wrongly skip a property that's connected but not yet
  mapped.
- **Room/category triggers — reused existing plumbing, no new function
  needed**: `rooms.js`'s `roomTypeChanged` boolean (already firing
  `pushRoomTypeReconcile(..., 'renamed', ...)` on a name/capacity/occupancy/
  category/status change) gained `description` as one more condition.
  `roomCategories.js`'s equivalent rename-trigger gained the same. Both
  reuse the exact existing reconcile path — `syncTarget()` already calls
  `roomTypeAttributes()`, which now carries the description automatically.
  No debounce needed here: this is the same single-fire-per-Save-click
  behavior a name change already has, not a rapid-fire trigger like
  photo uploads.
- **`server/routes/properties.js`**: on a description change, fires
  `schedulePropertyDetailsPush()` (debounced) always, and — **only for
  Whole Property mode** — also `pushRoomTypeReconcile(propertyId, 'property', null, 'created')`
  (the bulk-refresh entry point; it's the only way to reach WP's single
  target, since a narrower `refType:'whole_property'` call is deliberately
  a no-op elsewhere in that function for non-bulk callers). Never fires
  this second call for IR-Named/Categories modes, since a plain property-
  description edit doesn't affect their room/category-sourced descriptions
  — avoids doing real but pointless Channex API work.

## Verified (2026-09-15, real Channex staging — not just local reasoning)

- **The room_type_descriptions / content.description finding itself** —
  proved empirically, as above.
- **Room description**: set via the real `PUT /api/rooms/341` route →
  fired the existing reconcile path → independently confirmed via a fresh
  `GET /api/v1/room_types/:id` that `content.description` landed correctly.
  Edited again to a different string → confirmed clean replace, not
  concatenation. Cleared back to `null` → independently confirmed via GET
  that it actually cleared on Channex, not just locally.
- **Property description**: set via the real `PUT /api/properties/1` route
  → debounced push fired (`[channex-sync] property #1 — details re-synced`)
  → independently confirmed via `GET /api/v1/properties/:id`. Cleared back
  to `null` → confirmed cleared on Channex too.
- **No-op correctness**: resubmitting an unchanged room payload produced
  zero new Channex calls (confirmed via log — the widened `roomTypeChanged`
  boolean correctly stays `false` when nothing relevant changed).
- **Unconnected property**: `pushPropertyDetails()` on property #28 (no
  `channex_property_id`) returned in 1ms, zero network calls.
- **Categories and WP mode description resolution** (no live property of
  either mode exists locally — same historical DB limitation noted since
  Slice A): verified via `BEGIN`/`ROLLBACK` dry-runs against the live dev
  DB (sharing the app's own `db` singleton so uncommitted rows were visible
  to the code under test, same technique as Slice A) — a category's own
  `description` column resolved correctly; a synthetic WP-mode property
  object correctly sourced its target's description from
  `properties.description`.
- **Existing rate/availability/photo pushes unaffected**: the same live
  test that exercised the room-description reconcile also re-ran the
  existing availability + rate ARI refresh (unchanged code path) — both
  returned real Channex task ids. Separately re-ran Slice A's photo push
  against the same room type — behaved identically to before (attempted a
  real create call, non-fatal 422 from local dev's unreachable-localhost
  limitation, same as every Slice A test — not a regression).
- Real Channex staging and the local DB both independently re-verified
  clean (0 test photos, 0 tracking rows, 0 categories, descriptions back to
  their original `null`) after every test round.
- `node --check` clean on every touched server file.

## Not verified locally (same historical caveat as every prior slice)

WP and IR-Categories mode's **live, end-to-end** Channex round-trip for
descriptions — no property of either mode exists in the local dev DB. The
resolution logic itself was verified via dry-run (above); the actual PUT
call for those modes uses the identical, already-proven
`roomTypeAttributes()`/`updateChannexProperty()` path IR-Named just proved
live, so this is a low-risk gap, consistent with every other mode-specific
caveat already accepted throughout this integration's history.

## Deliberately out of scope (per the task)

- Multi-language descriptions — NestBook has none to offer; Channex's
  `content.description` is single-string regardless, so there was nothing
  to choose a language for.
- Auto-resyncing OTHER property-level fields (timezone/country/currency/…)
  on every Settings save — only description got a new automatic trigger,
  per the task's specific ask; the rest still rely on the existing manual
  "Update Property Details" button, unchanged.
