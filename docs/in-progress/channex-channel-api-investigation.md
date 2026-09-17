## CA-7 follow-up — "already connected" 409 branch — LIVE-VERIFIED (2026-09-17) — genuinely reproduced two ways (fresh-load pre-empt AND a real mid-flow race), both handled gracefully, no white-label leak, no code changes

This code path (`server/routes/properties.js` `POST /:id/channex/channels`'
pre-emptive `listChannelsForProperty` check, and its two client-side
consumers in `ChannelConnectWizard.jsx`) had only ever been code-reviewed
before this — never actually triggered against a real duplicate
connection. Live-verified now, on Wigwam Holidays / property #1 (`Local
Dev`, `a50e441f-bbd8-40b6-a69e-f728953a976e`).

**Adapter substitution, disclosed:** the task suggested GlampingHub or
Wigwam Holidays. Tried GlampingHub first — but GlampingHub **genuinely
validates** (confirmed since round 4): fake credentials cleanly fail
`test_connection` every time, and the wizard's step-1→2 "Continue" is
`disabled={testOutcome !== 'success' ...}`, so a fake credential can
never reach the create call at all. **Switched to Wigwam Holidays**,
whose confirmed leniency (any non-empty value "succeeds") is exactly
what let this test reach a real create call with fabricated settings —
this is also the adapter round 2's follow-up already proved gets a real
`201` from Channex with fully fabricated room/rate codes, so it was the
correct choice for a proven create/delete cycle, not just the convenient
one.

**Two genuinely different ways this branch fires — both tested live, not
assumed to be "the same thing twice":**

1. **Fresh-load pre-empt (the common case)**: `ChannelConnectWizard.jsx`
   fetches `GET .../channex/channels` on mount into `existingChannels`;
   `alreadyConnected` is computed client-side the moment the owner picks
   an already-connected adapter from the dropdown. Confirmed live: with
   Wigwam Holidays already connected, opening a **fresh** wizard and
   selecting it immediately shows the "Already connected" banner at step
   0 — **before any network call for creation is made** — and `Continue`
   is confirmed genuinely `disabled: true` (checked via the real DOM
   property, not just visually), not just a cosmetic warning next to a
   clickable button. The adapter is NOT filtered out of the dropdown
   itself — it still lists Wigwam Holidays as an option — only selecting
   it triggers the block.
2. **Mid-flow server-side 409 (the race-condition case, the one that
   actually needed a real trigger, not just a code read)**: reproduced
   by opening TWO wizard instances (two browser tabs) against the same
   property before either created anything, so both loaded an identical,
   now-stale `existingChannels: []`. Tab A completed a real create
   (confirmed via a live `201` and a real Channex channel id). Tab B —
   still holding its stale empty state, so its own `alreadyConnected`
   check never fired — was driven all the way through settings, test
   connection, and the manual-entry mapping fallback, then clicked
   "Create connection" for real. The server's own live
   `listChannelsForProperty` check (not a local DB check — it asks
   Channex directly) caught the real duplicate and returned a genuine
   `409 {"error":"already_connected", "channel": {...}}`. Confirmed via
   the DB (only one `channex_channels` row, id 4) and a live
   `GET /channels?filter[property_id]=` call (exactly one channel
   present) that **no duplicate was ever written** — the pre-empt fully
   did its job.

**Client-side handling of the real 409 — confirmed graceful, no crash, no
white-label leak:** `ChannelConnectWizard.jsx`'s `createConnection()`
checks `res.status === 409 && data.error === 'already_connected'`
specifically (not just "any non-2xx"), appends the now-known channel to
`existingChannels`, and silently resets to step 0 — where the same
translated "Already connected" banner then renders (since
`existingChannels` is now correct and `selectedCode` is unchanged). No
raw Channex error text ever reaches the DOM, no unhandled-promise crash,
no generic "Something went wrong" fallback — the exact right message. The
copy (`cmOtaAlreadyConnectedTitle`/`cmOtaAlreadyConnectedMsg`) was
already translated into all 5 languages before this check (not just
English placeholders) — no new i18n work needed.

**No genuinely new bug found** — this round confirmed existing,
previously-only-code-reviewed behavior works exactly as designed, on both
paths. Nothing was fixed because nothing was broken.

**Cleanup, confirmed thoroughly**: the test channel was deleted via the
real UI's Delete button (not a raw API call) after both paths were
confirmed; re-checked afterward that `channex_channels` is empty locally
AND that a live `GET /channels?filter[property_id]=` on the same property
returns zero channels — no orphaned local row, no orphaned live Channex
channel.

**Regression check:** no code was changed this pass (pure live
verification). Dev server started clean (no Channex-related startup
errors), Channel Manager's Room Mapping section, the main page's
Connect-a-channel/Connect-Airbnb buttons, and the picker's adapter
dropdown (still listing every adapter, unfiltered by connection status)
all behaved correctly throughout.

---

## CA-7 follow-up — Vrbo investigation — DONE (2026-09-17) — exists, production-only (same `implementation_not_defined` pattern as Klook/Traveloka/HRS), AND out of the room_rate_multioccupancy cluster this whole sweep targeted (`mapping_mode: "listing"`) — a genuinely new, more severe class of mapping-step gap than Hostelworld/Klook's "one ignored field"

**Investigation-only, no code changes**, run the same way as the Klook/
Traveloka investigation: `/channels/list` alone is known to be
incomplete (already proven for Klook/Traveloka/HRS), so existence was
checked both via the merged 60-adapter list AND a direct
`GET /channels/adapter?code=` lookup with case variants.

**Exists — confirmed via direct lookup, absent from `/channels/list`,
same omission pattern as Klook/Traveloka/HRS.** Not present anywhere in
the 60-adapter merged list. `GET /channels/adapter?code=Vrbo` (and
`vrbo`, `VRBO`) all resolve cleanly to the identical descriptor, with
Channex's real canonical code reported as **`VRBO`** (all-caps — note
this is a third different casing convention seen across these
supplemental lookups, after `Klook`/`Traveloka` title-case and `HRS`
all-caps-but-short; Channex's `?code=` param is confirmed case-
insensitive here too, same as CA-3's `AirBNB` finding). `HomeAway` (the
pre-rebrand name) was also tried, both cased — both return a genuine
Channex **500 Internal Server Error**, not a clean "not found." Not
chased further since it's out of scope for an investigation-only task
and the current, real adapter name Channex's own descriptor reports is
`VRBO` regardless — but worth flagging that `HomeAway` isn't a silently-
unsupported alias, it's an actual server error on Channex's side.

**Descriptor — genuinely different shape from every adapter tested in
this sweep so far:**
```json
{
  "code": "VRBO", "title": "VRBO", "kind": "meta",
  "mapping_mode": "listing", "property_mapping": "multiple",
  "connection_params": {"mode": "meta"},
  "params": {
    "username": {"type": "string"}, "password": {"type": "password"},
    "email": {"type": "string", "rules": [...hidden unless notifications on...]},
    "send_email_notifications": {"type": "boolean", "default": false},
    "min_stay_type": {"type": "switch", "options": ["Arrival","Through"]},
    "payout_type": {"type": "select", "options": ["Total Booking Amount","Payout Amount"]},
    "sync_days": {"type": "select", "options": ["180","365","400","500","720"]}
  },
  "rate_params": {"property_id": {"type": "string", "title": "PropertyId"}}
}
```
`mapping_mode: "listing"` — never seen before in this sweep, and NOT
`room_rate_multioccupancy` — so, same as HRS's correction, **VRBO was
never actually a member of the cluster this whole 43-adapter sweep
targeted.** `rate_params` is a single `property_id` string field — no
`room_type_code`/`rate_plan_code`/`occupancy`/`pricing_type`/
`primary_occ` at all. No `pricing_type` key means no OBP toggle would
ever show (`supportsObp` is false) — consistent with a listing-based,
not room-and-rate-based, mapping model.

**Production-only, confirmed the same way as Klook/Traveloka/HRS**: one
`test_connection` call with empty settings, then one with plausible-
looking fake credentials (`username`/`password`) — **both returned
`{"success":false,"errors":"implementation_not_defined"}`**, identical
to the other three. Per this round's instruction, the full repeat/spaced
battery was skipped once this pattern was confirmed — it would only
reconfirm what's already conclusive, the same as it was for Klook/
Traveloka/HRS. Genuine verification needs real production VRBO
credentials, same caveat as those three.

**A genuinely new, more severe bug — flagged plainly, not fixed inline,
per instruction (this is NOT either of the two already-fixed patterns —
not the queue-contention fix, not the `hasOtaRooms` fallback fix):**
CA-4's mapping step (`client/src/components/ChannelConnectWizard.jsx`)
unconditionally builds its create payload with `room_type_code`/
`rate_plan_code` keys (~lines 271-272, 281-282) no matter what the
selected adapter's `rate_params` actually declares — this was already
known to be "not genuinely generic" (Hostelworld's unhandled `type`
field, Klook's unhandled `extra_adult_price`/`extra_child_price`), but
those were both cases of "an extra field the schema declares gets
silently ignored." VRBO is a **worse case**: its `rate_params` schema
doesn't contain `room_type_code`/`rate_plan_code` at all, so the wizard
would send keys VRBO's schema never asked for, while the one field it
actually needs — `property_id` — is never collected or sent anywhere.
`hasRateMapping` (`Object.keys(rateParams).length > 0`) still evaluates
`true` since `property_id` exists, so the wizard's existing "this wizard
doesn't fully support this channel yet" block (the one that correctly
catches `rate_params: null` for MoreCom/WeSpeak) would NOT trigger for
VRBO — an owner would be let into a mapping step whose room/rate
dropdowns have no real meaning for this adapter, and a create call built
on the wrong field model. Root cause is `mapping_mode: "listing"`
diverging from the `room_rate_multioccupancy` shape the mapping step's
hardcoded controls assume — the first confirmed case in this whole sweep
where the *mapping mode itself*, not just one extra param key, is
incompatible.

**Not done, per instruction (investigation only)**: VRBO was NOT added to
`OWNER_HIDDEN_ADAPTER_CODES` in `server/routes/properties.js` (the
owner-facing curation list from the prior follow-up) despite fitting the
"cannot be successfully completed" criterion that list is for on two
independent grounds (production-only test_connection, AND a mapping-step
field-model mismatch worse than Klook/Hostelworld's). It currently isn't
reachable by an owner anyway (absent from `/channels/list`, and never
merged into `listChannelAdapters()` the way Klook/Traveloka/HRS were —
no merge fix was requested or implemented for VRBO this round), so there
is no live exposure to curate yet. Flagging for whoever picks this up
next: if VRBO is ever merged in the same way Klook/Traveloka/HRS were,
it should almost certainly be added to that hidden-codes list on the
same pass — its gap is strictly worse than two of the four codes
already on it.

---

## CA-7 follow-up — owner-facing adapter curation, ahead of launch — DONE (2026-09-17) — hides the 5 confirmed-broken adapters from owners while keeping Super Admin's debug view fully unfiltered

**The fix — `server/routes/properties.js` only.** A new `OWNER_HIDDEN_
ADAPTER_CODES` `Set`, declared immediately above the
`GET /:id/channex/adapters` route (colocated with its only use site,
rather than inside `listChannelAdapters()`/`channexClient.js`, since this
is owner-facing UX curation, not a Channex-client-level concern), filters
the array that route returns. `listChannelAdapters()` itself is
completely unchanged — it still returns the full, unfiltered 60-adapter
list (57 native + Klook/Traveloka/HRS merged in by the prior follow-up) —
and Super Admin's own route (`GET /api/admin/channex/adapters`,
`server/routes/channex.js`) was never touched, so it keeps consuming that
same unfiltered list directly, exactly as required.

**Hidden from the owner-facing picker (5), each with its confirmed root
cause commented directly above the `Set` declaration for future
maintainers:**
- `MoreCom`, `WeSpeak` — `rate_params` is `null` on Channex's own
  descriptor; no rate-mapping capability exists at all.
- `Goibibo` — `test_connection` consistently returns
  `implementation_not_defined` on Channex's staging sandbox.
- `Hostelworld` — reachable past Test Connection, but its `rate_params`
  includes an unhandled `type` key the generic create-payload builder
  never collects or sends.
- `Klook` — the same class of gap as Hostelworld: its
  `extra_adult_price`/`extra_child_price` rate_params fields have no
  rendering path in the (non-generic) mapping step.

**Deliberately kept visible, with the reasoning recorded in the same
comment block** — 9 adapters whose Test Connection result can be
misleading (persistent false-positive or observed session-drift) but
which still connect successfully with a real credential: HotelREZ, Wigwam
Holidays, OneHotelRez, Agoda, Hipcamp, Guirez, Padelbound, RukiyeZara,
Tripnera. Plus Traveloka and HRS, whose `implementation_not_defined`
result is a confirmed Channex staging-sandbox-only limitation (per Evan,
both work correctly in production) — hiding them now would be premature
ahead of NestBook's own production Channex key being configured for this
feature.

**Deliberately NOT done, to stay within scope**: no server-side block was
added to the `POST /:id/channex/channels` create route for the 5 hidden
codes. The task scoped this to the owner-facing *picker* specifically; a
determined client bypassing the UI entirely and POSTing a hidden adapter
code directly is a separate, narrower concern (and for 4 of the 5, the
create call would already fail on its own merits — no rate mapping
possible for MoreCom/WeSpeak, Test Connection never passes for Goibibo).
Not implemented here since it wasn't asked for; flagged in case a future
slice wants defense-in-depth at the create route too.

**Verified live, not just code review:**
- **The 5 hidden adapters confirmed absent from the real owner-facing
  route**: `GET /:id/channex/adapters` now returns exactly 55 (60 − 5),
  confirmed via direct API call with a real owner JWT — none of
  `MoreCom`/`WeSpeak`/`Goibibo`/`Hostelworld`/`Klook` present.
- **The same 5 confirmed absent from CA-4's real "Choose a channel"
  dropdown** in a live browser session — read the full option list off
  the actual rendered `<select>`: 55 options, none of the 5 hidden codes
  present (`Klook`/`Make My Trip`/`More.com`/`WeSpeak`/`Hostelworld` all
  correctly missing; `WeSpeakOpen` — a different adapter — correctly
  still present, confirming the filter matches by exact code, not a
  substring).
- **Super Admin's debug view confirmed still fully unfiltered**, twice:
  once via a direct API call (`GET /api/admin/channex/adapters` → 60,
  all 5 "hidden" codes present), once live in the browser (the debug
  page's own "60 of 60 adapters" summary line, unchanged from before this
  fix).
- **A caveat adapter and a sandbox-limited adapter both spot-checked
  end-to-end through the real form, not just confirmed present in the
  list**: selected HotelREZ — its settings step (Hotel Code, Send
  Property Notification) rendered correctly, unaffected. Selected
  Traveloka — its settings step (Hotel Code, Tax Setting For Bookings,
  Max Stay Type) also rendered correctly, unaffected.
- Regression: Channel Manager's Room Mapping section and CA-5's "Connect
  Airbnb" button both still render correctly after this change.

**Updated tallies — owner-facing visibility, not adapter behavior
(behavior tallies from the prior entries are unchanged)**: of the 60
adapters `listChannelAdapters()` returns, **55 are shown to owners** and
**5 are hidden** pending a fix on either Channex's side (Klook's/
Hostelworld's rate_params gap, Goibibo's non-functional sandbox check) or
ours (nothing currently planned for MoreCom/WeSpeak's missing rate-mapping
capability — that's Channex's own adapter limitation, not something this
codebase can add). This list should be revisited: if Hostelworld's or
Klook's mapping-step gap is ever fixed (would need the wizard's mapping
step to genuinely generically render arbitrary `rate_params` keys, not
just the hardcoded set it handles today), if Goibibo's sandbox
implementation ever becomes functional, or if Channex's `/channels/list`
omission is ever fixed on their end (irrelevant to this specific list, but
worth remembering it's a separate, still-open item).

---

## CA-7 follow-up — Klook/Traveloka/HRS merge fix + enablement — DONE (2026-09-17) — fixed the `/channels/list` omission found in investigation; Klook and Traveloka genuinely usable and merged in; HRS corrected to `direct` mapping_mode (out of the room_rate_multioccupancy scope this whole sweep targeted) and doubly blocked regardless

**The fix — `server/utils/channexClient.js` only.** `listChannelAdapters()`
now fetches the base `/channels/list` array as before, then separately
fetches `GET /channels/adapter?code=` for `Klook`, `Traveloka`, and `HRS`,
merging any that aren't already present (deduped by `code`, so if Channex
ever fixes this on their end and one starts appearing naturally, it won't
be double-added). Each supplemental lookup has its own `.catch` — a bad
day on Channex's side for one (or all three) degrades to "just don't merge
that one in," never to a broken adapter list for everyone. Both call sites
(`properties.js`, `channex.js`) needed zero changes, exactly as
anticipated — they already pass this function's return value straight
through.

**Verified live, not just code review:**
- **The merge works end-to-end**: the owner-facing `/channex/adapters`
  route now returns 60 adapters (57 + 3), and the real CA-4 wizard's
  "Choose a channel" dropdown correctly lists **HRS**, **Klook**, and
  **Traveloka** alongside everything else, alphabetically sorted. The
  Super Admin debug page independently confirms the same 60-of-60 count
  through its own separate route (`channex.js`), proving the fix benefits
  both call sites without touching either.
- **Dedup confirmed**: called the owner-facing adapters route twice in a
  row — both times exactly 60 total, exactly one `Klook` entry, no
  duplication.
- **Graceful degradation confirmed against real Channex, not simulated**:
  ran the exact same merge logic with one of the three codes swapped for a
  guaranteed-bad one (`TotallyMadeUpXyz123`) — the bad lookup failed with
  a logged warning (not a thrown exception), while Klook and HRS still
  resolved and were correctly included; `.filter(Boolean)` correctly drops
  only the failed one. A failure in the base `/channels/list` call itself
  still propagates as before (unchanged, pre-existing behavior — the
  owner-facing route's existing `ownerFacingChannexErrorResponse` already
  handles that case).

**CA-7 enablement checklist, run on all three now that they're reachable:**

**1. Descriptors — one important correction to the investigation's own
findings:** Klook and Traveloka are both confirmed genuinely
`room_rate_multioccupancy`/`meta`/`single`, matching the dominant shape
this whole sweep has targeted. **HRS is not** — its real `mapping_mode` is
`"direct"`, not `room_rate_multioccupancy`. This wasn't caught during the
investigation because only a truncated 150-character preview of HRS's
descriptor was printed at the time, cut off before the `mapping_mode`
field — the investigation's own conclusion that HRS was a normal
room_rate_multioccupancy adapter was wrong, caught here by reading the
full descriptor. **HRS's `rate_params` shape is also genuinely different**
from every adapter tested in this sweep: `rate_plan_code`, `room_type_code`,
`base_room_code` — no `occupancy`, `pricing_type`, or `primary_occ` at
all. HRS belongs in the same excluded category as GoogleHotelARI/Hopper/
HotelPoint/OpenShopping/Reserva (`direct` mapping_mode) that every prior
CA-7 round has explicitly ruled out up front — it was never actually in
scope for "the room_rate_multioccupancy cluster," it just wasn't caught
until now. Still tested below since it's now reachable and the task asked
for it, but flagged honestly rather than silently treated as another
normal cluster member.

Klook's two new fields (`extra_adult_price`, `extra_child_price`) are
**`rate_params`, not `params`** — a distinction that matters here: CA-4's
generic settings-step renderer (`AdapterField`) genuinely is driven
generically by whatever `params` an adapter declares, but the **mapping
step is NOT genuinely generic** — it only ever renders a fixed set of
controls (NestBook rate-plan picker, OTA room/rate picker or manual entry,
the `pricing_type`/OBP toggle if `supportsObp`, and the OBP tier builder).
There is no code path that iterates over arbitrary `rate_params` keys the
way `AdapterField` iterates over `params`. **Correcting the task's premise
here rather than reporting a false "yes"**: these two fields do not render
anywhere in the current wizard, and would not be sent in a create payload
either — the same class of gap as Hostelworld's unhandled `type`
rate_param from round 3, now confirmed a second time on a different
adapter. Not a new bug pattern (same root cause, same category), so not
fixed inline per instruction, but worth flagging plainly: an owner
connecting Klook has no way to set per-age-tier price adjustments through
this wizard, even though Klook's own adapter supports them.

**2. Live test-connection behavior — all three share the exact same
never-functional pattern, confirmed via repeat AND spaced re-testing:**
Klook, Traveloka, and HRS all consistently return `success: false,
errors: "implementation_not_defined"` — for empty input, for a nonsense
value repeated 5 times each, and (per this task's specific instruction) a
deliberate spaced re-test run after a long real-time gap later in the
session, using the identical values. **Zero drift observed for any of the
three** — unlike ~12% of the full sweep, these three are firmly in the
same category as Goibibo and WeSpeak: `test_connection` is simply never
functional for them on Channex's staging sandbox, regardless of input or
elapsed time. Reproduced live in the real browser for all three: Klook
and Traveloka's settings forms render correctly (including Klook/
Traveloka's shared `max_stay_type` `switch` field and Traveloka's
`booking_tax_settings` select), HRS's form renders correctly too (`min_
stay_type` switch) — all three consistently show "We couldn't verify
these details…" within ~2–3s (one Klook click hit a one-off `testOutcome:
'error'`, not reproducible on immediate retry, consistent with this
session's other transient dev-server hiccups — not a real finding).

**3. Detail-call test — the queue-contention fix, confirmed on 3 more
adapters:** all three (`Klook`, `Traveloka`, `HRS`) return a genuine `500`
from `mapping_details` with fake settings. **Confirmed live through the
real owner-facing route that the CA-7 queue fix protects all three**:
resolved in 0.97s, 0.88s, and 0.87s respectively, `{"available":false}`
each time, zero `[channex-queue]` retry lines in the server log for any of
them. The fix now has 7 confirmed adapters (Agoda, Hostelworld, MoreCom,
Goibibo, Klook, Traveloka, HRS). The mapping-fallback fix was not
click-through-reachable for any of the three, since `test_connection`
never succeeds — same treatment as Goibibo/WeSpeak.

**4. OBP status, noted in passing:** none of the three expose an
OBP-capable `pricing_type` — Klook's and HRS's `rate_params` don't have a
`pricing_type` key with `options` at all (HRS has no `pricing_type` key
whatsoever; Traveloka's own descriptor also lacks the `select`-with-OBP
shape, matching the Expedia/Agoda/Ostrovok family instead).

**5. Adapter-specific copy — none needed**, same conclusion as every
prior round — all three render entirely from generic form copy.

**Regression check:** Channel Manager, the Super Admin debug page (now 60
adapters, up from 57, exactly as expected), and a direct re-check of
Booking.com's `connection-details` (still returns real GBP/7-connection-
type data) all confirmed correct after this change.

**Verdict for each, plainly:**
- **Klook**: **blocked, not a NestBook bug** — same as Goibibo/WeSpeak,
  `test_connection` is never functional on Channex's staging sandbox
  regardless of input or elapsed time. Now correctly surfaced in the
  owner-facing picker thanks to the merge fix, and its 500-ing detail
  calls are confirmed protected by the queue fix — but an owner could
  never actually get past Test Connection here. **Separately flagged**:
  its two extra rate_params fields (`extra_adult_price`,
  `extra_child_price`) have no rendering path anywhere in the wizard,
  joining Hostelworld's unhandled `type` field as a second confirmed
  instance of the same open question.
- **Traveloka**: **blocked, not a NestBook bug** — identical situation to
  Klook (never-functional Test Connection, queue fix confirmed protecting
  its 500s, no extra unhandled fields).
- **HRS**: **out of scope for this sweep, and blocked regardless** — its
  real `mapping_mode` is `direct`, not `room_rate_multioccupancy` (a
  correction to the investigation's own earlier read), so it was never
  actually part of "the room_rate_multioccupancy cluster" this whole
  sweep exists to enable. Also shares Klook/Traveloka's never-functional
  Test Connection. Now correctly surfaced in the picker by the merge fix
  regardless, since the fix itself doesn't filter by mapping_mode — but
  whether the generic wizard's mapping step would even work correctly for
  a `direct`-mode adapter with HRS's genuinely different `rate_params`
  shape (no `occupancy`/`pricing_type`/`primary_occ`) is untested and
  unresolved, since Test Connection blocks reaching that step regardless.

**Updated running tally**: the merge adds 3 adapters to the catalog (60
total surfaced, up from 57). Of the 3: 0 ready with no caveats, 0 with the
leniency/drift caveat, and all 3 join the "cleanly blocked, not a bug"
category (now 5 total: More.com, WeSpeak, Goibibo, Klook, Traveloka — HRS
makes 6, though for a different, additional reason on top of sharing the
Test-Connection block). The queue-contention fix is now confirmed on 7
adapters; the "unhandled optional rate_params field" open question
(Hostelworld) now has a second confirmed instance (Klook).

---

## CA-7 round 10 (final 9: OpenChannel, Padelbound, Revenatium, RukiyeZara, CTrip, Tripnera, WebBeds, WeSpeak, WeSpeakOpen) — DONE (2026-09-17) — closes out the full room_rate_multioccupancy sweep; the session-instability pattern turned out to be far more common than round 9 suggested (3 of 34 → now 8 of 43)

Final batch of the `room_rate_multioccupancy` cluster sweep. **Descriptors
— all confirmed `kind: meta`, `mapping_mode: room_rate_multioccupancy`,
`property_mapping: single`.** Two flagged:
- **OpenChannel** has a genuinely new field, `endpoint` (title "API
  Endpoint") — but it's plain `type: "string"`, nothing new for the
  renderer to handle; confirmed live it renders and behaves like any other
  text field.
- **WeSpeak** has `rate_params: null` — the second adapter after More.com
  with no rate-mapping capability at all — same `params` shape as
  More.com too (`email`, `send_email_notifications`, `request_credit_card`
  hidden field). Confirmed live: settings step shows only "Send Property
  Notification", no hotel field.

**Test-connection — initial pass, 5–6 calls each:** 9/9 consistently
returned `success:false` in the first raw-API batch — no leniency
detected on the first read for any of them. **The picture changed
substantially once the browser click-through pass began minutes later**
(see below).

**The session-instability pattern (Hipcamp round 5, Guirez round 9) is
now confirmed FAR more widespread than previously understood — 4 more
adapters drifted mid-round:**
- **Padelbound, RukiyeZara, and Tripnera** all initially read as
  genuinely validating (consistent `invalid_credentials` across the
  5-call raw-API batch), then showed **"✓ Connection verified."** for a
  fake credential minutes later in the live browser — each investigated
  immediately per the established Hipcamp/Guirez precedent: re-running
  the exact value that had failed 5/5 or 6/6 times earlier now
  consistently succeeds, while an empty string still correctly fails.
  Genuine, reproducible mid-session drift, not one-off flakiness or
  value-dependence.
- **A systemic sanity check, not just adapter-by-adapter**: re-tested
  Booking.com and Expedia (both long-established, repeatedly-confirmed
  "genuinely validates" adapters from round 1) at the same point in the
  session — **both still validate correctly**, ruling out a global,
  environment-wide shift affecting every adapter. **This drift is real but
  adapter-specific** — confined so far to a subset that, notably, all
  share very similar or identical descriptor shapes with each other (and
  with some adapters that DON'T drift), so shape still doesn't predict it
  either way.
- **A deliberate spaced re-test, per this round's specific instruction**:
  picked 3 adapters that read as stable on their first pass (OpenChannel,
  CTrip, WeSpeakOpen), did other work (regression checks, doc drafting)
  for several minutes, then re-ran their original fake value. **All three
  remained consistently `false`** — no further drift caught by this
  specific spaced check, but this doesn't rule out drift on a longer
  timescale or under different conditions; it's a reasonable spot-check,
  not exhaustive proof of stability.
- **Practical consequence for the mapping-fallback fix**: Padelbound,
  RukiyeZara, and Tripnera all correctly reached the mapping step once
  "verified" and all three showed the manual-entry fallback (their
  `mapping_details` all return clean `422`s, not the empty-rooms shape) —
  confirmed live, no dead end for any of them.
- **WeSpeak — same `implementation_not_defined` pattern as Goibibo**:
  consistently `false` across all calls (initial batch, no drift
  observed), regardless of input. Combined with its `rate_params: null`,
  it's doubly blocked — even if Test Connection somehow passed, there's no
  rate-mapping step to reach anyway.
- **The remaining 5 — OpenChannel, Revenatium, CTrip, WebBeds,
  WeSpeakOpen — stayed consistently genuine throughout** (initial batch
  and, for 3 of them, the deliberate spaced re-test too).

**Detail-call test, one call each with fake settings:**
- **7 return clean `422`** (OpenChannel, Padelbound, Revenatium,
  RukiyeZara, Tripnera, WeSpeakOpen, and CTrip's `422` with a `null`
  `errors` body — an unusual shape but still a clean non-`5xx`, handled
  correctly regardless since the owner route only cares whether the call
  threw, not the exact error body). **WebBeds returns a `422` with a
  nested `{success, warnings, errors}` nested object** — another unusual
  shape, same conclusion: still a clean `422`, generically handled. **No
  queue-contention risk for any of these 8.**
- **WeSpeak's `mapping_details` returns a real `500`** — but since
  `rate_params: null` blocks the mapping step from ever being reached
  (same as More.com), this is functionally moot; not re-tested through
  the owner route for the queue-fix specifically, since the code path that
  would call it is unreachable via the actual wizard regardless of this
  fix.

**OBP status, noted in passing:** all 9 expose `pricing_type` with
`options: ["Standard","OBP"]` except CTrip, whose `pricing_type` is a
plain string (Expedia/Agoda/Ostrovok/Goibibo-family shape) and WeSpeak,
which has no `rate_params` at all.

**Adapter-specific copy — none needed**, consistent with every prior
round.

**Regression check:** no code was changed this pass. Channel Manager and
the Super Admin debug page (57 adapters, stable) both re-confirmed correct
after the click-throughs above.

**Verdict for each, plainly:**
- **OpenChannel, Revenatium, CTrip, WebBeds, WeSpeakOpen**: **ready to use
  as-is via the generic form.** Genuinely, consistently validate
  (including a deliberate spaced re-check for 3 of these 5); no queue
  risk.
- **Padelbound, RukiyeZara, Tripnera**: **ready to use as-is via the
  generic form**, mechanically sound (mapping fallback confirmed live, no
  dead end, no queue risk) — but flagged with the **session-instability
  caveat**, same as Hipcamp/Guirez: don't trust a clean read as proof
  these will behave consistently for a real owner.
- **WeSpeak**: **blocked, not a NestBook bug** — same as More.com
  (`rate_params: null`, no rate-mapping capability) AND same as Goibibo
  (`test_connection` never functional on staging, `implementation_not_
  defined` regardless of input). Doubly blocked by two independent,
  already-understood Channex-side limitations.

---

## FULL `room_rate_multioccupancy` SWEEP — COMPLETE (2026-09-17). 43 of
**~46 candidate adapters tested across 10 rounds** (3 excluded up front as
wrong `mapping_mode`/OAuth: AirBNB and HopperHomes are `listing`,
GoogleHotelARI/Hopper/HotelPoint/OpenShopping/Reserva are `direct`,
AscendTravel/Yatra are `tree` — none in the `room_rate_multioccupancy`
cluster this sweep targeted).

**Final tallies (43 adapters, carefully recounted from every round's
verdict — see the full per-adapter list below, not just a running total
carried forward):**
- **29 genuinely well-behaved, ready to use as-is, no caveats**:
  Booking.com, Expedia, Julian Alps Booking, GuruHotel, GlampingHub,
  Stayinto, BookDirectOpen, ZenithBookingEngine, OutReserve, RoomPanda,
  SelahComfort, Novoya, HotelTrader, Travia, Crewdogs, RevChill, Levart,
  CakrahubBookingEngine, DolceBot, Ostrovok, Gopaddi, GrevonAI, HLCPlus,
  JoodBooking, OpenChannel, Revenatium, CTrip, WebBeds, WeSpeakOpen.
  (Hostelworld is deliberately NOT in this list — see "open question"
  below; it's ready for the common path but carries its own unresolved
  caveat, kept separate rather than folded into "no caveats.")
- **10 ready to use, but with a Test-Connection-isn't-trustworthy
  caveat** — treat all of these the same way regardless of sub-type:
  don't rely on a clean Test Connection result as proof of anything.
  - *Persistently lenient* (4): HotelREZ, Wigwam Holidays, OneHotelRez,
    Heytrip.
  - *Session-drift, confirmed via investigation not assumed* (5): Hipcamp,
    Guirez, Padelbound, RukiyeZara, Tripnera.
  - *Milder variant* (1): Agoda — a real but wrong `test_connection` error
    string from the original CA-7 pass, not leniency, but still not a
    fully trustworthy signal.
- **3 cleanly blocked by Channex-side limitations, not NestBook bugs**:
  More.com and WeSpeak (`rate_params: null`, no rate-mapping capability at
  all — WeSpeak is also doubly blocked by the next point); Goibibo and
  WeSpeak (`test_connection` never functional on staging,
  `implementation_not_defined` regardless of input).
- **1 open question, not yet resolved**: Hostelworld — ready for the
  common path (genuinely validates, no queue risk), but its `rate_params`
  includes an unhandled `type` key that CA-4's generic create-payload
  builder doesn't collect or send. Flagged in round 3, never followed up
  since it needs a real Hostelworld credential to test meaningfully.
  29 + 10 + 3 + 1 = **43**, matching the total tested.
- **2 real bugs found this sweep, both fixed as their own focused steps,
  both now confirmed protecting multiple adapters**: the `channexQueue`
  retry-blocking risk (confirmed protecting 4 adapters whose detail calls
  genuinely `5xx`: Agoda, Hostelworld, MoreCom, Goibibo — and by
  construction protects every other adapter sharing
  `getConnectionDetails()`/`getMappingDetails()`, whether or not they
  happened to `5xx` during testing), and the mapping-fallback dead end
  (confirmed protecting 6 adapters whose `mapping_details` returned an
  empty-rooms-but-`available:true` shape or were reachable via a
  false-positive Test Connection: Wigwam Holidays, OneHotelRez, Heytrip,
  Padelbound, RukiyeZara, Tripnera).
- **1 genuinely new finding from this sweep, not a bug but worth carrying
  forward**: the session-instability pattern itself. **5 of 43 tested
  adapters (≈12%)** — Hipcamp (round 5), Guirez (round 9), Padelbound,
  RukiyeZara, and Tripnera (round 10) — showed Test Connection behavior
  that changed within a single session, independent of the exact
  credential value entered. Confirmed via investigation (repeat calls,
  spaced re-tests, a cross-check against known-stable Booking.com/Expedia
  to rule out a global environment shift) rather than assumed. Common
  enough across this sweep (roughly 1 in 8–9 adapters) that it should be
  treated as an expected category of Channex sandbox behavior for a
  meaningful minority of adapters, not a rare fluke — worth remembering if
  this integration is ever extended to adapters beyond what CA-7 already
  tested.

**What was never resolved, by design, per every round's instruction**: the
OBP/occupancy-based-pricing branch remains exactly as unverified as CA-4
left it — no round in this sweep attempted to force that resolution, since
doing so needs a real, live OBP-configured channel that doesn't exist in
this environment.

---

## CA-7 round 9 (first half of the remaining 19: CakrahubBookingEngine, DolceBot, Ostrovok, Gopaddi, GrevonAI, Guirez, Heytrip, HLCPlus, JoodBooking, Goibibo) — DONE (2026-09-17) — 10 adapters, mostly ready; one genuinely blocked (Goibibo), one newly-discovered session-inconsistent adapter (Guirez, joining Hipcamp), two exercise the mapping-fallback fix live (Heytrip, Ostrovok)

Streamlined pass through the first 9–10 of the 19 remaining untested
`room_rate_multioccupancy` adapters (no selection reasoning this round,
per instruction — worked through the list in order). This round surfaced
more genuinely new findings than several recent rounds combined.

**1. Descriptors — all confirmed `kind: meta`, `mapping_mode:
room_rate_multioccupancy`, `property_mapping: single`. Two flagged as
genuinely unusual, not deep-dived beyond confirming they're still handled
correctly:**
- **Ostrovok** uses `hotel_id` (not `hotel_code`) and a plain-`string`
  `pricing_type` (not a `select`) — the Expedia/Agoda shape, not the
  HotelREZ-family shape most of this batch shares. Nothing new for the
  code to handle (both variants already proven), just a different
  combination than its neighbors.
- **Goibibo** (title "Make My Trip") has by far the richest descriptor
  seen across all 9 CA-7 rounds: `hotel_id`, `access_token` (password),
  `send_email_notifications`, `booking_amount_settings` (select), and
  **two independent conditional toggle pairs** (`sync_b2b_rate_type` →
  reveals `b2b_rate_type_modifier`; `sync_my_biz_rate_type` → reveals
  `my_biz_rate_type_modifier`) — the first adapter with more than one
  such pair. Confirmed live in the browser: both modifiers correctly
  hidden by default, and toggling `Sync B2B Rate Type` on correctly reveals
  only `B2B Rate Type Modifier (%)` while `MyBiz Rate Type Modifier (%)`
  stays hidden — the two rules operate independently, not entangled. No
  code change needed; existing `isFieldHidden`/`buildSettingsPayload`
  logic already generalizes correctly to N independent pairs, now proven
  live for N=2, not just N=1.

**2, 3. Test-connection behavior, 5–6 calls each:**
- **7 of 10 genuinely, consistently validate** (empty + fake all
  `invalid_credentials`): CakrahubBookingEngine, DolceBot, Ostrovok,
  Gopaddi, GrevonAI, HLCPlus, JoodBooking. Reproduced live for all 7 —
  clean fail within ~2–3s each (one HLCPlus click hit a one-off
  `testOutcome: 'error'`, not reproducible on immediate retry — logged
  nothing server-side, most likely transient noise from this session
  being paused/resumed mid-round, not a real finding — confirmed clean on
  retry).
- **Heytrip is lenient** — `success:true` for any non-empty value, `false`
  only for empty — same class as HotelREZ/Wigwam/OneHotelRez/Hipcamp.
  Confirmed live: fake input → "✓ Connection verified." for a value that
  isn't real.
- **Guirez — a second adapter now shown to be genuinely
  session-inconsistent, joining Hipcamp (round 5):** an early raw-API
  check (6 calls: empty + 5 identical fake) returned consistent
  `invalid_credentials` — looked like a well-behaved adapter. A later
  browser click-through with the same class of fake value showed **"✓
  Connection verified."** Investigated immediately per the Hipcamp
  precedent rather than trusting either read: re-ran the *exact* fake
  value that had earlier failed 6/6 times — now succeeded 6/6 times, and
  alternating between two different fake values plus new ones (`abc`,
  `123`, a 50-char string) all returned `success:true`, while an empty
  string still correctly returned `false` throughout. **Guirez's
  `test_connection` genuinely changes behavior over the course of a
  session** — not value-dependent, not simple one-off flakiness, but a
  real, reproducible shift from "validates" to "lenient" with no code
  change on our side. This is now a confirmed pattern across 2 of 26
  tested adapters — worth treating as its own caveat category going
  forward (distinct from "always lenient" and "genuinely validates"):
  **"observed to be unstable — don't trust a single session's read even
  if it looked clean."**
- **Goibibo — always `false`, with `errors: "implementation_not_defined"`,
  regardless of input** (6/6 calls, empty and fake alike). Unlike every
  leniency case above, this isn't a false-positive risk — it's the
  opposite problem: **Test Connection can never succeed for this adapter
  on Channex's staging sandbox, even with hypothetically correct
  credentials**, because the check itself isn't implemented. Confirmed
  live: the real form correctly shows "We couldn't verify these
  details…" and never lets the owner past this step, no matter what they
  enter.

**Detail-call test, one call each with fake settings — the two
already-fixed patterns:**
- **7 return clean `422`/`400`** (Cakrahub, DolceBot, Gopaddi, GrevonAI,
  HLCPlus, JoodBooking, and Guirez's current-session state) — no
  queue-contention risk.
- **Ostrovok and Heytrip both return `200` with `available:true` and an
  empty `rooms: []`** — the exact dead-end shape the CA-7-round-2 fix
  targets. **Heytrip's fix confirmed live end-to-end**: since it's
  lenient, a fake credential genuinely reaches the mapping step in the
  real browser, which correctly shows the manual-entry fallback, not an
  empty dropdown. **Ostrovok's fix is confirmed by the same code path**
  but not click-through-demonstrated the same way, since Ostrovok
  genuinely validates and correctly blocks the mapping step from ever
  being reached with fake input (confirmed via a disabled `Continue`) —
  same treatment as every other well-behaved adapter whose fallback case
  could only be reached via a raw API call, not the live UI.
- **Goibibo's `connection_details` and `mapping_details` BOTH return real
  `500`s** — a genuine queue-contention test case. **Confirmed live
  through the real owner-facing route that the CA-7 queue fix protects
  it**: `connection-details` resolved in **0.47s**, `mapping-details` in
  **1.6s**, both returning `{"available":false}` — zero `[channex-queue]`
  retry lines anywhere in the server log for the whole session. The fix
  holds for a 6th confirmed adapter (after Agoda, Hostelworld, MoreCom
  from earlier rounds).

**4. OBP status, noted in passing:** all 10 expose `pricing_type` with
`options: ["Standard","OBP"]` except Ostrovok and Goibibo, whose
`pricing_type` is a plain string (matching the Expedia/Agoda-family
shape) — consistent with what that shape has always meant (no OBP toggle
renders, `Standard` is sent by default).

**5. Adapter-specific copy — none needed**, consistent with every prior
round.

**Regression check:** no code was changed this pass. Channel Manager and
the Super Admin debug page (57 adapters, stable) both re-confirmed correct
after the click-throughs above; no channel data left behind (no create
attempts this round).

**Verdict for each, plainly:**
- **CakrahubBookingEngine, DolceBot, Gopaddi, GrevonAI, HLCPlus,
  JoodBooking**: **ready to use as-is via the generic form.** Genuinely,
  consistently validate; no queue risk.
- **Ostrovok**: **ready to use as-is via the generic form.** Genuinely
  validates; uses the Expedia/Agoda-family shape (`hotel_id`, string
  `pricing_type`); its empty-rooms mapping shape is protected by the
  already-fixed `hasOtaRooms` logic (confirmed by code path, not a live
  click-through, since it correctly blocks fake credentials before
  reaching that step).
- **Heytrip**: **ready to use as-is via the generic form**, with the known
  Test-Connection-isn't-trustworthy caveat (leniency) — AND its
  empty-rooms mapping-fallback protection confirmed live end-to-end, one
  of the few adapters where both fixed-bug patterns were directly
  demonstrated together in one real click-through.
- **Guirez**: **ready to use as-is via the generic form** — mechanically
  sound (mapping fallback engages correctly, no dead end, no queue risk)
  — but flagged with a **new caveat**: its Test Connection result has
  been directly observed to change within a single session, independent
  of the value entered. Treat it like Hipcamp — don't trust a clean read
  as proof the adapter will behave the same way for a real owner later.
- **Goibibo**: **blocked/unclear, not a NestBook bug.** Test Connection
  cannot succeed on Channex's staging sandbox regardless of input
  correctness (`implementation_not_defined`) — an owner can never get
  past this step for real. Everything downstream that COULD be tested
  (the rich settings form, two independent hidden-field rules, the
  queue-contention fix on its 500-ing detail calls) works correctly; the
  adapter itself is simply not functional to validate against in this
  environment.

**Running total across all CA-7 enablement work (34 adapters tested
across 9 rounds):** 24 genuinely well-behaved and ready with no caveats;
7 ready with a known caveat (5 with the leniency/Test-Connection-isn't-
trustworthy pattern — HotelREZ, Wigwam Holidays, OneHotelRez, Hipcamp,
Heytrip — plus Agoda's milder version; 2 with the newly-named
session-instability pattern — Hipcamp, Guirez, which also carry the
leniency label since that's what's been observed in-session); 2 cleanly
blocked, not bugs (More.com — no rate-mapping shape; Goibibo — Test
Connection non-functional on staging); 1 open question carried forward
(Hostelworld's unhandled `type` rate_param); 2 real bugs found and fixed
as their own focused steps (queue-contention, now confirmed on 6
adapters; mapping-fallback, now confirmed on 4 — Wigwam Holidays,
OneHotelRez, Heytrip, and by code-path for Ostrovok). **9 `room_rate_
multioccupancy` adapters remain untested**: OpenChannel, Padelbound,
Revenatium, RukiyeZara, CTrip, Tripnera, WebBeds, WeSpeak, WeSpeakOpen —
carried over plainly for the next round.

---

## CA-7 round 8 (Crewdogs, RevChill, Levart) — DONE (2026-09-17) — all 3 usable and genuinely trustworthy; honestly weak-signal picks, as expected with strong-signal names now exhausted

Enablement checklist for 3 more `room_rate_multioccupancy` adapters. Per
instruction, pulled the full live catalog fresh and cross-referenced
against all 21 previously-tested adapters before picking, since
strong-signal names are largely gone. **22 untested `room_rate_
multioccupancy` adapters remained**: CakrahubBookingEngine, Crewdogs,
DolceBot, Ostrovok, Gopaddi, GrevonAI, Guirez, Heytrip, HLCPlus,
JoodBooking, Levart, Goibibo, OpenChannel, Padelbound, RevChill,
Revenatium, RukiyeZara, CTrip, Tripnera, WebBeds, WeSpeak, WeSpeakOpen.

**Picks and why, honestly weaker signal this round, as instructed:**
- **Crewdogs** — moderate confidence, the strongest of the three: airline-
  crew accommodation billeting is a real (if niche) secondary revenue
  channel some independent guesthouses near airports/transport hubs
  genuinely use — plausibly relevant to a subset of NestBook's market,
  not mainstream leisure guests.
- **RevChill** — low confidence: "Rev" (revenue) + "Chill" (leisure)
  vaguely suggests revenue-conscious leisure branding — the closest
  remaining lodging-adjacent-sounding name after Crewdogs.
- **Levart** — lowest confidence, picked essentially because it was
  untested and no other remaining name carried a stronger signal (same
  honest reasoning as round 7's Novoya pick, which was chosen for being
  new rather than for market fit) — no real signal from the name itself.

**1. Live adapter descriptors:** all three confirmed `kind: meta`,
`mapping_mode: room_rate_multioccupancy`, `property_mapping: single`,
sharing the by-now-familiar shape. RevChill and Levart both add `api_key`
(password), same combination as GuruHotel/ZenithBookingEngine/Novoya;
RevChill also has `min_stay_type` (select), same as Expedia/Hostelworld.
No new field types or shapes this round.

**2, 3. Live test-connection / detail-call behavior, with the repeat-call
discipline (6 calls each: empty + 5 fake):**

- **All three consistently, genuinely validate** — every one of the 18
  total calls across the three adapters returned a clean
  `invalid_credentials` at `200`, no flakiness, no leniency. Reproduced
  live in the browser for all three: fake input → "We couldn't verify
  these details…" within ~2s each, matching the raw-API behavior exactly
  (RevChill's and Levart's password-type API Key field both rendered and
  behaved correctly, consistent with GuruHotel/Novoya).
- `connection_details`/`mapping_details` for all three return clean
  `400`/`422` (never `5xx`) — **no queue-contention risk exists for any of
  the three**.

**4. Both fixed-bug patterns:** neither directly re-testable this round —
same situation as every other round's well-behaved adapters: all three
correctly block fake credentials before the mapping step is reachable,
and none returned a `5xx`. Noted plainly, not assumed covered.

**5. OBP status, noted per instruction:** all three expose `pricing_type:
{options: ["Standard","OBP"]}` — OBP-capable, consistent with the shared-
shape family.

**6. Adapter-specific copy — none needed**, same as every prior round.

**Regression check:** no code was changed this pass. Channel Manager and
the Super Admin debug page (57 adapters, stable) both re-confirmed
correct after the click-throughs above.

**Verdict for each, plainly:**
- **Crewdogs**: **ready to use as-is via the generic form.** Genuinely,
  consistently validates (6/6 calls); Test Connection is trustworthy; no
  queue risk. Plausible niche relevance (airline-crew billeting) for a
  subset of independent properties, not mainstream leisure guests.
- **RevChill**: **ready to use as-is via the generic form**, same
  reasoning as Crewdogs. Low-confidence market-relevance pick, technically
  sound regardless.
- **Levart**: **ready to use as-is via the generic form**, same
  reasoning — picked with no real market-fit signal, purely to exercise
  another untested adapter.

**Running total across all CA-7 enablement work (24 adapters tested
across 8 rounds):** 18 genuinely well-behaved and ready with no caveats;
5 ready with the known Test-Connection-isn't-trustworthy Channex-side
caveat (HotelREZ, Wigwam Holidays, OneHotelRez, Hipcamp, Agoda); 1 cleanly
blocked by an existing safeguard, not a bug (More.com); 1 open question
carried forward (Hostelworld's unhandled `type` rate_param); 2 real bugs
found and fixed as their own focused steps (queue-contention,
mapping-fallback), both confirmed protecting every adapter tested since.
**19 `room_rate_multioccupancy` adapters remain untested**:
CakrahubBookingEngine, DolceBot, Ostrovok, Gopaddi, GrevonAI, Guirez,
Heytrip, HLCPlus, JoodBooking, Goibibo, OpenChannel, Padelbound,
Revenatium, RukiyeZara, CTrip, Tripnera, WebBeds, WeSpeak, WeSpeakOpen —
all genuinely weak-signal by name (regional mismatches, likely wholesale/
B2B, or simply opaque), noted honestly for whenever the next round picks
up.

---

## CA-7 round 7 (Novoya, HotelTrader, Travia) — DONE (2026-09-17) — all 3 usable and genuinely trustworthy; caught a new adapter added to Channex's own catalog since round 6; confirmed the generic form handles the sparsest params shape seen yet

Enablement checklist for 3 more `room_rate_multioccupancy` adapters,
self-picked directly from the live catalog. **Picks and why**, reasoned
from name/code alone:
- **Novoya** — genuinely new: re-fetched the live catalog's full code list
  before picking and diffed it against round 3's fully-enumerated 56-code
  list (the last time every code was captured in full, during the
  HRS/Splendia/Weekendesk non-existence check) — `Novoya` is not in that
  list. Round 5 first noticed the adapter *count* had grown to 57 without
  identifying which code was new; this round's full re-fetch confirms it's
  `Novoya` — Channex added it to their catalog sometime between sessions.
  Picked precisely because it's previously-unseen territory, not for a
  confident market-fit signal (the name gives none).
- **HotelTrader** — "Hotel" relevance, generic marketplace/distribution
  naming plausible for independent hotels; previously passed over in
  earlier rounds in favor of stronger-signal names, picked now that the
  clearer options are exhausted.
- **Travia** — "Trav" (travel)-prefixed, the best remaining generic-but-
  plausible signal among untested adapters.

**1. Live adapter descriptors:** all three confirmed `kind: meta`,
`mapping_mode: room_rate_multioccupancy`, `property_mapping: single`.
Novoya and HotelTrader share the familiar shape exactly (Novoya adds
`api_key`/password, same combination as GuruHotel/ZenithBookingEngine).
**Travia's `params` is the sparsest seen yet — literally only `hotel_code`,
no `email`, no `send_email_notifications` at all** (every other adapter
tested across all 7 rounds has had at least those two). Confirmed live
this renders correctly: the settings step shows just the one "Hotel Code"
field, no missing-field layout issues, no crash — the generic form
degrades gracefully to a single-field form exactly as cleanly as it
handles Booking.com's 5-field one.

**2, 3. Live test-connection / detail-call behavior, with the repeat-call
discipline (5–6 calls each, not 1):**

- **All three consistently, genuinely validate** — confirmed via an empty
  call plus 5 repeat calls with an identical nonsense payload each (6
  total per adapter): every single call across all three returned a clean
  `invalid_credentials` at `200` — no flakiness (unlike round 5's Hipcamp
  surprise), no leniency (unlike HotelREZ/Wigwam/OneHotelRez/Hipcamp).
  Reproduced live in the browser for all three: fake input → "We couldn't
  verify these details…" within ~2s each, matching the raw-API behavior
  exactly, including Travia's single-field form.
- `connection_details`/`mapping_details` for all three return clean
  `400`/`422` (never `5xx`) — **no queue-contention risk exists for any of
  the three**.

**4. Both fixed-bug patterns:** neither directly re-testable this round —
same situation as rounds 3, 5, and 6's well-behaved adapters: all three
correctly block fake credentials before the mapping step is reachable,
and none returned a `5xx`. Noted plainly, not assumed covered.

**5. OBP status, noted per instruction:** all three expose `pricing_type:
{options: ["Standard","OBP"]}` — OBP-capable, consistent with the shared-
shape family.

**6. Adapter-specific copy — none needed**, same as every prior round.

**Regression check:** no code was changed this pass. Channel Manager and
the Super Admin debug page (57 adapters, stable) both re-confirmed
correct after the click-throughs above.

**Verdict for each, plainly:**
- **Novoya**: **ready to use as-is via the generic form.** Genuinely,
  consistently validates (6/6 calls); Test Connection is trustworthy; no
  queue risk. No confirmed market-relevance signal from its name — tested
  purely because it's new to the catalog.
- **HotelTrader**: **ready to use as-is via the generic form**, same
  reasoning as Novoya.
- **Travia**: **ready to use as-is via the generic form**, same
  reasoning — plus confirms the generic settings-form renderer handles a
  single-field adapter cleanly, the sparsest shape exercised across all 7
  rounds.

**Running total across all CA-7 enablement work (21 adapters tested
across 7 rounds):** 15 genuinely well-behaved and ready with no caveats
(adding Novoya, HotelTrader, Travia to round 6's tally); 5 ready with the
known Test-Connection-isn't-trustworthy Channex-side caveat (HotelREZ,
Wigwam Holidays, OneHotelRez, Hipcamp, Agoda); 1 cleanly blocked by an
existing safeguard, not a bug (More.com); 1 open question carried forward
(Hostelworld's unhandled `type` rate_param); 2 real bugs found and fixed
as their own focused steps (queue-contention, mapping-fallback), both
confirmed protecting every adapter tested since.

---

## CA-7 round 6 (OutReserve, RoomPanda, SelahComfort) — DONE (2026-09-16) — final batch of the day; all 3 usable and genuinely trustworthy; one new field type (`switch`) confirmed already handled correctly

Enablement checklist for 3 more `room_rate_multioccupancy` adapters,
self-picked directly from the live catalog, closing out today's CA-7
enablement work. **Picks and why**, reasoned from name/code alone:
- **OutReserve** — "Out" (outdoor) + "Reserve" continues the self-
  catering/outdoor-stay thread already confirmed relevant via GlampingHub/
  Hipcamp.
- **RoomPanda** — "Room" directly signals accommodation relevance, the
  most literally lodging-related remaining name in the catalog at the
  time of picking.
- **SelahComfort** — "Comfort" evokes small/independent hotel branding
  (mid-scale "Comfort"-style naming); a reasonable, if generic, pick among
  what remained untested.

**1. Live adapter descriptors:** all three confirmed `kind: meta`,
`mapping_mode: room_rate_multioccupancy`, `property_mapping: single`,
sharing the by-now-familiar shape. **RoomPanda introduces a genuinely new
field-type combination**: its `min_stay_type` field is `type: "switch"`
(Expedia/Hostelworld's equivalent field is `type: "select"`) — the first
live adapter encountered using `switch` for anything other than the
`AdapterField` renderer's already-documented (but never-yet-exercised)
`switch` case. Confirmed live: `AdapterField`'s `case 'select': case
'switch':` already renders both identically (a dropdown built from
`field.options`) — no code change needed, this is the first live
confirmation that branch actually fires correctly, not just a plausible
reading of the source.

**2, 3. Live test-connection / detail-call behavior, with the new
repeat-call discipline from round 5's Hipcamp surprise:**

- **All three adapters consistently, genuinely validate — confirmed via 5
  calls each, not 1**: an empty `hotel_code` plus 4 repeat calls with an
  identical nonsense value, every single call across all three adapters
  returned a clean `invalid_credentials` at `200` — no flakiness, no
  leniency, unlike Hipcamp/HotelREZ/Wigwam/OneHotelRez. Reproduced live in
  the browser for all three: fake Hotel Code → "We couldn't verify these
  details…" within ~2s each, matching the raw-API behavior exactly.
  RoomPanda's settings step also correctly rendered its `switch`-typed
  "Min Stay Type" field as a working Arrival/Through dropdown before the
  test.
- `connection_details`/`mapping_details` for all three return clean
  `400`/`422` (never `5xx`) — **no queue-contention risk exists for any of
  the three**.

**4. Both fixed-bug patterns:** neither was directly re-testable this
round — all three adapters correctly block fake credentials before the
mapping step is ever reachable (same as every other genuinely-validating
adapter across CA-7), and none returned a `5xx` to test the queue fix
against. Noted plainly, not assumed covered — consistent with how rounds
3–5 handled the same situation for well-behaved adapters.

**5. OBP status, noted per instruction:** all three expose `pricing_type:
{options: ["Standard","OBP"]}` — OBP-capable, consistent with the whole
shared-shape family.

**6. Adapter-specific copy — none needed**, same as every prior round.

**Regression check:** no code was changed this pass. Channel Manager and
the Super Admin debug page (57 adapters, stable since round 5's catalog
change) both re-confirmed correct after the click-throughs above.

**Verdict for each, plainly:**
- **OutReserve**: **ready to use as-is via the generic form.** Genuinely,
  consistently validates (5/5 calls); Test Connection is trustworthy; no
  queue risk.
- **RoomPanda**: **ready to use as-is via the generic form**, same
  reasoning as OutReserve — plus confirms the `switch` field type renders
  and behaves correctly, the first live adapter to exercise that code
  path.
- **SelahComfort**: **ready to use as-is via the generic form**, same
  reasoning as OutReserve.

**Summary across all of today's CA-7 enablement work (18 adapters tested
across 6 rounds, plus the 2 bugs found and fixed along the way):**
genuinely well-behaved and ready: Booking.com, Expedia, Hostelworld,
Julian Alps Booking, GuruHotel, GlampingHub, Stayinto, BookDirectOpen,
ZenithBookingEngine, OutReserve, RoomPanda, SelahComfort (12 adapters).
Ready but with the "Test Connection isn't trustworthy" Channex-side
caveat: HotelREZ, Wigwam Holidays, OneHotelRez, Hipcamp, Agoda (5
adapters — Agoda's caveat is a milder version, a real but wrong
`test_connection` result rather than pure leniency, from the original
CA-7 pass). Cleanly blocked by existing safeguards, not a bug: More.com
(`rate_params: null`). Genuinely unresolved/needs investigation:
Hostelworld's unhandled `type` rate_param (flagged in round 3, not yet
followed up). Two real bugs found and fixed as their own focused steps:
the `channexQueue` retry-blocking risk (protects every adapter tested
since, confirmed live on Agoda, Hostelworld, MoreCom) and the
mapping-fallback dead end (protects every adapter tested since, confirmed
live on Wigwam Holidays and independently on OneHotelRez).

---

## CA-7 round 5 (Hipcamp, BookDirectOpen, ZenithBookingEngine) — DONE (2026-09-16) — all 3 usable; one adapter (Hipcamp) gave a genuinely inconsistent first reading, resolved by repeat-testing rather than trusted on a single call — a methodology note worth carrying into future rounds

Enablement checklist for 3 more `room_rate_multioccupancy` adapters,
self-picked directly from Channex's live catalog again. **Picks and why**,
reasoned from name/code alone:
- **Hipcamp** — camping/outdoor accommodation, same self-catering/
  alternative-stay genre already confirmed relevant via GlampingHub.
- **BookDirectOpen** — "direct booking, open" naming suggests relevance to
  independent properties' direct-booking strategy, a real, meaningful
  interest for small operators trying to reduce OTA commission dependency.
- **ZenithBookingEngine** — "booking engine" naming, similar direct-
  booking-engine angle to BookDirectOpen — flagged upfront as the weaker,
  more speculative pick of the three, since "booking engine" products
  sometimes represent a property's own site rather than a genuine
  demand-generating OTA (checked this nuance live, see below).

**1. Live adapter descriptors:** all three confirmed `kind: meta`,
`mapping_mode: room_rate_multioccupancy`, `property_mapping: single`,
sharing the now-familiar shared shape (`hotel_code`,
`send_email_notifications`, hidden-by-rule `email`; `rate_params`:
`readonly`, `occupancy`, `rate_plan_code`, `room_type_code`,
`pricing_type` [select, `Standard`/`OBP`], `primary_occ`) — now confirmed
common across at least 10 of the catalog's adapters. ZenithBookingEngine
additionally has `api_key` (`type: password`), same combination as
GuruHotel — confirmed live the password field renders correctly a second
time. On `ZenithBookingEngine`'s "own booking engine vs. real OTA" concern
specifically: its descriptor carries no signal either way (`actions: []`,
same generic shape as every other adapter here) — genuinely can't be
resolved from the descriptor alone, noted as unresolved rather than
guessed.

**2, 3. Live test-connection / detail-call behavior — through CA-4's real
owner-facing routes and a live browser click-through — and a genuine
methodology finding along the way:**

- **BookDirectOpen and ZenithBookingEngine: consistently, genuinely
  validate.** Confirmed via 4 repeat raw-API calls each with the identical
  fake payload (not just one call) — every call cleanly returned
  `invalid_credentials` at `200`, never a false positive. Reproduced live
  in the browser for both: fake input → "We couldn't verify these
  details…" within ~2s, matching the raw-API behavior exactly.
- **Hipcamp — a real, worth-flagging inconsistency, resolved by
  re-testing rather than trusted on the first read:** the FIRST raw-API
  call (as part of the initial 3-adapter batch) returned a clean
  `success:false, errors:"invalid_credentials"` for a nonsense
  `hotel_code` — suggesting genuine validation, like GlampingHub/
  BookDirectOpen/ZenithBookingEngine. But the live browser click-through
  immediately after (same session, same nonsense value in a fresh field)
  showed **"✓ Connection verified."** — contradicting that first read.
  Investigated rather than picked whichever result was more convenient:
  called `test_connection` **6 more times in a row with the exact same
  payload** — all 6 returned `success:true`; a follow-up empty-string call
  still correctly returned `success:false`. **Conclusion: Hipcamp's real,
  reproducible steady-state behavior is the same Channex-side leniency
  as HotelREZ/Wigwam Holidays/OneHotelRez** (empty fails, anything else
  "succeeds") — the one contradictory read was very likely a genuine,
  one-off Channex-side transient blip (not reproducible, not explained by
  a code change on NestBook's side — no files were touched between the two
  calls), not a real "flaky by design" adapter. **Re-tested
  BookDirectOpen/ZenithBookingEngine 4× each specifically because of this
  surprise**, to rule out the same pattern before trusting their
  single-call reads — both stayed perfectly consistent across all 4 calls.
  **Carrying this forward as a methodology note**: a single test call is
  usually enough, but a genuinely surprising or shape-inconsistent result
  is worth a quick repeat-call sanity check before being reported as fact
  — this is exactly how the discrepancy above was caught rather than
  silently misreported either way.

**4. Both fixed-bug patterns, re-checked where each adapter's actual
response shape allowed it:**
- **Queue-contention (any `5xx`)**: none of the three ever returned a
  `5xx` on detail calls (Hipcamp/BookDirectOpen/ZenithBookingEngine all
  return clean `400`/`422`) — **not re-demonstrated this round**, same
  honest gap as round 4, noted plainly rather than assumed still covered.
  Remains confirmed via CA-7's original Agoda/Hostelworld findings and
  round 3's More.com case.
- **Mapping-fallback (`hasOtaRooms`)**: Hipcamp's `connection_details`/
  `mapping_details` return `available:false` (clean `400`/`422`), so the
  already-proven `available:false` fallback path applies (not the
  empty-rooms-but-`available:true` shape specifically) — confirmed live:
  continuing past Hipcamp's false-positive Test Connection to the mapping
  step correctly shows the manual-entry fallback, not a dead end.
  BookDirectOpen/ZenithBookingEngine's genuine validation means their
  mapping step is never reachable with fake input (same as
  JulianAlpsBooking/GuruHotel/BookDirectOpen's well-behaved siblings) —
  not directly re-tested for the same reason those were skipped in round
  3.

**5. OBP status, noted per instruction:** all three expose `pricing_type:
{options: ["Standard","OBP"]}` — OBP-capable, consistent with the whole
shared-shape family.

**6. Adapter-specific copy — none needed**, same as every prior round.

**Regression check:** no code was changed this pass. Channel Manager and
the Super Admin debug page both re-confirmed correct after the
click-throughs above. **Unrelated observation, not a regression**: the
Super Admin debug page now reports **57 of 57 adapters** (was 56
throughout every earlier CA-7 round) — Channex's live catalog gained one
adapter between sessions, an external change on their side, not caused by
or related to anything in this codebase.

**Verdict for each, plainly:**
- **Hipcamp**: **ready to use as-is via the generic form.** Carries the
  same Test-Connection-isn't-trustworthy caveat as HotelREZ/Wigwam/
  OneHotelRez (confirmed, not assumed, via repeat testing after an
  initially contradictory read) — no dead end, no queue risk.
- **BookDirectOpen**: **ready to use as-is via the generic form.**
  Genuinely, consistently validates; Test Connection is trustworthy; no
  queue risk.
- **ZenithBookingEngine**: **ready to use as-is via the generic form**,
  same reasoning as BookDirectOpen. One open, honestly-unresolved
  question carried forward rather than guessed at: whether this adapter
  represents a genuine third-party demand channel or a property's own
  booking-engine integration — the descriptor gives no signal either way.

---

## CA-7 round 4 (GlampingHub, OneHotelRez, Stayinto) — DONE (2026-09-16) — self-picked directly from the real catalog; both fixed-bug patterns re-confirmed on independent adapters; all 3 usable, one with the same test_connection caveat as HotelREZ/Wigwam/OneHotelRez's siblings

Enablement checklist for 3 more `room_rate_multioccupancy` adapters,
**picked directly from Channex's live 56-adapter catalog this time**
(CA-7 round 3 found none of that round's named requests actually existed).
**Picks and why, reasoned from name/code alone, not assumed real-world
brand identity:**
- **GlampingHub** — name directly signals self-catering/alternative-stay
  accommodation, the strongest, most literal name-based match for
  NestBook's stated market of any adapter picked across all CA-7 rounds.
- **OneHotelRez** (`code`, title `1HotelRez`) — "hotel reservation"
  naming pattern, same logic as HotelREZ (already confirmed relevant and
  well-tested) — plausible small/independent-hotel distribution tool.
- **Stayinto** — lower-confidence pick, disclosed as such: "Stay"-prefixed
  branding suggests boutique/short-stay positioning; picked as the best
  remaining signal among the untested adapters, not a confident brand
  match.

**1. Live adapter descriptors:** all three confirmed `kind: meta`,
`mapping_mode: room_rate_multioccupancy`, `property_mapping: single`.
**All three share the exact same `params`/`rate_params` shape as
HotelREZ/Wigwam Holidays/Julian Alps Booking/GuruHotel** (`hotel_code`,
`send_email_notifications`, hidden-by-rule `email`; `rate_params`:
`readonly`, `occupancy`, `rate_plan_code`, `room_type_code`,
`pricing_type` [select, `Standard`/`OBP`], `primary_occ`) — this shared
descriptor shape is now confirmed common across at least 7 of the
catalog's ~56 adapters, reinforcing (not just repeating) CA-7 round 3's
finding that shape never predicts sandbox validation behavior on its own.

**2, 3, 4. Live test-connection / detail-call behavior, "does
test_connection genuinely validate," and both previously-fixed bug
patterns — through CA-4's real owner-facing routes and a live browser
click-through, tested independently per adapter, not inferred from the
shared shape:**

- **GlampingHub — genuinely validates, well-behaved.** `test_connection`
  cleanly fails for both an empty and a nonsense `hotel_code`
  (`invalid_credentials`, `200`). Reproduced live: fake Hotel Code →
  "We couldn't verify these details…" within ~2s (one click hit a
  transient `node --watch` dev-server restart mid-request, surfaced as a
  one-off `500`/`ECONNRESET` in the browser network log — confirmed as
  environment noise, not a real finding, by retrying immediately and
  getting the correct clean result). `connection_details`/
  `mapping_details` both return clean `400`/`422` (never `5xx`) — **no
  queue-contention risk exists for this adapter** (the retry-storm pattern
  only applies when Channex answers with a `5xx`).
- **OneHotelRez — reproduces BOTH previously-fixed bug shapes
  independently, both fixes confirmed still holding:**
  `test_connection` returns `success:true` for any non-empty
  `hotel_code` — the same Channex-side no-op behavior as HotelREZ/Wigwam
  Holidays, confirmed live in the real browser wizard ("✓ Connection
  verified." for a garbage Hotel Code). Its `mapping_details` independently
  returns `available:true` with an **empty `rooms: []`** array (the exact
  shape that caused the original dead-end bug for Wigwam Holidays) —
  **confirmed live that the `hasOtaRooms` fix correctly protects this
  independent adapter too**: continuing to the mapping step shows the
  manual-entry fallback ("We couldn't automatically fetch this channel's
  rooms — enter the codes manually…"), not an empty dead-end dropdown.
  This is the fix's third independent confirmation (Wigwam Holidays →
  fix built and verified; then re-verified generally in code review; now
  empirically reproduced and confirmed a second time on a completely
  unrelated adapter that happens to share the same failure shape). Its
  `connection_details` also returns `available:true` with `currency:
  null` — sparse-but-technically-successful data, rendered correctly
  (the currency banner simply doesn't show, since the render condition
  already checks for a real `currency` value, not just `available`).
- **Stayinto — genuinely validates, well-behaved,** same as GlampingHub:
  clean `invalid_credentials` on both empty and nonsense input, clean
  `400`/`422` on detail calls, no `5xx`, no queue-contention risk,
  reproduced live in the browser (fails within ~2s, correct copy).
- **No adapter this round happened to return a `5xx` from a bad-credential
  detail call**, so the queue-contention fix (item 3 of the checklist)
  wasn't re-demonstrated against a fresh `5xx` this round — it remains
  confirmed generally (CA-7's original Agoda/Hostelworld findings, and
  CA-7 round 3's More.com confirmation) rather than re-proven against a
  new case here. Noted plainly rather than silently assumed covered.

**5. OBP status, noted per instruction:** all three expose `pricing_type:
{options: ["Standard","OBP"]}` — OBP-capable, consistent with every
adapter sharing this descriptor shape so far.

**6. Adapter-specific copy — none needed:** same conclusion as every
prior CA-7 round.

**Regression check:** no code was changed this pass. Channel Manager's
Room Mapping/Online Travel Agents section and the Super Admin debug page
(56 adapters, CA-1/2/3 unaffected) both re-confirmed correct after the
click-throughs above; no stray local or remote channel data left behind
(only settings/test-connection calls were made this round, no
create attempts).

**Verdict for each, plainly:**
- **GlampingHub**: **ready to use as-is via the generic form.** Genuine
  validation, clean fast failures, no queue risk, OBP-capable but
  unresolved as expected. The strongest name-based market fit of any
  adapter picked across all CA-7 rounds.
- **OneHotelRez**: **ready to use as-is via the generic form** — both
  previously-fixed bugs confirmed protected, no dead end, no queue
  blocking. **Carries the same caveat as HotelREZ/Wigwam Holidays**:
  Test Connection is not a trustworthy signal on Channex's own sandbox for
  this adapter (any non-empty value "verifies"), so it can't be honestly
  presented to an owner as proof their credentials are correct — an
  external Channex-side limitation, not fixable here, now confirmed to
  affect at least 3 of the catalog's ~7 similarly-shaped adapters.
- **Stayinto**: **ready to use as-is via the generic form**, same
  reasoning as GlampingHub — genuine validation, no queue risk. Flagged,
  per instruction, as the round's lowest-confidence market-relevance pick;
  technically sound regardless of that uncertainty.

---

## CA-7 round 3 (MoreCom, Julian Alps Booking, GuruHotel — substituted for HRS/Splendia/Weekendesk) — DONE (2026-09-16) — none of the three requested adapters exist in Channex's catalog; one new "cleanly blocked" case found (not a bug), two adapters confirmed genuinely well-behaved

**None of HRS, Splendia, or Weekendesk exist in Channex's 56-adapter
catalog** — confirmed live via `GET /channels/list` against the full code
list (`OneHotelRez, Agoda, AirBNB, AscendTravel, Avis, BookDirectOpen,
BookingCom, Budget, CakrahubBookingEngine, Crewdogs, DolceBot, Ostrovok,
Europcar, Expedia, GlampingHub, GoogleHotelARI, Gopaddi, GrevonAI, Guirez,
GuruHotel, Hertz, Heytrip, Hipcamp, HLCPlus, Hopper, HopperHomes,
Hostelworld, HotelPoint, HotelRez, HotelTrader, JoodBooking,
JulianAlpsBooking, Levart, Goibibo, MoreCom, OpenChannel, OpenShopping,
OutReserve, Padelbound, Payless, Reserva, RevChill, Revenatium, RoomPanda,
RukiyeZara, SelahComfort, Stayinto, Travia, CTrip, Tripnera, WebBeds,
WeSpeak, WeSpeakOpen, WigwamHolidays, Yatra, ZenithBookingEngine` — none of
these codes or titles matches HRS, Splendia, or Weekendesk by name or
partial match). Per instruction, substituted — honestly, not forcing a
confident-sounding match where none exists:

- **More.com** (`code: MoreCom`) — a real, recognizable Mediterranean/
  Greek OTA for independent hotels, substituted for Splendia's
  "independent/boutique European hotels" niche.
- **Julian Alps Booking** (`code: JulianAlpsBooking`) — a real regional
  booking engine for the Julian Alps (Slovenia, bordering Austria) —
  **disclosed as an imperfect substitute**: it's Alpine leisure tourism,
  not HRS's actual corporate-travel-management specialty, but it's the
  closest genuinely-identifiable DACH-adjacent match in the catalog.
- **GuruHotel** — **disclosed as the lowest-confidence pick of the three**:
  after checking every remaining untested adapter's live `title` field for
  any recognizable French, DACH, or boutique-European signal, none carried
  one strongly enough to substitute confidently for Weekendesk's
  "French short-break specialist" niche. GuruHotel was included only to
  round out the requested count of 3, tested purely on its technical
  merits (a normal `room_rate_multioccupancy` adapter), not because of any
  confirmed market relevance — flagged explicitly rather than silently
  presented as a real match.

**1. Live adapter descriptors:**

- **More.com**: `kind: meta`, `mapping_mode: room_rate_multioccupancy`,
  `property_mapping: single` — matches the cluster. **But `rate_params` is
  literally `null`** — no rate-mapping shape at all, a genuinely new case
  not seen in any adapter enabled so far. `params` has no `hotel_id`/
  `hotel_code` field either — only `send_email_notifications`, its
  hidden-by-rule `email`, and a `type: "hidden"` `request_credit_card`
  field (correctly never rendered, per existing `isFieldHidden`/
  `buildSettingsPayload` logic).
- **Julian Alps Booking**: `kind: meta`, `mapping_mode:
  room_rate_multioccupancy`, `property_mapping: single`. `params`:
  `hotel_code`, `min_stay_type` (select), `send_email_notifications`
  (boolean), hidden-by-rule `email` — all supported types.
  `rate_params`: same shape as HotelREZ/Wigwam Holidays exactly
  (`occupancy`, `rate_plan_code`, `room_type_code`, `pricing_type` —
  select with `Standard`/`OBP` — `primary_occ`, `readonly`).
- **GuruHotel**: same shape as Julian Alps Booking, plus one new field
  type combination not seen before — `api_key` (`type: "password"`),
  alongside `hotel_code`. Confirmed the generic `AdapterField` renderer
  already handles `password` correctly (it's one of the 8 documented
  types) — rendered live as a genuine masked password input.

**2, 3, 6. Live test-connection / detail-call behavior, queue-contention
check, and "does test_connection genuinely validate" — through CA-4's
real owner-facing routes and a live browser click-through:**

- **More.com — genuinely a no-op, confirmed live, not assumed**:
  `test_connection` returns `success:true` even with **every field left
  blank** (there's nothing to fill in — no hotel identifier field exists
  at all). Reproduced live in the browser: opened the settings step,
  which correctly shows only "Send Property Notification" (no hotel field
  — the generic renderer correctly handles an adapter with zero
  identifying params), clicked Test Connection with nothing filled in →
  **"✓ Connection verified."** — a signal that means literally nothing for
  this adapter. **Cannot honestly be recommended to an owner as a "test
  your credentials" step** — though this is somewhat moot given the next
  finding.
- **More.com's `mapping_details` returns `{"data": null}` at the top
  level** (not `{"data": {"rooms": [...]}}` or even `{"data":
  {"rooms":[]}}` — literally `data: null`). **`connection_details` returns
  a real `500`** — confirmed this IS protected by the CA-7 queue fix:
  called the owner-facing route directly, resolved in **2.6s**, zero
  `[channex-queue]` retry log lines (verified against the full server log
  for this session — not a single retry line appears anywhere).
- **More.com is cleanly blocked at the mapping step by EXISTING code —
  correct behavior, not a bug**: since `rate_params` is `null`,
  `hasRateMapping` (`Object.keys(rateParams).length > 0`) is `false`, so
  the wizard shows `t('cmOtaUnsupportedAdapter')` ("This wizard doesn't
  fully support this channel yet.") and disables "Create connection" —
  confirmed live via the real browser click-through (settings → Test
  Connection succeeds → mapping step correctly shows the unsupported
  message, `Create connection` button confirmed `disabled: true` via a
  direct DOM check). **This is the existing `!hasRateMapping` safeguard
  working exactly as designed** — Channex's own More.com adapter simply
  doesn't declare a rate-mapping capability, so there's nothing CA-4's
  wizard (or the CA-7-round-2 `hasOtaRooms` fix) could offer here even in
  principle; not reachable by, or relevant to, either previously-fixed bug
  pattern.
- **Julian Alps Booking and GuruHotel both genuinely validate** — a
  meaningful contrast with HotelREZ/Wigwam Holidays, which share the
  **exact same params/rate_params shape** but don't validate at all.
  **Confirms shape alone never predicts sandbox validation behavior** —
  each adapter's real backend differs independently, worth re-checking
  per-adapter every time, not inferring from a sibling adapter's shape.
  Both confirmed live: fake `hotel_code` (Julian Alps Booking) and fake
  `hotel_code` + `api_key` (GuruHotel) both cleanly fail
  `test_connection` (`invalid_credentials`, `200`) within ~2s through the
  real browser wizard — "We couldn't verify these details…" — and the
  step 1→2 "Continue" button is correctly `disabled` since `testOutcome`
  never reaches `'success'` with fake input. **Consequence**: unlike
  HotelREZ/Wigwam (whose false positives let a fake credential reach the
  mapping step), these two correctly BLOCK a bad credential before the
  mapping step is ever reachable — confirmed via a direct DOM check
  (`Continue` button `disabled: true`). Their `connection_details`/
  `mapping_details` were still probed directly via the raw API for
  completeness: both return clean `400`/`422` (never a `5xx`) — **no
  queue-contention risk exists for either adapter** (the retry-storm
  pattern only applies when Channex itself answers with a `5xx`, which
  neither does) — the mapping-fallback pattern (item 4) was therefore not
  directly click-through-tested for these two (the UI correctly never
  lets fake credentials reach that step), but their error shape matches
  HotelREZ's already-proven `available:false` case exactly, so the
  existing fallback is expected — not empirically re-demonstrated here —
  to engage correctly if real credentials were entered and later details
  calls failed.

**4. Mapping-fallback pattern (`hasOtaRooms`, from the CA-7-round-2
follow-up) — re-checked against a genuinely different response shape, not
just re-confirmed on an identical one:** More.com's `mapping_details`
returning the whole body as `{"data": null}` (rather than Wigwam's
`{"rooms": []}`) is a shape the fix hadn't been exercised against before.
Traced it through: `mappingDetails.result?.rooms` → `{data:null}.rooms` →
`undefined` → `?? []` → `mappingRooms = []` → `hasOtaRooms = false` — the
fix handles this correctly too, though in practice it's moot for More.com
specifically since `!hasRateMapping` already blocks the mapping step
before `hasOtaRooms` is ever evaluated. Still a useful robustness
confirmation: the fix isn't narrowly matched to Wigwam's exact empty-array
shape, it correctly treats "nothing usable" broadly.

**5. OBP status, noted per instruction:** Julian Alps Booking and
GuruHotel both expose `pricing_type: {options: ["Standard","OBP"]}` —
OBP-capable, matching HotelREZ/Wigwam. More.com has no `rate_params` at
all, so the question doesn't apply.

**7. Adapter-specific copy — none needed:** same conclusion as every prior
CA-7 round — all three render entirely from generic form copy and the
existing `cmOtaUnsupportedAdapter`/`cmOtaTestFailed` strings. No new i18n
keys.

**Regression check:** no code was changed this pass (pure investigation).
Channel Manager's Room Mapping/Online Travel Agents section and the Super
Admin debug page (all 56 adapters, CA-1/2/3 unaffected) both re-confirmed
rendering correctly after the click-throughs above.

**Verdict for each, plainly:**
- **More.com**: **blocked — cleanly, by design, not a bug.** Channex's own
  adapter declares no rate-mapping shape at all (`rate_params: null`);
  CA-4's existing `!hasRateMapping` safeguard correctly refuses to let an
  owner proceed, with a clear message and a disabled create button. Not
  fixable or completable through this integration model regardless of any
  NestBook-side change — a genuine capability gap on Channex's side, not
  ours.
- **Julian Alps Booking**: **ready to use as-is via the generic form.**
  Test Connection is trustworthy (genuinely validates), the common
  wrong-credential path fails fast and cleanly, no queue-contention risk
  (never 5xxs), OBP-capable but unresolved as expected. The one caveat is
  editorial, not technical: it's a niche Alpine regional booking engine,
  a looser fit for NestBook's stated market than HRS would have been.
- **GuruHotel**: **ready to use as-is via the generic form**, same
  reasoning as Julian Alps Booking (genuine validation, clean errors, no
  queue risk, OBP-capable) — but flagged as the pick with the least
  confirmed market relevance of the three; included to satisfy the
  requested count of 3, not because any real-world relevance to NestBook's
  target market could be confirmed.

---

## CA-7 round 2 follow-up — DONE (2026-09-16) — fixed the empty-rooms manual-entry-fallback gap CA-7 round 2 found for Wigwam Holidays; confirmed general, not adapter-specific; Wigwam Holidays re-flagged as ready to offer

**Investigated first, per instruction, whether this was Wigwam-specific or a
general gap in CA-4's fallback logic — it's general.** Read
`ChannelConnectWizard.jsx`'s mapping step in full: the decision between
showing the OTA room/rate dropdowns vs. the manual-entry fallback, in
**three separate places** (which UI branch to render, and the `roomCode`/
`rateCode` values fed into `mappingReady`/`createConnection()`), was gated
purely on `mappingDetails?.available` — a flag that only means "Channex
answered the request," not "Channex returned anything to pick from." Any
adapter can come back with a populated-but-empty `rooms` array (a
genuinely empty inventory on the OTA's side, a scoping mismatch, etc.) —
this was never specific to Wigwam Holidays' particular sandbox behavior,
it was a structural gap in what "available" was being used to mean.

**Fix — `client/src/components/ChannelConnectWizard.jsx` only:** introduced
`hasOtaRooms = mappingRooms.length > 0` (where `mappingRooms` is the
existing, unchanged derivation) as the one signal for "is there actually
something here to select," and replaced all three prior uses of
`mappingDetails?.available` for this decision (the render branch, and the
`roomCode`/`rateCode` fallback values) with it. `mappingRooms` itself is
untouched, so this naturally covers both failure shapes — `available:
false` (unchanged behavior, still falls back) and `available: true` with
zero rooms (the bug, now also falls back) — with a single check, not two
adapter-specific branches.

**The "slow-but-successful load shouldn't show a false fallback" concern —
already structurally impossible, confirmed by reading the code, not
patched around:** the step 1→2 "Continue" button is already
`disabled={testOutcome !== 'success' || fetchingDetails}` — the owner
cannot reach the mapping step until the mapping/connection-details fetch
has fully settled (success OR failure). `mappingDetails` is therefore
guaranteed non-null and settled by the time `hasOtaRooms` is evaluated;
there is no mid-flight state for the fix to misread as "empty." No change
was needed to guard against this — it already can't happen.

**Verified live against real Channex:**
- **Reproduced the exact original bug scenario and confirmed the fix**:
  selected Wigwam Holidays, entered a fake Hotel Code, Test Connection
  showed the (separately-flagged, unrelated, Channex-side) false "✓
  Connection verified.", continued to the mapping step — **now correctly
  shows the manual-entry fallback** ("We couldn't automatically fetch this
  channel's rooms — enter the codes manually…") with real Room
  code/Rate code inputs, instead of the previous empty, dead-end dropdown.
- **Confirmed no regression for adapters with real rooms**: Booking.com's
  real test hotel `5868189` — Test Connection succeeded, mapping step
  still correctly shows **"Currency: GBP"** and the real Channel
  room/Channel rate dropdowns (Single Room/Double Room/Suite), not the
  fallback — `hasOtaRooms` correctly evaluates `true` when real rooms
  come back, unchanged from the pre-fix behavior for this case.
- Regression: Channel Manager's Room Mapping section, CA-5's Airbnb
  button, and CA-6's per-channel actions all still render correctly; no
  other files were touched by this fix.

**Wigwam Holidays — re-flagged, per instruction:** now **ready to offer**,
with its one remaining caveat unchanged and explicitly accepted rather
than blocking: Channex's own `test_connection`/`create` implementation for
this adapter doesn't validate against real inventory (confirmed in CA-7
round 2 — any non-empty Hotel Code returns a false "verified", and even
`POST /channels` accepted fully fabricated settings). That's a Channex-side
sandbox/adapter-completeness limitation, not fixable in this codebase, and
is now a known, documented, accepted limitation rather than a blocker —
the dead-end code bug that made it actively unsafe to offer is fixed.
HotelREZ's earlier verdict (mechanically ready, same test-connection
caveat, no dead-end) is unchanged by this fix.

---

## CA-7 round 2 (Hostelworld, HotelREZ, Wigwam Holidays) — DONE (2026-09-16) — mixed results; two real, previously-unknown Channex sandbox/code gaps found and confirmed live, neither fixed this pass (reported per instruction)

Enablement checklist for 3 more `room_rate_multioccupancy` adapters.
**Adapter choice and why**, per instruction to pick ones genuinely relevant
to NestBook's actual market (independent UK/EU B&Bs, guesthouses, small
hotels), not obscure/regional ones:
- **Hostelworld** — one of the largest pan-European OTAs specifically for
  independent, budget-conscious small properties (hostels, guesthouses) —
  a very natural fit for exactly NestBook's target customer profile.
- **HotelREZ** (`code: HotelRez`) — a real, UK-based marketing/booking
  consortium built specifically FOR independent hotels — arguably a more
  precise match for "independent UK hotels" than any adapter enabled so
  far, including Booking.com/Expedia.
- **Wigwam Holidays** (`code: WigwamHolidays`) — a recognized UK brand for
  small independent glamping/unique-stay operators, representing the
  alternative-accommodation niche many small UK properties (including
  NestBook's own target segment) increasingly diversify into.

Excluded from consideration: adapters with `mapping_mode` other than
`room_rate_multioccupancy` (e.g. `GoogleHotelARI`'s `mapping_mode:
"direct"` was tempting given its relevance to independents' direct-booking
strategy, but doesn't match the shape this checklist is scoped to), and
the clearly wholesale/regional-niche/unclear-origin adapters (WebBeds,
CTrip, Goibibo, JoodBooking, etc.) that don't fit NestBook's stated UK/EU
independent-property market.

**1. Live adapter descriptors — all three confirmed `room_rate_multioccupancy`/`meta`/`single`,
but with real, concrete differences from the Booking.com/Expedia/Agoda
shape already handled, not assumed identical:**

- **Hostelworld**: `params` — `hotel_id`, `min_stay_type` (select),
  `send_email_notifications` (boolean), `email` (hidden-by-rule), `booking_amount_settings`
  (select) — all within the generic form's supported types, same as
  Expedia. **`rate_params` has NO `pricing_type` key at all** (unlike
  Booking.com/Expedia/Agoda, which all have one, select or plain string) —
  instead it has a genuinely new key never seen in this codebase's
  Channel API work: **`type`** (`{"position":2,"type":"string","title":"Type"}`,
  no default). CA-4's `createConnection()` payload builder
  (`ChannelConnectWizard.jsx`) hardcodes exactly 5 possible `rate_plans[].settings`
  keys (`room_type_code`, `rate_plan_code`, `occupancy`, `pricing_type`,
  `primary_occ`) — it has no path to collect or send an arbitrary
  additional key like `type`. **Not confirmed live whether Hostelworld's
  real create endpoint actually requires `type`** (would need a real
  Hostelworld hotel_id to get far enough to test — not available in this
  environment) — flagged as a genuine open question, not silently assumed
  either way.
- **HotelREZ**: `params` uses **`hotel_code`, not `hotel_id`** — already
  correctly handled by existing code (`createConnection()`'s
  `hotel_id: settings.hotel_id ?? settings.hotel_code ?? ''` fallback,
  written during CA-4, already anticipates exactly this). `rate_params`
  matches Booking.com's shape exactly, including `pricing_type: {type:
  "select", options: ["Standard","OBP"]}` — **HotelREZ is OBP-capable**
  (noting per instruction, not resolving).
- **Wigwam Holidays**: identical shape to HotelREZ in every respect —
  `hotel_code` (same fallback applies), same `rate_params` including
  OBP-capable `pricing_type`.

**2 & 3. Live test-connection / detail-call behavior AND the queue-contention
check, through CA-4's real owner-facing routes and a live browser
click-through — this round surfaced two genuinely new findings beyond
"does it work":**

- **Hostelworld behaves like the well-behaved adapters (Booking.com/
  Expedia/Agoda)**: `test_connection` genuinely validates — a fake hotel_id
  cleanly fails (`200 {success:false, errors:"authentication_failed"}`),
  confirmed with three different nonsense values, none of which
  false-positived. Live in the browser: entering a fake Hotel ID and
  clicking Test Connection resolves in ~2s to "We couldn't verify these
  details..." — clean, no hang. **Queue-contention check, specifically**:
  `connection_details` returns a real Channex `500` for bad input (same
  failure class CA-7 found for Agoda) — confirmed this is now protected by
  the CA-7 queue fix: called the owner-facing route directly with a
  bad hotel_id, resolved in **1.6s** (`connection-details`) and **0.7s**
  (`mapping-details`), zero `[channex-queue]` retry log lines. The fix
  applies to every adapter sharing this code path, confirmed concretely
  for a second one here, not just assumed from Agoda's case.
- **HotelREZ and Wigwam Holidays — a genuinely new finding, not seen with
  any adapter enabled so far**: their `test_connection` does **NOT**
  validate against real inventory at all — confirmed live with 3 separate
  nonsense values (`'totally-nonsense-value-999888777'`, `'   '`, and a
  real UI click-through with garbage in the Hotel Code field) — **every
  non-empty value returns `success:true`**; only a genuinely empty string
  returns `false`. Reproduced live in the actual browser for both
  adapters: typing garbage into "Hotel Code" and clicking Test Connection
  shows **"✓ Connection verified."** — a false positive, confirmed through
  the real wizard, not a raw-API artifact. This is a Channex-side sandbox/
  adapter-implementation limitation (their own `test_connection` stub for
  these two adapters doesn't check real inventory) — **not something
  NestBook's code can fix**, but a real product risk worth knowing about
  before offering either adapter to real owners: the one signal the wizard
  gives an owner to catch a typo ("Connection verified") is meaningless
  for these two.
- **A confirmed, reproducible CA-4 code bug for Wigwam Holidays specifically**:
  its `mapping_details` returns a **`200` with `available:true` but an
  EMPTY `rooms: []` array** for any fake credential (confirmed live, not
  hypothetical — this is exactly the "empty/null but HTTP 200" case CA-4's
  own doc flagged as "not independently observed live... low risk but not
  itself witnessed," now actually witnessed). Reproduced through the real
  browser wizard: the mapping step shows the "Channel room" dropdown with
  **only the placeholder option, zero real rooms to pick** — and critically,
  the manual-entry fallback ("We couldn't automatically fetch this
  channel's rooms — enter the codes manually") does **NOT** appear,
  because that fallback only triggers when `mappingDetails.available` is
  `false` — here it's `true`, just empty. **The owner is stuck**: no room
  to select, no manual-entry alternative offered, `mappingReady` can never
  become true, "Create connection" stays effectively unreachable. This is
  a genuine, confirmed dead-end in CA-4's own code — **needs a small fix**
  (the manual-entry fallback condition should also trigger when `rooms` is
  empty, not only when `available` is false) — **not implemented this
  pass**, reported per instruction for a decision, matching how CA-7's
  Agoda queue finding was handled (reported first, fixed in a separate
  follow-up).
- HotelREZ does NOT have this dead-end: its `connection_details`/
  `mapping_details` both return real `400`/`422` errors (not a
  `200`-with-empty-data), so the existing `available:false` fallback
  correctly engages — confirmed live through the browser: after the false
  "✓ Connection verified.", continuing to the mapping step correctly shows
  the manual room/rate code entry fields, not a dead end.
- **A related, confirmed-live discovery about Channex's own sandbox
  completeness for Wigwam Holidays, worth flagging even though it's not a
  NestBook code issue**: `POST /channels` (create) was tested directly
  with a completely fabricated `hotel_code` and fabricated room/rate
  codes for Wigwam Holidays — **it returned a real `201`**, creating a
  genuine (if meaningless) channel connection on the live account. This
  confirms the leniency isn't limited to `test_connection`/detail calls —
  Channex's own adapter for this brand doesn't validate the create step
  against real inventory either, in this staging environment. **Deleted
  immediately after confirming** (via CA-6's now-existing delete
  mechanism) to avoid leaving junk data — confirmed genuinely gone via a
  follow-up `GET` (`404`) and the account's total channel count back to
  `0`.

**4. OBP status — noted, not resolved, per instruction:** HotelREZ and
Wigwam Holidays both expose `pricing_type: {options: ["Standard","OBP"]}`
— OBP-capable. Hostelworld does not expose `pricing_type` at all (see
finding above). None of the three were used to resolve the still-open OBP
verification gap from CA-4.

**5. Adapter-specific copy — none added:** same conclusion as the
Expedia/Agoda round — every string shown for all three adapters is
already generic form copy (field labels come from the live descriptor's
own `title` values). No new i18n keys this pass.

**Regression check:** no code was changed this pass (pure investigation,
like the original CA-7 round) — Channel Manager's Room Mapping, Online
Travel Agents section (CA-4/5/6), and the Super Admin debug page all
re-confirmed rendering correctly after the click-throughs above.

**Verdict for each, plainly:**
- **Hostelworld**: behaves correctly for the common path and is protected
  by the CA-7 queue fix, but has one genuinely open question — the
  unhandled `type` rate_param — that couldn't be resolved without a real
  Hostelworld credential. **Needs investigation before being called
  "ready"** — not blocked, not confirmed-broken, genuinely unclear.
- **HotelREZ**: mechanically fully compatible with the generic form
  (hotel_code fallback already exists, OBP toggle renders, manual-entry
  fallback engages correctly when detail calls fail) — **ready to use
  mechanically**, but flagged with a real caveat: its Test Connection
  step is not a trustworthy signal on Channex's own sandbox (accepts any
  non-empty value) — an external limitation, not something to fix in this
  codebase, but worth knowing before recommending this adapter to an
  owner.
- **Wigwam Holidays**: same Test-Connection-is-meaningless caveat as
  HotelREZ, **plus a confirmed, reproducible stuck-UI bug** (empty-rooms-
  but-available:true dead end) that's a genuine CA-4 code gap — **needs a
  small fix**, not implemented this pass. Given both this bug and
  Channex's confirmed-lenient `create` behavior for this specific adapter,
  **recommend not offering Wigwam Holidays to real owners yet**, pending
  at minimum the mapping-fallback fix.

---

## CA-7 follow-up — DONE (2026-09-16) — fixed the channexQueue retry-blocking risk CA-7 flagged for Agoda (and, identically, Booking.com)

CA-7 found that `getConnectionDetails()`/`getMappingDetails()` routed
through `channexQueue`'s shared single-worker retry queue, and that a
genuine Channex `500` (confirmed live for Agoda) would burn the full
retry/backoff schedule (`[2s, 8s, 30s, 60s]` × up to 5 attempts, ≈100s per
call) before giving up — serialized through the queue's one worker, so two
back-to-back detail calls could block every OTHER property's pending
Channex writes (ARI pushes included) for ~200s over a single bad response.
Fixed by reusing the codebase's own existing bypass pattern, not inventing
a new one.

**Fix — `server/utils/channexClient.js` only:** `getMappingDetails()` and
`getConnectionDetails()` now call `channexRequest()` directly instead of
wrapping the call in `queuedWrite()` — the exact same pattern
`listChannelAdapters()`/`listChannelsForProperty()`/`getChannel()` already
use for best-effort reads that shouldn't wait behind (or retry through)
the ARI write queue. No new function, no new bypass mechanism — literally
the same shape, applied to two more functions. `channexQueue.js` itself
was **not touched at all** (confirmed via `git diff --stat` showing zero
lines changed in that file) — the fix is entirely about which functions
opt into the queue, not any change to the queue's rate-limiting, dedup, or
retry logic.

**Scope, exactly as instructed:** `testChannelConnection()` was left
unchanged (still queued) — it was never part of the reported issue (it
returns a clean `200 {success:false}` even on bad credentials for both
Booking.com and Agoda, never a 5xx, so it was never at risk of the retry
storm), and the task scoped the fix to `connection_details`/
`mapping_details` specifically. This one shared function in
`channexClient.js` is used by both `server/routes/channex.js` (CA-2's
Super-Admin debug routes) and `server/routes/properties.js` (CA-4's
owner-facing routes) — fixing it here fixes both call sites, and both
adapters (Agoda, where the 500 was found, and Booking.com, which shares
the identical code path) at once, with no route-level changes needed.

**Verified live (not just code review):**
- **The retry storm is gone**: called the owner-facing
  `connection-details`/`mapping-details` routes for Agoda with a
  bad-but-plausible `hotel_id` (the same input that previously triggered
  ~100s of retries each). Both now resolve in under 5 seconds
  (`connection-details`: 4.5s, `mapping-details`: 0.8s — the small
  remaining latency is just the real Channex round-trip, not a retry).
  Confirmed via the server's own log output that **zero**
  `[channex-queue]` retry lines appear for either call — each 500 is
  logged once by the route's own error handler and resolved immediately,
  down from the 10 retry-attempt log lines (5 for each call) seen during
  CA-7's original investigation.
- **Successful calls still work identically**: re-ran `connection-details`
  and `mapping-details` for Booking.com's real test hotel `5868189`
  through the owner-facing routes — same real `GBP` currency + 7
  connection-type rows, same real 3-room/9-rate mapping data as every
  prior slice. Reproduced again through an actual browser click-through of
  CA-4's real wizard (not a bypassed API call): selected Booking.com,
  entered `5868189`, clicked Test Connection → "✓ Connection verified.",
  continued to the mapping step → "Currency: GBP" and the real
  Single/Double/Suite room options rendered correctly, exactly as before
  this fix.
- **The Super Admin debug route (CA-2) also still works**: called
  `POST /api/admin/channex/channels/mapping-details` (Booking.com, hotel
  `5868189`) with a real Super Admin session — `200`, real room/rate data,
  resolved in ~1.3s.
- **Phase 2's ARI push queue confirmed completely unaffected — the most
  important regression check**: (a) static — `channexQueue.js` has zero
  diff, so its rate limiter, per-property ARI sliding window, dedup, and
  retry/backoff logic for actual writes are untouched by construction; (b)
  dynamic — ran a real `updateAvailability()` call (the same `kind: 'ari'`
  job type every availability push in the app uses) against property #1's
  real Channex room type, through the same unmodified `channexQueue.js`
  this fix didn't touch: real `200`, `{"data":[{"id":"...","type":"task"}],
  "meta":{"message":"Success"}}` — the queue dispatches, rate-limits, and
  completes real ARI jobs exactly as before.
- Regression: Channel Manager's Online Travel Agents section, CA-5's
  Airbnb button, and CA-6's per-channel actions all still render correctly
  after this change (no UI files were touched — the fix is
  backend-only, in `channexClient.js`).

**Not changed, deliberately:** the recommended-but-deferred fix noted in
CA-7 is now done; no further follow-up items from that finding remain
open.

---

## CA-7 (Expedia + Agoda) — DONE (2026-09-16) — both confirmed ready to use as-is via the generic form; zero code changes needed; one real-but-narrow operational risk flagged for Agoda, not fixed

Enablement checklist for two more `room_rate_multioccupancy` adapters,
per §3's CA-7+ plan. Unlike every prior slice, this one required **no code
changes at all** — pure confirmation, exactly as scoped. Both adapters
already work correctly through CA-4's existing generic wizard.

**1. Live adapter descriptors — re-confirmed fresh, not assumed from the
original 56-adapter survey:**

`GET /channels/adapter?code=Expedia` and `?code=Agoda`, both live against
staging:
- Both: `kind: "meta"`, `mapping_mode: "room_rate_multioccupancy"`,
  `property_mapping: "single"` — the exact same cluster shape as
  Booking.com, confirmed live rather than assumed.
- **Expedia params**: `hotel_id` (string), `min_stay_type` (select:
  Arrival/Through), `send_email_notifications` (boolean), `email` (string,
  hidden-by-rule same as Booking.com's), `booking_amount_settings` (select:
  3 options). **Agoda params**: `hotel_id` (string),
  `send_email_notifications` (boolean), `email` (string, same hidden
  rule), `booking_tax_settings` (select: 3 options). Every field type used
  by either adapter (`string`/`boolean`/`select`) is already handled by
  `AdapterField`'s generic renderer (`ChannelConnectWizard.jsx`) — no new
  field type, no new rule shape.
- **rate_params — both identical in shape to Booking.com's**: `occupancy`
  (integer), `rate_plan_code`/`room_type_code` (string), `primary_occ`
  (boolean). **One real difference worth noting**: `pricing_type` is type
  `"string"` for both Expedia and Agoda — NOT `type: "select", options:
  ["Standard","OBP"]` the way Booking.com's is. Confirmed this is handled
  correctly already: the wizard's `supportsObp` check
  (`rateParams.pricing_type?.options?.includes('OBP')`) evaluates to
  `false` when there's no `options` array at all, so the Standard/OBP
  toggle simply never renders for either adapter — the create payload
  still sends `pricing_type: 'Standard'` (the state's default), which is
  correct. **Neither adapter exposes an OBP option** — per instruction,
  noting this rather than trying to force an OBP test; the OBP branch
  remains exactly as unverified as it's been since CA-4, unaffected by
  this slice either way.

**2. Live test-connection / connection-details / mapping-details —
re-confirmed through CA-4's REAL owner-facing routes (not a bypassed raw
API call), using plausible fake settings (`hotel_id: 'fake-hotel-id...'`)
on property #1, then reproduced again by clicking through the actual
wizard in a real browser:**

- **Expedia**: `test_connection` → clean `200 {success:false,
  errors:"invalid_credentials_structure"}`. `connection_details` → `400`
  (a real, non-retryable client error). `mapping_details` → `422` (also
  non-retryable). All three resolve in well under a second through the
  owner-facing routes, and the real wizard correctly shows "We couldn't
  verify these details. Double-check them and try again." within ~2
  seconds of clicking Test Connection with a fake hotel id — no hang, no
  crash, no special-casing needed.
- **Agoda**: `test_connection` → clean `200 {success:false,
  errors:"implementation_not_defined"}` (a different error string than
  Expedia's, but still a clean, fast, non-throwing response — this being
  Channex's own Agoda adapter reporting its `test_connection`
  implementation isn't fully wired up on their side, not something
  NestBook's code can or needs to fix). Reproduced live in the browser:
  clicking Test Connection with a fake hotel id resolves in ~2 seconds to
  "We couldn't verify these details..." — **the common "owner typed the
  wrong credentials" path is fast and clean for Agoda too.**

**A real, but narrower-than-first-suspected, operational finding for
Agoda — flagged, not fixed:** calling `connection_details`/
`mapping_details` DIRECTLY (bypassing test_connection, i.e. the case where
a hotel_id passes `test_connection` but a later detail call still fails)
returns a genuine Channex `500` for Agoda — and because
`getConnectionDetails()`/`getMappingDetails()` route through the shared
`channexQueue` (same single-worker retry queue as ARI pushes),
`isRetryable()` correctly-by-design treats any 5xx as transient and
retries with the full backoff schedule (2s/8s/30s/60s ≈ 100s) before
giving up — confirmed live, `channex-queue` logs showed the full 5-attempt
retry sequence for both calls, each independently burning ~100s, and
because `channexQueue` is a single serial worker (confirmed via the log
ordering — `mapping_details`'s retries didn't start until
`connection_details`'s 5 attempts had already finished), the two calls
serialize to **~200s total**, during which the shared queue cannot process
ANY other property's pending Channex writes (ARI pushes, room-type
creates, etc.) — matching the file's own documented architecture ("one
array + one async worker").

**Correctly scoped, not overstated**: this is NOT reachable via the common
"owner enters a wrong Agoda hotel_id" mistake — that path fails at
`test_connection` (clean, fast `success:false`) before the wizard ever
calls `connection_details`/`mapping_details` at all (confirmed by reading
`runTestConnection()`: the detail calls only fire `if
(data.result?.success)`). It's only reachable in the narrower case where a
hotel_id passes `test_connection` but then a detail call independently
500s — not verified live end-to-end (would need a real, valid-shaped
Agoda credential that happens to trigger this on Channex's side, which
this environment doesn't have), but the retry-then-500-then-`{available:
false}` behavior itself IS confirmed real and reproducible through the
real owner-facing routes. **Recommended fix, not implemented this pass**:
route `getConnectionDetails()`/`getMappingDetails()` outside
`channexQueue` (call `channexRequest()` directly, same as the existing
GET-reads-bypass-the-queue pattern already documented in
`channexClient.js`'s own top comment) — these are explicitly best-effort
UI probes with an existing graceful fallback, not writes that need
guaranteed delivery, so there's no reason for them to share ARI's
retry-with-backoff budget or its single worker. Left unfixed deliberately:
this is a queue-wide behavioral change that would also affect
Booking.com's identical code path, and felt like a decision worth
surfacing rather than bundling into a "mostly confirmation" pass.

**3. Curated picker — confirmed no change needed:** `ChannelConnectWizard.jsx`
has no curation/allowlist mechanism — it lists all 56 adapters returned by
`GET /channex/adapters`, alphabetically sorted, unfiltered (confirmed by
reading the code — `adapters.slice().sort(...)`, no filter step anywhere).
Expedia and Agoda already appear in that list today; no code change was
needed to "add" them. The curated-list product question from the original
investigation's §5 open question #2 remains open and unrelated to this
slice.

**4. Adapter-specific copy — confirmed none needed:** both adapters render
entirely off the generic form (field labels come straight from the live
descriptor's own `title` values — "Hotel ID", "Min Stay Type", "Tax
Setting For Bookings", etc. — not hardcoded anywhere in NestBook's code),
and the existing generic error copy (`cmOtaTestFailed`,
`cmOtaGenericError`) already reads correctly for both. **No new i18n keys
were added this slice.**

**Verified live (regression):** no files were changed this slice, so
regression risk is minimal by construction — still spot-checked the
Channel Manager page (Room Mapping, Online Travel Agents section with
CA-4's wizard button, CA-5's Airbnb button, CA-6's per-channel actions
list) after clicking through both new adapters, confirmed everything
renders exactly as before.

**Verdict for both, plainly:**
- **Expedia: ready to use as-is via the generic form.** No blockers, no
  fixes needed, no OBP to worry about.
- **Agoda: ready to use as-is via the generic form for the common path**
  (test_connection fails cleanly and fast on bad credentials, exactly like
  every other adapter). **Has one real, narrow, unfixed operational risk**
  (the connection-details/mapping-details retry-storm-blocks-the-shared-
  queue scenario above) that only bites if a hotel_id passes
  `test_connection` but a detail call then 500s — flagged with a concrete
  recommended fix, deliberately not implemented this pass.
- **Neither could be tested to a real `201`/`activate`** — the exhausted
  shared-sandbox situation from CA-2/CA-4/CA-6 applies here too, for the
  same reason (no real Expedia/Agoda hotel/credentials available in this
  environment, and Channex's adapters validate `hotel_id` against real OTA
  inventory server-side, confirmed again this slice by Expedia's `400`/
  Agoda's `500` on an unrecognized-but-plausible hotel_id — neither is a
  clean "not found" that could be worked around).

---

## CA-6 follow-up — DONE (2026-09-16) — closed the check-readiness/activate ownership gap CA-6 flagged; CA-6's translations applied

**1. Security fix — IDOR gap on CA-4's check-readiness/activate routes,
closed:** CA-6 flagged (but didn't fix) that its own new
deactivate/delete routes verify a `channelId` belongs to the calling
property before calling Channex, while CA-4's existing
`POST /:id/channex/channels/:channelId/check-readiness` and
`POST /:id/channex/channels/:channelId/activate` routes
(`server/routes/properties.js`) did not — any owner with Channel Manager
access on ANY property could call either route with another property's
real `channelId` and Channex would happily act on it, since only the
`propId` in the URL was checked against the caller's own access, never
whether that specific channel actually belonged to that property.

Fixed by reusing CA-6's existing `verifyChannelBelongsToProperty()` helper
verbatim (not reinvented) — both routes now call it immediately after the
`requireOwnerChannelManagerAccess` gate and before calling Channex at all,
404ing on a mismatch exactly like CA-6's deactivate/delete routes already
did.

**Live-verified — real exploit shape, not just a fake id:** confirmed via
curl with a real owner JWT that both routes reject a syntactically-valid,
nonexistent channel UUID with `404` before ever reaching Channex (same test
CA-6 already used for its own two routes). Attempted to go further and test
against a channelId genuinely belonging to a DIFFERENT property (the actual
exploit shape asked for) — this requires at least one real, live Channex
channel to exist somewhere on the account to use as the "victim" id.
**None exists, for the same reason CA-6 already documented (sandbox
exhaustion), reconfirmed independently three separate ways this session:**
1. Reusing either known Booking.com sandbox test hotel (`5868189`,
   `6519420`) on property #2 (a different property than CA-6's earlier
   attempts used) — still `422 "channel with the same settings already
   exists"`, confirming this is a whole-account fingerprint block, not
   scoped per property, matching CA-2/CA-4/CA-6's existing finding.
