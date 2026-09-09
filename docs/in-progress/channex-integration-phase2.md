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

## Slice 4 — ongoing outbound availability sync  ✅ DONE (2026-09-07)

**Problem it fixes:** slice 3 pushed availability once. After that, a new
booking / cancellation / date-edit on a connected property never touched
Channex, so OTA-visible availability silently went stale — a real
double-booking risk.

**Built:**

- **`server/utils/channexPushInventory.js`:** new exported
  `pushAvailabilityUpdate(propertyId, refType, refId, dateFrom, dateTo)`.
  - `refType` is `'room'` (the usual call, with the booking's `room_id`),
    `'category'`, `'whole_property'`, or `'property'` (refresh every mapping —
    used by bulk import).
  - `affectedMappings()` resolves which `channex_room_mappings` rows a change
    touches, reusing the same mode branching as `buildTargets()`: WP → the one
    `whole_property` mapping; IR-Categories → the affected category's mapping
    (resolved from the room's `category_id`); IR-Named / Units → the room's
    mapping.
  - Recomputes availability for just the affected nights via
    `buildTargets(property)` (so the predicates stay identical to slice 3 /
    `widget.js` day-availability / `bookings.js` `hasOverlap`), clamped to the
    initial-push window `[today, today+89]`, coalesced into date ranges, one
    `POST /api/v1/availability` call.
  - **No-ops silently** when the property has no `channex_room_mappings` rows
    (checked first — the common case) or no `channex_property_id`.
  - **Never throws / never rejects** — the whole body is wrapped; a Channex
    failure logs `[channex-sync] … failed (non-fatal)` and returns.
- **`channexClient.js`:** unchanged from slice 3 (`updateAvailability` already
  returned `{ meta }` via `raw: true`).
- **Call sites** (all fire-and-forget, after the HTTP response, `.catch(()=>{})`):
  - `bookings.js`: `POST /` (create), `POST /import` (property-wide refresh),
    `POST /:id/decline`, `PUT /:id` main path (pushes **both** old and new
    room/range), `PUT /:id` `_wp_action` decline + `wp_departure`, `DELETE /:id`.
  - `widget.js`: Stripe-Connect `pending_payment` insert, the main public
    booking insert, the approval-token decline.
  - `enquiries.js`: the enquiry→`pending_owner_approval` booking.
  - `stripe.js`: `checkout.session.expired` → `cancelled_unpaid`.
  - Skipped (no availability change — both states block): `approve` /
    `pending_owner_approval → confirmed`, `wp_checkin`, `checkout.session.completed`.

**Verified this slice (real, via the owner app UI on connected property #1
`a50e441f`):**
- Book Chambre Lavande (room 341) 2026-10-15→18 → Channex rate plan
  `e4f3f2a6` availability **0 on 10-15/16/17**, 1 elsewhere. Log:
  `[channex-sync] property #1 room:341 … — 2 segment(s)`.
- Cancel it → availability **back to 1** across the range. Log: `1 segment(s)`.
- Date-shift booking #181 (room 342) 11-05→08 to 11-10→13 → `PUT` fired **two**
  syncs (old + new range); Channex Mistral shows **11-05/06/07 → 1 (freed)**,
  **11-10/11/12 → 0 (new)**. `DELETE` of the test bookings pushed everything
  back to 1.
- Non-connected property #13 → `pushAvailabilityUpdate` returns in 0 ms, **no
  API call, no log line, no throw**. Same for #2 (connected, 0 mappings).
- Forced API failure (bad base URL) on a real mapped ref → logs
  `[channex-sync] … failed (non-fatal): … fetch failed`, **does not throw**.
- `node --check` clean on all changed files
  (`channexPushInventory.js`, `bookings.js`, `widget.js`, `enquiries.js`,
  `stripe.js`).

**Only end-to-end verified for IR-Named** (same DB limitation as slice 3 — no
WP / Units / IR-Categories property exists locally). The category / WP branches
of `affectedMappings()` mirror `buildTargets()` but are unverified against live
data.

**Test bookings** #180 / #181 on "Local Dev" were created and deleted during
verification — no leftover NestBook rows. Channex `a50e441f` is back to an
all-available state.

**Deferred (unchanged):** rate re-push / seasonal `rate_periods` sync;
room-type reconciliation (add/rename/delete a NestBook room after the initial
push); Holiday-Rentals one-Channex-property-per-unit split; a "disconnect from
Channex" path; **inbound** sync (Channex webhook → NestBook booking) — that is
the next slice and needs the public-HTTPS-endpoint gap from
`channex-integration-research.md` §9 solved first.

---

## Slice 5 — inbound booking sync (Channex webhook → NestBook booking)  ✅ DONE (2026-09-08)

**Problem it fixes:** slices 3–4 push availability OUT; nothing came back. An OTA
booking made through Channex had no NestBook representation — no booking row, no
guest, and it never blocked NestBook's own availability.

### Investigation (confirmed against docs.channex.io AND the live staging API)

- **Events:** `booking`, `booking_new`, `booking_modification`,
  `booking_cancellation`. We register for `booking` only (one event per revision)
  and branch on the pulled revision's `status` — avoids double-handling.
- **Webhook body is a POINTER, not the data:**
  `{ event, payload: { booking_id, property_id, revision_id }, timestamp }`.
  The handler PULLS `GET /api/v1/booking_revisions/:revision_id` (verified live —
  returns the full reservation) and acts on that. Never trusts the body /
  ordering (research §12).
- **Registration:** single **global** webhook — `POST /api/v1/webhooks`
  `{ webhook: { callback_url, event_mask:'booking', property_id:null,
  is_global:true, headers:{…}, is_active:true, send_data:true } }`. Confirmed
  via a real `422` from staging that `property_id` is required unless
  `is_global:true`.
- **No HMAC / signing.** Auth is a **shared-secret header** we set at
  registration (`headers.X-Channex-Webhook-Secret`) and validate on every
  request. `CHANNEX_WEBHOOK_SECRET` added to `server/.env` (32 random bytes).
  **Zero relation to the Stripe webhook** — different mechanism, different route,
  `stripe.js` untouched.
- **Multi-room: YES.** `rooms` is an array; per-room `room_type_id`,
  `rate_plan_id` (nullable when unmapped), `checkin_date`, `checkout_date`,
  `amount`, `days`, `occupancy{adults,children,infants}`, `guests[]`,
  `is_cancelled`, `booking_room_id`. Top level: `booking_id` (stable across
  revisions), `id` (= revision id), `status`, `ota_name` ("BookingCom"),
  `ota_reservation_code`, `arrival_date`, `departure_date`, `currency`, `amount`,
  `customer{name,surname,mail,phone,country,…}`.
- `POST /api/v1/bookings` (CRS create) → **403** with our key — can't create
  test reservations that way. No `/ack` endpoint (`non_acked_booking` just fires
  a reminder webhook 30 min later — harmless, deferred).

### Built

- **Schema** (`server/db/schema.js`): `bookings.channex_reservation_id TEXT`
  (nullable, indexed, NOT unique — a multi-room reservation = several bookings
  sharing the value). Guarded `ALTER TABLE` per house convention.
- **`server/utils/normaliseSource.js`** (new): `normaliseSource()` + `splitName()`
  **extracted** from the CSV Booking Import Wizard's inline closures in
  `routes/bookings.js` (which now imports them). Behaviour-preserving superset —
  also strips separators so Channex's `"BookingCom"` resolves to `booking_com`.
  15/15 + 4/4 unit assertions.
- **`server/utils/channexInboundSync.js`** (new): `fetchRevision()` (pull) +
  `syncReservationFromRevision(revision)` (all DB work). Per revision `status`:
  - `new` → one `confirmed` booking per non-cancelled room. `source =
    normaliseSource(ota_name)`. Guest deduped by `(lower(email), property_id,
    deleted=0)` exactly like the Import Wizard. `channex_reservation_id` =
    `booking_id`. Reverse mapping lookup `channex_room_mappings` by
    `(property_id, channex_room_type_id)` → `nestbook_ref_type`:
    `room` → the room; `whole_property` → property's first room;
    `category` → `assignRoomForCategoryBooking(…, {respectBuffer:false})`
    (synchronous, immediately before INSERT — race-free; oversold ⇒ pin to
    lowest-id room in category + loud warn, never NULL).
  - `modified` → single active booking + single room ⇒ UPDATE in place (dates,
    occupancy, room). This branch ALSO absorbs an at-least-once redelivery of
    the original `new` event — idempotent, never churns rows. Multi-room / room
    count change ⇒ cancel the reservation's bookings and recreate.
  - `cancelled` → `status='cancelled'` on every booking with that
    `channex_reservation_id`. Idempotent (2nd delivery = no-op).
  - Unmapped Channex property ⇒ logged + skipped, 200. Unmapped room type ⇒
    that room skipped with a warning; whole reservation skipped only if NO room
    maps.
  - All writes in one `db.exec('BEGIN')`…`COMMIT`/`ROLLBACK` (node:sqlite, no
    `db.transaction()`).
  - **Loop prevention:** after writing, calls `pushAvailabilityUpdate()` from
    slice 4 for every (room, range) touched — Channex lowers availability so
    OTHER OTAs stop selling the room. **Nothing else is sent to Channex.** There
    is NO reservation-create call anywhere in the file (grep-confirmed; staging
    booking count unchanged through all testing).
- **`server/routes/channex.js`** (new), mounted `app.use('/api/channex', …)`
  BEFORE `requireAuth` (public — Channex has no NestBook session):
  - `POST /webhook` — constant-time `X-Channex-Webhook-Secret` check → `401` if
    missing/wrong (or if secret unset). Missing `booking_id`/`revision_id` →
    `400`. Non-booking event → `200 {ignored}`. Else pull + sync → `200`.
    Genuine pull/DB failure → `500` (Channex retries on 5xx w/ backoff).
  - `channexAdminRouter` (mounted `/api/admin/channex` under
    `requireSuperAdminSession`): `POST /register-webhook` (idempotent — dedups
    on `callback_url`; refuses a non-HTTPS / localhost URL — set
    `CHANNEX_WEBHOOK_URL` to the deployed origin), `GET /webhooks`,
    `DELETE /webhooks/:id`. Same "Super Admin manual trigger" pattern as slices
    2–4.
- **`server/utils/channexClient.js`**: added `createWebhook`, `listWebhooks`,
  `deleteWebhook`, `getBookingRevision`, `getBooking`.

### Verified (2026-09-08)

- **Real pull leg:** `getBookingRevision('b3d1cd3c-…')` against staging returns
  the full Jim Beam / BookingCom reservation.
- **Full sync** (harness, real staging pull retargeted onto the real connected
  property `a50e441f` / room 341, all cleaned up):
  - `new` → 1 booking, `status=confirmed`, `source=booking_com`, `room_id=341`,
    dates from `room.checkin_date`/`checkout_date`, `num_guests=2`,
    `channex_reservation_id` set, guest "Jim Beam" created. Room 341 then shows
    BOOKED for those nights (hasOverlap-style query).
  - `modified` (date shift) → SAME booking row updated, no duplicate.
  - `cancelled` → booking → `cancelled`; re-delivery = no-op.
  - unmapped property → `skipped: unmapped_property`.
- **HTTP** (`POST /api/channex/webhook`, dev server): no secret → `401`; wrong
  secret → `401`; empty body → `400`; `event:'ari'` → `200 ignored`; real
  revision pointer for an **unconnected** property → `200 skipped`; real
  revision pointer for a **connected** property → `200 created`, booking #186
  appears (room 341, confirmed, booking_com, correct dates/guest); redeliver ×2
  → `200 updated`, same row, no churn.
- **Availability push-back fired** on every create/modify/cancel
  (`[channex-sync] property #1 room:341 … — N segment(s)`), **no Channex
  reservation created** (staging booking count stayed 1 throughout).
- `node --check` clean on all changed/new files. CSV importer still wired
  (`normaliseSource`/`splitName` imported), 19 unit assertions pass.

### Not verified locally (same DB limitation as slices 3–4)

- WP / Units / IR-Categories inbound — no such property exists locally. The
  category branch (`assignRoomForCategoryBooking`) and WP branch (first-room)
  are written from the data model + reused engines but not end-to-end tested.
- **Channex's actual webhook delivery** — needs the public-HTTPS-endpoint gap
  (research §9/§13) solved. The receiver + registration route are ready; John
  registers the global webhook once a public origin exists:
  set `CHANNEX_WEBHOOK_URL` in prod `server/.env`, then Super Admin
  `POST /api/admin/channex/register-webhook`. Then run the task's live
  verification (create/modify/cancel a reservation on Channex staging for
  room 341 / `a50e441f`).

### Deferred (unchanged)

- Rate re-push + seasonal `rate_periods`; room-type reconciliation; disconnect
  path; the Holiday-Rentals one-Channex-property-per-unit split;
  `non_acked_booking` acknowledgement; the "unmapped rate" Live-Feed state
  (research §10) — inbound currently tolerates `rate_plan_id: null` (it only
  keys off `room_type_id`).

### Verified live in production (2026-09-08, John)

Slice 5 was re-verified end-to-end against **real production infrastructure**
(not Local Dev, not a replay harness) — first genuine Channex-originated
webhook delivery to `https://nestbook.io/api/channex/webhook`.

- Connected a real production property (#95 "The category", IR-Categories
  mode) to Channex for the first time via `channex-create` + `channex-push`
  (5 room types/rate plans, 90 days ARI, no warnings).
- Registered the global webhook against production via
  `POST /api/admin/channex/register-webhook` (`CHANNEX_API_KEY` had to be
  added to production `server/.env` — it only existed in Local Dev's `.env`
  before this session; sandbox key).
- Created a real reservation on Channex staging (Booking CRS app, property
  dropdown workaround needed — see below) → webhook fired →
  `[channex-inbound] reservation ... CREATED — booking(s) 250` → booking #250
  appeared correctly in the owner-facing app (room 1 / Double, confirmed,
  2 guests, correct dates, guest "Webhook Testing" created) — **first live
  proof the IR-Categories `assignRoomForCategoryBooking()` inbound branch
  works against a real Channex booking**, not just the harness.
- Cancelled the same reservation on Channex → webhook fired →
  `[channex-inbound] reservation ... CANCELLED — 1 booking(s) freed` →
  booking #250 flipped to `status='cancelled'` in the DB and in the owner
  app's Bookings list; calendar/dashboard correctly freed the room. Cancel
  leg now proven live, not just via harness.
- Availability push-back (`pushAvailabilityUpdate`) fired correctly after
  both events, confirmed no reservation was echoed back to Channex.

**Known Channex dashboard quirk (not a NestBook bug):** the property
switcher/dropdown at the top of the Channex dashboard did not show newly
created or existing properties reliably — required a hard refresh in one
case, and a manual URL (`/properties/{id}/edit`) to reach a property at all
in another. Confirmed independent of NestBook-side permissions (Groups
showed correct access throughout). Worth remembering before assuming a
property connection is broken — try a hard refresh first.

**Still not verified:** WP and IR-Named inbound in production (only
IR-Categories tested live this session). Rate/restriction sync *from*
Channex back to NestBook (i.e. OTA-set pricing) is out of scope for slice 5
and remains a future slice if ever needed.

### All dispatch branches verified live in production (2026-09-08, John, continued)

Following the IR-Categories production proof above, the two remaining
inbound dispatch branches were verified live against real production
throwaway properties (not Local Dev, not a harness):

- **Whole-Property mode** — property #108 "Test One Property"
  (`whole_property` / `villa`). Connected via `channex-create` +
  `channex-push` (1 room type, first-room mapping). Real Channex reservation
  created via Booking CRS → `[channex-inbound] reservation ... CREATED —
  booking(s) 255` → booking landed correctly assigned to room 265 (the
  property's first room), `status=confirmed`, correct dates/total, and
  rendered correctly in the owner-facing Dashboard and Calendar (not just
  the DB row).
- **Named Rooms (IR-Named) mode** — property #109 "Test Two property"
  (`rooms` / `named`, 2 real rooms: Garden Room, River Run). Connected the
  same way (2 room types/rate plans mapped 1:1 to rooms). Real Channex
  reservation for one room → `[channex-inbound] reservation ... CREATED —
  booking(s) 256` → booking landed on the correct specific room (272 /
  "River Run"), `status=confirmed`, correct dates/total.

**All four dispatch branches (`room` / `category` / `whole_property`, plus
the `assignRoomForCategoryBooking()` sub-path) are now proven against real,
live, Channex-originated webhook deliveries in production** — not just code
review or Local Dev harness replay. This closes the last standing "not
verified locally" caveat carried since slice 3.

Both throwaway properties (#108, #109) were Free-plan, created solely for
this test, and are safe to disconnect/delete/leave alone — nothing
production-real depends on them.

**Status: Phase 2 technical build is complete.** Full lifecycle proven live:
connect → initial push → ongoing availability sync → seasonal rate sync →
inbound booking create → inbound booking cancel → room-type reconciliation
→ disconnect. Next step is Channex's certification process (efficiency
review + live session with their team) before any real OTA channel can go
live — no further engineering work is required to reach that point.
- ~~Rate re-push + seasonal `rate_periods`~~ — **done, slice 6.**
- Room-type reconciliation; disconnect path; the Holiday-Rentals
  one-Channex-property-per-unit split; `non_acked_booking` acknowledgement; the
  "unmapped rate" Live-Feed state (research §10) — inbound currently tolerates
  `rate_plan_id: null` (it only keys off `room_type_id`).

---

## Slice 6 — seasonal rate push + ongoing rate sync  ✅ DONE (2026-09-08)

**Problem it fixes:** slices 3–4 pushed ONE flat rate
(`price_per_night` / `whole_property_rate`) across the whole 90-day window per
rate plan. Any `rate_periods` an owner configured (Christmas, Summer Peak, …)
were ignored — every OTA saw the wrong price for those nights.

### Investigation (confirmed against the codebase + docs.channex.io)

- **`getRateForDate()`** (`server/utils/ratePeriods.js`) is the app's single
  source of truth for a night's price (booking modal, checkout, widget all use
  it). Signature `getRateForDate(propertyId, roomId, checkInDate, baseRateOverride = null)`
  → `{ rate, periodName }` | `null`. Needs a real `rooms` row. Priority:
  `rate_period_rooms.amount` override > matching `rate_periods` row (flat, or
  `multiplier` × base, rounded to cents) > base. Periods scanned
  `ORDER BY priority ASC, id ASC`, first match wins. `date_from`/`date_to` are
  `MM-DD` (annual, Dec→Jan wrap) or `YYYY-MM-DD` (one-off).
- **WP pattern** (from widget.js `GET /api/widget/rate-range`): resolve against
  the property's first room by id + `baseRateOverride = whole_property_rate`.
- **`rate_periods` mutation routes** (`grep -rn "rate_period" server/routes/`):
  only `server/routes/ratePeriods.js` (`POST /`, `PUT /:id`, `DELETE /:id`).
  widget.js is GET-only. `admin.js:990` deletes `rate_periods` inside the
  Super-Admin "delete user + all their properties" cascade — the property + its
  `channex_room_mappings` are destroyed in the same txn, so **deliberately NOT
  wired** (nothing to sync to).
- **Channex `POST /api/v1/restrictions`** — `values` IS an array; each element
  carries its own `date_from`/`date_to`/`rate` → segmented rates in ONE call
  (same as `/availability`). Last-Win, FIFO. `rate` must be `> 0`. Rate limit
  ~40/min per property. `channexClient.updateRates()` already existed.

### Built

- **`server/utils/channexPushInventory.js`:**
  - `buildTargets()` targets now carry `rateForDate(date) -> number>0 | null`
    instead of `baseRate`:
    - room → `getRateForDate(pid, room.id, date).rate`
    - category → **lowest positive** `getRateForDate()` across the category's
      rooms (keeps the old flat "lowest room price" rule, now per-night &
      season-aware)
    - whole_property → `getRateForDate(pid, firstRoomId, date, whole_property_rate)`,
      plain `whole_property_rate` fallback
  - `rateSegments(dates, rateForDate)` helper — `coalesce()` into contiguous
    `{date_from, date_to, rate:"0.00"|null}`; a `null` segment ⇒ caller skips +
    warns (per-segment, mirroring slice 3's per-property zero-rate skip).
  - `pushInitialInventory` step 3b rewritten to push one `/restrictions` row per
    rate segment. `rates.skippedZeroRate` entries are now
    `"<title> (<from>..<to>)"`.
  - **New `pushRateUpdate(propertyId, refType, refId, dateFrom, dateTo)`** — the
    rate twin of `pushAvailabilityUpdate()`. Same contract: no-op if unmapped /
    no `channex_property_id`, **never throws / never rejects**, window-clamped,
    reuses `affectedMappings()` + `buildTargets()` + `coalesce()`. Rate-period
    callers pass `('property', null, null, null)` → recompute + re-push real
    seasonal rates for EVERY mapped rate plan across the full window. No diffing:
    Channex Last-Win means a full re-push inherently reverts a stale segment left
    by an edited/deleted period.
- **`server/routes/ratePeriods.js`:** imports `pushRateUpdate`; fires it
  fire-and-forget (`.catch(()=>{})`, **after** `res.json()` / `res.status(204)`,
  never awaited) in `POST /`, `PUT /:id`, `DELETE /:id`.

### Verified (2026-09-08)

- **Unit harness** (BEGIN/ROLLBACK against `server/nestbook.db`, property #1
  IR-Named room 341 @ €95): baseline → one `95.00` segment; flat one-off 150 →
  `95 / 150 / 95` coalesced; `multiplier` 1.5 → `142.50`; `rate_period_rooms`
  override 200 → `200.00`; period with `rate_value 0` → falls back to base
  `95.00` (no skip); priority (p0=120 vs p1=999 overlap) → `120` wins; annual
  `01-01..12-31` → `175.00` across the whole window.
- **Live Channex staging** (real API, connected property #1 `a50e441f`, rate
  plan `e4f3f2a6` = room 341, all cleaned up):
  - **CREATE** a seasonal period (flat 150, 2026-10-08..17) → `pushRateUpdate`
    logged `12 segment(s) across 4 rate plan(s)`; `GET /api/v1/restrictions`
    showed `95.00 / 150.00 [10-08..17] / 95.00` ✅
  - **EDIT** (price 150→175, range shifted to 10-11..20) → `GET` showed
    `95.00 / 175.00 [10-11..20] / 95.00` — **old 150 range fully reverted, no
    stale segment** ✅
  - **DELETE** → `GET` showed flat `95.00` across the whole window ✅
  - Final staging state: all 4 rate plans back to flat base (95/85/145/65) ✅
  - **Non-connected property #3** + `pushRateUpdate` → **0 `fetch` calls**
    (silent no-op) ✅
- `node --check` clean on `channexPushInventory.js` + `ratePeriods.js`.

### Not verified locally (same DB limitation as slices 3–5)

WP / Units / IR-Categories — no such property in the local DB. Those
`rateForDate` branches are written from the data model + `widget.js` /
`bookings.js` reading and unit-checkable via `buildTargets`, but not
end-to-end tested against live Channex.

### Deferred (unchanged)

- ~~Room-type reconciliation~~ — **done, slice 7.**
- Disconnect path; Holiday-Rentals one-Channex-property-per-unit split;
  `non_acked_booking` acknowledgement; the "unmapped rate" Live-Feed state.

---

## Slice 7 — room-type reconciliation  ✅ DONE (2026-09-08)

**Problem it fixes:** `channex_room_mappings` was populated once, at initial
push. After that a **renamed** room kept its old Channex title, a **new** room
got no Channex room type (invisible to OTAs), and a **deleted** room left an
orphan mapping whose Channex room type stayed frozen at its last availability
(usually 1) → **OTAs kept selling a room that no longer exists.**

### Investigation (confirmed against the codebase + docs.channex.io)

- **Room CRUD** — `server/routes/rooms.js`: `POST /` (create), `PUT /:id`
  (name = rename; also capacity / max_occupancy / category_id / status),
  `DELETE /:id` (`409 {booking_count}` unless `?force`; then hard-deletes),
  + 4 bulk importers (`bulk-import` Named, `bulk-import-categories` — also
  creates `room_categories`, `bulk-import-wp` sections, `bulk-import-units`).
- **Category CRUD** — `server/routes/roomCategories.js`: `POST
  /properties/:pid/room-categories`, `PUT /room-categories/:id`,
  `DELETE /room-categories/:id` (**`409` if any room still references it** → a
  category delete only ever fires on an empty category). `createRoomCategory()`
  shared helper — wired the routes, not the helper.
- **Channex docs:**
  - `PUT /api/v1/room_types/:id` **exists** — `title` updatable in place; body
    `{room_type:{…}}`, all create fields except `property_id`. (Dropping a
    channel-mapped occupancy option 422s — we only bump title/count/occ.)
  - `PUT /api/v1/rate_plans/:id` **exists** — `title` updatable (≤255).
  - `DELETE /api/v1/room_types/:id` — refuses if channel-associated unless
    `?force=true`; **docs silent on booking/ARI history**. `DELETE
    /api/v1/rate_plans/:id` — **irreversible** ("can't restore it").
    → **auto-delete is NOT confirmed safe** → orphan-mark + zero availability +
    loud warn; never an automatic `DELETE`.
- **Stale mapping today:** a deleted room's mapping lingers;
  `pushAvailabilityUpdate`/`pushRateUpdate` → `affectedMappings()` returns it,
  `buildTargets()` has no target → `byRef.get()` undefined → `continue` →
  **silent no-op, no crash** — but the Channex room type is frozen → overselling.
- **IR-Categories nuance (confirmed):** the *category* is the Channex room type,
  not the room. Adding/removing a room within a mapped category → just an
  availability + lowest-price refresh; only category created / emptied / deleted
  is a room-type-level change. `buildTargets()` already `continue`s past a
  0-room category, so an emptied category = treated as a delete.

### Built

- **Schema** (`server/db/schema.js`): `channex_room_mappings.orphaned_at TEXT`
  (nullable, guarded `ALTER`). NULL = live; set = NestBook side gone, excluded
  from create/rename reconcile + ongoing ARI's "live" set, kept for the audit
  trail.
- **`server/utils/channexClient.js`:** `updateRoomType(id, attrs)` (PUT),
  `updateRatePlan(id, attrs)` (PUT). Delete helpers gained doc-comments on the
  channel guard / irreversibility.
- **`server/utils/channexPushInventory.js`:**
  - Extracted `roomTypeAttributes(target)`, `ratePlanCreateAttributes(...)`,
    `createTargetOnChannex(cxPropId, currency, target)` (create room type +
    rate plan, self-cleaning on partial failure). `pushInitialInventory`'s inner
    loop now calls `createTargetOnChannex` instead of its inline creates.
  - **`pushRoomTypeReconcile(propertyId, refType, refId, changeType, opts)`** —
    `refType` ∈ `room|category|property`, `changeType` ∈
    `created|renamed|deleted`, `opts` = `{categoryId, parentUnitId}` (captured
    by the caller before a delete). Same contract as slices 4/6: never
    throws/rejects, silent no-op unless the property has `channex_property_id` +
    ≥1 mapping row, never awaited.
    - `syncTarget(property, target, mapping|null)` — null ⇒ `createTargetOnChannex`
      + insert mapping (BEGIN/COMMIT/ROLLBACK, Channex cleanup on insert
      failure) + push its 90-day ARI (reuses slices 4 + 6); mapping ⇒ PUT
      room-type attrs + rate-plan title, then ARI refresh.
    - `orphanTarget(property, mapping, reason)` — `SET orphaned_at`, push
      `availability 0` across the window for its `channex_room_type_id`,
      `console.warn` loudly. **No Channex DELETE.**
    - Dispatch: `property`+`created` → `syncTarget` every target; WP room
      changes → no-op (single property-level room type); Categories → resolve
      to the `category:` ref (create/refresh, or orphan when emptied);
      IR-Named/Units → the `room:` ref (internal unit rooms skipped);
      `deleted` → `orphanTarget` (or refresh if a category still has rooms);
      a reappeared ref whose mapping is orphaned → warn, don't auto-duplicate.
- **Wiring** (all fire-and-forget after the response, `.catch(()=>{})`):
  - `rooms.js`: `POST /` → `('room', id, 'created', {categoryId, parentUnitId})`;
    `PUT /:id` → `('room', id, 'renamed', …)` when name/capacity/max_occupancy/
    category_id/status changed (+ a `('category', oldCatId, 'deleted')` refresh
    when a room moved out of a category); `DELETE /:id` →
    `('room', id, 'deleted', {…})` (room row read before the delete); each of the
    4 `bulk-import*` → `('property', null, 'created')`.
  - `roomCategories.js`: `POST …/room-categories` → `('category', id, 'created')`;
    `PUT /room-categories/:id` → `('category', id, 'renamed')` when name changed;
    `DELETE /room-categories/:id` → `('category', id, 'deleted')`.

### Verified (2026-09-08 — live Channex staging, connected property #1 `a50e441f`)

Harness inserted a real room, ran each reconcile against the real API, cleaned up:
- **CREATE** room #359 → new Channex room type `67dddbff…` ("CX Slice7 Test"),
  `channex_room_mappings` row #6 inserted, availability pushed (`[1]`), rate
  pushed. ✅
- **RENAME** + capacity 2→4 / max_occ 3→5 → Channex room type title →
  "CX Slice7 Renamed", `occ_adults` 3→5, **in place (PUT)** — no new room type. ✅
- **DELETE** (no bookings) → mapping row `orphaned_at` set, loud warn logged,
  Channex room type **still exists** (NOT deleted), availability → `[0]`. ✅
- **Delete WITH bookings** → the route's own `409 {booking_count}` guard fires
  before reconcile; `?force` path routes through the same orphan logic — nothing
  crashes (route reads the room row before deleting, so `opts` is intact). ✅
- **Non-connected property #3** → `pushRoomTypeReconcile` made **0 Channex fetch
  calls**. ✅
- `node --check` clean on all 5 changed files.

### Not verified locally (same DB limitation as slices 3–6)

WP / Units / IR-Categories — no such property exists locally. Their dispatch
branches are written from the data model + `buildTargets()` reading; the
IR-Named create/rename/delete/orphan path is the one exercised end-to-end.

### Deferred

Property rename → WP room-type title (separate route, separate concern);
automatic `DELETE` of an orphaned Channex room type / rate plan (needs a human);
un-orphaning a mapping when the owner re-creates a same-named room.
(~~disconnect surface~~ — done, slice 8.)

---

## Slice 8 — disconnect path  ✅ DONE (2026-09-08)

**Problem it fixes:** slices 2–7 are one-way. No way to clear
`properties.channex_property_id` + `channex_room_mappings` if an owner stops
using Channel Manager, switches providers, or connected the wrong property.

### Investigation (confirmed 2026-09-08)

- **Nothing half-built** — `grep channex` across `client/src` → only
  `admin/pages/Properties.jsx`; no disconnect anywhere in `server/routes`.
- **Channex `DELETE /api/v1/properties/:id`** (hotels-collection.md): exists but
  *"can't be reverted … create it again from scratch"*, blocked if the property
  has ≥1 channel unless `?force=true`, cascade to room types / rate plans
  **undocumented**.
- **Decision: disconnect severs the NestBook side ONLY — no Channex API call.**
  Clear `channex_property_id`, delete the property's `channex_room_mappings`
  rows (orphaned rows included). Leave the Channex property + room types + rate
  plans intact (owner manages them in their own Channex account). Matches the
  standing "never auto-destroy OTA-side history" rule (slices 5 + 7).
- **`channex_reservation_id` bookings are safe:** plain nullable TEXT on
  `bookings`, no FK, no trigger; nothing joins `bookings` →
  `channex_room_mappings`; the property row itself is never deleted (only its one
  column nulled). OTA-origin bookings stay real; the column is kept as the
  historical record.
- **Post-disconnect no-op is automatic** — `pushAvailabilityUpdate` /
  `pushRateUpdate` / `pushRoomTypeReconcile` all bail on
  `mappings.length === 0`; `channexInboundSync` can't resolve the property
  (`channex_property_id` NULL) → its existing "unmapped property → skip" path.

### Built

- **`server/utils/channexPushInventory.js`:** `disconnectChannexProperty(property)`
  — **pure DB, synchronous, no API calls.** Reads the mapping rows for the
  summary, then `BEGIN` → `DELETE FROM channex_room_mappings WHERE property_id`
  → `UPDATE properties SET channex_property_id = NULL` → `COMMIT`
  (`ROLLBACK` + rethrow on error). Returns `{ priorChannexPropertyId,
  mappingsDeleted, orphanedMappingsDeleted, roomTypeIds, ratePlanIds,
  channexSide: 'untouched' }`.
- **`server/routes/admin.js`:** `POST /api/admin/properties/:id/channex-disconnect`
  (Super Admin only — same mount as `channex-create` / `channex-push`;
  owner-facing is Phase 4). 400 invalid id / not-connected; 404 no property;
  else disconnect + `logAction` `CHANNEX_DISCONNECTED` (detail spells out
  NestBook-side cleared + Channex-side left intact) + `res.json({ success,
  cleared: { channex_property_id, mappings_deleted }, channex_side })`. No 502
  branch (no API call).
- **`client/src/admin/pages/Properties.jsx`:** `disconnectChannex()` callback —
  `window.confirm` (internal SA debug tool; reconnect is possible so no full
  modal), `POST …/channex-disconnect`, toast, `fetchProperties()`. New
  danger-coloured **"Disconnect"** button in the connected branch of the Channex
  cell, next to the room-type count / Push Inventory button. After disconnect
  the cell falls back to "Create in Channex" (the SELECT already returns the
  now-NULL `channex_property_id` + 0 `channex_mapping_count`).

### Verified (2026-09-08 — harness against connected property #1 `a50e441f`, restored to exact pre-slice-8 state after)

- **Disconnect** → `channex_property_id` NULL, 4 mapping rows deleted,
  **0 Channex API calls**. ✅
- Seeded booking #187 with a `channex_reservation_id` → **unchanged** (resv id +
  `confirmed` status intact) after disconnect. ✅
- Post-disconnect: `pushAvailabilityUpdate` + `pushRateUpdate` +
  `pushRoomTypeReconcile` (×2) → **0 fetch calls**. ✅
- **Reconnect** from scratch: `createChannexProperty` → new UUID
  `17deedb0…` (≠ old, no collision) → `pushInitialInventory` → 4 room types +
  4 rate plans + 4 fresh mappings, no leftover-state collision. ✅
- Cleanup: new Channex property force-deleted; local DB restored to the exact
  original 4 mapping rows + `channex_property_id`. The original `a50e441f`
  Channex property was never touched.
- `node --check` clean on `admin.js` + `channexPushInventory.js`; `Properties.jsx`
  JSX transform-checks clean.

### Deferred

Owner-facing disconnect (Phase 4 Settings UI); an optional "also delete on
Channex" checkbox for the empty-property case where the owner confirms nothing
of value is on the Channex side.

---

## Slice 9 — certification prep (500-day/2-call Full Sync · booking ack · queue + rate limiter + retry)  ✅ DONE (2026-09-08)

Closes the three gaps between the integration and Channex's PMS certification
(docs.channex.io/.../pms-certification-tests).

### Investigation (confirmed against the codebase + docs)
- **Full Sync call count** — `pushInitialInventory` already batches: ONE
  `POST /availability` across every room type + ONE `POST /restrictions` across
  every rate plan (the object creates are separate). The only gap was the
  window: `WINDOW_DAYS = 90` (the sole hardcode). Rates already vary (seasonal,
  slice 6) — not the "1 availability / 100 USD" anti-pattern.
- **Cert test 1:** *"2 API calls: 1 x 500 days for Availability (All Rooms), 1 x
  500 days Rates & restrictions"*.
- **Cert anti-patterns:** full-sync-on-a-timer (we never do — manual trigger
  only), per-date/per-rate calls where "1 API call" is specified, integration
  logic in test files.  *"Full sync is allowed once every 24h … off-peak"* — so
  keep it manual.
- **Ack endpoint** (bookings-collection.md): `POST /api/v1/booking_revisions/:id/ack`,
  **empty body**, `200 { meta: { message: "Success" } }`. Un-acked → 30-min
  reminder email. Cert test 11 also: *"do not use `GET api/v1/bookings…`, use
  `GET api/v1/booking_revisions…`"*.
- **Rate limits** (rate-limits.md), **per property per minute**: 10 availability,
  10 restrictions, **20 ARI total**. Breach → `429`
  `{"errors":{"code":"http_too_many_requests"}}`. No documented `Retry-After`.
- **No ack today** — `grep` of `channexInboundSync.js` / `channex.js`: none.
  Slice 5's deferral confirmed. `getBooking()` (`GET /bookings/:id`) existed as a
  dead fallback → removed.

### Built
- **`server/utils/channexQueue.js` (NEW):** `submitChannexJob({ kind:'ari'|'other',
  ariType, propertyId, dedupeKey, label, run })` → `Promise`. One array-backed
  FIFO + one async worker. **Per-property ARI sliding-window limiter**
  (9 availability / 9 restrictions / 18 total per trailing 60 s — a hair under
  the documented 10/10/20), **250 ms global min-gap**, **retry-backoff**
  `[2s,8s,30s,60s]` × 5 attempts on `429`/`5xx`/network (honours `Retry-After`),
  immediate reject on other 4xx, **dedupe** of not-yet-started jobs by
  `dedupeKey`. Test hooks: `__setChannexQueueConfig`, `__resetChannexQueue`,
  `channexQueueStats`, `drainChannexQueue`. Real infra — not a test shim.
  A job's `run()` must never call `submitChannexJob` (single worker → deadlock).
- **`server/utils/channexClient.js`:** `ChannexError.retryAfter` +
  `channexRequest` reads the `Retry-After` header. Every **write** now routes
  through the queue — `updateAvailability`/`updateRates` as `kind:'ari'`
  (`{propertyId, dedupeKey}` opts); `create/update/deleteRoomType` /
  `…RatePlan` / `createProperty` / `createWebhook` / `deleteWebhook` as
  `kind:'other'`. **Reads stay direct** (`getBookingRevision`, `listWebhooks`)
  so a webhook pull never waits behind a backed-up ARI burst. New
  `acknowledgeBookingRevision(revisionId)`. `getBooking()` removed.
- **`server/utils/channexPushInventory.js`:** `WINDOW_DAYS = 90 → 500` (the one
  place; delta paths widen with it — still one change-triggered call each, never
  a timer). `pushAvailabilityUpdate` / `pushRateUpdate` keep the cheap
  `SELECT 1 … LIMIT 1` no-op pre-check (never enqueue for the ~99 % unconnected
  case), then `submitChannexJob({ kind:'ari', dedupeKey, run: () =>
  runAvailabilitySync/runRateSync(...) })` — the `run` **recomputes from the DB
  at execution time**, so dedupe never pushes stale state. `pushInitialInventory`
  awaits its 2 batched ARI calls (route needs the summary).
- **`server/utils/channexInboundSync.js`:** `acknowledgeBookingRevision(
  revision.id)` fired **after the DB commit** on every terminal outcome —
  created / updated / cancelled, and the `unmapped_property` /
  `no_mapped_rooms` skip decisions — queued + retried + non-fatal (an ack
  failure must not fail the webhook). NOT on a thrown error. The availability
  push-back is now **fire-and-forget** (drains via the queue) so the webhook
  responds fast. `fetchRevision` requires `revision_id` (no `GET /bookings`
  fallback).
- **`channex.js`:** webhook `400`s if `revision_id` is missing (always present
  for a `booking` event). **`admin.js` / `Properties.jsx`:** 90→500 in the
  comment + toast fallback.

### Verified (2026-09-08)
- **Full Sync** (mocked fetch, real `pushInitialInventory` on property #1 with a
  seeded rate_period): **exactly 1 `POST /availability` + 1 `POST /restrictions`**,
  availability across all 4 room types, restrictions across all 4 rate plans,
  both reaching **day 500**, distinct rates `95/222/85/145/65` (varied, not
  flat). `summary.window.days === 500`.
- **Ack:** inbound `new` revision → one `POST …/booking_revisions/:id/ack`
  **after** the booking row is committed (log order confirms); `cancelled`
  revision → one ack. Real staging: `ack` of a bogus revision id → real `404`,
  surfaced as `ChannexError` (non-retryable), no crash.
- **Rate limiter:** 25 rapid `pushAvailabilityUpdate` for one property → **max 9
  dispatches in any rolling window** (the real 9-per-window logic; window
  duration shrunk for test speed), calls visibly spaced, `[channex-queue]
  rate-limit hold` logged.
- **Retry-backoff:** simulated `429` ×2 → 3 attempts, succeeds, `retries:2
  failed:0`. Simulated `422` → **1 attempt, no retry**, `failed:1`, logged
  non-fatal.
- **Deltas through the queue:** `pushAvailabilityUpdate` + `pushRateUpdate`
  both increment `channexQueueStats().submitted` / `.ok` — no bare fetch.
- **Real staging round-trip:** `pushAvailabilityUpdate` + `pushRateUpdate` on
  connected #1 → real `POST /availability` + `POST /restrictions` (500-day
  window), `ok:2`, via the queue.
- `node --check` clean on all changed files; `Properties.jsx` JSX parses clean.

### Deferred
- Durable queue (survives a process restart) — current one is in-memory; a lost
  job is re-covered by the next change event / Channex's ack reminder (the
  reminder path is now actually wired — see slice 9a).
