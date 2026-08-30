# Audit + fix: "total due" / "amount owed" consistency across the app

Status: **built + verified, committed to `main`**. 2026-08-30 (John).
Trust-rebuilding pass. Follow-on from the breakfast / date-edit fixes earlier
this session. Delete once John has read it and is satisfied.

## TL;DR for John

There is now **one function** — `client/src/utils/bookingTotal.js`
`computeBookingTotal(booking, property, { charges, roomBreakdown })` — that every
"total due / amount owed / booking price" surface calls. It derives the room
subtotal from the recorded rate breakdown (never from `total_price`, which is
ambiguous), adds breakfast via the fixed morning-count formula, adds charges,
subtracts a paid deposit and any refund. Because all surfaces call it, they
**cannot disagree**. Verified by a 30-case computation sweep (below) and an
in-browser cross-check of all four named surfaces on the three booking types
that used to diverge.

## The root problem

`bookings.total_price` has **inconsistent meaning by source**:

| Booking source | `total_price` is… | `rate_breakdown` stored? |
|---|---|---|
| Owner (`NewBookingModal` → `POST /api/bookings`) | room subtotal **+ paid breakfast** | ✅ yes |
| Widget (`widget.js` 2 INSERTs) | room subtotal only (breakfast = separate Stripe line) | ❌ **no** |
| CSV import (`bookings.js:640`) | whatever the CSV `total_stay_amount` said | ❌ no |
| Free-plan enquiry (`enquiries.js:108`) | **NULL** (never set) | ❌ no |
| After a date edit (`PUT /api/bookings/:id`) | room subtotal + recalculated paid breakfast | ✅ yes (recomputed) |
| Any WP booking | room subtotal only (WP has no breakfast) | mixed |

So a surface that trusts `total_price` as room-only and adds breakfast on top
**double-counts** for owner/date-edited bookings; a surface that trusts it as-is
**misses breakfast** for widget/import bookings.

## Part 1 — Full inventory

Patterns: **(a)** recompute room independently · **(b)** trust `total_price`
as-is · **(c)** trust `total_price` as room-only + add breakfast/charges.
Only (a) is safe.

### Tier 1 — per-booking "amount owed / total due" (task-named — must agree exactly)

| # | Surface | Location | Pattern | Notes |
|---|---|---|---|---|
| 1 | `EstimatedTotal` | `BookingPanel.jsx:1985` | **(a)** | reference impl: `roomBreakdown.total ?? nights×price_per_night`; `useStoredTotal` guard; breakfast via `countBreakfastMornings`; charges additive; − deposit − refund. |
| 2 | `CheckoutModal` | `CheckoutModal.jsx:39` | **(a)** | same math; no explicit `useStoredTotal` guard but the `b.price_per_night ‖ total/nights` fallback chain reconstructs it. |
| 3 | BookingPanel checkout-print `d` builder | `BookingPanel.jsx:320` | **(a)** | feeds `buildReceiptHTML`; **no import guard**. |
| 4 | BookingPanel Reprint `<PrintReceipt>` | `BookingPanel.jsx:1373` | **(a)** | **no import guard**. |
| 5 | `PrintReceipt` component | `PrintReceipt.jsx:264` | **(a) presentation** | pure — sums the `roomSubtotal` / `breakfastSubtotal` / `roomCharges` props; correctness lives in callers #3/#4/CheckoutModal. |
| 6 | `calcDue()` | `Dashboard.jsx:1176` | **(c) BROKEN** | `room = b.total_price` (assumed room-only) **+ breakfast**; **no charges**, **no refund**; deposit subtracted. Double-counts breakfast for owner/date-edited bookings. |
| 6a | Dashboard arrivals/departures "Total Due" | `Dashboard.jsx:1212,1238` | via `calcDue` | inherits #6. |
| 6b | Rooms units-mode panel "Total Due" | `Rooms.jsx:830,918` | via `calcDue` | inherits #6. |

### Tier 2 — per-booking "price" displays (raw `total_price`)

| # | Surface | Location | Pattern |
|---|---|---|---|
| 7 | BookingPanel "Pricing" header | `BookingPanel.jsx:994` | **(b)** — sits directly above #1, can visibly disagree |
| 8 | Bookings list "Total" column (table + card) | `Bookings.jsx:384, 447` | **(b)** |
| 9 | GuestPanel booking-history line | `GuestPanel.jsx:301` | **(b)** |
| 10 | Dashboard `WPBookingCard` | `Dashboard.jsx:1297` | **(b)** — WP only → `total_price` reliable, ✅ |