2. A fresh, never-used Booking.com `hotel_id` — Channex's own adapter
   round-trips to real Booking.com sandbox inventory to validate it, not
   just a local uniqueness check: this returned a real `500 Internal Server
   Error`, not a clean validation response, confirming creation cannot be
   faked with an arbitrary hotel_id.
3. HopperHomes' `create_host` endpoint (flagged during CA-5 as
   "supposedly no credentials to collect from the user") — still requires
   a real, pre-verified email on Channex/Hopper's own side: `400 "No
   verified user found with provided email"`.

**Conclusion: there is genuinely no way to create a second real,
independently-owned Channex channel in this environment right now** — not
a gap in effort, an external sandbox constraint affecting every adapter
tried. Given that, correctness here rests on the ownership check's
construction rather than an empirical cross-property test: `verifyChannelBelongsToProperty()`
calls `listChannelsForProperty(property.channex_property_id)` — Channex's
own authoritative `filter[property_id]=` query — and checks membership by
real Channex UUID against ONLY that list. A channelId belonging to a
different property cannot structurally appear in this property's own
filtered list, so there is no code path by which a cross-property id could
incorrectly pass; this isn't weaker evidence than an empirical test would
give, since the check's correctness follows directly from Channex's own
query semantics, not from application logic that could hide a bug. Still
explicitly flagged as unverified-in-the-strongest-sense (a real cross-
property live call) until the sandbox frees up or a real Airbnb-connected
channel exists from CA-5.

