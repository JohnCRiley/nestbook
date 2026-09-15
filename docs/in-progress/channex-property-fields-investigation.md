# Channel Manager parity — remaining property fields: investigation (no code yet)

**Investigated 2026-09-15.** Follow-up to Slices A (photos) and B
(descriptions). Scopes what's left of Channex's Edit Property panel:
email/phone/website (quick, mostly), Policies and Taxes (real future slices).

## email / phone / website — behavior confirmed, but NestBook's data doesn't exist for 2 of 3

**Channex side (tested live against staging, not just docs):** all three are
plain top-level scalar strings on the property object — `email` (validated
email format, "provided to 3rd party services as contact email"), `phone`
(string, max 32 chars), `website` (valid URL, no further validation).
Confirmed via a real set → omit → clear cycle: **standard partial-update
semantics** — setting replaces, omitting the field entirely on an unrelated
update leaves the existing value untouched, and explicit `null` clears it.
Identical, simplest-possible behavior to how `timezone`/`country` already
work in `createChannexProperty.js` — no surprises, no dedicated tracking
needed.

**NestBook side — the actual finding, contrary to the task's assumption:**
checked Settings.jsx and the full schema directly.
- **`website`: buildable today, zero new fields.** No `properties.website`
  column exists, but every property already has a real, always-present
  public URL — `properties.booking_slug` → `https://nestbook.io/book/<slug>`
  (the same booking page already live for guests). This is arguably a
  *better* website value than a generic one would be. Genuinely quick.
- **`email`: does NOT already exist at property level.** No
  `properties.email` column, and no email input anywhere in Settings for
  the property itself. The only email in the data model is `users.email` —
  the owner's **login** credential. Using it as a public OTA contact
  address is a real, deliberate choice (a login email isn't necessarily
  what an owner wants listed for guest inquiries) — not something to
  assume on their behalf.
- **`phone`: does NOT exist anywhere in NestBook's data model.** No
  `properties.phone`, no `users.phone`, nothing. Checked the full schema —
  genuinely absent.

So "check Settings, they likely exist" turned out false for 2 of the 3 —
same shape of surprise as the timezone gap, just far smaller to fix (two
plain text inputs, no lookup tables or picker UI needed, unlike Facilities).

## Policies — a real separate resource, not a quick field

Channex's "Edit Property → Policies" tab is backed by a genuinely separate
CRUD resource, **Hotel Policy** (`GET/POST/PUT/DELETE /api/v1/hotel_policies`,
linked via `property_id`) — not fields embedded on the property object.
Confirmed scope is broader than the task's guess of "cancellation/deposit
rules": it actually configures check-in/check-out times, max occupancy,
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
  this space) rather than the property. Not chased further per the "just
  report, don't build" scope of this pass.

**Verdict: genuine future slice.** This needs its own resource-lifecycle
build (create-once-then-update, same shape of work as the room-type/rate-
plan resources already built), plus new NestBook-side fields for pet/
smoking/internet policy that don't exist yet — not a today addition.

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

**Verdict: real future slice, larger than Policies.** Flagging per the
task's instruction, not investigating further today.

## Scoped recommendation

| Field | Today (Slice D)? | Why |
|---|---|---|
| `website` | **Yes** | `booking_slug` already exists, zero new NestBook fields, confirmed simple replace/omit/clear behavior |
| `email` | Needs one small decision first | No property-level field exists; either add a genuine new `properties.email` column (simple, mirrors timezone's "add the real field" precedent), or deliberately choose to reuse `users.email` — John's call, not mine to assume |
| `phone` | Needs a new field first | Doesn't exist anywhere in the data model; a plain new `properties.phone` column + Settings input would be a small, self-contained addition (no picker/enum, unlike Facilities) |
| Policies | **No — future slice** | Separate CRUD resource, broader scope than assumed (house rules, not just cancellation), real NestBook-side data gaps (pet/smoking/internet policy) |
| Taxes | **No — future slice, larger** | Multi-resource system for room-rate tax compliance; NestBook's existing tax_rate is a different concept (charges, not room rates) — needs new NestBook data model work first |

**If John wants email/phone done today too**, the fix is small (one or two
plain `properties.email`/`properties.phone` TEXT columns + two Settings
inputs, no lookup tables) — just needs the one product decision above
before touching code.

## Confirmed facts (don't re-check next time)

- `email`/`phone`/`website` are plain top-level property scalars, standard
  replace/omit-preserves/null-clears semantics — same pattern as
  `timezone`/`country`, safe to fold into the existing
  `buildChannexPropertyAttributes()` using the same "omit when empty"
  convention already used there (not description's "always send" special
  case, since these don't need the same clearing guarantee applied yet).
- `properties.booking_slug` → `https://nestbook.io/book/<slug>` is the
  ready-made `website` value.
- No `properties.email`, `properties.phone`, or `users.phone` column
  exists anywhere in the current schema.
- Hotel Policy and Tax Set/Tax are confirmed separate Channex CRUD
  resources (not property attributes) — do not attempt to fold them into
  the existing property-attribute push function whenever they are built.
