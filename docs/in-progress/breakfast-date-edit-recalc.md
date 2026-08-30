# Fix: recalculate breakfast on date edits instead of silently dropping it

Status: **built + verified, committed to `main`**. 2026-08-30 (John).
Delete once John has eyeballed it on real data.
Follow-on from the date-edit / breakfast audit earlier this session.

## The bug

`PUT /api/bookings/:id` (`server/routes/bookings.js` ~1139-1156) recomputes
`total_price` from `calcSeasonalBreakdown` (room rate only) whenever the dates
change. Any breakfast component that was baked into `total_price` (owner-created
bookings via `NewBookingModal` store `roomSubtotal + bfSubtotal`) is silently
dropped. John's principle: breakfast must be **recalculated against the new
mornings**, never carried forward stale, never silently dropped.

## Confirmed facts (already verified — do not re-check)

- Date-edit block: `bookings.js` ~1139-1156. `calcSeasonalBreakdown`
  (`server/utils/ratePeriods.js`) is room-rate-only, zero breakfast awareness.
- **No** server-side "count breakfast mornings" function exists. The formula
  `Math.max(1, nightsBetween(breakfast_start_date || check_in_date, check_out_date))`
  is duplicated inline in **5 client sites**:
  - `client/src/pages/bookings/CheckoutModal.jsx` (~55, `bfDays`)
  - `client/src/pages/bookings/BookingPanel.jsx` ~343 (`rpBfDays`, checkout-print `d` builder)
  - `client/src/pages/bookings/BookingPanel.jsx` ~1388 (`rpBfDays`, `<PrintReceipt>` render)
  - `client/src/pages/bookings/BookingPanel.jsx` ~1999 (`bfDays`, `EstimatedTotal`)
  - `client/src/pages/Dashboard.jsx` ~1186 (`bfDays`, `calcDue`)
- `breakfast_start_date` is stored as **the night BEFORE the first breakfast
  morning** (`BookingPanel.jsx` ~1784 comment). So
  `nightsBetween(breakfast_start_date, check_out_date)` = mornings inclusive of
  the checkout morning. It's almost always == `check_in_date` (only mid-stay
  breakfast differs).
- `breakfast_price_per_person / breakfast_start_date / breakfast_guests /
  breakfast_added` all round-trip UNCHANGED on a date edit today — which is how
  `breakfast_start_date` can end up after a shrunk stay's checkout.
- Audit for a date edit today = bare `BOOKING_EDITED`, no `detail` string,
  before/after only `{status}` (and before/after aren't rendered in any UI —
  only `detail` is, `ActivityLog.jsx` / `admin/pages/AuditLog.jsx`).
- `nightsBetween` is client-only (`client/src/utils/format.js`). No server util
  dir has a date-diff helper; `ratePeriods.js` / `widget.js` do inline
  `Math.round((new Date(a) - new Date(b)) / 86400000)`.

## Design

### Part 1 — shared `countBreakfastMornings`

```
countBreakfastMornings(breakfastStartDate, checkInDate, checkOutDate):
  start = breakfastStartDate || checkInDate
  effectiveStart = max(start, checkInDate)          // clamp corruption
  if effectiveStart >= checkOutDate: return 0        // NOT floored to 1
  return nightsBetween(effectiveStart, checkOutDate)
```

