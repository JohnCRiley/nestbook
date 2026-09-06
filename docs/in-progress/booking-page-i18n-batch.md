# Booking-page i18n batch — captions, amenities, sample-data names, help-chat check

Started 2026-09-06. Follow-on from the room-type-badge fix (commit fffe23a).

## Scope (4 items)
1. WP/Units showcase room **descriptions** (sample-data captions) — English-only → data-i18n on the booking page.
2. **Amenity chips** (`AMENITY_LABELS` / `fmtAmenity`) — English-only page-wide → data-i18n + FR/DE/ES/NL.
3. **HelpChatPanel** own UI chrome — VERIFY only in a Spanish session; fix only if broken.
4. **Sample-data room/unit names** — seeded English-only → translate by account language at signup (like welcome emails).

## Confirmed facts (do not re-check)

### Where the "captions" live
- NOT booking-page fallbacks. They're `rooms.description` values written by
  `server/utils/seedSampleData.js` for WP-mode sample data (`WP_ROWS`, 3 rows:
  double / living_room / bathroom). Units-mode sample data has NO descriptions
  (only the top-level unit could carry one, and it doesn't).
- `bookingPage.js` renders `room.description` raw at line ~367 (`wpAlternatingShowcase`
  `ws-desc`) and ~446 (`generateUnitsPage` `ws-desc`); also IR `room-desc` ~501/565
  and category `ws-desc` ~671.
- Booking-page rooms query is `SELECT * FROM rooms` → `room.is_sample_data` IS available.
- `room.description` ALSO shows in the owner's Rooms.jsx dashboard (~650) and RoomPanel editor.

### Amenities
- Free-text comma list. Known vocab (11): wifi, ensuite, balcony, terrace, parking,
  minibar, kitchenette, aircon, tv, safe, bathtub.
- `AMENITY_LABELS` (bookingPage.js:50) = EN nice-labels; `fmtAmenity()` = label or title-case.
- Client has its own copy: `formatAmenity()` in `client/src/pages/rooms/RoomPanel.jsx:871`
  (owner-facing app — OUT OF SCOPE, item 2 is "the booking page").
- 5 render sites in bookingPage.js: ~366, ~445, ~498, ~533, ~670 (classes `ws-amenity` ×3, `amenity-tag` ×2).

### seedSampleData
- `seedSampleData(userId, propertyId, rentalType, unSubType)` — has `userId`, can
  `SELECT language FROM users` internally (no signature change). Called fire-and-forget
  from `auth.js:400` on first onboarding completion.
- Guarded: `SELECT 1 FROM rooms WHERE property_id=? AND is_sample_data=1` → skips if
  sample data exists. Only ever INSERTs `is_sample_data=1` rows; **never UPDATEs
  existing rooms** → real rooms and existing sample data are untouched by design.
- Names generated: IR = "Garden Room", "Orchard Room"; WP = "Bedrooms", "Living Spaces",
  "Bathroom"; Un = "Unit A"/"Unit B" + internal "Double Room", "Kitchen", "Living Area", "Bathroom".
  (Task mentions "Master Bedroom" — not in the current seeder; noted, nothing to do.)
- Welcome-email language pattern: `auth.js` reads `userLang` from the `users` row /
  `SELECT ... language FROM users`, passes `{ language }` to the email fn. Same here.

### Design decisions
- Descriptions: seeded in the account language (faithful preview + correct in owner
  dashboard) AND translated live on the booking page via `data-i18n` (guest can switch
  page language). The 3 EN/FR/DE/ES/NL description strings are duplicated between
  `seedSampleData.js` (SAMPLE_CONTENT) and `bookingPage.js` I18N (`page.sampleDesc*`) —
  kept identical, cross-ref comment in both.
- Names: seed-time only (they also appear in the owner's dashboard/calendar/bookings,
  which the booking-page data-i18n can't reach).
- Existing sample data on demo/test props: names stay English (no retroactive rename —
  flagged as the task allows). Descriptions on those pages DO translate live for guests
  via item 1's data-i18n (keyed by room type, not by stored text).

## Files touched
- `server/routes/bookingPage.js` — amenityChip() + descHtmlFor() + ~70 I18N keys ×5 langs
- `server/utils/seedSampleData.js` — SAMPLE_CONTENT (5 langs) + account-language selection
- (item 3: no change expected — verify only)

## Implemented
- `bookingPage.js`: `amenityChip()` (data-i18n for the 11 known amenities, plain
  title-case for free-text) at all 5 render sites; `descBlock()` + `SAMPLE_DESC`
  (data-i18n on sample-data descriptions, keyed by room type, only when
  is_sample_data + non-empty description) at the WP + Units showcase; 14 new
  I18N keys × 5 langs (`page.amenity*` ×11, `page.sampleDesc*` ×3).
- `seedSampleData.js`: `SAMPLE_CONTENT` (5 langs) for IR/WP/Un names + WP
  descriptions; `sampleStrings(userRow.language)` picked once at seed time
  (reads `users.language`, no signature change). The 15 WP `desc` strings are
  byte-identical to `page.sampleDesc*` in bookingPage.js (verified by grep).
- Item 3: no change — HelpChatPanel copy was already fully in all 5 langs.

## Verification (all ✅)
- **Items 1+2** — WP sample property in `es`, browser-switched through en/fr/de/nl/es:
  captions fully translated each language; amenity chips translated (WiFi/WLAN,
  En-suite/Salle de bains privative/Eigenes Bad/Baño privado/Eigen badkamer, etc.);
  an unknown free-text amenity ("poolside_bar") stays as-is in every language;
  room names ("Dormitorios"/"Zonas comunes"/"Baño") identical across all languages
  (seeded owner content, not guest-switchable); English unchanged.
- **Item 3** — logged in as a real `es` account, opened the panel: trigger aria
  "Ayuda", badge "Nuevo", title "Ayuda", subtitle/greeting/suggestions-label/chips/
  placeholder/send/close all Spanish. Nothing broken.
- **Item 4** — real Spanish signup (register + PATCH /complete-onboarding) →
  IR sample rooms "Habitación Jardín"/"Habitación Huerto"; direct `_seedWP` in es →
  "Dormitorios"/"Zonas comunes"/"Baño" + Spanish descriptions; direct `_seedUn` in
  es → "Alojamiento A/B" + "Habitación doble"/"Cocina"/"Zona de estar"/"Baño".
  English signup → "Garden Room"/"Orchard Room" unchanged. Pre-existing sample
  data on prop 27 ("Garden Room"/"Orchard Room", is_sample_data=1) untouched —
  the seeder only INSERTs and skips when sample data already exists.

## Flagged (per task allowance)
- Existing sample-data room NAMES on demo/QA properties stay in their original
  (English) language — no retroactive rename. Their booking-page DESCRIPTIONS do
  translate live for guests via item 1's data-i18n (keyed by type, not stored text).
- Owner-facing app amenity labels (`formatAmenity` in RoomPanel.jsx) remain
  English-only — out of scope (item 2 = "the booking page"); the owner app has
  its own i18n system.

## Ship
Committed to main 2026-09-06. Delete this file once John eyeballs a fresh
non-English signup on real infra.