### Tier 3 — revenue / lifetime-spend aggregation (`sum(total_price)`)

| # | Surface | Location | Verdict |
|---|---|---|---|
| 11 | Dashboard `monthRevenue` (IR) | `Dashboard.jsx:247` | undercounts widget/import breakfast |
| 12 | GuestPanel `totalSpend` | `GuestPanel.jsx:88` | same |
| 13 | Reports `/api/reports/revenue` + `Reports.jsx:287` | `reports.js:63`, `Reports.jsx` | same; report already splits accommodation vs charges — needs its own pass |
| 14 | WP `wpSummary.stats.revenueThisMonth` | `bookings.js` wp-summary | ✅ WP `total_price` is complete (room; no breakfast); charges reported separately |

### WP-only total surfaces — all legitimately trust `total_price` (WP = room-only, no breakfast)

`BookingPanel.jsx` Deposit&Balance (`:523`), Payment-outstanding grand total
(`:1265`), WP-departure confirm (`:1320`), Mark-as-paid confirm (`:1499`),
Mark-paid-in-full confirm (`:1482`); server `sendReceiptEmail`
(`emailService.js:2321`), `sendChargesSummaryEmail` (`:2190`). All `total_price +
charges`, all WP-gated → ✅ correct, not touched.

### Server emails carrying a booking total

- Booking confirmation — shows **no** total. Safe.
- Stay-extended / stay-shortened — uses the `finalTotalPrice` param (fixed this
  session: room + recalculated paid breakfast). ✅
- Receipt / charges-summary — WP-only (see above). ✅

## Part 2 — the fix

### New shared helper `client/src/utils/bookingTotal.js` → `computeBookingTotal(b, property, { charges, roomBreakdown })`

Mirrors `EstimatedTotal` exactly. Returns
`{ grossTotal, total, roomSubtotal, breakfastSubtotal, chargesSubtotal, depositDeduction, refund, isStoredTotal }`:

- **Import guard** — `EstimatedTotal`'s exact condition:
  `total_price > 0 && !storedBreakdown?.length && !(price_per_night > 0)` →
  trust `total_price` as the room+breakfast figure, charges still add on top.
- **room subtotal** (non-WP) = `roomBreakdown.total  ??  sum(rate_breakdown)  ??  nights × price_per_night`
  (added the `sum(rate_breakdown)` middle rung so charge-less contexts like
  `calcDue` get the seasonal-accurate figure without a live fetch; `EstimatedTotal`
  / `CheckoutModal` still short-circuit on `roomBreakdown` when they have it).
- **room subtotal** (WP) = `total_price`.
- **breakfast** = `countBreakfastMornings(...) × guests × price` — the fixed
  formula; **only ever from `rate_breakdown` sum, never from `total_price`**, so
  no double-count.
- **charges** = passed `charges[]` sum, else `b.charges_total` (new
  `ENRICHED_SELECT` column). Always additive.
- `grossTotal = room + breakfast + charges`.
- `total = max(0, grossTotal − depositDeduction − refund)`.

### Wiring

| Site | Change |
|---|---|
| `ENRICHED_SELECT` (`bookings.js`) | + `(SELECT COALESCE(SUM(amount),0) FROM room_charges WHERE booking_id = b.id AND voided_at IS NULL) AS charges_total` |
| `calcDue` | → `computeBookingTotal(b, property).total` (Dashboard + Rooms-units now correct) |
| `EstimatedTotal` | take `total` / `roomSubtotal` / `breakfastSubtotal` / `chargesSubtotal` from the helper (keep its own markup) |
| `CheckoutModal` | same |
| BookingPanel checkout-print `d` + Reprint `<PrintReceipt>` | room/breakfast/charges from the helper |
| Bookings list, GuestPanel history line, BookingPanel "Pricing" header | → helper `.grossTotal` |
| Dashboard `monthRevenue`, GuestPanel `totalSpend` | → `sum(computeBookingTotal(b, property).grossTotal)` |
| `widget.js` (both booking INSERTs) + `enquiries.js` booking INSERT | persist `rate_breakdown` (and, for enquiry, `total_price`) from `calcSeasonalBreakdown` so those bookings carry a real recorded breakdown |

