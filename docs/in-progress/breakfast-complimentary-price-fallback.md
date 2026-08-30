# Fix: complimentary breakfast (price 0) falling back to the property default price

Status: **built + verified, committed to `main`**. 2026-08-30 (John).
Delete once John has eyeballed it on real data.

Follow-on from the breakfast audit earlier this session.

## Problem

`bookings.breakfast_price_per_person` is `0` when an owner explicitly marks a
booking's breakfast **complimentary** (a real decision). Several display / total
calcs used `parseFloat(b.breakfast_price_per_person) || parseFloat(property?.breakfast_price) || 0`
— and `0` is falsy, so the `||` substituted the property's default **paid**
price, silently charging for a breakfast the owner gave away.

## Fix

Explicit "is a value recorded?" check instead of falsy-OR:
```js
const price = b.breakfast_price_per_person != null
  ? parseFloat(b.breakfast_price_per_person) || 0   // 0 stays 0; the `|| 0` only catches NaN, never the property price
  : parseFloat(property?.breakfast_price) || 0;      // genuinely unset → sensible default
```
`bookings.breakfast_price_per_person` has schema `DEFAULT 0` (never NULL from the
DB), so the fallback branch is effectively dead for real rows — it stays only as
defensive handling for partial objects. The point is that **explicit 0 is now
always honoured**.

## Files changed

| File | Line (post-edit) | What |
|---|---|---|
| `client/src/pages/bookings/CheckoutModal.jsx` | ~51 | `bfPricePerPerson` — drives checkout breakfast line + total, and the `bfPricePerPerson`/`breakfastSubtotal` props passed to `<PrintReceipt>` |
| `client/src/pages/Dashboard.jsx` | ~1182 | `calcDue()` `bfPrice` — was **ignoring** `b.breakfast_price_per_person` entirely (only read `property.breakfast_price`); now honours the booking value. Feeds the "amount due" figure on Dashboard arrivals/departures rows and the Rooms-page room card. |
| `client/src/pages/bookings/BookingPanel.jsx` | ~339 | `rpBfPrice` in the **checkout-and-print** receipt-data builder (`ViewMode`). Also dropped a bogus `parseFloat(property?.breakfast_price_per_person)` term (no such property column). |
| `client/src/pages/bookings/BookingPanel.jsx` | ~1384 | `rpBfPrice` feeding the `<PrintReceipt>` render in the panel |
| `client/src/pages/bookings/BookingPanel.jsx` | ~1987 | `bfPrice` in `EstimatedTotal` |
| `client/src/pages/bookings/BookingPanel.jsx` | ~1857 | **[beyond the literal list]** `AddBreakfastSection` "Modify" button now pre-fills the price field from the booking's own recorded value (0 included) instead of the property default, so editing the date/guests of a complimentary breakfast and hitting Save no longer converts it to charged. |

`PrintReceipt.jsx` itself has **no** fallback to fix — it receives already-computed
`bfPricePerPerson` / `breakfastSubtotal` props; fixing the two callers
(CheckoutModal, BookingPanel) covers it.

## Left as-is (correct — genuine "no decision yet" pre-fills)

- `NewBookingModal.jsx:745` — seeds the paid-breakfast price field from
  `property.breakfast_price` when the owner first ticks "paid breakfast".
- `BookingPanel.jsx:~1801` (`AddBreakfastSection` `useState`) — initial price for
  adding *new* breakfast to a booking that has none.
- Server `widget.js:721` / `:1003` — `if (breakfast_added && breakfast_price_per_person && breakfast_guests)` guards the Stripe line item; a 0 price correctly produces **no** charge line. Not a bug.
- Server write paths use `?? 0` — already preserve explicit 0.

## Verification (done — 2026-08-30, local stack, throwaway account, deleted after)

Fixture: IR-Named property, `breakfast_price = 8`. Three bookings on one room:
- **A** `breakfast_added=1, breakfast_price_per_person=0` (complimentary)
- **B** `breakfast_added=1, breakfast_price_per_person=6.5` (paid, ≠ default)
- **C** `breakfast_added=0` (no decision)

Results:
- **A** — BookingPanel "Estimated Total Due": `Breakfast (2 × 1 × €0.00) → €0`,
  Total Due €100 (was €116). CheckoutModal: `Breakfast (2 × 1 × €0.00) → €0`,
  Total €100. PrintReceipt preview + **Reprint Receipt** (checked A out): `Breakfast
  (2 × 1 × €0.00) → €0.00`, Total Paid €100.00. Dashboard "Today's Departures"
  row: **Total Due: €300** (was €316 with the €8 fallback). ✅
- **B** — Estimated Total Due: `Breakfast (2 × 3 × €6.50) → €39`, Total €339 —
  the booking's own price, not the €8 default. ✅
- **C** — no breakfast line anywhere; "Add breakfast" form still pre-fills the
  €8 property default as a starting suggestion. ✅
- **Modify** on A's breakfast → price field shows **0**, not 8 → saving
  unchanged keeps it complimentary. ✅
- `npm run build --workspace=client` clean. Confirmed/arriving/other statuses
  and positive-price bookings unaffected.