- The pre-flight checklist form + the stage-4 live screenshare are John's to run.
- Airbnb Live-Feed events (`reservation_request` etc.); the "unmapped rate"
  Live-Feed state.

---

## Slice 9a — booking ack was silently not reaching Channex  ✅ FIXED (2026-09-09)

**Symptom:** a real staging reservation (property #110 `OFL-1TESTNESTBOOK`,
revision `424776d2-…`) synced into NestBook fine (`[channex-inbound] … CREATED`)
but the Channex "Acked" column stayed grey `?` and **neither**
`[channex-inbound] acknowledged revision …` **nor** `… ack failed …` ever
logged. The ack wasn't failing — it was never completing.

**Root cause (confirmed by reproduction):** the ack was a fire-and-forget job on
`channexQueue` — a **single-worker FIFO**. Slice 9 submitted it *after* the
fire-and-forget availability push-back, so it sat behind an ARI job. And
`channexRequest` had **no timeout** — a stalled/slow `fetch` in that ARI job's
`run()` leaves the worker `running: true` forever, so the ack job behind it
never runs and nothing logs (reproduced exactly: `pending:1, running:true`, zero
log output). Even without a full stall, an ARI job that hit the retry-backoff
(`[2s,8s,30s,60s]`) held the ack for ~100 s; a process restart in that window
dropped it entirely, and `non_acked_booking` reminders were being `200 ignored`
so there was no recovery.