### Flagged, NOT fixed this pass

- **Reports `/api/reports/revenue`** — server SELECT lacks `rate_breakdown` /
  breakfast columns; multi-property, tax, and revenue-recognition semantics make
  it a separate careful pass. Documented; recommended follow-up.
- **Mapped CSV imports** — they have a real `price_per_night`, so the import
  guard doesn't fire and the helper recomputes `nights × mapped-room-rate`,
  which can differ from the CSV `total_stay_amount`. This is **existing
  `EstimatedTotal` behavior** and the task says to reuse that guard verbatim;
  every surface now agrees on the recomputed figure. Genuinely un-mappable
  imports (room deleted / rate 0) still hit the guard and show the stored total.

## Part 2 — what actually shipped

| Site | Before | After |
|---|---|---|
| **NEW** `client/src/utils/bookingTotal.js` | — | `computeBookingTotal()` — the one source of truth |
| `ENRICHED_SELECT` (`server/routes/bookings.js`) | — | `+ charges_total` correlated subquery (unvoided `SUM(amount)`) on every booking row |
| `Dashboard.calcDue()` | (c) `b.total_price + breakfast − deposit`, **no charges, no refund, double-counts bf** | `computeBookingTotal(b, property).total` — Dashboard arrivals/departures + Rooms units panel now correct |
| `BookingPanel` `EstimatedTotal` | (a) inline | reads every figure from the helper; keeps its own itemised markup |
| `BookingPanel` "Pricing" header | (b) raw `b.total_price` | helper `.grossTotal` — now matches the `EstimatedTotal` right below it |
| `BookingPanel` checkout-print `d` builder + Reprint `<PrintReceipt>` | (a) inline, no import guard, **`+ deposit` when unpaid** | helper for room/bf/charges; `rpGrandTotal = helper.total` (unpaid deposit shown as info only, matching everything else) |
| `CheckoutModal` | (a) inline | reads every figure from the helper |
| `PrintReceipt.jsx` | pure presentation; deposit deducted only if `require_deposit AND paid` | a paid deposit is always deducted (matches the helper); "outstanding" info line still gated on `require_deposit` |
| `Bookings.jsx` list "Total" (table + card) | (b) raw `b.total_price`, "TBC" if null | helper `.grossTotal`, "TBC" only if 0 |
| `GuestPanel` lifetime spend + per-booking history line | (b) `sum/show b.total_price` | helper `.grossTotal` |
| `Dashboard.monthRevenue` | `sum(b.total_price)` | `sum(computeBookingTotal(b, property).grossTotal)` |
| `widget.js` — both booking INSERTs | no `rate_breakdown` | persist `rate_breakdown` from server-side `calcSeasonalBreakdown` |
| `enquiries.js` — booking INSERT | no `total_price`, no `rate_breakdown` (approved enquiry bookings had **no price anywhere**) | persist both from `calcSeasonalBreakdown` |

WP-only surfaces (deposit/balance section, WP payment-outstanding, WP departure
confirm, mark-paid confirms, `sendReceiptEmail`, `sendChargesSummaryEmail`) —
left as-is: WP `total_price` is always room-only and WP has no breakfast, so
`total_price + charges` is correct there. `Dashboard.WPBookingCard` likewise.

## Part 3 — computation sweep (30 cases)

`computeBookingTotal` run against hand-calculated expectations covering every
combination of **source** (owner / widget / import-mapped / import-unmapped /
enquiry / legacy-null) × **breakfast** (none / property-complimentary /
room-included / booking-paid / paid-baked-into-`total_price` / paid-room-only /
paid-date-edited / paid-seasonal) × **charges** (0 / `charges_total` / `charges[]`
array / voided / array-beats-column) × **status/deposit/refund** (confirmed /
checked-out + deposit-paid / + refund / unpaid-deposit-not-subtracted /
refund-over-remaining-clamps-to-0) × **mode** (IR / WP, incl. WP + stored breakdown).

