# Channex Channel Manager Integration — Phase 1 Research (complete)

## 0. Purpose of this document

This captures everything learned during hands-on research and live sandbox testing of Channex as NestBook's planned real-time channel-manager integration — before any Phase 2 code gets written. Read this first, whenever Phase 2 actually starts, so nothing here gets rediscovered from scratch.

**Status: Phase 1 research is complete.** A full end-to-end test booking (Booking.com sandbox → Channex → live confirmation) has been successfully completed and verified. Phase 2 (actual code integration) has not started.

---

## 1. The business decision

- **What this is**: an optional paid add-on giving NestBook customers real-time, two-way OTA sync (Booking.com, Airbnb, etc.) — an upgrade from the existing always-free iCal sync, which only updates on a schedule (every ~15 minutes for inbound), not instantly.
- **Price to charge customers**: **£9 / €10 per property, per month.**
- **Demand validation**: deliberately skipped — a prior blog-embedded "would you be interested?" widget got very little engagement, but this was judged an unreliable signal (cold blog readers have no relationship with the product, unlike an existing user with real intent). Decision made to proceed on confidence rather than chase a better validation signal.
- **Why Channex over alternatives**: Rentals United (more enterprise/expensive, better suited to scale — reconsider later if NestBook grows much larger), NextPax (direct competitor, similar model, but no published pricing — a "contact us" quote model, which cuts against NestBook's own transparent-pricing values), Su (1,200+ channels — overkill for small independent European properties, which only need 4-5 real channels). SiteMinder/Staah are not real alternatives — they sell direct to hotels with no white-label PMS-partner model.

---

## 2. Channex's own pricing (what NestBook pays)

**WhiteLabel plan**: $130/month base fee, plus:
- **$7 per connected "Hotel"-billing-type property**, OR
- **$0.50 per connected "Vacation Rental"-billing-type unit**

Only properties with an *active* channel connection are billed. No setup fee. Monthly billing, cancel anytime.

**Breakeven math**: $7 ÷ $0.50 = **14 units**. Below 14 units on a per-unit-billed property, the vacation-rental rate costs less than the flat hotel rate; above 14, it costs more, uncapped. This only matters for the one NestBook mode that's genuinely per-unit-billed (see Section 4) — and per a judgment call, NestBook's real Aparthotel/Holiday-Rentals customers are expected to typically have only 4–6 units, comfortably under the 14-unit crossover. **Not yet re-validated against real usage once the feature ships** — worth checking once real customers are on it.

---

## 3. Certification (one-time, NestBook's responsibility — not per-customer)

- NestBook certifies its own integration **once**, against Channex's own sandbox test properties for Booking.com and Airbnb, following their PMS Certification Test Guide.
- Involves a mix of automated checks plus a **live screen-share session** with the Channex team.
- Typical timeline: **2–4 weeks** of developer integration work — not independently re-confirmed for a solo/small-team pace; worth a direct question to Channex support before committing a real timeline.
- **Individual NestBook customers never go through certification themselves** — once NestBook is certified, a customer connecting their own Airbnb/Booking.com account is a simple, self-service UI flow.

---

## 4. `property_type` — the single most important technical finding

When NestBook's code creates a property inside Channex via the API, it must set a `property_type` field. **This single field silently determines Channex's own internal "Billing Type" (Hotel-flat vs Vacation-Rental-per-unit) — confirmed by live testing, not just documentation.**

### Verified mapping (tested live in Channex's sandbox UI, not guessed):

| Channex `property_type` | Billing Type | Verified? |
|---|---|---|
| Hotel | Hotel (flat $7) | ✅ tested |
| Guest House | Hotel (flat $7) | ✅ tested |
| Inn | Hotel (flat $7) | ✅ tested |
| **ApartHotel** | **Hotel (flat $7)** | ✅ tested — surprising, favourable |
| **Camping** | **Hotel (flat $7)** | ✅ tested — surprising, favourable |
| Apartment | Vacation Rental ($0.50/unit) | ✅ tested |
| Villa | Vacation Rental ($0.50/unit) | ✅ tested |

The full dropdown also includes: Boat, Capsule Hotel, Chalet, Country house, Farm stay, Holiday Home, Holiday Park, Homestay, Hostel, Lodge, Motel, Resort, Riad, Ryokan, Tent, and more — not all individually tested, but the pattern strongly suggests only two real billing buckets exist overall (Hotel-style vs Vacation-Rental-style), regardless of how granular the label is.

### Final mode-to-`property_type` mapping for NestBook's six modes:

| NestBook mode | Channex `property_type` | Channex billing |
|---|---|---|
| IR-Named / IR-Categories | Guest House or Inn | Flat $7/property |
| WP (Whole Property) | Villa (or closest specific match) | $0.50 × 1 unit (always exactly 1) |
| SC-Aparthotel | **ApartHotel** | **Flat $7** — not per-unit, regardless of unit count |
| SC-Glamping | **Camping** | **Flat $7** — not per-unit, regardless of pod count |
| SC-Holiday Rentals | Apartment | $0.50 × real unit count — **the only mode genuinely exposed to per-unit cost at scale** |

**Open question, not yet asked of Channex support**: can ApartHotel/Camping legitimately be used for what is technically unstaffed self-catering, purely to get flat billing rather than per-unit? Worth confirming directly before relying on this in production, even though nothing in Channex's own docs suggests it's against their terms.

---

## 5. Property size limits (Channex's own constraints, not NestBook's)

- **Hotel-type**: max 20 room types, max 200 rate plans per property.
- **Vacation-Rental-type**: max 50 room types, max 10 rate plans *per room type*.
- Both cap occupancy-based pricing at 18 people.
- Small overage fees exist if exceeded ($1/extra room type up to $7/property max; $0.05/extra rate plan) — Channex will also manually raise limits case-by-case on request.
- **Channex's own explicit best-practice advice**: for a multi-unit self-catering property, register **each individual unit as its own separate Channex property** (each with 1 room type), not one Channex property with many room types. Their own example: 100 apartments = 100 Channex properties, not 1 property with 100 room types, since each unit has its own address/identity for OTA purposes. This maps cleanly onto NestBook's existing Self-Catering unit-based data model.

---

## 6. Content sync — confirmed real, not just ARI

Channex's Properties Collection API includes a genuine `content` object: description, important information, and **photos** (URL, position, description, author, and type — cover/ad/menu). A separate Facilities collection handles amenities. A dedicated Photo API includes built-in resizing to fit different OTA requirements. This is not a bare availability/rate/restriction pipe — full listing content genuinely flows through it.

---

## 7. Channel coverage

Marketing pages quote inconsistent totals (50+, 60, 68+, 400+ depending on the page) — not a reliable number to use externally. What actually matters: **Booking.com, Airbnb, Expedia, Vrbo, and major European regional OTAs are confirmed production-capable** via the certification documentation — which covers effectively all of where a small independent European property gets real bookings. Channel *count* is not a meaningful marketing angle for NestBook's actual customer base; channel *relevance* is.

---

## 8. Per-customer onboarding — real friction points

- **Booking.com's connection step requires 2FA sent to the property owner's own phone.** This cannot be done on the owner's behalf — they must be present, in real time, to enter the code themselves during setup. This means "Connect to Booking.com" cannot be a fully silent/background process the way Stripe Connect mostly is.
- **If a customer already has another channel manager or PMS connected to their Airbnb account, they must manually disconnect it first** before Channex can take over that connection. Switching to NestBook+Channex from an existing channel-manager setup is not seamless — it requires the owner to actively unplug their old integration.
- Beyond those two friction points, the actual connection UI is genuinely self-service: choose the property, fill in channel-specific settings (min/max stay, checkin days, etc.), connect.

---

## 9. Webhooks and the staging-server gap

- NestBook's own staging server was decommissioned some sessions ago; **Local Dev is localhost-only and unreachable from Channex's servers.**
- Real webhook testing (Channex → NestBook, for incoming bookings) requires a genuinely public HTTPS endpoint. **This needs solving before Phase 2's webhook-receiving code can be properly tested** — likely either a subdomain on the live Hetzner production server, or a temporary public tunnel during development. Not yet decided which.
- Channex's own webhook event list includes booking events plus newer additions like `channel_removal_warning` and `property_removal_warning` (added August 2026 per their changelog) — worth reviewing the full current event list directly in Channex's docs when Phase 2 begins, since this list evidently still evolves.

---

## 10. Full end-to-end sandbox test — completed and verified

A complete real test was run, live, start to finish:

1. Created a real Channex sandbox property ("NestBook Test Property," Christchurch GB, `property_type: Hotel`).
2. Added two room types (The Bay View, Garden View) with occupancy, descriptions, facilities, and real photos.
3. Set real rates (£95, £55) and real availability (not the default 0) across a two-week date range.
4. Connected a Booking.com channel using one of Channex's shared sandbox test Hotel IDs.
5. Mapped at least one room + rate pairing (partial mapping is sufficient to activate — full mapping is not required for testing).
6. Activated the channel (a separate manual step from saving — found under the channel list's row-level **Actions → Activate**, not a toggle inside the Edit panel itself).
7. Used Channex's own published direct booking-simulation link (`https://secure.booking.com/book.html?hotel_id=<ID>&test=1`) to reach an isolated Booking.com sandbox interface.
8. Completed a real fake booking using their standard test card (**Visa, 4111-1111-1111-1111, CVC 123, any future expiry**).
9. **The booking appeared in Channex's Live Feed within seconds** — guest name, room, nights, and price all correct — proving the full chain (OTA → Channex → visible to NestBook) genuinely works end to end.

### Gotchas discovered during testing (save future confusion):

- **Channex's shared sandbox test Hotel IDs are temporarily locked to whoever's currently using them** (an amber warning + "in use until [time]"; a green checkmark means currently free). These IDs shuffle between developers — expect to occasionally need to switch which one you're using.
- **One specific test ID, "Test Hotel - OTA Pay" (was 12152494 at time of testing), requires a REAL credit card**, unlike all the other standard fake-card test hotels. Avoid it for routine testing — use one of the plain GBP/USD/JPY test hotels instead (e.g. 5868189, 6519420 were both confirmed working with the standard fake-card flow at time of testing).
- **A channel will not activate with rooms mapped but rates unmapped** — Channex explicitly requires both room AND rate mapping before allowing activation.
- **Rate plans must be created in the same currency as the target test property** or Channex won't allow mapping (e.g. a GBP test hotel needs GBP-denominated NestBook-side rates).
- Some test IDs can temporarily show "Bookings not possible currently for this ID" — this is a live sandbox-availability state on Channex's side, not a NestBook or setup error.
- A booking can land with a **"BOOKING UNMAPPED RATE"** warning in the Live Feed if the exact incoming rate/occupancy doesn't precisely match what was mapped — harmless in testing (expected when only a partial/fast mapping was done), but worth understanding fully before Phase 2, since a real customer's booking landing in this state needs a defined handling behaviour.

---

## 11. What Phase 2 actually needs to build (unchanged in shape, now informed by the above)

1. **One NestBook-side Channex WhiteLabel master account** (same pattern as the Stripe Connect platform account).
2. **Auto-create a Channex property whenever a customer enables this add-on**, using the verified mode → `property_type` mapping table (Section 4) — this is the single most important piece of business logic from this whole research phase.
3. **Push updates to Channex** whenever room/rate/availability changes in NestBook.
4. **Receive bookings back via webhook** — blocked on solving the public-HTTPS-endpoint gap (Section 9) before this can be properly built and tested.
5. **Map incoming Channex bookings into NestBook's existing booking-creation logic** — including a defined behaviour for the "unmapped rate" case found in testing.
6. **Customer-facing connection flow** — must account for the Booking.com 2FA-to-owner's-phone requirement (Section 8); cannot be a fully silent background process.

Separate, later phases (unchanged): **Phase 3** — billing (new Stripe price ID, `has_channel_sync_addon` flag, Settings gating). **Phase 4** — the actual customer-facing Settings UI, sitting alongside the existing free iCal option.

---

## 12. Answers from Channex support (received, confirmed — no longer open questions)

Emailed support@channex.io directly ahead of Phase 2; full reply below, folded into the record.

### On `property_type` / billing (Section 4's open question — now answered)

Channex confirmed: **the property_type choice should follow how NestBook actually structures and pushes inventory, not just which label sounds closest.** Their own framing: "If a site is one inventory calendar with several bookable units as room types under that property (glamping site, small aparthotel), hotel-family types — including ApartHotel/Camping when that matches the model — are fine... Use Apartment when each unit should bill as its own VR unit. Keep it consistent with how you actually push ARI (one property + room types vs many properties)."

**This confirms the Section 4 mapping is legitimate and intentional, not a loophole** — NestBook genuinely does model a glamping site or aparthotel as one property with multiple room-type units, which is exactly the "hotel-family" shape Channex describes. No change needed to the mapping table in Section 4; it's now confirmed correct by Channex directly, not just inferred from testing.

One nuance worth remembering for Phase 2's actual build: this is explicitly framed as "keep it consistent with how you push ARI" — meaning if NestBook's data model or push pattern for a mode ever changed shape (e.g. started pushing SC-Holiday-Rentals units as one property with many room types instead of many properties), the correct property_type would need to be reconsidered alongside it. The mapping isn't a fixed label lookup independent of the actual integration architecture.

### On certification timeline (Section 3's open question — now answered)

"Lead time is mostly your build pace, not ours. Fast movers often land in a couple of weeks once the integration is solid — treat that as an impression, not a promise." The certification path itself is fully public and documented: **14 items across 5 stages** (https://docs.channex.io/api-v.1-documentation/pms-certification-tests). Confirmed: **staging remains free to use until certification passes; there's no production subscription commitment before then** — meaning further sandbox development work between now and actual certification costs nothing.

### On webhooks (Section 9's open question — now answered, and one new architectural decision surfaced)

The publicly documented webhook list is confirmed complete — nothing undocumented exists (https://docs.channex.io/api-v.1-documentation/webhook-collection). Full event set: `ari`, `booking` / `booking_new` / `booking_modification` / `booking_cancellation`, unmapped room/rate warnings, `non_acked_booking`, `message`, `sync_error` / `sync_warning` / `rate_error`, `review` / `updated_review`, Airbnb-specific Live Feed events (`reservation_request`, `alteration_request`, `accepted_reservation`, `declined_reservation`, `inquiry`), and channel lifecycle events (`new_channel`, `updated_channel`, activate/deactivate/disconnect, removal warnings).

**Two new, important architectural findings for Phase 2, not previously known:**

1. **For a multi-property account (which NestBook is, at the platform level), Channex recommends a single global webhook** (`property_id: null`, `is_global: true`) rather than registering one webhook per property. This is a real design decision for Phase 2's webhook-receiving endpoint — it should be built to handle events for any/all NestBook properties through one registered endpoint, not a per-property webhook setup.
2. **Webhook delivery order is not guaranteed, and payloads are not cryptographically signed** — authentication is a shared-secret header over HTTPS, not signature verification like Stripe's webhooks use. Two consequences for Phase 2's build: (a) the receiving code must treat every webhook as a prompt to **pull current state from Channex's API**, never trust the webhook body as the authoritative final truth or assume events arrive in the order they happened; (b) the shared-secret header must be validated on every incoming request, and this is a meaningfully weaker security model than signature-based verification — worth handling carefully (e.g. a long random secret, HTTPS-only, no logging of the raw secret).

---

## 13. Remaining open items before Phase 2 can fully start

- [x] ~~Ask Channex support directly: is using ApartHotel/Camping `property_type` for genuinely unstaffed self-catering properties acceptable?~~ — **Answered, confirmed legitimate (Section 12).**
- [x] ~~Confirm realistic certification timeline.~~ — **Answered: build-pace-dependent, "a couple of weeks" once integration is solid, staging free until passing (Section 12).**
- [x] ~~Confirm current full list of Channex webhook events.~~ — **Answered: public docs are complete and authoritative (Section 12).**
- [ ] Decide and implement a public HTTPS endpoint solution for webhook development/testing (staging replacement) — still open.
- [ ] Design the webhook-receiving endpoint around the two new findings above: single global webhook registration, and "pull current state" handling rather than trusting webhook payload order/content.
- [ ] Re-validate the "customers will have ≤14 units" assumption against real usage once the feature is live, given it underpins the flat single-price decision.