Contributing: `isRetryable()` treated **any** non-`ChannexError` (a plain bug,
`status` undefined) as retryable → 5 attempts / ~100 s to fail anyway.

**Fix:**
- **`channexClient.channexRequest`** — hard `AbortSignal.timeout` (default
  30 s, `opts.timeoutMs`). A stalled call now throws a network-class
  `ChannexError` instead of hanging the queue worker forever.
- **`channexClient.acknowledgeBookingRevision`** — **no longer goes through
  `channexQueue`.** Runs directly with its own small bounded retry (3 ×, 2/4 s,
  transient-only). The ack is not ARI-rate-limited and fires once per
  reservation; it must never queue behind ARI. `queuedWrite` still carries the
  object-CRUD calls.
- **`channexInboundSync`** — `ackRevision()` is now called *before* the
  availability push-back at every terminal site.
- **`channexQueue.worker`** — non-`ari` jobs (room-type / rate-plan / property
  CRUD) are picked ahead of `ari` jobs (FIFO preserved within each class); a
  create is a prerequisite for the ARI that follows it. `isRetryable()` now
  requires `err.name === 'ChannexError'` for the null-status case. `__reset…`
  also clears `running`.
- **`routes/channex.js`** — `non_acked_booking` added to `BOOKING_EVENTS`; its
  payload carries `booking_revision_id`, so the reminder re-drives the
  idempotent pull → sync → ack path as the real recovery net.

