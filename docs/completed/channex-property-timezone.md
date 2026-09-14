# Property timezone field — Channex cert requirement + "PC showed China time" fix

**Shipped 2026-09-15.** Real per-property IANA timezone field — not a
cert-only patch. Closes two gaps at once: Channex flagged `timezone` as
required on property creation (Evan, post-cert), and this is the same gap
behind John's earlier "PC/VPN showing the wrong local time" confusion.

## What was built

1. **Schema** (`server/db/schema.js`): `properties.timezone TEXT`, nullable,
   guarded `ALTER TABLE` (SQLite errors if the column already exists — caught
   and ignored, house convention). Additive only — existing rows are all
   `NULL`, nothing else changes.
2. **Settings UI** (`client/src/pages/Settings.jsx`): a "Timezone" field in
   Property Details, right after Country. A plain text input with an HTML
   `<datalist>` for search-as-you-type — no new npm dependency. Options come
   from `client/src/utils/timezones.js`'s `getTimezoneOptions()`, which prefers
   `Intl.supportedValuesOf('timeZone')` (the browser's own canonical ~418-zone
   list, zero maintenance) and falls back to a curated ~45-zone static list for
   browsers without that API.
3. **Nudge, Channex-connected properties only**: when
   `property.channex_property_id` is set and `form.timezone` is blank, a small
   amber hint appears in **two** places — under the Timezone field itself, and
   under the "Connect to Channel Manager" card's Disconnect button (the more
   visible spot for an owner who's there to manage the Channex connection).
   Never shown for a non-connected property.
4. **Server validation** (`server/routes/properties.js`): a module-level
   `VALID_TIMEZONES` Set built once at load from `Intl.supportedValuesOf`
   (Node 24 confirmed: 418 zones). `PUT /:id` trims the submitted `timezone`
   and silently stores `NULL` if it's empty or not a real IANA name — same
   "fall back to a safe default, never error" pattern as `theme`/
   `access_method` elsewhere in this route. If `Intl.supportedValuesOf` is
   unavailable (old Node), validation is skipped rather than rejecting
   everything.
5. **Channex payload** (`server/utils/createChannexProperty.js`):
   `buildChannexPropertyAttributes()` now adds `timezone` to the attributes
   object **only when `property.timezone` is a non-empty string** — omitted
   entirely otherwise (never an empty string, never guessed from `country`).
   This function is shared by both the Super Admin trigger (`admin.js`) and
   the owner-facing "Connect to Channel Manager" flow
   (`properties.js:/:id/channex-connect`) — both benefit automatically, no
   separate wiring needed.
6. **i18n**: `timezoneLabel`, `settings.timezoneHint`,
   `settings.timezoneChannexNudge` added to all 5 app languages (en/fr/es/de/
   nl) in `client/src/i18n/index.js`.

## Confirmed facts (from investigation, don't re-check)

- Channex's `POST /api/v1/properties` `timezone` field is an IANA string
  (`Europe/London`), documented **optional** at the API level — Evan's ask is
  about correctness, not a hard API rejection.
- Node 24 (this project's runtime) supports `Intl.supportedValuesOf('timeZone')`
  natively — 418 real zones, no library needed either client or server side.
- `country` was deliberately NOT used to derive a default timezone — it's
  free text (not ISO), and many countries span multiple zones. A wrong guess
  actively misinforms Channex/OTAs about local check-in cutoffs.

## Verified (2026-09-15, live dev stack, not just unit-level)

- `npm run dev` (root) → backend log shows `✓ Database schema ready.` with no
  errors; confirmed via direct `node:sqlite` query that `properties.timezone`
  exists and every existing row is `NULL`.
- `client && npm run build` — clean Vite build, no errors.
- **API round-trip** (demo owner session, property #1 "Local Dev", real
  `channex_property_id` already connected):
  - `PUT` with `timezone: "Not/ARealZone"` → stored as `null` (rejected
    silently, not an error response).
  - `PUT` with `timezone: "Europe/London"` → persisted; confirmed on a
    follow-up `GET`.
  - `buildChannexPropertyAttributes()` called directly against the DB row:
    with `timezone` set → attributes include `"timezone": "Europe/London"`;
    with `timezone: null` → the key is absent entirely from the object (not
    `""`, not present-but-null).
  - Property restored to `timezone: null` afterward — no residue.
- **Browser, real UI** (logged in as `demo@nestbook.io`, property #1): Timezone
  field visible under Country with the hint text; typed + saved
  `Europe/London` → `PUT /api/properties/1` → 200, response body confirms
  `"timezone":"Europe/London"`. Switched Dev Tools plan to Multi (unlocks the
  owner-facing Channel Manager card) → cleared the timezone field → saved →
  **both** nudges appeared (under the field, and under the Channel Manager
  card's Disconnect button) — confirmed correct because property #1 is
  Channex-connected. Restored timezone to blank and plan back to Free
  afterward — dev property left exactly as found.
- Dev server (`npm run dev` root process tree) stopped cleanly afterward via
  `taskkill /PID <root> /T /F` — ports 3001/5173 confirmed free (no
  LISTENING sockets, only expected TIME_WAIT remnants).

## Deliberately out of scope (per John's instructions)

- Onboarding wizard — not touched.
- No timezone auto-detection/suggestion from browser or IP — the field is
  blank until the owner sets it.