**2. CA-6's translations applied:** replaced the EN-only placeholders for
all 8 `cmOtaDeactivate*`/`cmOtaDelete*`/`cmOtaChannelActionError` keys with
real FR/ES/DE/NL text across `client/src/i18n/index.js`, matching CA-5's
translation pass. One shape change: `cmOtaDeleteConfirmMsg`'s new text
doesn't reference the channel name (unlike the placeholder draft, which
interpolated `${title}`), so it's now a plain string in all 5 languages
instead of a function — `ChannelManager.jsx`'s `ConfirmModal` call site
updated to match (`t('cmOtaDeleteConfirmMsg')`, no longer called as a
function). Verified live via the same browser-fetch-mock technique CA-6
used: the ConfirmModal renders the new copy correctly ("Delete this
connection? … This will permanently remove this channel connection. You
can reconnect later, but you'll need to set it up again from scratch.").

**Files touched:** `server/routes/properties.js` (ownership check on the
two CA-4 routes), `client/src/i18n/index.js` (CA-6 translations, all 5
languages), `client/src/pages/ChannelManager.jsx` (one-line call-site fix
for the now-non-interpolated message).

---

## CA-6 — DONE (2026-09-16) — owner-facing deactivate/delete; endpoints and UI verified live, but NOT against a real connected channel — sandbox still exhausted, confirmed fresh this session, not just carried over from CA-2/CA-4

Owner-facing list/deactivate/delete for a property's connected channels, in
the existing "Online Travel Agents" section (CA-4/CA-5), gated by the same
`requireOwnerChannelManagerAccess`.

**Deactivate vs delete — confirmed as two genuinely different Channex
endpoints, not assumed:** fetched
`docs.channex.io/api-v.1-documentation/channel-api` fresh for this slice,
which states `POST /channels/{id}/deactivate` ("stop the exchange with the
channel") and `DELETE /channels/{id}` ("remove deactivated channel") are
separate calls, delete requiring the connection to already be deactivated.
Live-verified this is real behavior, not just a docs claim: `POST
/channels/<real-uuid-format-but-nonexistent-id>/deactivate` and `DELETE
/channels/<same-id>` each returned a clean `404 resource_not_found` —
proving both paths are real, distinct, live-routed endpoints (a typo'd or
fake path would 404 differently, e.g. Express's own catch-all, not a real
Channex JSON error body).

**Files touched:**
- `server/utils/channexClient.js` — two new functions, same `queuedWrite`
  pattern as every other Channel API write: `deactivateChannel(channelId)`
  (`POST /channels/{id}/deactivate`) and `deleteChannel(channelId)`
  (`DELETE /channels/{id}`).
- `server/routes/properties.js` — two new owner-facing routes:
  `POST /:id/channex/channels/:channelId/deactivate` and
  `DELETE /:id/channex/channels/:channelId`. Both add a
  `verifyChannelBelongsToProperty()` ownership check (via
  `listChannelsForProperty`, matching by real Channex id) before calling
  Channex at all — closes a real IDOR-shaped gap that CA-4's existing
  `check-readiness`/`activate` routes still have (neither of those verifies
  the `channelId` param actually belongs to the property being acted on;
  not fixed here — out of scope for this slice — but worth a follow-up).
  Confirmed live: both routes 404 immediately on an unowned/nonexistent
  channel id, never reaching Channex.
  Neither route trusts Channex's 200 at face value, per instruction: after
  `deactivateChannel()`, a follow-up `getChannel()` confirms
  `attributes.is_active` is genuinely `false` before the local
  `channex_channels.is_active` mirror is updated or the owner is told it
  worked (a 200-but-still-active response is treated as a failure, not a
  success). After `deleteChannel()`, a follow-up `getChannel()` is expected
  to 404 — genuine confirmation the resource is gone — before the local row
  is hard-deleted; any other outcome (still 200, or a non-404 error) is
  treated as "can't confirm it worked," not silently assumed successful.
- `client/src/pages/ChannelManager.jsx` — each connected-channel row (list
  rendering already existed from CA-4) now shows one action button:
  **Deactivate** while `is_active`, **Delete** once it isn't. This mirrors
  Channex's real prerequisite honestly in the UI rather than hiding it
  behind one "Remove" button that would have to silently deactivate-then-
  delete on a single click — an owner clicking Delete on a still-active
  channel never happens, because Delete simply isn't offered until the
  channel is already inactive. Deactivate fires directly (no confirmation —
  reversible, the channel can be reconnected/reactivated later). Delete
  goes through the existing `ConfirmModal` component (danger variant),
  matching the exact pattern already used for rate-period/room-category
  deletes in `Settings.jsx` — permanent and irreversible, so it gets the
  same friction as other real deletes in this app, consistent with how the
  rest of the codebase treats destructive vs. reversible actions.
- `client/src/i18n/index.js` — 8 new `cmOta*` keys, **EN block only**,
  explicitly flagged as not-yet-translated, matching CA-5's pattern.
  **These need FR/ES/DE/NL from John**: `cmOtaDeactivateBtn`,
  `cmOtaDeactivating`, `cmOtaDeactivatedToast`, `cmOtaDeleteBtn`,
  `cmOtaDeleteConfirmTitle`, `cmOtaDeleteConfirmMsg`, `cmOtaDeletedToast`,
  `cmOtaChannelActionError`.

**Sandbox exhaustion — re-confirmed fresh this session, not assumed
carried-over from CA-2/CA-4:** before writing any code, checked
`GET /channels` live — zero channels exist anywhere on the account
(`{"data": [], "meta": {"total": 0}}`). `test_connection` against both
shared Booking.com sandbox hotels (`5868189`, `6519420`) succeeds cleanly.
But a real `POST /channels` create attempt against **both** hotels —once
through the live UI wizard (hotel `5868189`, full owner click-through:
selected room/rate, filled a connection name, clicked Create) and once via
a direct API call (hotel `6519420`, same shape CA-2 used) — **both failed
with the identical `422`: `"channel with the same settings already
exists"`**, despite zero live channels existing anywhere on the account.
This is the exact same finding CA-2 and CA-4 already documented, now
independently reconfirmed rather than assumed still true. **As a direct
consequence, there was no way to create a fresh, genuinely real, connected
channel this session to run Deactivate or Delete against for real** — this
is a confirmed external Channex sandbox limitation, not a code defect, and
not worked around.

**What WAS verified live regardless:**
- Both new Channex client functions' endpoints are real and distinct
  (404-on-nonexistent-id test above).
- Both new owner-facing routes correctly reject an unowned/nonexistent
  `channelId` with a `404` before ever calling Channex — confirmed via curl
  with a real owner JWT against a syntactically-valid-but-nonexistent UUID.
- **The Deactivate/Delete UI conditional rendering, action wiring, and
  ConfirmModal integration** — verified live in the running browser by
  temporarily intercepting the page's own `fetch` (browser-console-level
  mock, not a code change) to return two synthetic channel rows, one active
  one inactive, through the real, unmodified `GET /channex/channels`
  response shape the frontend actually consumes. Confirmed: the active row
  shows "Deactivate" and the inactive row shows "Delete"; clicking Delete
  opens the danger-styled ConfirmModal with the correct title and the
  channel's real title correctly interpolated into the message
  ("Permanently delete the connection to Agoda (test)? This can't be
  undone."); Cancel dismisses it without firing any request; clicking
  Deactivate on the active row fires the POST immediately to the correct
  URL (`/api/properties/1/channex/channels/fake-active-1/deactivate`,
  confirmed by inspecting the intercepted call) with no modal in the way —
  matching the task's own checklist ("ConfirmModal appears before delete,
  not before deactivate"). **This proves the frontend code is wired
  correctly; it does NOT prove a real deactivate/delete round-trip against
  Channex — that remains the one genuinely unverified piece, exactly per
  §5's already-known sandbox-exhaustion gap.** Reloaded the page
  immediately after to clear the mock and confirm the page returns to its
  real (accurate, empty) state — `GET /channex/channels` against the real
  account still correctly shows "No channels connected yet."
- Regression: Super Admin debug page
  (`/app/super-admin/channex-channel-api`, CA-1/CA-2/CA-3) still loads and
  renders all 56 adapters and the property selector correctly. CA-4's
  generic "Connect a channel" wizard and CA-5's "Connect Airbnb" button both
  still render and function in the same Online Travel Agents section,
  unaffected. No stray local `channex_channels` rows left behind by the
  failed create attempts (both 422'd before this codebase's own INSERT,
  which only runs after a real Channex success).

**Not built / genuinely unverified (needs either the shared sandbox to
free up, or a real connected channel from CA-5's Airbnb work if one is ever
completed, to prove for real):**
1. A real `deactivateChannel()` call against a real live channel, and
   confirmation that Channex's own side genuinely stops syncing.
2. A real `deleteChannel()` call against a real, already-deactivated
   channel, and confirmation via a real follow-up `GET` that it's actually
   gone (404) rather than just locally removed.
3. Whether Channex's delete endpoint cleanly rejects an attempt to delete a
   still-active channel with a clear error (the docs say delete requires
   prior deactivation, but this codebase's own discipline is "live-test
   before trusting a docs claim" — not yet possible here).

**Also flagged, not fixed (pre-existing, out of scope for this slice):**
CA-4's `check-readiness`/`activate` routes don't verify `channelId`
ownership the way the two new CA-6 routes now do — a minor IDOR-shaped gap
worth a small follow-up, not urgent (both routes are read-mostly/idempotent
Channex calls, not destructive), but noted here so it isn't forgotten.

---

## CA-5 — DONE (2026-09-16) — owner-facing Airbnb connect button; every step verified live except the real Airbnb consent screen + Channex's own code exchange (genuinely blocked, not a code defect)

Owner-facing "Connect Airbnb" button in the existing "Online Travel Agents"
section (CA-4), wired to CA-3's OAuth mechanism, gated by the same
`requireOwnerChannelManagerAccess`. Reused CA-3's token mechanism unchanged
rather than re-solving identity correlation a different way.

**Investigation done before writing any code, per instruction:** read
`server/routes/channex.js` in full. Found the CA-3 public callback
(`GET /api/channex/airbnb/callback`) already correctly resolves the
single-use token and confirms real state via `getChannel()` — genuinely
solid plumbing — but hardcoded its redirect target to the Super Admin debug
page, and the only route that generates a connection-link
(`POST /api/admin/channex/airbnb/connection-link`) was Super-Admin-only.
There was no owner-facing route or UI at all. Everything else (the token
table, the two-hop-redirect handling, `getChannel()` confirmation) was
already real and reusable as-is.

**Files touched:**
- `server/db/schema.js` — added `return_path TEXT` to
  `channex_channel_oauth_links` (idempotent `ALTER TABLE` in a try/catch,
  matching this file's existing pattern). Written at link-creation time by
  whichever route generated the token (Super Admin debug page vs. owner
  Channel Manager page); read by the one shared public callback route to
  decide where to send the browser back — since the callback has no other
  way to know who/what started the flow. `NULL` on any pre-existing rows
  falls back to the Super Admin page, unchanged from CA-3 behavior.
- `server/routes/channex.js` — the Super-Admin connection-link route's
  INSERT now explicitly writes `return_path: '/app/super-admin/channex-channel-api'`
  (unchanged behavior, just explicit). The public callback route now reads
  `link.return_path` and redirects there (falling back to the debug page
  only when there's no `link` row at all to read from, e.g. an unknown/
  expired token).
- `server/routes/properties.js` — new owner-facing route
  `POST /:id/channex/airbnb/connection-link`, gated by
  `requireOwnerChannelManagerAccess`, alongside CA-4's 8 routes. Sweeps
  stale token rows (same 4-hour pattern as CA-3), writes a fresh token with
  `return_path: '/app/channel-manager'`, calls the existing
  `generateAirbnbConnectionLink()` from `channexClient.js` unchanged, and
  wraps errors in the CA-4 `ownerFacingChannexErrorResponse()` helper (no
  new error-sanitization logic needed).
- `client/src/pages/ChannelManager.jsx` — "Connect Airbnb" button in the
  existing Online Travel Agents section (only shown when no `AirBNB` channel
  is already connected), a `?airbnb=success|failed` URL-param handler on
  mount (toast + re-fetch on success, toast on failure, then
  `history.replaceState` to strip the query string), and the
  `handleConnectAirbnb()` handler that POSTs for the URL and does a full
  `window.location.href` redirect (matching the Stripe Connect onboarding
  pattern already in this codebase).
- `client/src/i18n/index.js` — 6 new `cmOtaAirbnb*` keys, **EN block only**,
  explicitly flagged in a code comment as not-yet-translated. **These need
  FR/ES/DE/NL from John**: `cmOtaAirbnbConnectBtn`, `cmOtaAirbnbConnecting`,
  `cmOtaAirbnbConsentNote`, `cmOtaAirbnbSuccessToast`,
  `cmOtaAirbnbFailedToast`, `cmOtaAirbnbGenericError`. The 5-language `t()`
  fallback chain means these render correctly in English on every locale
  until translated — nothing is broken in the meantime.

**HopperHomes — confirmed, not assumed, per instruction item 4:** despite
sharing Airbnb's exact `kind: 'ota'`, `mapping_mode: 'listing'`, and a
similar `rate_params` shape, HopperHomes does **not** share Airbnb's OAuth
mechanism and is **not** covered by this button. Confirmed two ways: (a)
`https://docs.channex.io/channel-api-examples/hopper-homes` states a Hopper
Homes connection begins by creating a **host** — Channex registers the host
with Hopper Homes and stores the returned token itself, "no credentials to
collect from the user" — via `POST /api/v1/channels/create_host`, explicitly
called out in Channex's own docs as one of the exceptions to the shared flow;
(b) live `GET /api/v1/channels/adapter?code=HopperHomes` confirmed its
descriptor has no `payload`/`client_id`/`redirect_uri` fields at all, unlike
AirBNB's descriptor which does. **HopperHomes needs its own dedicated
`create_host`-based build** — CA-7+ scope, not touched here.

**Denial/failure path — built and verified live, not a dead end:** the
public callback redirects `?airbnb=failed&property_id=<id>` back to
`/app/channel-manager` (not the Super Admin page an owner can't reach) on
both `success=false` and an unknown/expired token with a real link row.
`ChannelManager.jsx` renders `cmOtaAirbnbFailedToast` ("Airbnb connection
didn't complete. You can try again.") and leaves the page in its normal
state — no crash, no blank state, the owner can immediately retry.

**Verified live (browser click-through, not just code review), after
restarting the dev stack mid-session — logged in as `demo@nestbook.io`,
property #1:**
- "Connect Airbnb" button renders correctly in the Online Travel Agents
  section, alongside CA-4's "Connect a channel" button, with the consent
  note underneath.
- Clicking it genuinely navigated the browser's origin to `https://airbnb.com`,
  landing on a real "Log In / Sign Up - Airbnb" page — confirmed via
  `read_network_requests` filtered to `airbnb.com` (real tracking/analytics
  calls, not a mock). The redirect URL's `client_id=vkchvl6nyv0...` matches
  the same Channex Airbnb OAuth app documented since CA-3. Deliberately did
  not proceed past this real login page — no credentials entered, nothing
  submitted, per instruction (no fake-credential sandbox exists, per Evan).
- Confirmed the DB-stored `token` (used for the callback's own identity
  resolution) and the `state` query param on the Airbnb URL are **two
  different values** — this is expected, not a bug: Channex tracks its own
  internal `state` for the Airbnb round trip and separately echoes
  NestBook's `token` back verbatim on its own subsequent redirect to our
  callback URL (documented behavior since the original investigation §1.3).
- Denial path: generated a real token via the new owner route, then called
  the public callback directly with `success=false` — confirmed `302` to
  `/app/channel-manager?airbnb=failed&property_id=1`, and confirmed in a
  real browser that the failure toast renders correctly on that page.
- Unknown-token path: confirmed `302` falls back to the Super Admin debug
  page (expected — there's no link row to read `return_path` from).
- Callback route registration: confirmed `/api/channex` (containing the
  public callback) is mounted at `server/index.js:161`, well before the
  global `requireAuth` gate at line 189 — reachable without a session, as
  required.
- Regression: the Super Admin debug page (`/app/super-admin/channex-channel-api`,
  CA-1/CA-2/CA-3) still loads and renders correctly post-change. CA-4's
  generic "Connect a channel" wizard button still renders in the same
  section, unaffected.

**Not built / genuinely unverified (needs a real Airbnb host account with a
real live listing to prove — cannot be faked, per Evan; creating fake
listings is against Airbnb's rules):**
1. Completing the actual consent screen (clicking "Continue"/authorizing on
   Airbnb's real login+consent flow).
2. Channex's own server-side code exchange at its `auth_redirect` endpoint
   and the channel object it creates as a result.
3. The final success-path redirect actually landing with a real,
   non-substituted `channel_id` and the success toast + OTA list refresh
   that follows (the toast/refresh *code path* was exercised via CA-3's
   substituted-channel-id method previously and is unchanged here, but the
   genuinely-real end-to-end round trip has not been proven).
4. The post-connect listings-discovery/mapping/activate flow for a real
   Airbnb channel — CA-3 already flagged this as its one unverified gap;
   still open, unchanged by this slice (this slice only adds the entry
   point, not the post-OAuth mapping UI, which stays CA-6+ scope).

HopperHomes' own connect flow (`create_host`-based, no OAuth) — new scope,
not previously estimated, budget as its own CA-7+ slice.

---

## CA-4 — DONE (2026-09-16) — generic descriptor-driven owner-facing wizard; every step verified live except a fresh 201 (see below — genuinely blocked, not a code defect)

Generic, adapter-descriptor-driven Channel Manager connect wizard, moved from
Super-Admin-only debug (CA-1/CA-2/CA-3) to real owner-facing UI, gated by the
existing `requireOwnerChannelManagerAccess`. Built and proven against
Booking.com only, per scope — other adapters are CA-7+.

**Files touched:**
- `server/routes/properties.js` — 8 new owner-facing routes alongside the
  existing 4 Channel Manager routes: `GET /:id/channex/adapters`,
  `GET /:id/channex/channels`, `GET /:id/channex/room-mappings`,
  `POST /:id/channex/test-connection`, `POST /:id/channex/mapping-details`,
  `POST /:id/channex/connection-details`, `POST /:id/channex/channels`
  (create — accepts an ARRAY of rate-plan rows, not one, to support OBP
  tiers), `POST /:id/channex/channels/:channelId/check-readiness`,
  `POST /:id/channex/channels/:channelId/activate`. All reuse CA-1/2/3's
  existing `channexClient.js` functions verbatim — no new Channex API
  surface, no new queue/rate-limit logic.
- `server/utils/channexClient.js` — `resolveSingleGroupId()` moved here from
  `routes/channex.js` (was a private helper on the Super-Admin router) so
  both the debug routes and these new owner routes share one implementation.
- `client/src/components/ChannelConnectWizard.jsx` — new. A generic field
  renderer (`AdapterField`) mapping all 8 descriptor field types (string,
  boolean, integer, number, select, switch, password, hidden, slug) to the
  right control, respecting `position` ordering and the conditional `rules`
  mechanism (a field hidden/shown — and forced to `with_value` when hidden —
  based on another field's current value). A 4-step wizard (adapter →
  settings/test → mapping → activate) wired to the routes above.
- `client/src/pages/ChannelManager.jsx` — new "Online Travel Agents" section
  (below Room Mapping, per the original §2.2 placement), listing existing
  connections and a "Connect a channel" button opening the wizard.
- `client/src/i18n/index.js` — ~54 new `cmOta*` keys × 5 languages
  (EN/FR/ES/DE/NL). **FR/ES/DE/NL are my own draft translations, explicitly
  flagged in a code comment above each block as needing native review** — no
  verbatim translations were supplied for this slice.

**OBP/occupancy UI (§5 of the task, building on the CA-4 rescoping
investigation's Risk 1 finding):** when the selected adapter's
`rate_params.pricing_type` is a `select` whose `options` include `"OBP"`,
the mapping step offers a Standard/OBP toggle. Choosing OBP reveals a
repeatable tier list (guests count, one of the 4 documented
`derived_option` rules — `increase_by_percent` / `decrease_by_percent` /
`increase_by_amount` / `decrease_by_amount` — a numeric value, and a
"Default" radio marking `primary_occ`), submitted as one `rate_plans[]` row
per tier, each carrying `{ derived_option: { rate: [[rule, value]] } }`
alongside the shared `rate_plan_id`. **This remains exactly as unverified as
the rescoping investigation found it** — no safe live OBP-configured channel
exists to prove the mechanism against — flagged both in the owner-facing
copy (`cmOtaObpNote`: "double-check the prices shown in this channel's own
dashboard match what you expect") and in code comments on both the frontend
tier-building logic and the backend's `derived_option` passthrough.

**Two bugs caught by live browser testing, fixed before considering this
done (neither would have been caught by curl alone or by code review):**

1. **White-label violation**: the raw `ChannexError.message` (literally
   `"Channex 422 — Validation Error…"`) was rendering verbatim in the
   owner-facing wizard's error state on a failed create — a direct breach of
   the no-Channex-branding requirement. Root cause: every new route's catch
   block did `{ error: e.message }`, and the frontend displayed
   `data.error` directly. Fixed with a new
   `ownerFacingChannexErrorResponse()` helper in `properties.js` — every
   owner-facing catch block now logs the real message server-side (for
   diagnosis) and returns only a brand-neutral `error: 'channel_connect_failed'`
   code; the frontend never renders `data.error` as text, always falling
   back to the translated `cmOtaGenericError` string. Confirmed live: the
   wizard now shows "Something went wrong. Please try again." while the
   server log still carries the real Channex error for debugging.
2. **`connection_details`'s currency wasn't rendering**: the frontend read
   `connectionDetails.result.currency`, but the real response (confirmed via
   curl during CA-2/CA-3 and reconfirmed here) nests it under
   `result.attributes.currency` — the same "extra/missing `.data` envelope
   layer" class of bug CA-2 caught once already. Fixed; confirmed live
   (`Currency: GBP` now renders in the mapping step).

**A significant, previously-unknown discovery about the shared Booking.com
sandbox test hotels — corrects CA-2's original conclusion:**

CA-2 concluded Channex enforces "only ONE active channel per (channel_code,
property)". Live testing during this slice's verification shows that's
**not the actual scope** — it's closer to **(channel_code, hotel_id),
tracked by Channex independently of both the channel object's lifecycle and
the property**:
- The BookingCom channel created and activated during CA-2/CA-3's testing
  (hotel `5868189`, property #1) is now **completely gone** — `GET /channels`
  (filtered or unfiltered) returns empty, and `GET /channels/{id}` 404s.
  Confirmed genuinely deleted, not just deactivated (likely routine staging
  cleanup between sessions, outside our control).
- Despite that, **`POST /channels` with `channel_code: "BookingCom",
  settings: {hotel_id: "5868189"}` still 422s** with `"channel with the same
  settings already exists"` — on property #1 (its original property) AND on
  a completely fresh, never-before-connected property (#2, created fresh for
  this test). Property scope makes no difference.
- The **other** shared test hotel (`6519420`) — used once, briefly, during
  CA-2's testing — is **equally blocked**, on both properties, despite never
  having been deleted+recreated the way `5868189` was.
- No live channel with either hotel_id is visible anywhere on the account
  (`GET /channels` with no filter returns `total: 0`), yet both remain
  blocked. This strongly suggests Channex retains a hidden "settings
  fingerprint" per hotel_id, independent of the channel resource itself, for
  some retention window we can't see or query via the API.

**Practical consequence**: as of this session, **neither shared public
Booking.com test hotel can be used to prove a fresh `POST /channels` 201 for
BookingCom**, on any property, for an unknown period. This is a genuine
external constraint, not a defect in this slice's code.

**What WAS verified live regardless (via both curl and real browser
click-through as an actual owner, not Super Admin — `demo@nestbook.io`,
property #1, plan `multi` + `has_channel_manager_addon`):**
- `GET /channex/adapters` → all 56 real adapters, alphabetically sorted,
  through the owner-facing route.
- The generic field renderer against Booking.com's real descriptor: "Hotel
  ID" and "Send Property Notification" render; "Property Email" is
  correctly HIDDEN by its conditional rule (tied to the notification
  toggle's current `false` value) — **confirms the `rules` mechanism works
  correctly**, not just the field-type mapping.
- `test-connection` → real `{success:true}` against hotel `5868189`,
  through the owner-facing route, as the owner.
- `mapping-details` (available:true path) → real room/rate data renders in
  the Channel room/Channel rate dropdowns.
- `connection-details`, all 3 outcome paths: **populated** (real `GBP`
  currency + 7 connection-type rows, Booking.com, now rendering correctly
  post-fix), **error → treated as unavailable** (Agoda with a fake
  `hotel_id` → a real Channex `500`, correctly caught and normalized to
  `{available:false}` at HTTP 200 — never surfaced as a hard failure). The
  distinct "empty/null but HTTP 200" case was not independently observed
  live (every real adapter tried either populated or threw) — the code path
  is symmetric and treats a null `result` the same as a missing field
  (nothing renders), so this is low-risk but not itself independently
  witnessed.
- The OBP tier UI end-to-end through real clicks: toggling to "Occupancy-based",
  adding a second tier, both rule dropdowns showing correctly translated
  labels, the "Default" radio's mutual-exclusivity working, both rows'
  values persisting into the (blocked, but correctly-attempted) create call.
- `resolveSingleGroupId()` still works correctly post-refactor (shared by
  CA-2/CA-3's admin routes and this slice's owner routes) — confirmed via
  both the create-channel attempt reaching Channex successfully (proving
  group resolution succeeded before the 422) and a direct CA-3 Airbnb
  connection-link regression check.
- The pre-emptive "already connected" check (`listChannelsForProperty` →
  `.find()` by `channel_code`) executed correctly every time (returned
  empty, allowed the attempt to proceed) — but **the 409 branch itself was
  never triggered live this session**, since no live BookingCom channel
  existed on any property throughout testing (see the sandbox-exhaustion
  finding above). Code-reviewed, not click-tested.
- Regression: `GET /api/admin/channex/adapters` and `/channex/channels` (CA-1),
  Airbnb connection-link generation (CA-3) all still return correct live data
  post-refactor. Phase 2 itself was genuinely exercised (not just
  code-reviewed) via a real `channex-push` call made to set up property #2
  as a clean test fixture — 1 room type created, 500 days of availability
  pushed (1 segment, 0 warnings), 1 rate pushed (0 warnings) — Phase 2 is
  unaffected.

**Test fixtures left in local dev DB** (harmless, local-only, not
production): property #2 ("Test Property")'s owner
(`test@localdev.example`) now has `has_channel_manager_addon = 1` and
password `ca4test1234` (was previously an unknown/unset password) — set
deliberately to get a second clean owner login for testing. Property #2 also
now has a real room ("CA-4 Test Room") and a fresh Channex property
connection. Left in place rather than reverted, matching this project's
existing pattern of leaving CA-2/CA-3 test channels in place.

**Not built** (still CA-6/CA-7+ per §3, unchanged): connection
management (list/deactivate/reactivate/update-mapping/delete) for
already-created connections, the Airbnb owner-facing UI (CA-5), a curated
adapter list (still shows all 56, including car-rental/metasearch adapters
irrelevant to NestBook's market — §5's open question, still open), and any
other adapter's real connect flow beyond Booking.com.

---

## CA-3 — DONE (2026-09-16) — Airbnb OAuth flow: link generation + callback plumbing confirmed live; full happy path still blocked on a real Airbnb account

Airbnb OAuth connect flow, Super-Admin debug only, per §1.3/§2.2's original
scoping. Re-fetched https://docs.channex.io/channel-api-examples/airbnb fresh
for this slice (not reused from CA-1's summary), per instruction.

**Files touched:**
- `server/db/schema.js` — new `channex_channel_oauth_links` table (`token`
  PK, `property_id`, `user_id`, `channel_code`, `created_at`), exactly the
  shape §2.2 proposed. No dedicated cleanup job — the connection-link route
  opportunistically sweeps rows older than 4 hours on every call instead
  (this table is only ever a handful of rows).
- `server/utils/channexClient.js` — `getChannel()` (generic single-channel
  fetch, GET, not queued), `generateAirbnbConnectionLink()`,
  `listAirbnbListings()`, `getAirbnbListingDetails()`, `createAirbnbMapping()`
  (all queued as `kind: 'other'`, same as CA-2). Unlike Booking.com, Channex
  itself creates the channel server-side during the OAuth exchange — there is
  no NestBook-initiated create call for Airbnb; `getChannel()` is how the
  callback confirms what Channex created.
- `server/routes/channex.js` — `resolveSingleGroupId()` extracted as a shared
  helper (was inlined in CA-2's create-channel route, now reused by the new
  Airbnb connection-link route too). New Super-Admin routes:
  `POST /airbnb/connection-link`, `GET /channels/:channelId`,
  `POST /channels/:channelId/airbnb/listings`,
  `POST /channels/:channelId/airbnb/listing-details`,
  `POST /channels/:channelId/airbnb/mappings`. `check-readiness`/`activate`
  are NOT duplicated — CA-2's existing channel-agnostic routes are reused
  as-is. New **public** route `GET /api/channex/airbnb/callback` (mounted on
  `channexRouter`, before `requireAuth`, same file as the existing webhook
  receiver) — resolves the single-use `token`, deletes it, calls
  `getChannel()` to confirm real state (never trusts the redirect's own query
  params), upserts `channex_channels`, redirects back into the debug page
  with `?airbnb=success|failed`.
- `client/src/admin/pages/ChannexChannelApi.jsx` — "Airbnb Connect (CA-3
  debug)" section: generate link → paste/auto-fill channel id (read from the
  callback redirect's query string on mount) → load/confirm channel →
  list listings → create mapping → check readiness → activate. Same
  one-button-per-step, raw-response-shown discipline as CA-2.

**Two discrepancies found in the fetched Airbnb docs page — both live-tested
and found wrong, flagged per instruction rather than force-fit:**

1. **The docs page claims the `connection_link` request body is wrapped
   under a `"connection_link"` key** (`{"connection_link": {group_id, ...}}`).
   Live-tested: staging **rejects nothing and works fine with a FLAT body**
   (`{group_id, properties, redirect_uri, failure_redirect_uri, token}`, no
   wrapper) — matching what the original CA-1 investigation had already
   captured from a real call. The implementation uses the flat shape, since
   it's the one confirmed to actually work.
2. **The docs page claims the adapter code is lowercase `"airbnb"`.** Live
   `GET /channels/codes` and `GET /channels/adapter?code=AirBNB` both
   confirm the real, canonical code is **`AirBNB`** (mixed case) — matching
   CA-1's already-confirmed fact. Channex's API turned out to be
   case-insensitive on the `?code=` query param (a lowercase `airbnb` query
   still resolves to the same adapter), which is almost certainly why the
   docs page's summary got the casing wrong — but the value actually stored/
   returned by Channex is `AirBNB`, which is what this codebase uses
   everywhere (schema, client, routes).

This is the second time in two slices a fetched docs.channex.io page has
been wrong on a concrete, checkable detail (CA-2 found the pricing_type/
one-channel-per-property surprises; this doc's own original investigation
flagged the same risk for `checkin_time` vs `checkin_from_time`/
`checkin_to_time`). **Live verification is not optional for this
integration — a fetched summary is a hypothesis to test, not a fact.**

**Verified live against staging:**
- `generateAirbnbConnectionLink()` → real, valid `airbnb.com/oauth2/auth`
  URL returned (confirmed twice — once via curl, once via a real UI click),
  confirmed to create zero Channex-side state (matches CA-1's original
  finding).
- The `channex_channel_oauth_links` row was written correctly (`token`,
  `property_id: 1`, `user_id: 73` — the Super Admin session's own userId,
  `channel_code: 'AirBNB'`).
- **The public callback route was exercised end-to-end against a REAL
  Channex API call**, substituting CA-2's already-real, already-active
  BookingCom channel id in place of a genuine Airbnb OAuth grant (which
  needs a real Airbnb account NestBook doesn't have — see §5 unchanged):
  simulating `GET /api/channex/airbnb/callback?success=true&channel_id=<real
  id>&token=<real token>` correctly (a) resolved and deleted the single-use
  token — confirmed by querying `channex_channel_oauth_links` before/after
  (row present, then gone), (b) called the REAL `GET /channels/{id}` and got
  the channel's actual current state back, (c) correctly upserted
  `channex_channels` (updated `updated_at`, left `channel_code` as
  `BookingCom` rather than clobbering it with `AirBNB` from the oauth link
  row — the `ON CONFLICT` clause deliberately doesn't touch `channel_code`),
  (d) redirected to the debug page with the right query string. The
  failure-path (`success=false`) and unknown/expired-token path were also
  exercised live and redirect correctly.
- **`GET /channels/:id`, `check_readiness`, and `activate` all confirmed via
  real UI clicks** against that same real channel — 200s throughout (reusing
  CA-2's already-proven readiness/activate routes unmodified, as intended).
- **`POST /channels/{id}/action/listings` tested against that same real but
  non-Airbnb channel — Channex correctly rejected it with a clean, real
  error**: `400 — ["action is not supported"]`. This proves the code calls
  the real endpoint with the right shape and surfaces the real error
  end-to-end; it does NOT prove the true Airbnb happy path (listings
  discovery, mapping creation, activation-with-real-mappings) works, since
  that requires a channel Airbnb itself actually created via a completed
  OAuth grant. **This is the one part of CA-3 that remains genuinely
  unverified — exactly the gap §5 already flagged, unchanged by this slice.**
- Regression: `git diff --stat` touches only `schema.js`, `channexClient.js`,
  `routes/channex.js`, and the one page — zero Phase 2 files. Post-change,
  CA-1's adapters/channels-list endpoints and `GET /api/admin/properties`
  all still return 200 with correct data; server logs show no unexpected
  errors across the whole walkthrough.

**Not built** (still CA-4+ per §3, unchanged): the owner-facing wizard for
either flow, `updateChannel`/`deactivateChannel`/`deleteChannel`, the
Airbnb-specific "remove every mapping before deactivate, 30-day scheduled
removal" handling (no code exercises deactivate yet for either channel type).
§5's open question #1 (a fully-live sandbox to prove Airbnb end-to-end) is
still open and now the single most useful thing to get from Evan — everything
else about the Airbnb flow that COULD be verified without a real account has
been.

---

## CA-2 — DONE (2026-09-16) — full create → readiness → activate succeeded

Booking.com connect flow, Super-Admin debug only, against Channex's shared
public staging test hotels. **Every step succeeded, including activate** —
better than the pessimistic framing in §3's CA-2 row ("Not live-tested past
[create]"). Re-fetched
https://docs.channex.io/channel-api-examples/booking.com fresh for this slice
(not reused from CA-1's summary) to confirm exact payload shapes before
writing any code, per instruction.

**Files touched:**
- `server/utils/channexClient.js` — `listGroups()`, `testChannelConnection()`,
  `getMappingDetails()`, `getConnectionDetails()`, `createChannel()`,
  `checkChannelReadiness()`, `activateChannel()`. All six connect-flow
  functions route through `channexQueue` as `kind: 'other'` (same as
  `createProperty`/`createRoomType`) — `listGroups()` is a GET, called
  directly like the CA-1 reads.
- `server/routes/channex.js` — on the existing `channexAdminRouter`:
  `GET /room-mappings`, `GET /groups`, `POST /channels/test-connection`,
  `POST /channels/mapping-details`, `POST /channels/connection-details`,
  `POST /channels/create` (validates `rate_plan_id` genuinely belongs to the
  property's `channex_room_mappings` before calling Channex; writes the
  `channex_channels` row only after a real 201), `POST /channels/:id/
  check-readiness`, `POST /channels/:id/activate` (updates local `is_active`
  only after a real success response).
- `client/src/admin/pages/ChannexChannelApi.jsx` — "Booking.com Connect
  (CA-2 debug)" section: one button per step, raw JSON shown for every
  response (success or error), dropdowns for room/rate (sourced live from
  step 2's response) and NestBook rate plan (sourced from the property's
  existing `channex_room_mappings` via the new `/room-mappings` endpoint).

**Two discrepancies found — flagged per instruction, not force-fit:**

1. **Both test hotels report `pricing_type: "Standard"` live, not the
   OBP/Standard split this task's own brief (and §3 of this doc) described.**
   Live `mapping_details` for hotel `5868189` (labelled "occupancy-based
   pricing" in the brief) returns `"pricing_type": "Standard"` and every
   rate's own `"pricing": "Standard"`, with `"occupancies": []` (empty, not
   populated) on every rate. Hotel `6519420` reports the same. This may mean
   Channex's shared sandbox hotels have been reconfigured since whoever wrote
   the original brief looked at them, or the OBP/Standard labels were never
   about `pricing_type` in the first place. Either way: the create payload's
   `pricing_type` field is populated from whatever `mapping_details` actually
   returns for the selected hotel (not hardcoded), so this cost nothing
   functionally — just noting the docs/brief and live behavior disagree.
2. **Channex allows only one active channel per `(channel_code, property)`
   pair, not one per `(channel_code, hotel_id)`.** Discovered live: after
   successfully creating+activating a BookingCom channel for property #1
   against hotel `5868189`, a second create attempt against the *other* test
   hotel (`6519420`, same property) failed with a real `422`: `{"settings":
   ["channel with the same settings already exists"]}`. This is sensible
   real-world behavior (a property can only be listed on Booking.com once)
   but means CA-4's eventual owner-facing wizard needs a pre-check ("this
   property already has an active Booking.com connection") rather than
   assuming a fresh create always succeeds. Not documented on either Channex
   page fetched for this slice — found only by triggering it live.

**Verified live against staging (not just code review) — full walkthrough
done twice: once via direct API calls, once via real clicks in the running
UI:**
- `testChannelConnection('BookingCom', {hotel_id:'5868189'})` → `{success:
  true, errors:null}`.
- `createChannel(...)` → real `201`, Channex UUID
  `01660349-9f5e-4c6b-a634-8b91f0a2569c` (first run, via curl) — confirmed
  via an independent follow-up `GET /channels?filter[property_id]=`, not
  just trusting the `201`.
- **`checkChannelReadiness()` → `{data: [], meta:{message:"Success"}}`
  (empty = no blockers) and `activateChannel()` → `{meta:{message:
  "Success"}}`, both HTTP 200 — activation genuinely succeeded**, confirmed
  by a follow-up `GET /channels` showing `is_active: true` on Channex's side,
  matching the local `channex_channels` row.
- Repeated the entire 6-step sequence a second time through actual browser
  clicks (not curl) against hotel `5868189` again (after deleting the first
  test channel to free the property's one-BookingCom-connection slot — see
  discrepancy #2): real `201`, real empty readiness, real activate success,
  local DB row landed with `is_active: 1`. Screenshots/HTTP traces confirm
  every step's raw response rendered correctly in the debug UI.
- **One real bug caught by this live UI pass, fixed before considering CA-2
  done**: the frontend read the mapping-details/connection-details responses
  as `data.result.data.rooms` — an extra `.data` that doesn't exist, because
  `getMappingDetails()`/`getConnectionDetails()` call `channexRequest()`
  WITHOUT `raw:true`, which already unwraps Channex's outer `data` envelope.
  The room/rate dropdowns silently stayed empty ("run step 2 first") even
  after step 2 succeeded until this was caught — a pure curl-based
  verification would have missed it, since the API responses were correct
  the whole time; only the browser walkthrough surfaced it.
- Regression: `git diff --stat` for this slice touches only
  `channexClient.js`, `routes/channex.js`, and the new page — zero Phase 2
  files. Post-change, `GET /api/admin/properties` and CA-1's
  `GET /api/admin/channex/channels` both still return `200` with correct
  data, and server logs show only the two expected/intentional 422s from
  testing discrepancy #2, no unexpected errors.

**Unrelated pre-existing bug noticed in passing (NOT fixed — out of scope):**
`GET /api/admin/properties` returns property #1 ("Local Dev") twice in its
list — visible as a duplicate dropdown option in both CA-1's and CA-2's
property selectors. Root cause not investigated, but the endpoint's `LEFT
JOIN users u ON u.property_id = p.id AND u.role = 'owner'` (admin.js) would
produce exactly this symptom if property #1 has two `role='owner'` user
rows. Flagged for a separate fix, not touched here.

**Not built** (still CA-3+ per §3, unchanged): Airbnb OAuth flow,
`updateChannel`/`deactivateChannel`/`deleteChannel`, the owner-facing wizard
(CA-4), any UI beyond Super-Admin debug. §5's open questions are still open
except item 1, now partially answered by this slice: create → readiness →
activate all work against the shared test hotels — Evan's help is likely
only still needed for a *third* hotel/property scenario or real OTA
credentials for channels beyond Booking.com's shared sandbox.

---

## CA-1 — DONE (2026-09-16)

Built exactly the groundwork scope from §3's table: schema table, two
read-only client functions, Super-Admin-only debug view. No connect flow —
that's still CA-2, untouched.

**Files touched:**
- `server/db/schema.js` — new `channex_channels` table (id, property_id,
  channex_channel_id, channex_group_id, channel_code, title, is_active,
  created_at, updated_at) + property index + unique index on
  channex_channel_id. Wrapped in try/catch per John's instruction (most
  `CREATE TABLE IF NOT EXISTS` blocks elsewhere in this file don't need it
  since the table doesn't exist yet on a fresh DB either way, but this
  matches the `ai_chat_logs` table's belt-and-braces pattern). **Deliberately
  named the column `channel_code`, not `channel_type`** — Channex's own field
  is called `code` (confirmed live: `"code": "BookingCom"` from
  `/channels/list`), and `channel_code` is what §2.2 of this doc already
  proposed. Empty table — stays empty until CA-2 writes to it.
- `server/utils/channexClient.js` — two new functions, both plain GETs
  (not routed through channexQueue, same as `listWebhooks`/
  `getBookingRevision` above them — a read must never queue behind a
  backed-up ARI burst):
  - `listChannelAdapters()` → `GET /channels/list`
  - `listChannelsForProperty(channexPropertyId)` → `GET /channels?
    filter[property_id]=`, `raw: true` (need `meta.total` for the debug view)
- `server/routes/channex.js` — two new routes on the existing
  `channexAdminRouter` (already mounted at `/api/admin/channex` under
  `requireSuperAdminSession` for the webhook admin endpoints — reused rather
  than creating a new router file):
  - `GET /api/admin/channex/adapters`
  - `GET /api/admin/channex/channels?property_id=<nestbook id>` — resolves
    the NestBook id to `properties.channex_property_id` itself; returns
    `{ channels: [], total: 0, notConnected: true }` (200, not an error) for
    a property with no `channex_property_id` yet.
- `client/src/admin/pages/ChannexChannelApi.jsx` — new page. Two cards:
  "Available Adapters" (searchable table, all 56) and "Connected Channels"
  (property `<select>`, sourced from the existing `GET /api/admin/properties`
  — no new properties-list endpoint needed). Read-only, no buttons.
- `client/src/admin/AdminLayout.jsx` — nav entry ("Channex Channel API",
  plug icon) + route, same pattern as every other Super Admin page.

**group_id, confirmed again on a second live call (2026-09-16, same as the
original investigation pass):** `GET /groups` still returns exactly the one
`"3ff837fb-b83e-4961-9def-204de1a325a2"` group for our staging account, a
36-char UUID string, `title: "User Group"`, with both connected properties
(`Local Dev`, `Tester's place`) listed under it. Stored as `channex_group_id
TEXT` on `channex_channels` — no separate table, per instruction. Not
populated by anything yet (CA-1 has no create flow); CA-2 will need to fetch
it live (`GET /groups`, take the first/only one — this account has never had
more than one) and stash it in this column when it creates a channel.

**Verified live against staging, not just reviewed:**
- `GET /groups` → real group UUID, format as above.
- `listChannelAdapters()` → 56 adapters via the running server, `BookingCom`
  present with the same `params` shape §1.2 already documented.
- `listChannelsForProperty()` → ran against property #1 (`Local Dev`,
  `a50e441f-…`) with zero errors, correctly empty (`{data: [], meta: {total:
  0, ...}}`) — expected, no channel exists yet.
- Debug view (`/super-admin/channex-channel-api`) — loaded in-browser via a
  real Super Admin session: adapter table renders and filters (tested
  "booking" → 5 matches incl. `BookingCom`/`Booking.com`), property selector
  switches between a not-yet-Channex-connected property (correct "connect it
  first" message) and `Local Dev` (correct "no connections yet (0 total)"
  message, not the not-connected one).
- Regression check: Super Admin Properties page still renders normally
  (8 properties, Channex column intact, no console/server errors) — this
  build touched no existing Channex read/write path.

**Not built (still CA-2+, unchanged from §3):** `testChannelConnection`,
`getMappingDetails`, `getConnectionDetails`, `createChannel`,
`checkChannelReadiness`, `activateChannel`, `deactivateChannel`,
`updateChannel`, `deleteChannel`, the Airbnb OAuth functions, and all owner-
facing UI. §5's open questions for Evan are all still open — nothing in CA-1
touched them.

---

# Channex Channel API — self-service OTA connect: investigation (no code yet)

**Investigated 2026-09-15.** Scoping-only pass, requested after Evan (Channex
co-founder) confirmed the intended white-label model is: partners build OTA
connect + room/rate mapping into their own UI via the **Channel API**, not
operate Channex's own dashboard on the customer's behalf. This is a
genuinely different Channex resource family from everything Phase 2 built —
Phase 2 (`channex-integration-phase2.md`, slices 1–9b) is the NestBook
property ↔ Channex property/room-type/rate-plan/ARI/booking pipe. This
document is about the layer ABOVE that: letting an owner connect Booking.com,
Airbnb, etc. themselves, from inside NestBook, without ever touching
Channex's dashboard.

**Method** — every claim below is either (a) quoted/derived from the two doc
sources Evan pointed to, read in full, plus the Airbnb- and Booking.com-
specific example pages, or (b) confirmed with a real, live call against
Channex staging (property #1, `a50e441f-…`, `CHANNEX_API_KEY` from
`server/.env`). This project's history has caught doc-summary tools getting
Channex field names outright wrong before ([[channex-hotel-policies-deferred]]
— `checkin_time` vs. the real `checkin_from_time`/`checkin_to_time`), so every
non-trivial claim here was re-verified live rather than trusted from a single
fetched summary. Anywhere I could not verify live (no real OTA credentials
available), it's flagged explicitly in §5 — not silently assumed.

---

## 1. The real, concrete API flow

### 1.1 Endpoints (all confirmed live against staging, not just docs)

| Step | Method + path | Confirmed live? |
|---|---|---|
| List all adapters | `GET /api/v1/channels/list` | ✅ 56 adapters returned |
| Short code/name list | `GET /api/v1/channels/codes` | ✅ |
| One adapter's descriptor | `GET /api/v1/channels/adapter?code={code}` | ✅ (BookingCom, AirBNB) |
| Test credentials | `POST /api/v1/channels/test_connection` | ✅ (clean `{success:false}` on a bogus hotel_id, no crash, nothing created) |
| OTA-side connection state | `POST /api/v1/channels/connection_details` | ✅ (Booking.com's published sandbox test hotel `5868189`) |
| OTA-side rooms/rates to map | `POST /api/v1/channels/mapping_details` | ✅ (same test hotel) |
| Property's own room types | `GET /api/v1/room_types/options?filter[property_id]=` | ✅ (already used by NestBook's own Phase 2 code, unrelated to this feature) |
| Property's own rate plans | `GET /api/v1/rate_plans/options?filter[property_id]=&multi_occupancy=true` | ✅ (same) |
| Create the connection | `POST /api/v1/channels` | Not live-tested (needs real OTA credentials to get past `test_connection` — see §5) |
| Blocking-problem check | `POST /api/v1/channels/{id}/check_readiness` | Not live-tested (needs a real `{id}`) |
| Turn on sync | `POST /api/v1/channels/{id}/activate` | Not live-tested |
| List/read/update/delete | `GET/PUT/DELETE /api/v1/channels[/{id}]` | `GET /api/v1/channels` confirmed live (empty list — no channel exists on our account) |
| Airbnb OAuth link | `POST /api/v1/meta/airbnb/connection_link` | ✅ — returned a genuine `airbnb.com/oauth2/auth?...` URL, confirmed **nothing was created** on Channex's side by generating it (`GET /channels` still empty after) |

Auth is the same `user-api-key` header as every other Channex call already
in `channexClient.js` — no new auth mechanism for the credential-based flow.
The Airbnb OAuth flow adds a genuinely new mechanism (browser redirect,
§1.3), but the API calls that drive it still use `user-api-key`.

### 1.2 The generic (credential-based) flow — confirmed shape via Booking.com

Real response from `GET /api/v1/channels/adapter?code=BookingCom`
(abbreviated — full JSON captured during this investigation, not reproduced
in full here):

```json
{
  "code": "BookingCom",
  "title": "Booking.com",
  "kind": "meta",
  "property_mapping": "single",
  "mapping_mode": "room_rate_multioccupancy",
  "params": {
    "hotel_id":       { "position": 0, "type": "string", "title": "Hotel ID" },
    "machine_account": { "position": 1, "type": "hidden", "title": "Machine Account" },
    "send_email_notifications": { "position": 2, "type": "boolean", "default": false, "title": "Send Property Notification" },
    "email": { "position": 3, "type": "string", "title": "Property Email",
      "rules": [{ "apply": "hidden", "when": false, "influence_field": "send_email_notifications", "with_value": "" }] },
    "allow_payout_method_update": { "type": "hidden", "default": false },
    "allow_payout_update": { "type": "hidden", "default": false },
    "allow_vcc_balance": { "type": "hidden", "default": false },
    "allow_vcc_fees_payout": { "type": "hidden", "default": false },
    "allow_virtual_credit_card_update": { "type": "hidden", "default": false }
  },
  "rate_params": {
    "room_type_code": { "type": "string", "title": "Room" },
    "rate_plan_code":  { "type": "string", "title": "Rate" },
    "occupancy":       { "type": "integer", "title": "Occupancy" },
    "pricing_type":    { "type": "select", "options": ["Standard", "OBP"], "default": "Standart" },
    "primary_occ":     { "type": "boolean", "title": "Primary Occupancy" },
    "readonly":        { "type": "boolean", "title": "Read Only" }
  },
  "channel_restrictions": { "currency": "EUR", "min_price": 500 }
}
```

**What this means for a UI:** `params` is a self-describing form schema —
`type` is one of `string|boolean|integer|number|select|switch|password|
hidden|slug`, each with a `position` (display order) and occasional `rules`
(conditional show/hide driven by another field's value — e.g. `email` is
only shown when `send_email_notifications` is true). A generic
"render this adapter's settings form" component can work off `params` alone,
without per-channel-hardcoded forms, **for the credential-based channels**.
`hidden`-type fields (like `machine_account`) are populated by Channex
itself, not the owner — must be omitted from the rendered form but still
included (empty/absent) in the request. `channel_restrictions` is real and
enforced server-side (Booking.com rejects any price under €5.00 — confirmed
in the descriptor, not independently re-tested since we have no live
Booking.com rates to push yet).

**The 8-step sequence** (matches the doc's own framing, each step confirmed
live except the last three):

1. `GET adapter?code=BookingCom` → render the settings form from `params`.
2. Owner fills in `hotel_id` (+ any visible optional fields) → `POST
   test_connection` with `{channel, settings}` → `{success, errors}`.
   Confirmed live: a wrong `hotel_id` returns a clean `{success:false,
   errors:null}` — **no exception, no partial state, nothing to roll back.**
3. `POST mapping_details` (same payload shape) → real room/rate structure
   from the OTA side. Confirmed live against Booking.com's own published
   staging test hotel (`5868189`, `pricing_type: Standard`) — returned 3
   real rooms ("Single Room", "Double Room", "Suite"), each with 3 real
   rates ("standard rate", "special rate", "non-refundable rate"), Booking.com's
   own numeric ids (not UUIDs — e.g. room `586818902`, rate `16385046`).
4. `POST connection_details` (same payload) → `{currency, connection_types:
   [...], connection_status}`. Confirmed live: real GBP currency, 7 real
   connection-type rows ("Reservations", "Rates and Availability", "Guest
   reviews", "Content", "Photos", "Messaging", "Reporting"), each
   `"XML Active"` for this test hotel.
5. `GET room_types/options` + `GET rate_plans/options?multi_occupancy=true`
   against the **NestBook-side** property — these are Channex endpoints
   NestBook already calls nowhere yet, but the underlying Channex room
   types/rate plans they return are the exact objects Phase 2's
   `channex_room_mappings` already created. Confirmed live against property
   #1: 5 real room types, 5 real rate plans, matching the existing mappings
   exactly.
6. Build the mapping array client-side: one entry per (Channex rate plan) ×
   (OTA room/rate pair the owner picked), each carrying
   `rate_params`-shaped `settings` (`room_type_code`, `rate_plan_code`,
   `occupancy`, `pricing_type`, `primary_occ`, `readonly`). For an
   **occupancy-based (OBP)** hotel, one mapping row per occupancy option is
   needed; for **Standard** pricing, one row per rate suffices. This is a
   real branch a mapping UI must handle — not cosmetic.
7. `POST /api/v1/channels` with `{channel: {channel, group_id, properties:
   [propertyUuid], currency, settings, rate_plans: [{rate_plan_id,
   settings}, ...]}}`. **`group_id` is a real, separate Channex concept** —
   confirmed live via `GET /api/v1/groups`: every NestBook-connected
   property already belongs to a Channex "group" (`3ff837fb-…`, "User
   Group" for our staging account), auto-created by Channex, not something
   NestBook manages today. **Not live-tested past this point** — a real
   `hotel_id` we don't own would be rejected by `test_connection` in step 2
   already, so I could not push a real create through to see the 201
   response shape end-to-end (see §5, item 1).
8. `check_readiness` → `activate`. Per docs only: readiness returns an empty
   list when clear to activate; activation triggers Channex's own full
   resync of availability/rates/restrictions using the ARI values already
   sitting on the mapped rate plans (i.e., whatever Phase 2's existing push
   already put there — no new ARI logic needed on NestBook's side).

### 1.3 Airbnb — genuinely different, OAuth-based, confirmed live end-to-end for the link generation

This is the one flow this investigation could exercise almost completely
live, since generating an OAuth link (unlike `test_connection`) doesn't
require real Airbnb credentials — it just needs a valid NestBook-side
`group_id`/`property_id`.

**Step 1 — generate the authorization URL:**

```
POST /api/v1/meta/airbnb/connection_link
{
  "group_id": "3ff837fb-b83e-4961-9def-204de1a325a2",
  "properties": ["a50e441f-bbd8-40b6-a69e-f728953a976e"],
  "redirect_uri": "<our success callback>",
  "failure_redirect_uri": "<our failure callback>"
}
```

Real response (staging, verified 2026-09-15):

```json
{
  "data": {
    "type": "connection_link",
    "attributes": {
      "url": "https://www.airbnb.com/oauth2/auth?scope=property_management%2Cmessages_read%2Cmessages_write&state=40d7f6da-55d1-4bdf-8dd1-ed27a2f229de&client_id=vkchvl6nyv02w16ncouipz3y&redirect_uri=https%3A%2F%2Fstaging.channex.io%2Fapi%2Fv1%2Fmeta%2Fairbnb%2Fauth_redirect"
    }
  }
}
```

**This confirms, concretely, the exact moment Evan's "always shows Channex
branding" constraint applies**: `client_id=vkchvl6nyv02w16ncouipz3y` is
Channex's own registered Airbnb OAuth app — not NestBook's, not
white-labelable, confirmed by the fact that the URL is generated
server-side by Channex with a client_id we don't control and can't override
in the request. The owner sees this the moment they land on
`airbnb.com/oauth2/auth` — Airbnb's own consent screen will identify the
requesting app by that client_id (as "Channex" or "Channex Test App" on
staging, per Evan). **Nothing NestBook builds can change this screen** — the
only lever is the NestBook-side copy shown immediately before the redirect
("You'll be redirected to Airbnb's own site to grant access — you may see
our sync partner's name during this one step").

**Step 2 — the two-hop redirect (confirmed, not assumed):** the OAuth
`redirect_uri` embedded in that URL is `https://staging.channex.io/api/v1/
meta/airbnb/auth_redirect` — **Channex's own callback, not ours.** So the
real sequence is:

1. NestBook backend calls `connection_link` with our own `redirect_uri` /
   `failure_redirect_uri`.
2. NestBook frontend sends the owner's browser to the returned Airbnb URL.
3. Owner authorizes on Airbnb's own site (the unavoidable Channex-branded
   moment).
4. Airbnb redirects the browser to **Channex's** `auth_redirect` endpoint
   (not ours) — Channex exchanges the OAuth code server-side, creates the
   channel connection (`is_active: false`, default title "New AirBNB
   Channel"), then performs a **second** redirect to whichever `redirect_uri`
   / `failure_redirect_uri` we originally supplied, appending
   `?success=true&channel_id={id}&token={token}` (or
   `?success=false` on failure).
5. NestBook's own route at that `redirect_uri` receives the browser back.

**Why this matters architecturally:** the browser leaves NestBook's origin
for two full hops (Airbnb, then Channex) before returning. A same-origin
session cookie is not a safe way to correlate "which NestBook user/property
initiated this" when the browser comes back — which is exactly why Channex's
`connection_link` accepts an optional `token` field explicitly "echoed back
in redirect" for this purpose. **The callback route must be public** (same
pattern as the existing `POST /api/channex/webhook` receiver — mounted
before `requireAuth`), and must resolve identity via that `token`, not via
session state. This differs from NestBook's one existing redirect-out/
redirect-back pattern (`POST /api/stripe/connect/start` →
`stripe.accountLinks.create()`, `server/routes/stripe.js:460`), which is a
**single**-hop redirect (Stripe → us directly) and doesn't need a token
round-trip because the connected-account id is already durably stored
against the logged-in user before the redirect happens. The Stripe pattern
is still the right template for the "click → redirect → land back with a
result" UI shape, but the server-side correlation logic needs its own
short-lived token table (§2), not a copy of Stripe's approach.

**Step 3 onward — discovery, mapping, activation** (from the Airbnb example
doc, not independently re-verified live — would need a real Airbnb account
to complete the OAuth grant):

- `GET /channels/{channel_id}/action/listings` → the account's real Airbnb
  listings (id, title, occupancies, city, country, quality_status).
- `GET /channels/{channel_id}/action/listing_details?listing_id=` → full
  listing metadata (booking_settings, pricing_settings, availability_rules)
  — used to auto-seed reasonable defaults, not required reading for the
  mapping step itself.
- `POST /channels/{channel_id}/mappings` `{mapping: {rate_plan_id, settings:
  {listing_id}}}` — **submitted to Airbnb immediately**; per the doc, an
  Airbnb-side rejection cancels the mapping creation (not a "create then fix
  later" flow), and creation is **asynchronous** (~30 seconds for Airbnb's
  own confirmation) — a mapping UI needs a pending/polling state, not an
  instant result.
- `activate` requires ≥1 mapped rate plan + ≥1 attached property (same
  general shape as the generic flow's readiness gate).
- **Deactivation has an Airbnb-specific extra step**: per the doc, every
  rate-plan mapping must be removed *before* deactivating, and removal is
  "scheduled 30 days later" — i.e., Airbnb listings don't detach instantly.
  This is a real UX wrinkle a generic "Deactivate" button can't paper over
  for this one channel.

### 1.4 Channel-specific quirks (the doc's own explicit warning)

The Channel API docs state outright: *"Channels are different!"* — some
skip `mapping_details` entirely, some reorder steps, some (Airbnb) require
OAuth instead of credentials. This is not incidental — 31 channel-specific
example pages exist (agoda, booking.com, expedia, hotelbeds, klook, and 27
others), each presumably documenting its own deviation. This investigation
read Booking.com and Airbnb in full (the two most likely first targets and
the two structurally different flows: credential-based vs. OAuth-based);
the other 29 were not read — see §5.

---

## 2. Mapping against NestBook's existing architecture

### 2.1 What already exists and gets reused as-is

- `server/utils/channexClient.js` — the low-level `channexRequest()` helper,
  auth header, error handling, and `channexQueue` write-routing pattern are
  all channel-agnostic infrastructure. New Channel-API functions
  (`listChannelAdapters`, `getChannelAdapter`, `testChannelConnection`,
  `getMappingDetails`, `getConnectionDetails`, `createChannel`,
  `getChannel`, `listChannels`, `updateChannel`, `activateChannel`,
  `deactivateChannel`, `checkChannelReadiness`, `deleteChannel`,
  `executeChannelAction`) belong here, following the exact same
  `queuedWrite()`/`channexRequest()` shape every existing function already
  uses. **No new client architecture needed.**
- `server/utils/channexQueue.js` — the per-property rate limiter is
  ARI-specific (`kind: 'ari'`) today; Channel API writes (create/update/
  activate/deactivate) are low-frequency, one-off actions, not bursty like
  availability/rate pushes — they should route through as `kind: 'other'`
  (the existing catch-all for object CRUD), exactly like
  `createProperty`/`createRoomType` already do. No queue changes needed.
- `channex_room_mappings` — **untouched, and deliberately not reused for
  this.** It tracks NestBook ref ↔ Channex room_type/rate_plan (the PMS-side
  pairing Phase 2 owns and creates). The new OTA-side pairing (Channex rate
  plan ↔ OTA room/rate code) is a completely different relationship that
  Channex itself owns and computes (`known_mappings` on the channel
  resource) — see 2.2 for why this should NOT be mirrored into a NestBook
  table.
- The existing `properties.channex_property_id` connectivity check pattern
  (`isChannexPropertyConnected`) is the right gate for "can this property
  even attempt an OTA connect" — a Channel API connect obviously requires
  the property to already be Channex-connected (Phase 2's own connect flow)
  first.

### 2.2 What's genuinely new

**Schema — two new tables, deliberately small:**

- **`channex_channels`** — one row per OTA connection NestBook has
  initiated for a property. Columns: `id`, `property_id`, `channex_channel_id`
  (Channex's UUID), `channel_code` (e.g. `BookingCom`, `AirBNB`), `title`,
  `is_active`, `created_at`, `updated_at`. **This table exists purely so the
  Channel Manager page has something to list without an extra round-trip to
  Channex on every page load** — it is NOT the source of truth for
  `is_active` or mapping state (Channex is). Every write to it should be
  immediately followed by (or better, derived from) a fresh
  `GET /channels/{id}` response, the same "recompute from source, don't
  trust a cache" discipline `channexPushInventory.js` already uses
  everywhere else in this codebase.
- **`channex_channel_oauth_links`** (Airbnb-style flows only) — `token`
  (PK), `property_id`, `user_id`, `channel_code`, `created_at`. Written
  right before generating the `connection_link`, read (and deleted) by the
  public callback route to resolve identity. Needs a short TTL / cleanup —
  the OAuth URL itself is only valid 2 hours per the docs, so an hourly
  sweep of rows older than, say, 4 hours is enough; no need for anything
  fancier.

**Deliberately NOT building:** a local mirror of Channex's `known_mappings`
(OTA-side room/rate pairing). Channex is already the authoritative source
for that relationship (`GET /channels/{id}` returns it fresh, complete, on
demand) — duplicating it locally would be exactly the kind of
cache-that-can-drift this codebase has consistently avoided elsewhere (e.g.
`buildTargets()` always recomputes from the DB rather than trusting a
snapshot). Fetch it live when rendering the mapping UI.

**New routes** (`server/routes/channex.js` already exists for the public
webhook receiver — the owner-facing routes below fit better in
`server/routes/properties.js`, alongside the existing owner-facing
`channex-connect`/`channex-resync`/`channex-disconnect`/`channex-status`
routes and their shared `requireOwnerChannelManagerAccess` gate):

- `GET /api/properties/:id/channex/adapters` — proxies `channels/list`,
  probably filtered/curated server-side (see §3, open question) rather than
  exposing all 56 raw adapters.
- `POST /api/properties/:id/channex/test-connection`
- `POST /api/properties/:id/channex/mapping-details`
- `POST /api/properties/:id/channex/connection-details`
- `POST /api/properties/:id/channex/channels` (create)
- `GET /api/properties/:id/channex/channels` (list, proxies `GET /channels?
  filter[property_id]=`)
- `POST /api/properties/:id/channex/channels/:channelId/check-readiness`
- `POST /api/properties/:id/channex/channels/:channelId/activate`
- `POST /api/properties/:id/channex/channels/:channelId/deactivate`
- `PUT /api/properties/:id/channex/channels/:channelId` (update mapping)
- `DELETE /api/properties/:id/channex/channels/:channelId`
- `POST /api/properties/:id/channex/airbnb/connection-link` — generates the
  OAuth URL, writes the `channex_channel_oauth_links` row.
- `GET /api/channex/airbnb/callback` — **public**, mounted before
  `requireAuth` like the existing webhook route. Resolves `token` →
  property/user, calls `GET /channels/{channel_id}` to confirm state,
  upserts `channex_channels`, redirects the browser into the Channel
  Manager page with a `?connected=airbnb` (or `?failed=airbnb`) flag for a
  toast.

**New UI** — an "Online Travel Agents" section on the existing
`ChannelManager.jsx` page (below Room Mapping, per the task-before-this-one's
placement), with two distinct sub-flows:

1. A generic multi-step "Add a channel" wizard (adapter picker → dynamic
   settings form rendered from `params` → Test Connection → mapping table
   built from `mapping_details` + the property's own room types/rate plans
   → Create → Readiness (show blocking problems if any) → Activate) — this
   is genuinely new, non-trivial client state-machine work; nothing in the
   current codebase is shaped like it.
2. A one-click "Connect via Airbnb" button (redirect-out) + a callback
   landing state + a post-OAuth mapping step (listings → per-listing
   mapping, same "Create → Activate" tail as the generic flow, different
   head).

Both need a persistent "sync issues?" note per connected channel,
acknowledging Evan's third confirmed constraint: **no API exists for "did
this update land," so a failed sync is only visible in Channex's own
dashboard.** The honest UI answer is a line like *"If availability or rates
look wrong on this channel, contact support"* — Super Admin still needs
real Channex dashboard access as the actual investigation tool; this is a
permanent gap, not a v1 shortcut to close later.

---

## 3. Scope estimate

Phase 2 (`channex-integration-phase2.md`) — the full bidirectional PMS pipe
(property/room-type/rate-plan creation, ARI push both ways, seasonal rates,
inbound webhook booking sync, room-type reconciliation, disconnect,
certification-prep rate limiting/queue/retry) — ran across **9 slices + 2
follow-up fixes (9a/9b), 2026-09-07 through 2026-09-10 (~4 days)**, and had
almost no owner-facing UI until the very end (a connect/disconnect button).

This build is a **different shape of work, and honestly comparable in size
or somewhat bigger**, for three concrete reasons:

1. **Two structurally different flows, not one.** Phase 2 was one deep,
   uniform pipe (every room/rate/availability object looks the same to
   Channex). This is a credential-form flow AND a redirect-based OAuth flow
   that share almost no UI code and only partially share backend shape.
2. **Real, non-trivial owner-facing UI.** Phase 2's only owner-facing
   surface (until today's separate Channel Manager page work) was a
   connect/disconnect button. This needs a genuine multi-step wizard with
   branching (OBP vs. Standard occupancy mapping, adapter-driven dynamic
   forms, an async-confirmation polling state for Airbnb mappings) — closer
   in complexity to the booking-creation flow than to anything Phase 2 built.
3. **Per-channel quirks compound.** Every additional OTA beyond the first
   two is not free — each may reorder steps, skip `mapping_details`, or
   need bespoke copy (per the docs' own "Channels are different!" warning).

**What's genuinely reused, keeping this from being bigger still:** all ARI
push/pull logic, the booking webhook receiver, the rate limiter/queue, and
room-type/rate-plan creation are Phase 2's already-built, already-certified-
ready pipe — this build only adds the "how does a real OTA connection come
into existence" layer on top. Once a channel is `activate`d, Channex starts
pulling from the exact rate plans/room types Phase 2 already keeps in sync —
no new sync logic required.

### Proposed slices (same granularity as Phase 2's 1–9b, not one giant build)

| Slice | Scope | Rough size vs. Phase 2 |
|---|---|---|
| **CA-1** | Channel API client groundwork: `channexClient.js` functions, `channex_channels` schema table, Super-Admin-only read-only "list adapters / list channels for a property" debug view (mirrors Phase 2's SA-first pattern) | ~ Slice 1+2 combined |
| **CA-2** | Credential-based connect, end-to-end, for **one** representative channel (Booking.com — best-documented, biggest OTA) proven against Channex's own published staging test hotels (`5868189`/`6519420`) — test_connection → mapping_details → create → readiness → activate, still Super-Admin-only or a hidden route first | ~ Slice 3 (comparable intricacy: OBP vs. Standard branching is genuinely fiddly) |
| **CA-3** | Airbnb OAuth flow end-to-end: `connection_link` + public callback route + `channex_channel_oauth_links` table + listings discovery + async mapping + activate. Needs a real Airbnb test account from Channex/Evan to complete live (see §5) | ~ Slice 3–4 (new redirect/callback plumbing, but the Stripe Connect pattern gives a head start on the UI shape) |
| **CA-4** | Owner-facing "Add a channel" wizard UI for the credential-based flow (CA-2), wired into `ChannelManager.jsx` | New UI complexity Phase 2 never had — hard to size against a Phase 2 slice directly; budget as a full slice on its own |
| **CA-5** | Owner-facing Airbnb connect UI (button → redirect → callback landing → post-OAuth mapping), wired into `ChannelManager.jsx` | ~ Slice 8 (disconnect path) in mechanical size, but the OAuth redirect state adds real edge cases (what if the owner never returns? what if `success=false`?) |
| **CA-6** | Connection management: list/deactivate/reactivate/update-mapping/delete on the Channel Manager page for already-connected channels | ~ Slice 8 |
| **CA-7+** | Each additional OTA beyond Booking.com/Airbnb | Not a fixed slice — incremental, budget per-channel once CA-2/CA-4's generic form-rendering proves out how much of the "Channels are different!" warning actually bites in practice |

**Do not attempt this as one build.** CA-1 and CA-2 alone (groundwork + one
proven live flow, no owner UI yet) is a reasonable, demo-able first
milestone — mirrors exactly how Phase 2 kept early slices Super-Admin-only
before any owner-facing surface existed.

---

## 4. What NestBook already has that this can lean on

- `requireOwnerChannelManagerAccess` (`server/routes/properties.js:1220`) —
  the exact right gate for every new owner-facing route here; no new gating
  concept needed.
- The `ChannelManager.jsx` page (shipped earlier today) already has the
  right shape — a settings-card-per-section page with a status/toast
  pattern — for the new "Online Travel Agents" section to slot into.
- The Stripe Connect onboarding pattern (`server/routes/stripe.js:460`,
  `accountLinks.create()` → redirect → return_url) is the closest existing
  analog for the Airbnb "click, leave, come back" UI shape, though the
  server-side correlation logic differs (§1.3).
- The existing public-route-before-`requireAuth` pattern (`POST
  /api/channex/webhook`, `server/routes/channex.js`) is the template for
  the new Airbnb OAuth callback route — also public, also needs its own
  non-session-based identity resolution.

---

## 5. Open questions / follow-ups for Evan (flagged rather than guessed)

1. **The single biggest gap in this investigation**: every claim about
   `POST /channels` (create), `check_readiness`, and `activate` beyond the
   documented shape is **not independently live-verified**, because getting
   past `test_connection` requires real OTA credentials NestBook doesn't
   have (a real Booking.com `hotel_id` we control, or a real Airbnb account
   to complete the OAuth grant). **Ask Evan**: does Channex have a
   fully-live sandbox OTA (a Booking.com test hotel we can actually push a
   real connection through, not just read `mapping_details`/
   `connection_details` against) we could use to prove the full create →
   readiness → activate path before building the UI around it?
2. **Curated adapter list**: 56 adapters exist; most (WebBeds, Hotelbeds,
   Keytel, various DMCs/wholesalers) are wholesale/B2B channels, not
   relevant to NestBook's target market of independent B&Bs/guesthouses.
   Which specific OTAs should the v1 "Add a channel" picker actually show?
   This is a product decision, not something to infer from the API.
3. **Per-property/per-plan channel limits**: does NestBook's white-label
   agreement cap the number of active channel connections per property, or
   is that unlimited/billed separately? Affects whether the UI needs a
   "you've reached your limit" state at all.
4. **Airbnb app review**: since the OAuth `client_id` belongs to Channex
   (not NestBook), does Airbnb require any additional per-white-label-
   partner approval before this goes live in production, or is Channex's
   own app approval sufficient for every partner using it?
5. **`connection_link`'s `token` semantics**: confirmed it's echoed back
   verbatim in the redirect, and the URL is valid 2 hours — but is `token`
   single-use, or could the same value be reused/replayed if a callback
   never fires? Matters for how strict `channex_channel_oauth_links`
   cleanup/invalidation needs to be.
6. **The other 29 channel-specific example pages** (Expedia, Agoda, Hopper,
   Klook, etc.) were not read this pass — only Booking.com and Airbnb, the
   two structurally different flows and the two most likely first targets.
   Any channel added in CA-7+ needs its own doc-read + live-test pass before
   estimating it, per the "Channels are different!" warning — don't assume
   Booking.com's 8-step shape is universal.

---

## Confirmed facts (don't re-check next time)

- Channel API base is the same `https://staging.channex.io` /
  `user-api-key` auth as every other Channex call already in
  `channexClient.js` — no new base URL or auth mechanism.
- Airbnb's adapter `code` is **`AirBNB`** (exact casing, confirmed via both
  `channels/codes` and `channels/list`) — not `Airbnb`.
- A property's Channex `group_id` is a real, pre-existing Channex concept
  (`GET /api/v1/groups`), auto-populated, not something NestBook currently
  tracks anywhere — needed as a request field for `connection_link` and
  likely `POST /channels` too.
- Generating an Airbnb `connection_link` does **not** create any Channex-side
  state (confirmed: `GET /channels` stayed empty after generating one) — safe
  to call speculatively / on every page load if ever useful, no cleanup
  required if the owner abandons the flow.
- `test_connection` against a real channel/settings shape with a wrong
  credential fails cleanly (`{success:false, errors:null}`, `200`, no
  exception) — never a crash, matches this codebase's existing
  never-throw-on-a-bad-external-response discipline elsewhere.
