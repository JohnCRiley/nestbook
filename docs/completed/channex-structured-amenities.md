# Structured amenities picker — SHIPPED

**Shipped 2026-09-15.** A curated, checkbox-based amenities system for
rooms/categories and properties — the prerequisite for Channex Slice C
(facilities push, still NOT built — see "Deliberately out of scope" below),
but built as a real NestBook feature in its own right per the investigation's
own recommendation (`docs/in-progress/channex-facilities-investigation.md`).

## Why not free text → Channex matching

The investigation tested this directly and found it genuinely unreliable —
Channex's vocabulary is far more granular and differently-worded than
NestBook's free text (`wifi` only matches "Portable Wifi" at room level;
`safe` matches "Baby safety gates"; `parking` has zero room-level matches).
A fixed checklist, curated from Channex's real vocabulary, with the Channex
ID baked in from day one, was the only reliable path — see the investigation
doc for the full evidence.

## What was built

- **Curated vocabulary** (`server/utils/amenityCatalog.js`): 16 room-level
  and 18 property-level amenities, hand-picked from Channex's real staging
  option lists (`GET /api/v1/room_facilities/options` — 191 entries — and
  `/api/v1/property_facilities/options` — 301 entries — fetched live
  2026-09-15, not guessed). Each entry stores `{ key, channexId, icon }` —
  the exact Channex facility UUID is captured now so Slice C's eventual push
  needs no further "guessing" layer.
  - Room list: wifi, tv, private_bathroom, shower, air_conditioning, heating,
    minibar, safe, balcony, sea_view, hot_tub, washing_machine, iron,
    hairdryer, fireplace, sofa.
  - Property list: parking, pool, pet_friendly, sun_terrace,
    reception_24hr, wifi, restaurant, bar, air_conditioning, non_smoking,
    elevator, laundry, wheelchair_accessible, garden, bbq, baggage_storage,
    first_aid, fire_extinguisher.
  - Deliberately excludes a "breakfast" property checkbox —
    `properties.breakfast_included` already exists as a real structured
    feature (price/timing/widget fields); duplicating it here would just
    confuse owners with two breakfast controls. Whenever Slice C's push is
    built, that existing flag can feed Channex's "Breakfast" facility
    directly.
  - "Parking" has no single generic Channex ID (confirmed in the
    investigation — 6 granular variants). "Street parking" was chosen as
    the curated mapping — the option a truthful checkbox is least likely to
    overclaim, since a private/secured/indoor lot implies more than most
    independent properties actually offer.
  - Client mirror (`client/src/utils/amenityCatalog.js`) carries `{ key,
    icon }` only — no Channex IDs on the client, that's a server-only
    concern. Icons reference the existing 100-icon guest-facing library
    (`server/public/images/guest-icons/`), so an amenity looks identical in
    Settings and to a guest on the booking page.
- **Schema**: `properties.amenities`, `rooms.structured_amenities`,
  `room_categories.structured_amenities` — all nullable TEXT storing a JSON
  array of catalog keys (e.g. `["wifi","tv","safe"]`), guarded `ALTER
  TABLE`, following the same pattern as the existing
  `properties.at_a_glance_facts` fixed-checklist feature.
  `properties.amenities` is new — no property-level amenity concept existed
  in NestBook before this.
- **Existing free-text `amenities` columns are UNCHANGED** — kept as a
  supplementary "anything else" note field on rooms/categories, relabeled
  in the UI, never deleted or migrated. No existing owner data was touched.
- **Shared picker component** (`client/src/components/AmenityPicker.jsx`):
  a checkbox grid with guest-icon images, same interaction style as
  Settings' existing At a Glance section. Reused across:
  - `Settings.jsx` — new `PropertyAmenitiesSection` (property-level) and
    `RoomCategoryModal` (Room Categories mode).
  - `RoomPanel.jsx` — `WPBedroomPanel` (Whole Property bedrooms) and
    `EditMode` (Named Rooms / Units).
  - `NewRoomModal.jsx` — room creation, so a picker is available immediately
    rather than only on a later edit.
