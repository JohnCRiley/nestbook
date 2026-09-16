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
