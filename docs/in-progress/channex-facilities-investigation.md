# Channel Manager parity — facilities/amenities: investigation (no code yet)

**Investigated 2026-09-15.** The NestBook-side data model change this
investigation called for (see verdict below) **shipped 2026-09-15** — see
`docs/completed/channex-structured-amenities.md`. This doc's findings
(Channex's real field shape, the curated vocabulary, the ruled-out
text-matching approach) remain the reference; what's still NOT built is the
actual `facilities` push itself, now a fast, simple follow-up per the
"Verdict" section below — this file stays in `in-progress/` until that push
ships. Third slice of the "full property parity" project (Slice A = photos,
Slice B = descriptions).

## 1. Channex's real field — confirmed via direct staging tests, not docs alone

- **Two SEPARATE facility catalogs**, not one shared list: room-type-level
  (`GET /api/v1/room_facilities/options` → **191** facilities) and
  property-level (`GET /api/v1/property_facilities/options` → **301**
  facilities). Each entry: `{ id (UUID), title, category }`. Property-level
  categories: `general, safety_and_security, food_and_drink, activites,
  services, outdoors, sustainable_practice, parking, pets`. Room-level
  includes `in_room` among others.
- **Association field**: `facilities` — a plain top-level key (NOT nested
  under `content` like description/photos), on both the room_type and
  property `PUT`/`POST` body. Value: a bare array of facility UUID strings,
  e.g. `"facilities": ["c3bff477-...", "724b54ce-..."]`. Confirmed identical
  shape and behavior at both levels.