**Verified (2026-09-09, real Channex staging):**
- Booking #259's revision (`424776d2-…` / `OFL-1TESTNESTBOOK`) → manual ack →
  Channex `acknowledge_status: acknowledged` (revision **and** booking). The
  "Acked" `?` is now cleared. ✅
- Full HTTP webhook flow (real `channexRouter`, real revision pulled from
  staging, retargeted onto connected property #1): `event:booking` → `CREATED`
  **then** `[channex-inbound] acknowledged revision 424776d2-…` **then** the ARI
  `[channex-sync]` line — correct order, ack fired automatically, Channex shows
  `acknowledged`. ✅
- `non_acked_booking` reminder POST → re-runs idempotently (`UPDATED`, same
  booking row, no churn), re-acks (idempotent `{meta:{message:"Success"}}`). ✅
- Ack completes **while an ARI job is wedged** (hung `run()`) — proved the two
  are now independent. ✅
- Regression: rate limiter still caps 9/window (25 rapid → 9 then spaced); `429`
  retried→ok; `422` fails fast (1 attempt); a plain bug `Error` now fails fast
  (1 attempt, was 5); timeout throws `ChannexError status:null` at ~timeoutMs. ✅
- `node --check` clean on all 4 changed files. Local DB + staging property #1
  ARI restored to pre-test state; no leftover rows.

**Couldn't test locally:** creating a fresh reservation *on Channex* via the API
(`POST /api/v1/bookings` → 500/403 with the staging key, same as slice 5's
finding) — used John's existing real revision + the retargeted-property harness
instead. A brand-new Channex-side reservation → auto-ack is John's to spot-check
from the dashboard.
