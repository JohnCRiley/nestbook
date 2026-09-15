# Channel Manager parity — Policies & Taxes: deferred findings

**Investigated 2026-09-15.** `email`/`phone`/`website` (also investigated
this same pass) shipped as Slice D — see
`docs/completed/channex-property-contact-details-slice-d.md`. This file
now holds only the parts that are genuine future slices, not yet started.

## Policies — confirmed live against Channex staging 2026-09-15, still a future slice

Re-investigated for a proposed "check-in/out + occupancy only" slice
(pets/smoking/internet/parking explicitly out of scope for that attempt).
Confirmed directly against real Channex staging (property #1,
`a50e441f-bbd8-40b6-a69e-f728953a976e`) with live POST/GET/PUT/DELETE calls
— the original guessed field names below were WRONG, corrected here:

- **Real resource**: `hotel_policies` is a genuine top-level CRUD resource
  (`GET/POST/PUT/DELETE /api/v1/hotel_policies`, linked via `property_id`,
  **not** nested under the property payload) — one policy row per property.
- **Check-in/out are RANGES, not single times**: `checkin_from_time` /
  `checkin_to_time` / `checkout_from_time` / `checkout_to_time`, each
  `HH:MM` 24hr strings. NestBook's single `check_in_time`/`check_out_time`
  would need to map to both ends of each range (e.g. from=to=the one
  NestBook value) — there's no NestBook-side "earliest/latest" concept to
  split it more precisely.
- **Occupancy is `max_count_of_guests`** — one plain integer, confirmed
  **property-wide** ("at Property at same time"), not per-room and no
  adults/children split. This is a completely different field from the
  room-type `occ_adults`/`occ_children`/`default_occupancy` NestBook
  already pushes per room type via `roomTypeAttributes()` — unrelated,
  already shipped, not part of this investigation.
- **PUT is an ordinary partial update** — confirmed live: a PUT containing
  only checkin/checkout/`max_count_of_guests` left every other field
  (pets/smoking/internet/parking/title/currency) untouched on a fresh GET.
  No "always send the full state" requirement the way `content.description`
  has elsewhere in this integration.
- **The actual blocker — confirmed live, not assumed**: `POST
  /hotel_policies` **422s** unless `title`, `currency`,
  `internet_access_type`, `internet_access_coverage`, `parking_type`,
  `parking_reservation`, `pets_policy`, and `smoking_policy` are ALL present
  on creation — none of which NestBook collects today. There is no way to
  create this resource with only check-in/out + occupancy; Channex forces a
  stance on pets/smoking/internet/parking just to create the row at all
  (PUT afterward is fine with a subset, per above — it's creation that's
  strict).
- Other real fields observed on a live create response, for whenever this
  is picked up: `parking_is_private` (bool), `parking_cost` (nullable),
  `pets_non_refundable_fee` / `pets_refundable_deposit` (nullable numeric
  strings), `is_adults_only` (bool, optional), `children_max_age` /
  `infant_max_age` (nullable), `enhanced_cleaning_practices` (bool),
  `cleaning_practices_description` (nullable), `partner_hygiene_link`
  (nullable), `self_checkin_checkout` (bool). Channex also nulls
  `internet_access_coverage` server-side when `internet_access_type` is
  `'none'`, even if a coverage value is sent.
- A separate **Cancellation Policy** concept clearly exists (the property
  GET response carries its own `default_cancellation_policy_id`, distinct
  from `hotel_policy_id`), but no dedicated docs page was found for it in
  this pass — likely attaches at the rate-plan level (a common pattern in
  this space) rather than the property. Not chased further.

**Decision (2026-09-15, John):** given creation genuinely requires taking a
stance on pets/smoking/internet/parking — none of which NestBook has real
owner-set data for — the build was explicitly deferred rather than sending
placeholder/guessed values (e.g. "pets not allowed", "no smoking") on a
live OTA channel on an owner's behalf. **Build this once NestBook has real
UI + data for pets/smoking/internet/parking policy** (a genuine new
NestBook feature, not just a Channex-push slice), then push all of
check-in/out + occupancy + pets/smoking/internet/parking together as one
real `hotel_policies` create. Needs its own resource-lifecycle build
(create-once-then-update, same shape of work as the room-type/rate-plan
resources already built).

## Tax Sets / Taxes — confirmed non-trivial, and a real conceptual mismatch with NestBook's existing tax feature

Channex's system is genuinely a multi-resource setup: a **Tax** (title,
`logic` — percent/per_room/per_night/etc., `type` — tax/fee/city_tax, rate,
inclusive-or-added, seasonal date ranges) belongs to a **Tax Set**, and Tax
Sets attach to rate plans via `associated_rate_plan_ids` (one marked
default per property). This is built for jurisdiction-level compliance
(VAT, city tax) shown correctly per OTA, not a simple flat percentage.

**Important distinction NestBook doesn't have yet**: the existing
`service_categories.tax_rate` (Room Charges/POS feature) taxes **ad-hoc
guest charges** (bar tab, spa, extras) — a completely different concept
from a **nightly room-rate tax** (VAT/city tax on the accommodation price
itself), which is what Channex's Tax Sets are actually for. NestBook has
no room-rate-tax concept at all today, so this isn't a quick "reuse the
existing tax_rate field" job — it would need a genuinely new tax concept
built into the rate/booking model first.

**Verdict: real future slice, larger than Policies.**

## Confirmed facts (don't re-check next time)

- Hotel Policy and Tax Set/Tax are confirmed separate Channex CRUD
  resources (not property attributes) — do not attempt to fold them into
  the existing property-attribute push function (`buildChannexPropertyAttributes()`)
  whenever they are built.
