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
