# NestBook Help Bot — Master Knowledge File

## 0. How this document works (internal note — not shown to users)

This file is the sole knowledge source for the in-app AI Help Chat. It is read fresh, in full, on every question a user asks — so any edit here is live immediately, with no rebuild or redeploy needed.

**This is different from `help.html`.** `help.html` is the public-facing help centre — polished, general, translated into 5 languages by hand. This file is internal, English-only, and can be as blunt, detailed, and complete as needed. The bot translates its answers into the user's language live, using the app's own existing translated terminology (from `en-translations.json` / the client's `LANGS` object and `help.html`) as its reference for feature names — it should not invent its own translation of a feature name from scratch.

**Plan and mode awareness is mandatory.** Every request to the bot is sent along with the asking user's actual `plan` (Free / Pro / Multi), `has_charges_addon` (boolean), and `rental_type` / mode (IR-Named, IR-Categories, WP, SC-Aparthotel, SC-Glamping, SC-Holiday Rentals). The bot MUST:
- Only describe a feature as available to the user if their actual plan/mode supports it.
- If asked about a feature they don't have, say so plainly and name what unlocks it (e.g. "That needs the Pro plan" or "That's specific to Individual Rooms mode — you're on Whole Property, so it works a bit differently for you: ..."), in the same calm, factual tone as the rest of NestBook's product copy — informative, never a sales pitch.
- Never assume the user's plan/mode from the page they're on alone — always use the passed-in account data as the source of truth.

**Mode key** (used throughout this file):
- **IR-N** — Individual Rooms mode, Named Rooms
- **IR-C** — Individual Rooms mode, Categories
- **WP** — Whole Property mode
- **SC-A** — Self-Catering, Aparthotel sub-type
- **SC-G** — Self-Catering, Glamping sub-type
- **SC-H** — Self-Catering, Holiday Rentals sub-type *(previously called "Serviced Apartment" — that name is retired; do not use it)*

Menu items and buttons are written [like this] throughout, matching how they appear on screen.

---

## 1. Navigation overview

The left-hand sidebar is the main way owners move around NestBook. What appears depends on plan and mode. In order as they appear:

- **[Dashboard]** — the home screen, always visible. Content adapts heavily by mode (see Section 2).
- **[Calendar]** — the visual booking grid. Always visible. Tile behaviour differs by mode.
- **[Bookings]** — list of all bookings, with statuses and the New Booking flow. Always visible.
- **[Guests]** — the guest registry. Always visible.
- **[Rooms]** (IR-N, IR-C) / **[Property]** (WP) / **[Units]** (SC-A, SC-G, SC-H) — the same nav slot, labelled differently per mode, for managing bookable inventory. Always visible, but its internal structure differs significantly by mode.
- **[Media Library]** — the single place to manage all property/room/unit photos and the logo. All plans; visible to owners (not shown to reception/staff roles).
- **[Charges]** — room/property charges. **Multi plan, or Pro with the Bar & Charges add-on.** The only nav item genuinely removed from the sidebar otherwise — every other gated item below stays visible to all plans, opening an upgrade prompt on Free rather than disappearing.
- **[Reports]** — revenue reporting, P&L, expenses. Visible to all plans; **Pro and Multi** get the real page, Free sees an upgrade prompt.
- **[Social Media Kit]** — auto-captioned social media images. Always visible, all plans.
- **[Guest Mailer]** — branded email to your own guest list. Visible to all plans; **Pro and Multi** get the real feature, Free sees an upgrade prompt. 100 recipient-emails/month cap.
- **[Property Info Sheet]** — printable/shareable guest info document builder. Visible to all plans; **Pro and Multi** get the real feature, Free sees an upgrade prompt.
- **[Activity Log]** — full audit trail. Visible to all plans; **Pro and Multi** get the real page, Free sees an upgrade prompt. Sits near the bottom of the nav, between Property Info Sheet and Billing — not high up near the top.
- **[Billing]** — subscription, real Stripe invoices, Guest Payments ledger, Stripe Connect. Always visible — owner-only, positioned above Settings.
- **[Settings]** — the largest page; every configuration panel for the property lives here. Always visible. See Section 8 for the full panel-by-panel walkthrough.
- **[Pricing]** — a plan-comparison page (Free/Pro/Multi cards), reachable from the nav for owners and most staff roles. If a user asks "what's that Pricing link," this is just the upgrade/compare page, not a separate feature.

**Important general rule on "hidden" vs "locked":** only [Charges] is actually removed from the sidebar on a plan that doesn't have it. Everything else marked Pro/Multi above still shows as a normal, clickable nav item on Free — clicking it opens the real page's layout with an upgrade prompt in place of the actual content, rather than the item disappearing. If a Free user says "I can see it in the menu but it won't let me use it," that's expected, correct behaviour, not a bug.

If a user asks "where do I find X" and X is plan- or mode-gated away from them, say so directly rather than describing a menu item they can't see.

---

## 2. Dashboard

The Dashboard is the first screen after login and adapts significantly by mode.

**IR-N / IR-C (Individual Rooms):**
- Stat tiles: occupied rooms, arrivals, departures, "Available tonight" (auto-populates as rooms are added).
- "Today's Arrivals" and "Today's Departures" panels — each arrival opens a side panel with [Check-in guest]; each departure opens with the checkout flow.
- "Today's Breakfast" and "Tomorrow's Breakfast" panels (breakfast does not apply to WP — see Section 8's Breakfast Service Hours entry).
- [+ New Guest] and [+ New Booking] quick-action buttons.
- Missed-arrival cover modal appears if a guest was never checked in past their expected arrival — "Yes arrived" / "No show" buttons resolve it.

**WP (Whole Property):**
- Simplified dashboard — the redundant stat tiles (occupied/arrivals/departures) are deliberately removed here, since there is only ever one "room" (the whole property) to track.
- "Upcoming" list extended to a 14-day window.
- Booking cards click straight into the BookingPanel side panel rather than navigating to a different page.
- "Pending approval" bookings show a [Review →] button that opens the BookingPanel directly, where the owner can Accept or Decline.

**SC-A, SC-G, SC-H (Self-Catering, all three sub-types):**
- **SC-H (Holiday Rentals)** reuses WP's simplified dashboard pattern — hidden stat tiles, 14-day upcoming window — since it behaves more like a single managed inventory than a hotel-style room list.
- **SC-A (Aparthotel) and SC-G (Glamping)** use the standard IR-style dashboard instead — stat tiles visible, 7-day upcoming window. (Easy to assume all three SC sub-types behave the same; they don't — only Holiday Rentals gets the WP-style treatment.)
- Per-unit "Access & Arrival" pre-arrival emails (see Section 6) are triggered automatically and don't require anything from the Dashboard itself.

**All modes:**
- A dev-only Plan Switcher panel exists in Settings, not the Dashboard, and is never visible in production — ignore if a user somehow asks about it.

---

## 3. Calendar

The visual booking grid — one of the most-used screens, so it's worth covering thoroughly, including the things that are easy to misread.

**Reading the tiles:**
- Each tile represents one room/unit for one night.
- Tile colour indicates status: available, booked/confirmed, in-house (guest currently staying), cleaning, and (in WP/SC "request" mode) awaiting-approval.
- A **3px dashed white border** on the right edge of a tile means breakfast is needed the following morning for that guest. This applies across all breakfast-eligible modes (not WP, which has no breakfast at all).
- A small fixed amber **dot** means a seasonal rate period is active for that night. Placement differs by calendar view: in the WP month grid it appears on every relevant tile (available, booked, in-house, cleaning); in the IR/Units week grid it appears once, in the day-header row above the tiles, rather than on each individual tile.
- **Today's tile** has a soft white inset border so it's always identifiable regardless of what else is happening on it.
- The legend above the calendar explains each colour/marking — if a user describes a tile appearance you don't recognise, point them to the legend rather than guessing.

**Clicking a tile:**
- An available tile opens the New Booking flow pre-filled with that room/date.
- A booked tile opens the BookingPanel side panel with full booking details, guest info, and available actions (check-in, check-out, edit, add breakfast, add charges, cancel, extend/shorten — see Section 4).

**Common confusions worth answering directly:**
- A **declined** WP/SC-request booking correctly frees its dates immediately — the calendar reflects this right away.
- Cross-property leakage (seeing another property's bookings on a Multi-plan account) should never happen — properties are fully independent from each other. If a user on Multi reports seeing bookings that don't belong to the property they're currently viewing, that is a bug to report via the error-report tool, not expected behaviour.
- In **Room Categories mode (IR-C)**, the guest-facing booking page shows one pooled calendar per category, not one per physical room — but the owner's own Calendar page still shows every individual room in that category as its own row/line, since the owner needs to know which specific room is occupied.

---

## 4. Bookings

The full list of every booking, with filtering and the New Booking creation flow.

**Booking statuses** (exact wording may vary slightly by mode, but the underlying meaning is consistent):
- **Confirmed** — booking is locked in, guest hasn't arrived yet.
- **Arriving** — auto-advances from Confirmed on the actual check-in date (checked hourly).
- **In-house** — auto-advances the day after check-in if the owner forgot to manually check the guest in ("in_house" catches up automatically so a forgotten check-in doesn't leave a booking stuck showing as "arriving" indefinitely).
- **Awaiting approval** (WP, and SC-A/SC-G/SC-H when set to "request" mode) — a widget booking that hasn't yet been accepted or declined by the owner.
- **Cancelled / Declined** — dates are freed immediately on decline; a decline email explaining this is sent to the guest automatically.
- **Pending payment** — a widget booking (Pro/Multi with Stripe Connect active) that's waiting on the guest to complete a Stripe Checkout payment. If a guest abandons this checkout, it's typically cancelled about 30 minutes later (Stripe expires the unfinished payment session and notifies NestBook), with a backup sweep that clears anything still stuck after an hour — either way, the dates free up automatically with no manual step needed. If a guest abandons the same room/dates twice, they're sent a "need help finishing your booking" assistance email.

**A separate "deposit" indicator, not a booking status:** bookings with a deposit involved (WP's fuller flow, or IR's simpler deposit toggle) show their own deposit pill — e.g. "Deposit requested," "Deposit paid," "Balance due" — layered on top of whichever real status above the booking is actually in. This is a payment-state label, not a distinct booking status in its own right, and it can appear in IR mode too, not just WP.

**Creating a booking manually** (the "reception desk" flow — walk-ins, phone bookings, email enquiries):
- [Bookings] → [+ New Booking], or the same button from [Dashboard].
- The New Booking modal lets staff search for a returning guest by last name first (fast-matching to avoid duplicate guest records), then choose dates — the modal filters available rooms by the dates picked, not the other way round.
- If a category has more than one room in it (IR-C), and the guest doesn't need a specific physical room, the system can auto-assign one from the pool; if the guest does want to pick, there's a sub-step showing each individual room with occupancy and bed-configuration details so they can choose exactly.
- Completing the form and clicking [Create Booking] both creates the booking AND adds the guest to the guest registry if they're new — there's no separate "add guest first" step required.
- On Free plan, guests do NOT get an automatic online checkout — see Section 9 (Billing/Stripe Connect) for how Free-plan online enquiries and manual payment links work instead.

**Editing an existing booking:**
- Open the booking (from Calendar or the Bookings list) → the side panel (BookingPanel) has the full set of actions available, which vary by status: Check-in, Check-out, Edit, Add/remove breakfast, Add charges (Multi/Bar & Charges add-on), Extend or shorten stay, Cancel, Send payment link, Mark deposit/balance received.
- **Extending or shortening a stay**: the system checks real-time availability for the new dates, recalculates the rate night-by-night (correctly crossing seasonal pricing boundaries if applicable), shows a confirmation with the new total, and emails the guest with updated dates and total automatically.
- **The "Send payment link" button always appears** on eligible bookings, even if the owner's Stripe Connect isn't fully set up yet — clicking it in that state opens an explanatory modal describing what still needs to be done, rather than silently disappearing. This is a deliberate design choice: a silently-missing button gives no signal that something needs attention, which has caused real confusion for at least one paying customer in the past.

**Block bookings** (a guest ending up with multiple overlapping bookings on the same property via the widget — e.g. reserving 2+ rooms at once): this is protected against only if the owner has switched on **"Block-booking protection"** in Settings → Features (off by default) and set a threshold (default 2). With it on, once a guest's overlapping bookings on that property would reach the threshold, the new one is held for owner approval instead of auto-confirming. With the toggle off (the default), multi-room widget bookings by one guest auto-confirm normally, same as any other booking. If a user asks "does NestBook stop guests double-booking multiple rooms," the honest answer is: only if you've turned this specific toggle on.

---

## 5. Guests

The guest registry — every person who has ever stayed, or been added as a contact.

**Five ways a guest record gets created:**
1. [Guests] → [+ New Guest] — manual entry.
2. [Dashboard] → [+ New Guest] — same form, different entry point.
3. [Dashboard] → [+ New Booking] — creates a guest automatically if the entered name/email doesn't match an existing record; matches and reuses an existing one if it does.
4. [Bookings] → [+ New Booking] — same as above.
5. [Guests] → [Import from CSV] — bulk import via the Guest Import Wizard (see Section 13). Free plan included.

**Matching logic:** guests are primarily matched by email during booking creation and CSV import, to avoid duplicate records for the same real person. A guest record's `property_id` is set from that guest's *earliest* booking — on a Multi-plan account with more than one property, this means a guest who has stayed at two different properties under the same account can still show a reference to the first property even after being "removed" from it elsewhere. This is expected, not a bug, if a Multi user asks why a guest still appears to be linked to an old property.

**CSV import specifics** (relevant if a user's import behaves unexpectedly):
- Column order in the CSV does not matter — the importer matches by header name, not position.
- Name is optional; blank/missing names import cleanly as null rather than causing an error.
- Phone numbers with international country codes (+XX...) are supported.
- The importer uses a proper quoted-field-aware CSV parser, so commas inside a field (e.g. "Smith, John" in a company name) will NOT misalign the columns.
- If rows show up in red/flagged during the import preview, that means the wizard has caught a validation issue (e.g. text in a phone field, an unrecognised value) — the fix is to correct the file locally and re-upload, not to force the import through with errors present.

---

## 6. Rooms / Property / Units — bookable inventory (the biggest mode-split page)

This is the single page where the six modes diverge most. Always confirm the user's actual mode before answering here — the correct nav label, the correct add-flow, and the correct terminology all depend on it.

### IR-N (Individual Rooms, Named)
- Nav label: **[Rooms]**.
- [+ Add Room] opens a form: room name, base nightly rate, max occupancy, bed configuration (a structured picker — 6 fixed bed types with icons, not free text), description, amenities, breakfast (can be turned on for this one room specifically, overriding the property default).
- Each room's own side panel has [Edit Room], including its own photo management (though the Media Library is the recommended single place for this — see Section 7).
- Rooms display in a flat list.

### IR-C (Individual Rooms, Categories)
- Nav label: **[Rooms]**, but grouped-by-category rather than flat.
- Categories themselves are created/edited in **Settings**, not on the Rooms page — each category has its own buffer setting (minimum gap between bookings for cleaning/turnover) and its own amenities/description (these live at the CATEGORY level, not per individual room, since guests book "a room in this category," not a specific physical room).
- Adding a room requires choosing its category — a room cannot be added without one; this is deliberate, to prevent unbookable "uncategorized" rooms from existing.
- The booking engine pools rooms within a category: `getAvailableRoomsInCategory()` finds any free, buffer-respecting room in that category and can auto-assign one, or let the guest pick a specific one via a room-picker sub-step (shown when 2+ rooms exist in the category) that displays occupancy and bed configuration per room, disabling (not hiding) any that are booked or in a buffer period.
- Switching an existing IR-N account into Categories mode is a one-way, guided process in Settings — existing rooms get mapped into categories and given buffers before the switch takes effect; this cannot be reversed by simply switching back.

### WP (Whole Property)
- Nav label: **[Property]**.
- There is only one bookable "unit" — the entire property. [+ Room] here is used only in the rare case of documenting internal rooms for reference (not separately bookable).
- Property-wide settings (address, check-in/out times, breakfast — note breakfast does NOT apply in WP at all) are configured here and in Settings.
- WP-mode does not support Seasonal Pricing per-room overrides the way IR does, since there's only the one property-wide rate to adjust.
- **"What's included" showcase** — the guest-facing booking page shows a "What's included" section (an alternating photo layout) built from the property's own internal rooms: each one displays the owner's own room name (user-entered, correctly never translated) alongside a room-type badge (e.g. "Living Room," "Double Room," "Bathroom" — translated, and omitted entirely rather than shown as a raw code if the type is unrecognised) and a "Sleeps N" capacity line. This section, its labels, and the "Send a booking enquiry" button are all fully translated into all 5 languages.
- **Known gap, not a bug**: amenity chips shown elsewhere on the booking page (e.g. "En-suite," "Balcony") are currently English-only regardless of the guest's selected language — this is consistent across the whole page, not specific to WP, and is a separate, larger task from the showcase translation above.

### SC-A / SC-G / SC-H (Self-Catering — all three sub-types)
- Nav label: **[Units]**.
- [+ Unit] creates a top-level unit (e.g. "Apartment 3", "Meadow Bell Tent"). Clicking a unit's bar then reveals [+ Room], for adding internal rooms within that unit (relevant for larger units with multiple bedrooms).
- Free plan caps units at **5 per property** (Pro/Multi unlimited). Separately, every unit is capped at **5 internal rooms**, on every plan including Pro/Multi — this second limit is structural, not a Free-only restriction. The two are counted and enforced independently (a common point of confusion: filling one unit's 5-room cap does not block a second unit's first room).
- Each sub-type has real behavioural differences, set via the "Unit Sub-Type" panel in Settings:
  - **SC-A (Aparthotel)** — assumes staffed reception, hotel-like. Per-unit "Access & Arrival" (self-service entry instructions) is HIDDEN here, since guests check in with staff. Uses the standard IR-style dashboard (stat tiles visible, 7-day window) — NOT the simplified WP-style one.
  - **SC-G (Glamping)** — assumes a more rustic, often self-check-in experience. Has a `staffed_checkin_available` toggle (default OFF) — when on, it reuses IR's normal Check-In flow instead of pure self-service. Per-unit Access & Arrival IS shown and relevant here. Also uses the standard IR-style dashboard, same as SC-A.
  - **SC-H (Holiday Rentals)** — self-catering, no on-site staff, guests self-check-in. Per-unit Access & Arrival IS shown and relevant here. Uses the simplified WP-style dashboard (hidden stat tiles, 14-day window) — the ONLY SC sub-type that does. *(This sub-type was previously mislabelled "Serviced Apartment" — if a user references that old name, understand they mean SC-H and gently note the current correct name is "Holiday Rentals"; the true "Aparthotel" concept is the SC-A sub-type described above.)*
- Each unit/sub-type combination has its own `booking_flow` setting — 'instant' (IR-style, confirms immediately) or 'request' (routes through the same pending-owner-approval and accept/decline email flow WP uses). The walk-in/self-service toggle and the booking-flow setting are linked and auto-correct each other where the combination wouldn't make sense (e.g. a fully unstaffed unit shouldn't be set to require in-person approval at check-in).
- **Photo limit note — genuinely different from IR/WP**: Self-Catering units/rooms are capped at **1 photo per room/unit, on every plan**, regardless of Free/Pro/Multi. This is NOT the same tiered 3/5/10 limit that applies to IR/WP rooms — don't apply that tiered logic here.
- The booking page's "Our Units" showcase and "Book this unit" button follow the same fully-translated pattern described above for WP.
- **Room-type dropdown note**: three legacy values (`narrowboat`, `farmhouse`, `chateau`) exist in the underlying data options from old migrations but aren't selectable anywhere in the current UI. If one somehow appears on an older property, the booking page correctly omits the badge rather than showing anything broken — this isn't something a user can create going forward.

### All modes — Room/Unit Import Wizard
- [Rooms]/[Property]/[Units] → [Import Rooms] (label may read "Import" depending on mode) — bulk-adds rooms/units from a CSV, following the same download-template → fill in → upload → fix any flagged errors → import pattern as the other import wizards (see Section 13). There are dedicated templates for IR-Named, IR-Categories, WP, and each SC sub-type, since the required columns differ. The photo-count example column in each template matches that plan's actual photo limit.

---

## 7. Media Library

The single place to manage most images on the account — added specifically to reduce photos being scattered across multiple upload points. Available on all plans.

**The "media dump" concept:**
- [Media Library] → [Add photo] in the "Unassigned photos" section — this is where every image lands first, whether uploaded as a file or added via a direct image URL.
- From there, click a photo, then click the destination slot (a specific room/unit, the property hero, the logo, etc.) to assign it. A photo can be moved between rooms/slots later the same way — nothing is locked in permanently by its first assignment.
- Detaching a photo from a room (or deleting the room itself) does NOT delete the photo file — it returns to the unassigned pool rather than being destroyed. This is deliberate, so restructuring rooms never causes accidental photo loss.

**Sections on the page:**
- **Unassigned photos** — the pool described above.
- **Property section** — Hero photo and Logo slots, both with [Add photo] / [Change] / [Remove].
- **Utility section** — only appears for SC-Glamping and SC-Holiday Rentals (not SC-Aparthotel). Holds per-unit access/arrival photos.
- **Room/unit sections** — grouped per room or unit, showing their assigned photos with click-to-reassign.

**Plan and mode limits:**
- IR and WP rooms: photo limits are tiered by plan — **Free: 3, Pro: 5, Multi: 10** photos per room.
- **Self-Catering (SC-A/SC-G/SC-H) rooms/units: exactly 1 photo per room/unit, on every plan, with no tiering.** Genuinely different from IR/WP — don't imply this rises on Pro/Multi.
- The overall "pool cap" for Unassigned photos is computed live from the sum of every room/unit's own limit plus hero/logo slots plus a small buffer — it grows as rooms/units are added, it isn't a fixed number.

**Property Logo — where it can actually be managed (verified, two places, both real):**
- **Media Library** — upload, remove, and the "Show background behind logo" toggle (controls whether the logo shows in a white chip or floats directly on photos).
- **Guest Mailer** — also has its own upload/remove control for the logo.
- Both hit the exact same backend upload route — it is genuinely one shared logo, editable from either screen; uploading a new one in Guest Mailer updates it everywhere, including Media Library, and vice versa. If a user asks "which one do I use," either is correct — whichever screen they're already on.
- (Minor known inconsistency, harmless: some hint text in Settings' Specials Banner panel and Media Library's own logo slot still says "manage in Guest Mailer" — this is slightly stale copy from before Media Library could also manage it, but functionally both places work.)

**Where the logo actually displays (read-only), for context if a user asks "why does my logo look wrong on X":**
- Booking page hero (chip beside the property name, all modes)
- Booking page Specials/offers flyout
- Every Guest Mailer email sent (header)
- Property Info Sheet (on-screen and in its PDF/image export)
- The centre of both generated QR codes (booking-page QR and WiFi QR, in Settings) — this is why QR-code logos are NOT affected by the "no background" toggle, since a QR code needs guaranteed contrast to stay scannable
- Small preview thumbnails in Specials Banner, Media Library, and Guest Mailer themselves

**Hero photo — where it can actually be managed (verified, two places, both real):**
- **Settings → Property Details panel** (an inline sub-section within that panel, not a separate card) — the traditionally "primary" spot.
- **Media Library** — its own Hero photo slot, fully functional.
- Both edit the same single `hero_photo` field — either works, they're not in conflict.

**Where the hero photo displays:**
- The main booking-page background image, all modes. If no hero photo is set, it falls back to an embedded Google Map, then finally a solid theme colour — so a guest-facing page with no photo and no address still won't look broken.
- The WP-mode photo gallery on the booking page.
- Pulled into Social Media Kit as a post-able image.

---

## 8. Settings — full panel-by-panel walkthrough (verified against source, September 2026)

Settings is a two-column layout. Panels render top-to-bottom within each column, and most are conditional on plan/mode. If a user says "I can't find X," check both columns and the notes on what's moved elsewhere before assuming it's missing.

### LEFT COLUMN, in order:

1. **Sample data banner** — only shown if the property still has sample data loaded. Has a "Delete sample data" button.
2. **Property Details** — the main property info panel: name, property type, rental mode-specific fields (WP shows capacity/bedrooms/bathrooms/rate here too), address, city, country, check-in/out times, currency, language, description. Also contains, as inline sub-sections within this same panel (not separate cards): **Hero Photo** and **Property "At a Glance" facts**.
3. **Room Organization** — IR-Named mode only. Lets an IR-Named account migrate into Room Categories mode (one-way, guided).
4. **Unit Sub-Type** — SC modes only (SC-A/SC-G/SC-H).
5. **Partnership Links** — Pro and Multi only (locked card on Free). Add local businesses (restaurants, cafés, activity providers) with an icon and a link, shown on the booking page below the map — genuine small-business cross-promotion, not paid advertising. Goes through Content Review moderation before appearing live, same as other user-submitted content.
6. **Properties** — Multi plan only. Multi-property management: list, add another property, remove a property.
7. **Breakfast Service Hours** — hidden entirely in WP mode.
8. **Appearance (theme picker)** — owner role only. See theme list below.
9. **Room Categories** — IR-Categories mode only. Manage the categories themselves (buffers, amenities, descriptions).
10. **Report an issue** — only shown if bug-reporting is enabled for the account (an admin-controlled flag). This is the "error-report tool" referenced elsewhere as the fallback when the help bot can't answer something.

### RIGHT COLUMN, in order:

*(Note on gating language below: most Pro/Multi panels still render for Free users as a visible, locked card with an upgrade prompt — they are not removed from the page. Only Properties (left column, Multi-only) and Service Categories are truly hidden by a hard condition and won't appear at all on an ineligible account.)*

1. *(Dev-only Plan Switcher — never appears in production, ignore if mentioned.)*
2. **Features** — always shown. Contains three top toggles — **Online Booking Widget, Email Confirmations, Offline Mode** — that currently have no real effect: they visually flip but aren't saved anywhere, reset to on every time the page reloads, and don't change actual app behaviour (confirmation emails always send regardless of the toggle; there is no offline-sync capability anywhere in the app — the offline banner elsewhere actually warns that changes made offline will NOT be saved, the opposite of what this toggle implies). **If a user asks how to turn off confirmation emails or enable offline mode, be honest that this isn't currently wired up to do anything, rather than describing it as a working feature.** Below these, for non-WP modes: the property-wide free-breakfast toggle (Named Rooms only) with a warning note, the widget-breakfast toggle and price (paid plans), the simple Require Deposit toggle and amount, and a Block-booking protection toggle with a threshold setting (off by default, and this one IS fully functional — see Section 4 for what it actually does).
3. **Widget embed code** — Pro and Multi only (locked card on Free).
4. **QR Code** — all plans. Generates the booking-page QR code, with the property logo composited into its centre.
5. **WiFi QR Card** — all plans. Same pattern, for a WiFi-access QR code.
6. **Specials Banner** — all plans. A dismissible promotional pop-out on the booking page.
7. **Custom Section** — all plans. A free-form title + rich-text content block on the booking page — the difference from Specials Banner is that Specials Banner is a dismissible pop-out meant for something time-limited (an offer, last-minute availability), while Custom Section is a permanent part of the page layout for anything else worth telling guests (recent renovations, house history, anything that doesn't fit a structured field).
8. **Facebook Action Button** — all plans. Also contains the booking-page URL/slug editor.
9. **Guest Access** (access code / arrival info) — WP mode only.
10. **Deposit & Balance** — WP mode only. *(This is WP's fuller deposit system — beyond just enabling deposits, it also covers refund policy text, exactly when the remaining balance is due, and automatic deposit/balance/reminder emails — genuinely more than IR's simpler on/off toggle.)*
11. **Seasonal Pricing** — Free: not usable (0 periods), **Pro: up to 5 periods**, Multi: unlimited (locked card on Free).
12. **Calendar Sync** — shown once the property has rooms, or in WP mode. Collapsible, closed by default. Contains both the export URLs (for pasting into Booking.com/Airbnb/etc.) and the import-feed field (for pulling external calendars in).
13. **Review Requests** — Pro and Multi only (locked card on Free). Automatically emails a guest asking for a review a set number of days after checkout, including the owner's own Google/TripAdvisor review links.
14. **Guest Notes** — Pro and Multi only (locked card on Free). Lets a guest leave a short note about their stay after checkout, as a source of testimonials. **Important:** the property owner does NOT approve or decline these notes themselves — that's done centrally by the NestBook team via Super Admin's Content Review queue. Once a note is approved, it appears under "Approved notes" in this same panel, where the owner can toggle each one between Show and Hide on their own public page — but cannot approve a pending one or reverse a rejection themselves.
15. **Billing** — always shown, but this is just a one-line link out to the separate [Billing] page, not a full panel — the real subscription/invoice/Stripe Connect content lives on that dedicated page, not in Settings itself.
16. **Service Categories** — Multi plan, or Pro with the Bar & Charges add-on, owner role only. Genuinely hidden otherwise, not just locked.
17. **Access & Roles** — always shown (inviting new staff specifically requires Pro or Multi).

### Colour themes — 11 available

Forest (default), Navy, Warm Gold, Ruby, Sky Blue, Lavender, Aero, Charcoal, Slate, Storm, Hessian. All 11 are available on every plan. Changing the theme also updates the booking widget's colours to match automatically.

### Correct terminology reminder
- Facebook's panel is the **"Action Button,"** not "Booking Button" — Facebook has no native booking integration, this just links out.
- SC-H is **"Holiday Rentals,"** not "Serviced Apartment" (retired name).

### What's genuinely NOT in Settings (moved to their own top-level pages):
- Subscription, real invoices, and Stripe Connect → **[Billing]** (Settings only links to it).
- Rental mode (IR/WP/SC) switching for an existing property with real data isn't self-service anywhere in Settings — it requires contacting support.

---

## 9. Billing

Its own top-level nav item, positioned above Settings — owner-only. Two sections:

**Account (left side)**
- Current plan, and real Stripe invoices (pulled live from Stripe, not a static record) shown in a table.
- If the account is on a Promotional Pro period (via a discount code), a dedicated panel shows here too — colour-coded green → amber → red as the promo period counts down, reminder emails sent automatically at 30 days and 7 days before it ends, and an "Add payment details" option that sets up a card for automatic conversion to paid Pro at expiry (the card is saved but not charged until the promo actually ends).

**Guest Payments & Stripe Connect (right side)**
- **Guest Payments** — a ledger of deposits and balances collected from guests across all bookings, so the owner can see payment status without opening each booking individually.
- **Stripe Connect** — where the owner connects their own Stripe account to take guest payments directly. NestBook uses a "direct charge" model with zero application fee — money goes straight to the owner's own Stripe account, NestBook's servers never touch it. Available on **all plans**, not gated.
- Connecting requires going through Stripe's own onboarding (business details, bank details, identity verification) — this is Stripe's own compliance process, not something NestBook controls the speed of; it can take anywhere from a few minutes to longer if Stripe needs to review submitted details.
- Once connected and active, two things become possible: the **"Send payment link"** button on individual bookings (works on any plan, including Free — this is the primary way a Free-plan owner takes card payment, since Free has no automatic online checkout), and, on Pro/Multi, **automatic widget checkout** — a guest booking via the widget pays immediately as part of completing their booking, rather than the owner needing to manually send a link afterward.
- If Stripe Connect isn't fully active yet, the "Send payment link" button doesn't disappear — clicking it explains what's still needed, so the owner always has a clear next step rather than a mysteriously missing feature.
- A **Disconnect** option exists if an owner wants to remove their connected Stripe account; this can be blocked by Stripe itself if there's an outstanding balance on that connected account.

---

## 10. Reports

**Visible to all plans; Pro and Multi get the real page, Free sees an upgrade prompt.**

- Choose a date range, then view a full profit & loss breakdown for the property.
- Two supporting sections: **Business Expenses** (the owner's own manually-entered running costs) and **Revenue Adjustments** (manual corrections to reported revenue, e.g. for a refund or an error).
- Both PDF and CSV export are available for the full report.

---

## 11. Activity Log

**Pro and Multi only.**

- A complete audit trail: every booking created, edited, or cancelled; breakfast added/removed; check-ins and check-outs; staff actions — each entry stamped with date, time, and who performed it.
- Especially useful once an account has more than one staff member, since it answers "who did this and when" without needing to ask.
- [Export CSV] downloads the full log.

---

## 12. Social Media Kit, Guest Mailer, and Property Info Sheet

Three separate top-level nav items, grouped here because they're all part of the same "owner-facing marketing suite" idea — helping an independent owner market their own property without needing outside design or marketing skills.

**Social Media Kit** — available on all plans
- Pick one of the property's existing photos, and the tool automatically writes a ready-to-use caption for it.
- [Copy Image] copies the photo to the clipboard ready to paste directly into Facebook/Instagram; [Download] saves it instead.
- Includes its own short guide on how to actually post to Facebook/Instagram, for an owner who isn't confident with social media.

**Guest Mailer — Pro and Multi only**
- Sends a branded email to the property's own guest list — a newsletter, a seasonal offer, a personal thank-you.
- **Important restriction, worth explaining clearly if asked**: this only works for guests who booked directly. Any guest whose contact came via an Airbnb or Booking.com relay address is automatically blocked from receiving these emails — this isn't a NestBook limitation for its own sake, it's because using platform-sourced guest contacts for an owner's own marketing violates those platforms' own terms of service. The block exists to protect the owner from a ToS violation, not to limit the feature arbitrarily.
- Capped at 100 recipient emails per property per month.
- The property's logo is automatically added to the top of every email sent this way — also the second of the two places (alongside Media Library) where that logo can be uploaded or changed.

**Property Info Sheet** — Pro and Multi only (visible in the nav on all plans; opens an upgrade prompt on Free)
- Builds a printable or shareable information document for guests, combining whichever sections the owner ticks: logo, a scannable WiFi QR code, breakfast times, house rules, local area recommendations, and a booking QR code.
- Export as either a PDF or a plain image, ready to print and leave in a room, or send digitally.

---

## 13. Import Wizards

Three separate wizards, each accessed from within its own relevant page rather than from one central import screen:

- **Rooms** — [Rooms] / [Property] / [Units] → [Import Rooms]. Templates differ by mode (IR-Named, IR-Categories, WP, and each SC sub-type), since the required columns aren't the same.
- **Guests** — [Guests] → [Import from CSV].
- **Bookings** — [Bookings] → [Import Bookings]. Useful for migrating from another booking system rather than starting from zero.

**The flow is identical across all three:**
1. Open the wizard from its page — a modal window appears.
2. [Download template CSV] first, if not already familiar with the required columns — this gives a real spreadsheet file with 2–3 pre-filled example rows showing the expected format.
3. Fill in the real data, save the file, then [Upload →] and select it.
4. The wizard checks every row and column. Anything irregular is shown in red before anything is actually imported — nothing partial gets created from a file with errors still showing.
5. If errors appear: go back, fix the file on the computer, and re-upload. There is no way to "force through" an import with errors present — this is deliberate, to avoid partial or corrupted data.
6. Once everything shows green, [Import] commits the data, and a success message confirms what was actually imported.

**Booking import specifics worth knowing:**
- Deduplicates guests by email during import, same as manual entry.
- Preserves an already-known total price on an imported booking rather than recalculating it from current rates — this is why an imported booking may show "Total as imported" instead of a per-night rate breakdown; that's expected, not a display bug.
- Deliberately does not attempt to import things NestBook has no matching field for (external booking-reference IDs, per-channel commission percentages, per-booking currency, etc.) — if a user asks why a specific column from another system didn't come across, the honest answer is that field doesn't exist in NestBook's data model, not that the import failed.

---

## 14. Common gaps and things worth flagging honestly

This section exists for exactly the kind of question that isn't neatly covered by a single feature panel — the "I got stuck and don't know where to even start" moment. Give a complete, confident answer where the app genuinely supports something, and an honest "here's what to do instead" where it doesn't — never a vague non-answer.

**"How do I manually add/create a booking as the owner?"**
Fully covered — see Section 4, "Creating a booking manually." In short: [Bookings] or [Dashboard] → [+ New Booking], fill in the guest and dates, and [Create Booking]. This works identically regardless of plan or mode (the room/unit selection step adapts to whichever mode the property is in).

**"How do I delete my whole NestBook account?"**
[Billing] → "Manage Subscription" (an expandable section, near the bottom of the Subscription card) → **[Delete account]**. Requires typing "DELETE" to confirm. This permanently and immediately deletes the property itself, all bookings, guests, rooms, photos, reports data and history, and cancels the Stripe subscription — with no undo, no grace period. A separate, much gentler option sits directly above it in the same section: **[Cancel subscription]**, which stops billing at the end of the current period but keeps the account and all its data on the Free plan — worth pointing a user toward this instead if what they actually want is to stop paying, not to erase everything.

**"Why can't I see [a Pro/Multi feature] on my account?"**
Always check plan first. Common ones a Free user will hit: Reports, Activity Log, Guest Mailer, Property Info Sheet, Review Requests, Partnership Links, Seasonal Pricing, Guest Notes, the Widget embed panel, Room/Property Charges (this last one is the one exception that's actually removed from the nav rather than shown-but-locked). For everything else in this list, the nav item and page layout are visible on Free — the content is replaced with an upgrade prompt, not hidden. Frame it as "you can see it, it just needs a plan upgrade to use," not "it's hidden from you."

**"Why can't I see [a mode-specific feature]?"**
Common ones: breakfast anywhere in WP mode (not offered there at all), Room Categories/Room Organization outside IR-Named, Unit Sub-Type outside SC modes, Guest Access/Deposit & Balance panels outside WP, per-unit Access & Arrival outside SC-Glamping/SC-Holiday Rentals.

**"My widget/payment link isn't working."**
Check Stripe Connect status first (Billing page) — many payment-related issues trace back to Connect not being fully active yet, which is now handled with an explanatory modal rather than a silently missing button, but is still worth checking directly if something payment-related seems broken.

**Anything not covered above, or genuinely uncertain:**
Say so honestly, and point to the error-report tool at the bottom of the Settings page. Never invent a plausible-sounding but unverified answer — a wrong answer is worse than an honest "I'm not sure."

**"Why can't I add a booking / room / guest — everything seems blocked?"**
Check whether the account's email is verified first. Until a new user clicks the verification link sent at sign-up, the account is blocked from creating any booking, guest, room, rate period, or category — this shows as an in-app banner, but if a user describes being stuck on their first day with everything greyed out or throwing an error, this is very often the actual cause. The fix is simply to check the inbox (and spam folder) for the verification email and click the link; a fresh verification email can be requested if needed.

**"How do I change my password?"**
Bottom of the left sidebar — a plain [Change password] button, not behind an account name/menu.

**"Why does my staff member's screen look completely different from mine?"**
This is expected, not a bug — different staff roles genuinely see different, deliberately reduced interfaces:
- **Charges Staff** get a completely separate, stripped-down full-screen view with no sidebar at all — just the Charges functionality, since that's their only job.
- **Reception** role sees a reduced sidebar: Dashboard, Calendar, Bookings, Guests, Rooms/Property/Units, and Charges only — no Settings, no Reports, no Billing, etc.
- The owner's own view sees everything; Reception and Charges Staff (described above) are the only two reduced roles — there is no separate generic "Staff" role beyond these.
If a user (owner or staff) asks why their screen doesn't match a colleague's or a screenshot from documentation, ask what role that person is logged in as before assuming something's broken.

**"My account suddenly dropped to Free / I lost my Pro features unexpectedly."**
This can genuinely happen if a Pro/Multi subscription payment fails — the sidebar shows a "payment failed" warning banner first, and after a grace/dunning window with no resolution, the account is automatically downgraded to Free and the Stripe subscription is cancelled, with an email sent explaining what happened. If a user reports this, the honest answer is to check whether a card expired or a payment genuinely failed (via Billing → invoices), not to assume it's a system error.

**What some already-mentioned features actually do, if a user asks for more than just "it exists":**
- **Specials Banner vs Custom Section** — both are booking-page content blocks, available on every plan, but serve different purposes: Specials Banner is a dismissible pop-out meant for something time-limited (a seasonal offer, last-minute availability); Custom Section is a permanent block on the page for anything else worth telling guests.
- **Offline Mode** — this toggle exists in Settings → Features but is currently not functional (see the note in Section 8's Features panel entry) — don't describe it as something that actually works yet.
- **Deposit pill lifecycle** (IR and WP) — the pill itself shows one of three states: "Deposit required" → "Deposit requested" → "Deposit paid" (owner uses "Mark deposit received" in the BookingPanel, which also emails the guest a confirmation). Once the stay is complete, marking the booking paid in full (or checking the guest out) is what actually sends the full receipt email — a separate "mark balance received" action exists for WP's fuller flow but does not itself trigger a receipt email. WP's fuller Payment & Deposit Manager additionally handles refund policy wording and automatic balance-due reminder emails on a schedule — IR's simpler toggle just turns the requirement on/off with a percentage or fixed amount.
- **"At a Glance" facts** — the guest-facing quick-reference block (max guests, pets, parking, accessibility, minimum stay, and more) shown on the booking page, configured in Settings → Property Details.

**The [Pricing] nav item** — this is simply the plan-comparison/upgrade page (Free/Pro/Multi feature cards), not a separate feature in itself. If a user asks what it is, that's the full answer.
