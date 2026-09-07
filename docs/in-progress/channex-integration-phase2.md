# Channex Integration — Phase 2 (build, in progress)

Companion to `channex-integration-research.md` (Phase 1 research — read that first
for business context, pricing, the property_type reasoning, webhook findings).
This file tracks the **build**, slice by slice.

## Shape of Phase 2

Backend groundwork → schema → push → webhooks. No customer-facing surface until
the groundwork underneath is solid. Billing/plan-gating is Phase 3, Settings UI
is Phase 4 — neither is touched here.

---

## Slice 1 — API client + property_type mapping + property creation  ✅ DONE (2026-09-07)

**Built (all in `server/utils/`, all pure groundwork, nothing wired up):**

- `channexClient.js`
  - `channexRequest(path, {method, body, query})` — low-level helper. Auth header
    `user-api-key`. Base URL from `CHANNEX_API_BASE_URL` env, **defaults to
    `https://staging.channex.io`** (pre-certification, sandbox only).
  - Throws `ChannexError` (exported) on: missing key, network failure, non-2xx
    (surfaces Channex's `errors.code` / `errors.title` / `errors.details`),
    non-JSON body. **Never a silent no-op.**
  - `getChannexApiKey()` / `getChannexBaseUrl()` / `isChannexConfigured()` helpers.
  - `createProperty(attributes)` — thin `POST /api/v1/properties` wrapper, body
    wrapped as `{ property: {...} }` per Channex convention.
- `channexPropertyType.js`
  - `getChannexPropertyType(property)` — pure. NestBook `properties` row →
    Channex `property_type` string. Throws on an unmapped mode/sub-type.
  - Also exports `CHANNEX_PROPERTY_TYPES` (the full documented enum, verbatim).
- `createChannexProperty.js`
  - `buildChannexPropertyAttributes(property)` — pure, exported for inspection.
    Maps `name→title`, `currency→currency` (upper-cased, ISO-4217 validated),
    `address`/`city` passed through when present, `country` best-effort
    free-text → ISO alpha-2 (omitted if unrecognised).
  - `createChannexProperty(property)` — builds attrs, calls `createProperty`,
    returns `{ id, propertyType, attributes, data }`. `id` = Channex UUID.

**Confirmed facts (don't re-check):**

- Channex `POST {base}/api/v1/properties`. Required at creation: **`title`,
  `currency` only.** `email`/`phone`/full address/`timezone`/coords become
  required only when connecting the first OTA (later slice).
- Auth header is `user-api-key` (NOT `Authorization: Bearer`).
- Request body wrapper: `{ "property": { ... } }`. Success: `{ data: { id,
  attributes } }` — `id` is a UUID, present at both `data.id` and
  `data.attributes.id`. Errors: `{ errors: { code, title, details? } }`.
- Staging base `https://staging.channex.io`, production `https://channex.io`.
- **`property_type` enum (verbatim from docs, verified 2026-09-07):**
  apart_hotel, apartment, boat, camping, capsule_hotel, chalet, country_house,
  farm_stay, guest_house, holiday_home, holiday_park, homestay, hostel, hotel,
  inn, lodge, motel, resort, riad, ryokan, tent, villa.
- **Final mapping (all five target values are valid enum members):**

  | NestBook | detect | Channex `property_type` |
  |---|---|---|
  | IR-Named | `rental_type='rooms'` + `ir_room_mode='named'` | `guest_house` |
  | IR-Categories | `rental_type='rooms'` + `ir_room_mode='categories'` | `guest_house` |
  | Whole Property | `rental_type='whole_property'` | `villa` |
  | SC-Aparthotel | `rental_type='units'` + `un_sub_type='aparthotel'` | `apart_hotel` |
  | SC-Glamping | `rental_type='units'` + `un_sub_type='glamping'` | `camping` |
  | SC-Holiday Rentals | `rental_type='units'` + `un_sub_type='serviced_apartment'` | `apartment` |

  (`rooms` mode returns `guest_house` for **any** `ir_room_mode` — both sub-modes
  are hotel-family. Only `units` mode branches on the sub-type.)

- **Schema, live `server/nestbook.db` (checked 2026-09-07):** `properties` has
  **no** `channex_property_id` / `channex_*` column, and **no `timezone`
  column** at all (only `locale`, `currency`, `address`, `city`, `country` —
  `country` is free text like "England"/"Norway", not ISO). Slice 2 adds the
  column to store the returned Channex id.

**Verified this slice:**
- `getChannexPropertyType()` returns the right value for all six modes +
  throws on unmapped (throwaway script, not committed).
- `channexClient` throws `ChannexError` ("CHANNEX_API_KEY is not set…") — not a
  silent no-op — when the key is absent.
- `node --check` clean on all three files.
- `grep` confirms nothing in `server/` or `client/` imports or references any of
  the three files or `CHANNEX_API_KEY` — genuinely inert.
- **HTTP path live-verified against Channex staging (2026-09-07):**
  `createChannexProperty()` created a real property — UUID
  `168ca97a-1b7a-4e4c-a472-94ca642350f2`, title "Rosewood Guest House",
  `property_type: guest_house` — and a follow-up `GET
  /api/v1/properties/:id` confirmed it exists, is owned by user
  `jcriley@nestbook.io` and sits in the default "User Group". No need to
  re-verify the create/GET round-trip in a future slice. (This test property
  is John's to remove manually via the Channex UI.)

**Ruled out / deliberately deferred:**
- No DB columns / migrations this slice (schema decision = slice 2).
- No route, no job, no Settings UI, no button. Console/script-only.
- No plan/billing gating (Phase 3).
- `timezone`, `email`, `phone`, coordinates NOT sent on create — not needed
  until OTA-connect, and NestBook has no timezone field yet.
- No Anthropic SDK style retries/backoff — add only if Channex rate-limits bite.

**BLOCKER for testing against real Channex:**
`CHANNEX_API_KEY` is **not** in `server/.env` (same state as `ANTHROPIC_API_KEY`
— absent locally). A Channex sandbox API key must be added before
`createChannexProperty()` can be exercised against the real staging API. Until
then the mapping/attribute-builder logic is unit-verified but the HTTP path is not.

---

## Slice 2 — schema column + Super Admin manual trigger  ✅ DONE (2026-09-07)

**Built:**

- **Schema:** `properties.channex_property_id TEXT` (nullable). Added near the
  end of `server/db/schema.js`'s migration block, guarded
  `try { ALTER TABLE … } catch {}` per house convention. NULL = not connected.
  Verified live: column present (`cid 74`), all existing rows NULL.
- **Route:** `POST /api/admin/properties/:id/channex-create` in
  `server/routes/admin.js` (mounted under `requireSuperAdminSession` — Super
  Admin only, no owner path). Loads the full property row, calls
  `createChannexProperty(property)` (real Channex staging API call), stores the
  returned UUID in `channex_property_id`, writes an audit-log entry
  (`CHANNEX_PROPERTY_CREATED`). **Duplicate guard:** if `channex_property_id`
  is already set, returns `409 { error: "This property is already connected to
  Channex.", channex_property_id }` and makes **no** API call.
  `ChannexError` with an HTTP status → `502`; anything else → `500`.
- **UI:** `client/src/admin/pages/Properties.jsx` — new "Channex" column in the
  existing properties table. Unconnected: a "Create in Channex" button
  (→ "Creating…" while in flight) that hits the route and shows the result via
  the page's existing toast. Connected: `✓ <first 8 chars>…` with the full
  UUID in the `title` tooltip. No modal, no styling polish — internal debug tool.
  The admin `GET /api/admin/properties` SELECT now also returns
  `p.channex_property_id`.

**Verified this slice (real, from the Super Admin UI — not a script):**
- Clicked "Create in Channex" on property #2 "Test Property" (lodge, England,
  GBP) → success toast, real Channex property created:
  **`e8675aa3-2216-4d31-86eb-add34759cbe3`**. Confirmed stored in
  `properties.channex_property_id` and echoed in the server log.
- Second `POST` to the same route → `409 "This property is already connected to
  Channex."`, no second Channex property (staging list still shows exactly one
  "Test Property").
- `grep` for "channex" across `client/src` and `server/` → only the admin page,
  `admin.js`, `schema.js`, and the three `utils/channex*` files. No owner-facing
  page renders `channex_property_id`. (It *is* in the owner `GET /properties`
  `SELECT *` payload as `null` — same as every other admin-only column like
  `is_demo`; not rendered anywhere owner-facing.)
- `node --check` clean on `admin.js` and `schema.js`.

**Note — pre-existing, not introduced here:** the admin Properties table logs a
React "two children with the same key" warning because the admin `/properties`
route's `LEFT JOIN users … role='owner'` emits two rows for a property that has
two owner-role users (property #1 "Local Dev"), and the row `key` is `p.id`.
Predates this slice; left alone.

**Ruled out / deferred (unchanged):** no owner UI, no billing/plan gating
(Phase 3), no automatic triggering — Super Admin manual click only.

**Test properties now in the Channex staging account (John to remove manually
when done — no API delete in the codebase):**
- `fff09646-…` "NestBook Test Property" (Phase 1 sandbox testing)
- `e8675aa3-…` "Test Property" (this slice's UI verification)
- (`168ca97a-…` "Rosewood Guest House" from slice 1 — already removed.)

---

## Slice 3 — first-time inventory push (room types + rate plans + ARI)  ✅ DONE (2026-09-07)

**Built:**

- **Schema:** new table `channex_room_mappings` (guarded `CREATE TABLE IF NOT
  EXISTS` + two indexes). One row per Channex room type, linking it to whatever
  the NestBook side of the pairing is:
  - `nestbook_ref_type = 'room'`  → `nestbook_ref_id = rooms.id` (IR-Named, Units)
  - `nestbook_ref_type = 'category'` → `nestbook_ref_id = room_categories.id` (IR-Categories)
  - `nestbook_ref_type = 'whole_property'` → `nestbook_ref_id = NULL` (WP)
  Stores **both** `channex_room_type_id` and `channex_rate_plan_id`. Chose a
  table over columns on `rooms` because (a) the NestBook side isn't always a
  room (category / whole-property), (b) a row needs two Channex ids, (c)
  IR-Categories maps one Channex room type to many `rooms`. Unique index on
  `(property_id, nestbook_ref_type, IFNULL(nestbook_ref_id,-1))`.
- **`server/utils/channexClient.js`:** added `createRoomType`, `createRatePlan`,
  `deleteRoomType`/`deleteRatePlan` (`?force=true`), `updateAvailability`,
  `updateRates`. `channexRequest` gained a `raw` option so the ARI endpoints can
  return `meta.warnings` (they report per-row problems on a 200, not as errors).
- **`server/utils/channexPushInventory.js`:** `pushInitialInventory(property)`.
  - `buildTargets(property)` (exported) → one entry per Channex room type:
    - **IR-Named / Units:** `rooms` where `parent_unit_id IS NULL AND
      is_sample_data = 0 AND status != 'maintenance'`; `count_of_rooms = 1`.
    - **IR-Categories:** one per `room_categories` row; `count_of_rooms` =
      rooms in the category (`status != 'maintenance'`, matching
      `getAvailableRoomsInCategory`); base rate = lowest positive room price.
    - **WP:** one target from property-level fields (`whole_property_rate`,
      `total_capacity`); `count_of_rooms = 1`.
  - Occupancy: `occ_adults = max(1, max_occupancy ?? capacity)`,
    `default_occupancy = min(occ_adults, capacity)`, children/infants 0.
  - Availability window = **90 days from today**, real NestBook availability
    (bookings excl. cancelled/checked_out/cancelled_unpaid/declined + `ical_blocks`
    with `room_id IS NULL` = property-wide) — mirrors `widget.js`
    `day-availability` / `bookings.js` `hasOverlap`; categories reuses the
    shared `getAvailableRoomsInCategory` helper directly. Per-day values are
    coalesced into contiguous `date_from`/`date_to` segments.
  - Rate plan: `sell_mode: per_room`, `rate_mode: manual`, one primary
    occupancy option. Base **flat rate** (`price_per_night` / `whole_property_rate`)
    pushed across the whole window in one `/restrictions` row per plan.
    Seasonal `rate_periods` are **not** reflected — deferred to the ongoing-sync
    slice. A rate of 0 is skipped (Channex requires rate > 0) and reported.
  - **Best-effort rollback:** if any create call or the mapping insert throws,
    it deletes every room type / rate plan it already created (force) and clears
    any mapping rows, then rethrows — so a partial failure doesn't strand
    orphans that the re-push guard (which counts local mappings) would then
    silently duplicate.
- **Route:** `POST /api/admin/properties/:id/channex-push` (Super Admin only).
  Guards: 404 (no property); **400** if `channex_property_id` is null
  ("not connected — use Create in Channex first"); **409** if
  `channex_room_mappings` rows already exist ("Inventory has already been
  pushed … Re-push / ongoing sync is a later slice"); **422** if the property
  has no bookable rooms; **502** on a `ChannexError` with a status; **500**
  otherwise. Audit-logs `CHANNEX_INVENTORY_PUSHED`.
- **UI (`Properties.jsx`):** the "Channex" cell now shows, for a connected
  property, either a **"Push Inventory"** button (→ "Pushing…") or, once pushed,
  `· N room types`. Result via the existing toast. Admin `GET /properties` also
  returns `channex_mapping_count`.

**Re-push decision:** **block** (409), not update. Room types / rate plans are
not idempotent to re-create, and reconciling NestBook↔Channex (renames, adds,
deletes) is real sync logic that belongs in the dedicated ongoing-sync slice.
ARI on its own is last-win idempotent, but a partial re-push is confusing. To
redo a push today: delete the property's `channex_room_mappings` rows **and** the
Channex-side room types, then push again.

**Verified this slice (real, from the Super Admin UI):**
- Connected **property #1 "Local Dev"** (IR-Named, 4 real rooms) → Channex
  property **`a50e441f-bbd8-40b6-a69e-f728953a976e`**, then "Push Inventory":
  - 4 room types + 4 rate plans created on Channex, `count_of_rooms` 1 each,
    `occ_adults` 2/2/4/1 (matches room capacities).
  - 4 `channex_room_mappings` rows (`nestbook_ref_type='room'`, ids 341–344),
    each with both Channex ids.
  - ARI confirmed via `GET /api/v1/restrictions`: availability = 1 every day
    for the 90-day window, rates `95.00 / 85.00 / 145.00 / 65.00` = the rooms'
    `price_per_night`. No warnings.
- Re-push (#1, has mappings) → **409** with the explanatory message, no
  duplicate room types on Channex.
- Push #36 (no `channex_property_id`) → **400** "not connected … use Create in
  Channex first".
- Push #2 (connected, 0 rooms) → **422** "no bookable rooms/units/categories".
- `grep` for "channex" across `client/src` → only `admin/pages/Properties.jsx`;
  across `server/` → only `admin.js` (SA-gated) + `schema.js` + the 4 utils.
  No owner-facing surface.
- `node --check` clean on all changed server files.
- **Not** checked in the Channex web dashboard's Rooms & Rates / Inventory
  pages — verified against the Channex **API** (the source of truth) instead,
  since the dashboard visibility gap from the slice-1/2 notes (property not
  appearing under the dashboard login) is still unresolved.

**Only verifiable against live data for IR-Named** — this DB has no WP, Units,
or IR-Categories property. The other modes' `buildTargets` branches are written
from the data model + `widget.js`/`rooms.js` reading and unit-checked via
`buildTargets` on property #27 (categories rows), but their end-to-end push is
unverified.

**Test artifacts on Channex staging (John to remove manually — Properties →
Actions → Remove; no API delete wired into the app):**
- `fff09646-…` "NestBook Test Property" (Phase 1)
- `e8675aa3-…` "Test Property" (slice 2) — connected, no inventory
- `a50e441f-…` "Local Dev" (slice 3) — **4 room types + 4 rate plans + 90 days ARI**

**Deferred (unchanged):** ongoing/auto sync on room/rate/availability change;
seasonal `rate_periods` in the rate push; Holiday-Rentals one-Channex-property-
per-unit split (research §5); a "disconnect / remove from Channex" path
(`DELETE /api/v1/properties/:id` + clear the column + drop mappings).

---

## Next — Slice 4 (not started)

- Ongoing sync: when a NestBook room/rate/availability changes, push the delta
  to Channex (uses `channex_room_mappings` to find the target room type / rate
  plan). This is where the "update vs block" re-push question gets its real
  answer.
- Reflect seasonal `rate_periods` in the rate push (`getRateForDate` already
  exists — `server/utils/ratePeriods.js`).
- A disconnect path (see Deferred above).