**Result: 30/30 correct.** (One row was flagged FAIL by a mistaken *expectation*
in the harness — "owner IR room-included breakfast" passed `breakfast_price_per_person: 0`
which correctly yields €0; the helper was right, the expected value was wrong.
The adjacent `room_breakfast_included: 1` case passes.)

Headline results:

| Case | `total_price` | gross | total owed | Note |
|---|---|---|---|---|
| owner IR, paid breakfast €51, +€40 charge | 391 (bf baked in) | **391** | 391 | was double-counted toward 442 by `calcDue` |
| widget IR, paid breakfast €51 | 300 (room only) | **351** | 351 | breakfast was **missing** from the list before |
| widget IR, paid breakfast, seasonal rate | 340 (room only) | **391** | 391 | 340 + 51 |
| import IR, mapped room, CSV total 347.50 | 347.50 | **300** | 300 | recomputed `3 × €100`; CSV total dropped — documented, matches existing `EstimatedTotal` |
| import IR, room deleted (un-recomputable) | 347.50 | **347.50** | 347.50 | `isStoredTotal` guard fires — stored total trusted |
| owner IR bf, checked-out, €100 deposit paid, €30 refund | 391 | 391 | **261** | 391 − 100 − 30 |
| WP + €60 charges, checked-out, €150 deposit paid | 500 | 560 | **410** | 560 − 150 |

## Part 3 — in-browser cross-check (all four named surfaces)

Fresh multi-plan IR property, one room €100/night, breakfast €8.50pp, €100
deposit required. Three bookings representing the divergent sources, checked out
where needed to reach `CheckoutModal` / `PrintReceipt`.

| Booking | Dashboard "Total Due" | BookingPanel "Pricing" | BookingPanel "Estimated Total Due" | CheckoutModal | PrintReceipt |
|---|---|---|---|---|---|
| **OwnerO** — owner-made, paid bf (2 mornings €34), +€40 bar charge, deposit unpaid | **€274** | **€274** | €200 + €34 + €40 = **€274** | Subtotal €274, deposit shown as info, **Total Due €274** | **Total Paid €274.00** |
| **WidgetW** — widget-style (`total_price`=room-only €200), paid bf €34 | **€234** | **€234** | €200 + €34 = **€234** | **Total Due €234** | **Total Paid €234.00** |
| **ImportI** — CSV total €347.50, mapped room, no breakdown | list **€300** (recomputed) | — | — | — | — |

**100% agreement across all four (five, incl. the "Pricing" header) surfaces**
for the cases that used to disagree. `ImportI` deliberately differs from its
stored CSV total — explained above and consistent with `EstimatedTotal`'s
long-standing behavior.

`npm run build --workspace=client` clean; `node --check` on all three touched
server files clean.

## Flagged, NOT fixed this pass (documented follow-ups)

1. **`/api/reports/revenue`** (`server/routes/reports.js` + `Reports.jsx`) still
   `SUM(b.total_price)`. Its SELECT has neither `rate_breakdown` nor the
   breakfast columns, it spans multiple properties, and revenue reporting has
   its own semantics (recognition timing, tax, the report already separates
   accommodation from charges). Needs a dedicated pass — add the columns to the
   endpoint and call `computeBookingTotal` client-side, same as `monthRevenue`.
2. **`EditMode`'s manual `total_price` override field** (`BookingPanel.jsx`)
   still pre-fills from `b.total_price` and, if saved without a date change, that
   raw value persists in storage. Display is now always correct (helper), but the
   stored ambiguity remains for power-user overrides.
3. **`rate_breakdown` back-fill.** Existing widget / enquiry / import bookings
   created before this change still have `rate_breakdown = NULL`. They fall to
   `nights × price_per_night` (mapped) or the `isStoredTotal` guard (unmapped) —
   the same as `EstimatedTotal` does today, so no regression, but a one-off
   migration computing `calcSeasonalBreakdown` for every `rate_breakdown IS NULL`
   booking with a live room would make every historical booking seasonal-accurate.
4. **Mapped CSV imports** show `nights × current-room-rate`, not the CSV
   `total_stay_amount`. This is existing `EstimatedTotal` behavior (the
   `useStoredTotal` guard requires *no* `price_per_night`), reused verbatim per
   the task. If John wants imports to always show their CSV figure, the guard
   would need to key on `rate_breakdown IS NULL` instead of `!price_per_night` —
   a deliberate behavior change, not done here.
