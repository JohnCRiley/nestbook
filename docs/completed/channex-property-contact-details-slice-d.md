# Channel Manager parity — Slice D: property contact details — SHIPPED

**Shipped 2026-09-15.** Pushes `website`, `email`, `phone` to Channex at
the property level. Fourth slice of the property-parity project (A =
photos, B = descriptions, C = facilities — deferred, needs a NestBook UI
change first).

Built directly from the prior investigation
(`docs/in-progress/channex-property-fields-investigation.md`, now folded
into this doc — no separate follow-up needed) — no new behavior surprises
this time; the investigation's live tests already confirmed the shape.

## What was built

- **Schema**: `properties.email TEXT`, `properties.phone TEXT`, both
  nullable, guarded `ALTER TABLE`. **Deliberately never defaulted from
  `users.email`** (the owner's login credential) — blank until the owner
  explicitly sets them in Settings.
- **Settings UI**: "Contact Email" / "Contact Phone" fields in Property
  Details, right after Timezone. Both carry an explicit hint distinguishing
  them from the account login email (e.g. "not your account login email")
  — the exact confusion the task asked to guard against in the copy itself,
  not just in code. Full 5-language i18n.
- **`createChannexProperty.js`**: `buildChannexPropertyAttributes()` now
  also sets:
  - `email` / `phone` — **always included, even as `null`**, matching
    description's Slice B pattern (confirmed via the investigation's live
    test: omitting these on an update leaves the old value in place rather
    than clearing it — an owner clearing a previously-set contact detail
    must actually clear it on Channex, not leave stale contact info live).
  - `website` — derived from `properties.booking_slug` +
    `process.env.APP_URL ?? 'https://nestbook.io'` (the same base-URL
    fallback already used everywhere else in this codebase, including
    already once in the Channex integration itself). Uses the simpler
    **omit-when-empty** convention (matching `address`/`city`/`country`/
    `timezone`), not description's "always send" exception — there's no
    legitimate "clear the website" case since every property always has a
    `booking_slug` and an owner never edits this value directly.
- **`properties.js`**: `email`/`phone` added to the PUT route's
  destructure, UPDATE statement, and diff-based trigger — reusing the
  exact `schedulePropertyDetailsPush()` debounce already built in Slice B
  for description edits (same debounce key, so saving description and
  contact details in one request still collapses into a single outbound
  Channex call). No new trigger mechanism needed — email/phone are
  property-only fields with no room-type equivalent, so unlike Slice B's
  description trigger, this never also fires a Whole-Property room-type
  reconcile.

## Verified (2026-09-15, real Channex staging — not just local reasoning)

- Confirmed the attribute builder directly: a property with blank email/
  phone/booking_slug=`'local-dev'` produces `email: null, phone: null,
  website: "http://.../book/local-dev"` — no `users.email` leak.
- **Set** via the real `PUT /api/properties/1` route → debounced push
  fired → independently confirmed via a fresh `GET
  /api/v1/properties/:id` that email, phone, **and** website all landed
  correctly on Channex.
- **Edited** to different values → confirmed clean replace (not
  accumulation) via a second fresh GET.
- **Cleared** back to `null` → confirmed actually cleared on Channex via a
  third fresh GET — and confirmed `website` stayed correctly set throughout
  (unaffected by the email/phone clear, since it's independently derived
  and always resent).
- **Unconnected property**: 2ms, zero network calls.
- **No regression**: re-ran the existing `pushAvailabilityUpdate`/
  `pushRateUpdate` against the same connected property — both returned
  real Channex task ids. Re-checked the room-type's own `content`
  (description/photos, Slices A/B) — untouched by the property-level
  changes, confirming Slice D's property-only scope didn't bleed into
  room-type pushes.
- `cd client && npm run build` clean both before and after the i18n
  additions. `node --check` clean on every touched server file.
- All test data (email/phone) cleared back to `null` on both Channex and
  the local DB afterward — `website` intentionally left showing the real
  booking-page URL, since that's its correct steady state, not test
  residue.

## Deliberately out of scope (per the task / investigation)

- No UI input for `website` — it's fully derived, never owner-edited.
- No reuse of `users.email` as a fallback/default — a real product
  decision was explicitly declined in favor of leaving it blank until the
  owner opts in.
- Policies and Taxes remain filed as genuine future slices (see the
  investigation doc) — not touched here.
