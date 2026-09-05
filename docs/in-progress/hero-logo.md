# Feature: property logo in the booking-page hero (beside the property name)

Status: **built + verified in-browser** on 2026-08-30, then bug-fixed on
2026-09-06 (transparent-PNG logos were showing a solid black background, and
the chip's border/shadow was too heavy — see "2026-09-06 fix" below).
Committed to `main`. Safe to delete / move to docs/completed once John has
eyeballed it on real data.
Started 2026-08-30 (John).

## 2026-09-06 fix — transparency + chip styling

The original build (below) deliberately stored logos as **opaque JPEG**,
treating that as a fixed constraint the chip design had to work around. That
was itself the bug: sharp's JPEG encoder has no alpha channel, so any
transparent-background PNG a user uploaded was silently flattened to solid
black. Root cause confirmed via `sharp(...).metadata()` / raw pixel
inspection, not assumed.

Fix — [properties.js:1041](../../server/routes/properties.js) — logo uploads
are now encoded as **PNG** (`filename` ends `.png`, `.png()` instead of
`.jpeg({ quality: 85 })`), which preserves alpha when the source has it and
behaves like a normal opaque image when it doesn't. Verified end-to-end: a
generated transparent PNG uploaded through the real
`POST /api/properties/:id/logo` endpoint round-tripped with `hasAlpha: true`
and a genuinely `alpha: 0` corner pixel (not `rgb(0,0,0)`), and rendered with
the chip's white background showing through on the live booking-page hero.

Room/property photos (`hero_photo`, `access_photo`, room photos) are
**untouched** — they stay JPEG; only the logo upload route's `sharp()` call
changed. That's the *only* pipeline: emails, the QR-code centre overlay, and
the Settings logo previews were investigated and confirmed to all reference
this exact same stored file (`/uploads/logos/<logo_url>`) rather than a
separate pipeline, so fixing this one route fixes every surface at once.

One knock-on fix was needed: [infoSheet.js](../../server/routes/infoSheet.js)
`buildLogoDataUrl()` had hardcoded `data:image/jpeg;base64,...` regardless of
the actual file — harmless while every logo really was a JPEG, but would have
silently broken (wrong-mimetype data URI) once logos could be PNG. Now derives
the mimetype from the file extension (map covers `.png`/`.jpg`/`.jpeg`/`.webp`,
falls back to `image/jpeg` for anything else), so existing already-uploaded
`.jpg` logos keep working exactly as before.

Chip styling ([bookingPage.js:1310](../../server/routes/bookingPage.js)) —
`.hero-logo-chip` border softened `rgba(0,0,0,.10)` → `rgba(0,0,0,.06)`, shadow
softened `0 2px 6px rgba(0,0,0,.16)` → `0 1px 3px rgba(0,0,0,.10)`; the
`.wp-stats-name .hero-logo-chip` shadow softened `0 1px 3px rgba(0,0,0,.14)` →
`0 1px 2px rgba(0,0,0,.08)`. Border kept (not removed) — the original design
notes below flag that the border is what separates a pale/white logo from the
light WP bar background, so removing it entirely risked the exact regression
already anticipated in "Follow-up / notes"; thinned instead of dropped.
Colour (`background:#fff`), size, radius, and layout untouched.

## Goal

Show `properties.logo_url` in the booking-page hero, immediately to the left of
the `<h1>` property name, in every rental mode. Additive — nothing currently in
the hero moves or changes. No widget changes (explicitly out of scope this pass).

## Confirmed facts (verified in the investigation that preceded this — do NOT re-check)

- `properties.logo_url` → file in `server/uploads/logos/`, served at
  `/uploads/logos/<file>`. Stored by `POST /api/properties/:id/logo`
  ([properties.js:1031](../../server/routes/properties.js)) as
  `sharp().resize(300, 300, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 })`:
  - **aspect ratio preserved** (NOT squared) — can be a wide wordmark or a square icon
  - **opaque JPEG, no transparency** — a transparent PNG upload is flattened
  - max 300px on the longer edge
  - => needs a `contain` + light "chip" treatment (rounded, white bg, border),
    never a bare `<img>`. Every existing consumer already does this:
    email header ([emailWrapper.js:24](../../server/utils/emailWrapper.js)),
    info sheet ([InfoSheet.jsx:129](../../client/src/pages/InfoSheet.jsx)),
    specials flyout ([bookingPage.js](../../server/routes/bookingPage.js) `.specials-flyout-logo`).
- **One server renderer**: `generateBookingPage()` in
  [server/routes/bookingPage.js](../../server/routes/bookingPage.js)
  (route at `bookingPageRouter.get('/:identifier')`, `SELECT p.*` so `logo_url`
  is already in scope — no query change needed).
- The hero has **two** header renderers / three visual contexts:
  1. **Dark-overlay context** — `.hero-overlay`, white `<h1>` over a dark
     photo / Google-map iframe / solid `palette.dark` backdrop. Used by:
     - IR-Named / IR-Categories / Units  (the shared `else` branch, ~L826-838)
     - WP-without-photos                  (`.hero.hero-whole`, ~L813-823)
  2. **Light-bar context** — WP-with-photos: `<h1>` sits in `.wp-stats-name`
     inside the sticky white `.wp-stats-bar` below the photo gallery (~L794-805).
     Dark text on near-white background.
- Type badge (`.hero-badge`) — in the dark contexts it sits on its **own line
  above** the `<h1>`; in `.wp-stats-name` it sits **inline before** the `<h1>`.
  Must be untouched in both.
- Widget (`widget.js`) has no logo/name branding at all — only the theme
  colour palette. Its config endpoint `/api/widget/property` does not return
  `logo_url`. Out of scope.
- Global reset on the page: `*,*::before,*::after { box-sizing: border-box; margin:0; padding:0 }`
  ([bookingPage.js:1181](../../server/routes/bookingPage.js)). So chip `height`
  is border-box (padding+border eat into it).

## Design

**One shared chip class + one WP-bar size override**, plus a flex wrapper for
the dark contexts (where badge/h1 are currently separate block lines).

- `logoChip` string built once near the top of `generateBookingPage()`, right
  after `typeLabel`. Empty string when `!property.logo_url` — no placeholder.
  `alt=""` (decorative — the `<h1>` beside it already carries the name; matches
  the `.specials-flyout-logo` precedent).
- `.hero-logo-chip` — `height:50px; width:auto; max-width:200px;
  object-fit:contain; border-radius:8px; background:#fff;
  border:1px solid rgba(0,0,0,.10); box-shadow:0 2px 6px rgba(0,0,0,.16);
  padding:4px 6px; flex-shrink:0; display:block`.
  Light regardless of backdrop, so it reads on the dark overlay with no extra
  treatment; the border + soft shadow give it an edge on the light WP bar.
- `.hero-title-row` — new flex wrapper (`display:flex; align-items:center;
  gap:14px; flex-wrap:wrap; margin-bottom:4px`) around `logoChip + <h1>` in the
  two **dark** contexts only. `.hero-title-row h1 { margin-bottom:0; min-width:0 }`
  (min-width:0 lets a long name wrap instead of overflowing the flex item;
  rule placed AFTER `.hero-overlay h1` so equal-specificity source order wins).
- `.wp-stats-name` is already `display:flex; align-items:center; gap:8px`, so in
  the **light** context the chip is just dropped in as `badge, chip, <h1>` — no
  wrapper. Size override: `.wp-stats-name .hero-logo-chip { height:32px;
  border-radius:6px; padding:3px 5px; box-shadow:0 1px 3px rgba(0,0,0,.14) }`.
- Mobile (`@media (max-width:540px)`): `.hero-logo-chip { height:38px }`,
  `.hero-title-row { gap:10px }`. Hero is 320px tall on mobile — 38px chip +
  wrapping name row fits with the badge line + location + meta.

## Files touched

- `server/routes/bookingPage.js`
  - `logoChip` const added after `typeLabel` (~L704)
  - shared `else` hero branch: `<h1>` wrapped in `.hero-title-row` with chip (~L831)
  - WP-without-photos branch: same wrap (~L818)
  - WP-with-photos `.wp-stats-name`: chip inserted before `<h1>` (~L800)
  - CSS: `.hero-logo-chip`, `.hero-title-row`, `.hero-title-row h1`,
    `.wp-stats-name .hero-logo-chip`, mobile overrides — added after the
    existing `@media (max-width:540px)` hero block (~L1270)

## Ruled out

- No new query column (SELECT p.* already covers it).
- No placeholder / empty-state chip when no logo.
- No per-backdrop treatment in the dark context — the chip is self-contained
  (white bg), so photo vs map vs solid colour doesn't matter.
- Not touching `.hero-badge` styling or position.
- Widget: not this pass.

## Verification (2026-08-30, local dev stack, `server/nestbook.db`)

Test fixtures: two generated logos in `server/uploads/logos/` — `test-wordmark.jpg`
(300×65, wide) and `test-icon.jpg` (300×300, square, opaque dark-green). Properties
28 ("Named Rooms QA Inn") and 3 ("Dev Test Inn") were mutated through each context
and **restored afterwards** to bare IR-named state (logo/hero NULL, city/country
cleared, WP-only numeric fields NULLed). Test logo files deleted.

- ✅ **Dark overlay, no hero photo** (IR-named, square logo) — chip renders left of
  `<h1>` on the solid `palette.dark` block; badge unchanged above; white chip
  reads cleanly.
- ✅ **Dark overlay, WITH hero photo** (IR-named, wide wordmark) — white chip reads
  cleanly over the photo, vertically centred with the name; no extra treatment
  needed (chip is self-contained).
- ✅ **IR-Named / IR-Categories / Units** — hero fragment is **byte-identical**
  across all three (`curl` diff): same `.hero-title-row` markup. Mode only swaps
  the body sections below the hero, confirmed.
- ✅ **WP-without-photos** (`.hero.hero-whole`, prop 3) — chip + name inline over
  the dark solid backdrop, badge above, location/guests/price below. Clean.
- ✅ **WP-with-photos** (`.wp-stats-name`, light bar) — chip inserted as
  `badge, chip, <h1>`; computed: bar bg `#fff`, chip has `1px rgba(0,0,0,.1)`
  border + `0 1px 3px rgba(0,0,0,.14)` shadow → reads on white (consistent with
  the bar's own existing border/shadow styling). Square icon logo (dark content)
  and cream wordmark both distinguishable.
- ✅ **No logo set** — HTML is `<div class="hero-title-row"><h1>Name</h1></div>`,
  **no `<img>`, no empty chip**. `grep -c '<img class="hero-logo-chip"'` → 0.
  Visually identical to before (row's `margin-bottom:4px` replaces the h1's own).
- ✅ **Mobile 375px, long name** ("The Old Lavender Farmhouse & Vineyard Retreat
  at Aix") — dark context: `.hero-title-row` wraps, chip on its own line under the
  badge, name wraps full-width below; bottom-anchored in the overlay, no clip at
  375px, no mid-word breakage. WP light bar: chip stays put (`flex-shrink:0`),
  name ellipsises as it already did — pre-existing WP behaviour, logo is additive.
- ✅ **Wide wordmark vs square icon** — both sit sensibly; `object-fit:contain` +
  `max-width:200px` letterboxes a very wide logo inside the white chip, reads as
  intentional.
- ✅ **Backend** — `node --check` clean; server boots; all `/uploads/logos/*.jpg`
  requests 200. (Gotcha hit & fixed: a backtick in a CSS comment closed the
  `<style>` template literal — comments in that block must be backtick-free.)
- ✅ **Widget** — untouched; `/api/widget/property` still doesn't return `logo_url`.

## Follow-up / notes

- Chip is `height:50px` **border-box** → ~40px visible logo (padding+border eat
  10px). Matches the "40–48px" intent. Bump `.hero-logo-chip` height if John
  wants it larger next to the big serif h1.
- WP-bar chip override is `height:32px` — deliberately compact for the sticky bar.
- If a future logo is itself pure-white with pale content, only the chip border
  separates it on the WP light bar. Border is `rgba(0,0,0,.1)` — same weight as
  `.wp-stats-bar`'s own `border-bottom`. Acceptable; revisit only if it looks weak
  on real data.

## Ship / cleanup

Verified working — delete this file (or move to `docs/completed/`) once John has
confirmed on production data.