- **Behavior — genuine REPLACE, and the field is fully well-behaved**
  (confirmed via a live 4-step test against a real staging room type,
  reading `relationships.facilities.data`, not `attributes.facilities` —
  the association surfaces as a JSON:API relationship on GET, not a plain
  attribute):
  1. `facilities: [wifiId]` → associates it.
  2. `facilities: [tvId]` (wifi omitted) → wifi is **gone**, only TV
     remains — real replace, not additive like Slice A's `content.photos`.
  3. `facilities: []` → clears to empty, confirmed.
  4. A later `PUT` that **omits** the `facilities` key entirely (e.g. just
     updating `title`) → the previously-set value **survives untouched** —
     ordinary partial-update semantics, exactly like `title`/`occ_adults`
     already behave in this codebase's `roomTypeAttributes()`.
  This is the simplest of the three behaviors seen across all three slices
  so far (photos = add-only via a dedicated API; description = replace but
  omit-doesn't-clear; facilities = replace AND omit-is-safe) — **if/when
  this gets built, it can go straight into the existing plain-attribute
  pattern (`roomTypeAttributes()` / `buildChannexPropertyAttributes()`),
  no dedicated tracking table like Slice A needed.**
- One field-name trap found and ruled out: `facility_ids` is silently
  ignored (no error, no effect — same "unknown key" pattern as Slice B's
  `room_type_descriptions`); the JSON:API relationship-object shape
  (`[{id, type}]`) is explicitly **rejected** (`422 "facilities is
  invalid"`). Only a bare UUID-string array works.

## 2. NestBook's amenity data — confirmed genuinely unstructured free text

- `rooms.amenities` and `room_categories.amenities` are both plain `TEXT`
  columns storing a **comma-separated free-text string** (schema's own
  comment: `-- comma-separated list e.g. "wifi,ensuite,balcony"`).
- **No `properties.amenities` column exists at all** — property-level
  amenities aren't stored anywhere in NestBook's data model today.
- The input is a **plain `<input>` text field** (`RoomPanel.jsx`,
  Settings.jsx's category modal) — placeholder `"wifi, ensuite, balcony,
  parking…"`, no autocomplete, no dropdown, no validation against any
  vocabulary. An owner can type literally anything.
- `formatAmenity()` (`RoomPanel.jsx`) has a small **11-entry display-only**
  map (wifi→WiFi, ensuite→En-suite, balcony, terrace, parking, minibar,
  kitchenette, aircon→Air Con, tv→TV, safe, bathtub) — but this is purely
  cosmetic capitalization for the guest-facing tag display; anything not in
  the map just gets its first letter capitalized. **It does not constrain
  input** — it's evidence the data is free text, not evidence of a hidden
  structured vocabulary.

## 3. Mapping feasibility — tested directly, genuinely unreliable

Checked real overlap between NestBook's common amenity words and Channex's
actual facility titles (live staging data, not guessed):

| NestBook word | Channex room-facility matches |
|---|---|
| `wifi` | only **"Portable Wifi"** (no plain "WiFi" at room level — that only exists at property level) |
| `parking` | **zero** room-level matches (parking is property-level only: 6 variants — Accessible/Bike/Indoor/Secured/Street/Valet parking, no generic "Parking") |
| `minibar` | zero matches at either level |
| `ensuite` / `en-suite` | zero matches — Channex uses "Bathroom" / "Private Bathroom"-style terms, not "ensuite" |
| `safe` | matches **"Baby safety gates", "Child safety socket covers", "Safe Deposit Box"** — a naive substring match would produce an actively wrong association |
| `bath` | 10 different matches (Bath, Bathroom, Spa Bath, Shared Bathroom, …) — no single obvious pick |
| `pool` (property) | 19 granular variants (Infinity/Rooftop/Heated/Kids/Salt-water pool, …) |

This confirms the task's anticipated risk directly: Channex's vocabulary is
**far more granular and differently-worded** than NestBook's free text.
Naive string/substring matching would sometimes fail to match anything
real (parking, minibar, ensuite), sometimes match ambiguously (bath →
10 options), and sometimes match **something actively wrong** (safe →
baby safety gates) — a real embarrassment risk if shipped on a live OTA
listing, not just a cosmetic gap.

## Verdict: this slice needs a NestBook-side UI change first — same shape as the timezone gap

**Do not build a text-matching mapping layer.** A fuzzy/keyword mapping
from free text to Channex's fixed vocabulary cannot be made reliable —
confirmed by testing real overlap, not assumed. This mirrors the timezone
finding exactly: the fix isn't a smarter guess, it's a genuine missing
field/UI.

What would actually be needed, whenever this is picked up:
1. A **structured amenities picker** (checkbox list, not a text input) on
   rooms/categories, and a **new property-level amenities field** (doesn't
   exist at all today) for property-level facilities.
2. The picker's vocabulary should be **curated from Channex's own 191/301
   lists** (not reinvented) — pick the subset actually relevant to
   NestBook's small-independent-property customer base, store the chosen
   Channex facility UUIDs directly (or a stable slug that maps 1:1), so no
   further "guessing" layer is ever needed between NestBook and Channex.
3. NestBook already has **a working precedent for exactly this shape of
   feature**: `properties.at_a_glance_facts` (JSON-stored, `AT_A_GLANCE_KEYS`
   = a small fixed checklist — max_guests/pets/parking/accessible/children/
   smoking/min_stay/languages, `server/routes/properties.js`). A real
   amenities picker would follow the same established pattern (fixed key
   set, structured storage, checkbox UI), just with Channex's vocabulary
   as the source of truth for the key list instead of an invented one.
4. Existing free-text `rooms.amenities`/`room_categories.amenities` would
   most sensibly stay as a supplementary "anything else" free-text note
   (still shown to guests on the booking page as today), separate from the
   new structured field that actually feeds Channex — not replaced outright,
   to avoid a disruptive migration of existing owner-entered text.

This is real, standalone product/UI work — not a small addition to the
existing push-logic slices — so it should be scoped and confirmed with
John as its own deliberate piece of work before any build starts, same as
the timezone field was.

## Confirmed facts (don't re-check next time)

- `facilities` (bare UUID-string array, top-level, both room_type and
  property) is the real, correct, already-tested field and shape.
- Behavior is plain replace + safe-to-omit — no dedicated tracking table
  needed if/when this is built, unlike Slice A's photos.
- Room-level and property-level facilities are two **different** catalogs
  (191 vs 301 entries) — a chosen room-level amenity and a chosen
  property-level amenity are not interchangeable IDs.
- NestBook's current `rooms.amenities`/`room_categories.amenities` are
  genuinely free text with zero structure to lean on; `properties` has no
  amenities column at all.

## Ruled out

- Any form of automatic keyword/fuzzy matching from NestBook's free text to
  Channex's facility titles — tested directly, confirmed unreliable
  (wrong-match risk, not just gap risk).
- Treating this as a quick continuation of Slices A/B's pattern — it
  genuinely needs new NestBook-side data model + UI work first.