- **Server routes** (`properties.js`, `rooms.js`, `roomCategories.js`):
  each PUT/POST accepts the new field, validates submitted keys against the
  catalog (unknown keys silently dropped, matching
  `normalizeAtAGlanceFacts`' own convention), and every GET/list endpoint
  decodes the JSON column back into a plain array before returning it
  (`rooms.js`'s `withParsedBedConfig` was extended and renamed
  `withParsedRoom` to also parse this; `properties.js`'s `_withSampleFlag`
  and a new `roomCategories.js` `withParsedCategory` do the same).
- **Guest-facing booking page** (`bookingPage.js`): a new "Amenities"
  section (property-level, styled like the existing At a Glance grid) plus
  structured chips alongside the existing free-text amenity chips on every
  room/unit/category card (WP showcase, Units gallery, plain room cards,
  Category showcase) — both structured and free-text amenities render
  together, guest icon + i18n label for the former. Full 5-language i18n
  via the page's own `data-i18n` pipeline (`page.amenityRoom<Key>` /
  `page.amenityProperty<Key>`), independent of the pre-existing free-text
  `page.amenity<Word>` keys (the two systems share some English words but
  are namespaced separately).
- **Dashboard i18n**: 34 new curated-amenity labels + 5 supporting UI
  strings (`settings.propertyAmenitiesTitle`/`Hint`,
  `settings.roomAmenitiesTitle`, `settings.amenitiesNoteLabel`/`Hint`), all
  5 languages (en/fr/es/de/nl), `amenities.room.<key>` /
  `amenities.property.<key>` dotted-key namespace.

## Verified (2026-09-15, live dev server — not just local reasoning)

- Confirmed all three new columns exist via `PRAGMA table_info` after a
  fresh schema-migration run.
- **Property amenities**: real `PUT /api/properties/1` with
  `amenities: ['wifi','pool','not_a_real_key']` → confirmed via fresh GET
  that the invalid key was silently dropped (`['wifi','pool']` stored),
  known keys persisted correctly.
- **Room structured_amenities**: real `PUT /api/rooms/:id` set/replace
  round-tripped correctly via fresh GET; **confirmed the existing free-text
  `amenities` value (`"wifi,ensuite,balcony"`) was completely untouched** —
  no lossy migration, exactly per the task's requirement.
- **Room category structured_amenities**: created a throwaway category via
  `POST /api/properties/1/room-categories` with a mix of valid and invalid
  keys, confirmed invalid key dropped, confirmed replace via a second PUT,
  then deleted the test category.
- **Booking page render**: set live property + room amenities, fetched the
  real rendered `/book/:slug` HTML, confirmed the property-level "Amenities"
  section and room-level structured chips both appear with correct
  `data-i18n` keys and icon paths, confirmed all 5 language blocks contain
  the new keys.
- **Live browser walkthrough**: logged in as the demo owner, checked
  "Parking" and "Swimming pool" in Settings' Property Amenities picker,
  clicked Save, confirmed via a fresh API call that the save actually
  persisted — then loaded the real booking page in the browser and visually
  confirmed the "Amenities" section shows the same two items with icons and
  labels. Also opened a Named-Rooms room's edit panel and visually confirmed
  the full 16-item room picker renders with icons, and the existing
  free-text note field/tags below it are untouched.
- All test data (property amenities, room structured_amenities, the
  throwaway category) cleared back to empty/deleted afterward.
- `cd client && npm run build` clean. `node --check` clean on every touched
  server file.

## Deliberately out of scope (per the task)

- **The actual Channex `facilities` push is NOT built.** Per the
  investigation, this is a fast, simple follow-up once this data model
  exists — `facilities` is a plain top-level array of Channex UUIDs on both
  room-type and property PUT bodies, clean replace semantics, no tracking
  table needed (unlike Slice A's photos). The next slice just needs to map
  each entity's `structured_amenities`/`amenities` keys to their
  `channexId` via this catalog and send the array — everything else
  (vocabulary, storage, UI) already exists.
- Whole-Property mode's "room type" (the property itself, per
  `buildTargets()`'s `refType: 'whole_property'`) has no dedicated
  room-level structured-amenities entity of its own — WP bedrooms
  (`rooms` rows) each carry their own picker, same as Named Rooms. Which
  bedroom's amenities (if any) should represent the single WP Channex room
  type is a decision for the push slice, not this one.
