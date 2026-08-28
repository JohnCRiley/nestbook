# Media Library — Phase 1b (the page)

Status: **in progress** (started 2026-08-29)
Scope: frontend page only, on top of the Phase 1a endpoints. Click-to-assign, **no drag-and-drop** (deferred).

Read `media-library-phase1a.md` for endpoint shapes + known limitations.

---

## Confirmed facts (from 1a — do not re-check)

- `GET /api/properties/:id/media` → `{ hero, propertyAccessPhoto, categories[], rooms[] (each {id,name,type,parentUnitId,categoryId,limit,photos[]}), unitAccessPhotos[], pool {cap,count,photos[]} }`
  - **1b addition:** added `categories` (`[{id,name}]`) + `room.categoryId` to this endpoint so the page can group by category without a second call. Small, backwards-compatible.
- `PATCH /api/rooms/photos/:photoId { roomId: <id>|null }` — the ONLY reassignment path. Enforces destination limit / pool cap server-side, returns 403 + `{error}` on violation.
- `POST /api/properties/:id/media/upload` (multipart `photo`) and `/media/upload-url` (`{url}`) — add to pool, enforce cap, fire the moderation flag.
- Existing `POST/DELETE /api/rooms/:roomId/photos*` untouched — the per-room strip in `RoomPanel.jsx` keeps working.
- Photo objects have `id`, `url` (`/uploads/rooms/x.jpg`), `thumbUrl`. hero / propertyAccessPhoto / unitAccessPhotos have **only `{filename,url}`** (+ roomId/roomName for unit) — **no photo id**, so they are NOT reassignable from this page (single-slot, managed in Settings / per-unit). Display + copy-URL only.

---

## Decisions

- New route `/media-library` → `client/src/pages/MediaLibrary.jsx`. Sidebar nav item `mediaLibrary` placed right after `rooms`.
- **Selection model:** one selected photo id at a time (pool or room-attached). Click a photo to select/deselect. Selected → shows a "copy image URL" action + (if room-attached) "move to unassigned".
- Click an **empty** room slot with a photo selected → `PATCH { roomId }`. Click a **filled** slot with a *different* photo selected → toast "that spot is taken", no swap. Click a filled slot with nothing / itself selected → select/deselect that photo.
- "Remove" on a room photo → `PATCH { roomId: null }`. 403 (pool full) → clear toast, no-op. Pool photos have no "remove" (no permanent-delete endpoint exists in 1a — noted as a gap).
- Hero + property access + unit access squares: rendered visually distinct (labelled, no grey "empty slot" affordance, no move target). Copy-URL only. A small "Change in Settings" hint.
- Copy-URL copies `window.location.origin + photo.url` (absolute, permanent).
- After any successful mutation: re-fetch `/media` (keeps `pool.cap/count` and every room's fill state exactly right — cheaper than reconciling client-side).
- All strings under `ml.*` keys in all 5 locales.
- Page is **not** plan-gated — free owners have photos + a pool too.

---

## Files touched — DONE (built + verified 2026-08-29)

- [x] `server/routes/properties.js` — `/media` now returns `categories` (`[{id,name}]`) + `room.categoryId`
- [x] `client/src/pages/MediaLibrary.jsx` — NEW page (~430 lines): PoolSection / RoomRow / PhotoTile / SingleSlot
- [x] `client/src/index.css` — `.ml-*` styles block appended (grid, tiles, slots, selection bar, toast, responsive)
- [x] `client/src/App.jsx` — `<Route path="/media-library">`
- [x] `client/src/components/Sidebar.jsx` — nav item after `rooms`, `ownerOnly: true` (matches guest-mailer/info-sheet/activity-log)
- [x] `client/src/components/Icons.jsx` — `IconMediaLibrary` (image glyph)
- [x] `client/src/i18n/index.js` — `mediaLibrary` + 41 `ml.*` keys × 5 locales (inserted after each `'nav.propertyCharges'` line)

---

## Verification (2026-08-29, live stack, real user 1, DB restored after)

| Check | Result |
|---|---|
| Page renders — IR Named (prop 1) | ✅ pool / property / rooms; no utility section |
| Page renders — IR Categories (prop 27) | ✅ rooms grouped under Double / Single / Family |
| Page renders — WP (prop 28) | ✅ "Sections" heading, flat list, no utility section; a 4/3 over-limit room renders fine (0 empty slots) |
| Page renders — Units (prop 12) | ✅ "Unit access photos" utility section, units bold with nested "Internal rooms", limit 1/1, "No internal rooms" for a childless unit |
| Cap maths | ✅ IR free 4 rooms → 24; units 3 rooms → 17 (`3×1 + 1 + 1 + 2 units + 10`); cat 3 rooms → 21 |
| Select pool photo → selection bar + 11 empty slots become targets | ✅ |
| Click empty room slot with photo selected → moves, pool count -1, room count +1, selection clears | ✅ toast "Photo moved" |
| Click blocked (full-room) slot with a different photo selected | ✅ toast `"<name>" is full - move or remove a photo there first.`, no move |
| Remove (✕) on a room photo → goes to pool | ✅ toast "Photo moved to unassigned", counts update |
| Remove when pool is at cap (24/24) | ✅ server 403 surfaced as toast, photo stays put |
| Pool at cap → add controls hidden, amber usage + warning note | ✅ |
| Copy image URL (selection bar + hero single-slot) | ✅ copies `window.location.origin + /uploads/...`, toast "Link copied" |
| Direct pool upload — file (multipart) | ✅ pool +1, toast |
| Direct pool upload — URL | ✅ pool +1, toast, form closes |
| Hero / access / unit-access squares: distinct (labelled, no grey empty affordance, "Change in Settings" hint), copy-only | ✅ |
| Existing per-room `POST/GET/DELETE /api/rooms/:id/photos*` | ✅ 201 / reflects / 204 — unchanged |
| `vite build` | ✅ passes |
| `/media` never bypasses the API (no direct processRoomPhoto / DB from frontend) | ✅ all writes via PATCH / media/upload* endpoints; uploads fire the content_flags row server-side |

Browser `computer` clicks were unreliable (0×0 pane); interactions driven via `javascript_tool` calling the real React handlers / DOM click(), which exercises the same code paths.

---

## Known gaps / notes (for a later phase)

- **No permanent delete for pool photos.** Phase 1a never added one (the only removal is the moderation queue). Pool photos on this page show copy-URL only, no ✕. If owners need to purge unwanted pool photos, add `DELETE /api/properties/:id/media/:photoId` (+ file cleanup + flag cleanup) later.
- No drag-and-drop (deliberate — click-to-assign only this phase).
- No swap: assigning onto a full room is blocked with a message, never a swap.
- Hero / access photos can't be *set* from a pool photo here (no endpoint) — only viewed + copied. Setting them stays in Settings.
- Pool `display_order` can have duplicate ordinals after a room-delete detach (Phase 1a note) — the page sorts by `displayOrder, id` so order is still stable; not re-sequenced.
