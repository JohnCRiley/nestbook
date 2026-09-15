# Channel Manager parity — Policies & Taxes: deferred findings

**Investigated 2026-09-15.** `email`/`phone`/`website` (also investigated
this same pass) shipped as Slice D — see
`docs/completed/channex-property-contact-details-slice-d.md`. This file
now holds only the parts that are genuine future slices, not yet started.

## Policies — a real separate resource, not a quick field

Channex's "Edit Property → Policies" tab is backed by a genuinely separate
CRUD resource, **Hotel Policy** (`GET/POST/PUT/DELETE /api/v1/hotel_policies`,
linked via `property_id`) — not fields embedded on the property object.
Confirmed scope is broader than originally guessed ("cancellation/deposit
rules"): it actually configures check-in/check-out times, max occupancy,
adults-only flag, internet type/coverage/cost, parking type, **pet policy**
(allowed/not-allowed/by-arrangement + deposits/fees), and **smoking policy**
— general "house rules" territory, not primarily cancellation terms.

- Real overlap: `check_in_time`/`check_out_time` (NestBook already has
  these) would map trivially.
- Real gaps: pet policy, smoking policy, and internet-cost/parking-type
  don't exist as structured NestBook fields today (`wifi_network_name`
  exists for guest instructions, but nothing about cost/coverage type).
- A separate **Cancellation Policy** concept clearly exists (the property
  GET response carries its own `default_cancellation_policy_id`, distinct
  from `hotel_policy_id`), but no dedicated docs page was found for it in
  this pass — likely attaches at the rate-plan level (a common pattern in
  this space) rather than the property. Not chased further.

**Verdict: genuine future slice.** Needs its own resource-lifecycle build
(create-once-then-update, same shape of work as the room-type/rate-plan
resources already built), plus new NestBook-side fields for pet/smoking/
internet policy that don't exist yet.

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
