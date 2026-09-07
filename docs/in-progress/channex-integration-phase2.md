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

## Next — Slice 2 (not started)

- Add `channex_property_id TEXT` (nullable) to `properties` (additive migration,
  same guarded `ALTER TABLE … catch` pattern as the rest of `schema.js`).
- A script/console entry point that: picks a NestBook property → calls
  `createChannexProperty()` → stores the returned id.
- Decide: one Channex property per NestBook property for `units` mode, or one
  Channex property per unit (research §5 says per-unit for Holiday Rentals —
  revisit when wiring room types).