- `client/src/utils/breakfast.js` — add it, import `nightsBetween` from `./format.js`.
- `server/utils/breakfast.js` — NEW file, mirror copy with inline UTC date diff
  (kept in sync by comment — matches the codebase's per-file-duplication norm).
- 5 client sites → drop the inline `bfStart` line, call `countBreakfastMornings(
  b.breakfast_start_date, b.check_in_date, b.check_out_date)`.
- **Invisible for normal bookings**: for any booking where
  `nightsBetween(breakfast_start_date || check_in_date, check_out_date) >= 1`
  (i.e. breakfast starts within the stay) the two formulas are identical. They
  diverge only when the inner is <= 0 — an already-broken/shrunk booking — where
  old gave 1 and new gives 0. That IS the fix.

### Part 2 — wire into the date-edit path

In the `datesChanged` block, after `computedTotal`:
- `isPaidBreakfast = !isWPProp && existing.breakfast_added && (parseFloat(existing.breakfast_price_per_person) || 0) > 0`
  (complimentary / property-included breakfast is already €0 either way; WP
  breakfast is inert and gated off everywhere client-side, so skip it too).
- `bfGuests = existing.breakfast_start_date ? (existing.breakfast_guests||1) : (existing.num_guests||1)` (mirrors the client).
- `bfSubtotal = countBreakfastMornings(existing.breakfast_start_date, newCheckIn, newCheckOut) * bfGuests * bfPrice`
- `finalTotalPrice = round2(computedTotal + bfSubtotal)`.
- Do NOT touch `breakfast_start_date / breakfast_guests / breakfast_added /
  breakfast_price_per_person`. Only `total_price` reflects it.

### Part 3 — audit `detail`

Enrich the existing `BOOKING_EDITED` entry (no new action type) when
`auditAction === 'BOOKING_EDITED' && datesChanged`:

`Dates <oldCI> → <oldCO> changed to <newCI> → <newCO> · breakfast <b> → <a> mornings · total <sym><old> → <sym><new>`

- Breakfast segment only when paid breakfast AND mornings changed.
- Dates raw ISO (matches `BOOKING_CREATED`'s `detail`). `sym` from a small
  `CURRENCY_SYMBOLS` map (matches `bookingPage.js:48`).

## Files touched

- `client/src/utils/breakfast.js` — add `countBreakfastMornings` + `nightsBetween` import
- `server/utils/breakfast.js` — NEW
- `client/src/pages/bookings/CheckoutModal.jsx` — import + site 1
- `client/src/pages/bookings/BookingPanel.jsx` — import + sites 2/3/4
- `client/src/pages/Dashboard.jsx` — import + site 5
- `server/routes/bookings.js` — import, `CURRENCY_SYMBOLS`, Part 2 recalc, Part 3 detail

## Known / out of scope (flag, don't fix here)

- **`calcDue` (Dashboard) trusts `b.total_price` as room-only and adds `bfSub`
  on top.** `total_price` has two conventions: room-only (widget — its Stripe
  flow REQUIRES this, it adds breakfast as a separate line item) vs
  room+breakfast (`NewBookingModal`, and now date-edited bookings after Part 2).
  Net: `calcDue`'s "Total Due" glance-estimate over-counts breakfast for
  owner-created paid-breakfast bookings **today already**, and Part 2 extends
  that to date-edited paid-breakfast bookings. The other 4 sites recompute the
  room subtotal independently (from `rate_breakdown` / `price_per_night`) so
  they're unaffected. Proper fix (separate): make `calcDue` recompute room like
  the others, or normalise `total_price` semantics. NOT touched here — reworking
  `calcDue`'s room source risks regressions on imported / manually-priced bookings.
- The BookingPanel "breakfast strip" (~648-652) is a display summary using raw
  `nightsBetween` (no floor); left as-is (not a billed amount, not in the 5).
- Widget `pending_payment` recovery checkout (`widget.js:992,1003`) reads
  `booking.total_price` then adds a breakfast Stripe line; a `pending_payment`
  widget booking that's date-edited then paid via the recovery link would
  double-charge breakfast. Extremely narrow (pending_payment bookings shouldn't
  be date-edited); flag only.

## Verification (done — 2026-08-30, local stack, throwaway account, deleted after)

Fixture: IR property, room €100/night, `breakfast_price` €8, paid breakfast
`breakfast_price_per_person` €8.50, 2 guests. Edits driven via the real
`PUT /api/bookings/:id`.

| Scenario | Result |
|---|---|
| **Extend** paid-bf 10→13 Sep → 10→15 Sep | room €500 + bf (2×**5**×8.50=€85) → **total €585** (was €351). bf fields untouched. ✅ |
| **Shorten** paid-bf 20→24 Sep → 20→22 Sep | room €200 + bf (2×**2**×8.50=€34) → **total €234** (was €468). ✅ |
| **Severe shorten** — mid-stay bf, `breakfast_start_date` 05 Sep, 01→08 Sep → 01→**04** Sep | `countBreakfastMornings` → **0** (start now ≥ checkout). bf subtotal €0 → **total €300** (room only). `breakfast_added=1`, `breakfast_start_date=2026-09-05`, `breakfast_guests=2`, `breakfast_price_per_person=8.5` **all unchanged, not wiped**. ✅ |
| **Complimentary** (`breakfast_price_per_person=0`), date edit | `isPaidBreakfast` false → **total = room only**, bf fields untouched. ✅ |
| **Property-included** (`properties.breakfast_included=1`), date edit | `breakfast_added=0` → **total = room only**. ✅ |
| **No breakfast**, date edit | **total = room only**. ✅ |
| Guest email | `sendStayExtended/ShortenedEmail(..., finalTotalPrice, ...)` — the 4th arg is `newTotal` and the template renders exactly that; `finalTotalPrice` = the verified breakfast-inclusive stored total (585 / 234). Resend not configured locally so HTML not rendered, but the value the email receives is confirmed. ✅ |
| Audit `detail` | `Dates 2026-09-20 → 2026-09-24 changed to 2026-09-20 → 2026-09-22 · breakfast 4 → 2 mornings · total €468.00 → €234.00` — breakfast segment present for paid+changed (incl. `3 → 0 mornings` for the severe case), **omitted** for complimentary / no-breakfast edits. ✅ |
| **Refactor invisible for normal bookings** | Synthetic sweep of 350 `(check-in, nights, breakfast_start_date)` combos: old `Math.max(1, nightsBetween(…))` vs new `countBreakfastMornings` differ in **105 cases — every one a degenerate `effectiveStart >= checkout` case** (already-broken booking); **0 diffs** in the 245 normal cases. Browser: a fresh never-edited mid-stay-breakfast booking (01→08 Oct, start 03 Oct) shows "5 mornings" / €127.50 in both `EstimatedTotal` and the strip — identical to old. ✅ |
| **Client ⇄ server agree** | Each edited booking's `EstimatedTotal` (client `countBreakfastMornings`) shows a breakfast line + total that exactly matches the server-stored `total_price` (585 / 234 / 300 / 500). ✅ |
| `npm run build --workspace=client` + `node --check` | clean. ✅ |

### Confirmed live: the `calcDue` double-count (flagged above, NOT fixed here)

Dashboard "Today's Departures" showed **"Total Due: €268"** for a shortened
paid-breakfast booking whose real total is €234 (room €200 + bf €34) —
`calcDue` = `total_price(234) + bfSub(34)`. This is the pre-existing
`b.total_price`-is-room-only assumption; Part 2 extends the set of affected
bookings from "owner-created paid-breakfast" to "+ date-edited paid-breakfast".
The other 4 sites recompute the room subtotal independently and are correct.
Recommended follow-up: make `calcDue` recompute room from `rate_breakdown` /
`price_per_night` (with the same imported-booking / manual-override guard
`EstimatedTotal` uses), or normalise `total_price` semantics.
