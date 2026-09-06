# Landing-page AI Assistant — in-progress notes

Slug: `landing-ai-assistant`. Started 2026-09-06.

## Goal
Floating chat widget for **anonymous visitors** on the public marketing site
(vanilla JS — public pages aren't React). Separate from the in-app Help Chat.
Backed by `POST /api/landing-chat` (no auth) → Claude Haiku, grounded in
`server/docs/landing-ai-knowledge.md`, read fresh per request.

## Confirmed facts (do not re-check)

### Shared-script inclusion pattern
- Public pages inject shared JS as literal `<script src="/foo.js"></script>` right
  before `</body>`. No build step / templating — each HTML file lists them.
- Current shared scripts (last two lines of every marketing page):
  `<script src="/cookie-banner.js"></script>` then `<script src="/navbar.js"></script>`.
- **37 files** contain `<script src="/navbar.js"></script>` (identical line):
  index, compare, how-it-works, help, about, contact, cookies, privacy, terms,
  blog/index + 27 blog posts. → `landing-chat.js` added on exactly this set,
  immediately after the navbar.js line.
- Files WITHOUT navbar.js (correctly excluded): `book.html` (booking-page shell),
  `calculator.html` (pw-gated internal), `og-image.html` (OG template).

### CSS palette (per-page `:root`, NOT a shared stylesheet)
- Every marketing page + blog post defines the same vars in its own `:root`:
  `--dark:#334333; --mid:#405440; --light:#f0ede8; --soft:#f0ede8;
   --border:#e0ecdb; --page:#ffffff; --muted:#6B6A66`
- `--mid #405440` = the sage/forest green (also navbar bg). `--soft/#f0ede8` = cream.
- Since the vars are page-local (not guaranteed on every page/context), the widget
  uses `var(--mid, #405440)` style fallbacks — picks up the page var when present,
  falls back to the canonical hex otherwise. Works everywhere incl. blog posts.

### Language detection (reuse site-wide mechanism — do NOT build a new one)
- `applyLang(lang)` (per-page IIFE) sets `document.documentElement.lang = lang`,
  swaps `[data-i18n]` textContent, writes `localStorage['nb-lang']`.
- `?lang=xx` capture writes `localStorage['nb-lang']` then strips the param.
- Auto-detect (no manual choice) applies lang but REMOVES `nb-lang` and sets
  `sessionStorage['nb_lang_auto']` instead.
- Supported: `['en','fr','de','es','nl']`.
- Widget `detectLang()` priority: `localStorage['nb-lang']` →
  `sessionStorage['nb_lang_auto']` → `document.documentElement.lang` → `'en'`
  (validated against the 5). Re-checked on open + on each send + on `.lang-btn` click.

### Logo asset
- `/icon.svg` — NestBook rounded-square nest logo (sage `#405440`). Used in header
  + trigger button. Large-ish viewBox but fine as `<img src>`.

### Cookie banner interaction
- `cookie-banner.js` renders `#nb-cookie-banner` — `position:fixed; bottom:0;
  left/right:0; z-index:99999`, full-width ~56px bar. Removed on "Got it"
  (localStorage `nb-cookies=accepted`).
- Widget trigger z-index 9998, panel 9999 (below the cookie banner deliberately —
  it's a legal notice). Trigger `bottom` lifts to clear the banner when present;
  MutationObserver on `document.body` resets it when the banner is dismissed.

### Backend
- **No Anthropic SDK in repo** — plain `fetch` to `https://api.anthropic.com/v1/messages`
  (`anthropic-version: 2023-06-01`, `x-api-key`). Model `claude-haiku-4-5`.
  Same pattern as `server/routes/helpChat.js`.
- `ANTHROPIC_API_KEY` in `server/.env` (already present per John — the in-app
  help chat uses it). Route degrades to a friendly localized message if absent.
- `getIp(req)` from `server/utils/auditLog.js`:
  `(x-forwarded-for split ',')[0] || req.ip`. nginx sets `X-Forwarded-For`.
- Public routes are mounted BEFORE `app.use('/api', requireAuth)` (index.js ~176).
  New router mounted next to `featureInterestRouter` (the other anonymous-visitor
  endpoint), in the "Public routes (no auth)" block.

### helpContent.js generalization
- Was: `readHelpKnowledge()` → one `readFileSync` of `docs/help-bot-knowledge.md`.
- Now: `readKnowledge(which)` with a fixed whitelist
  `{ help: 'help-bot-knowledge.md', landing: 'landing-ai-knowledge.md' }`.
  `readHelpKnowledge()` kept as a back-compat wrapper → `helpChat.js` untouched.

## Design decisions
- **Rate limit:** IP-based, 20 msgs / rolling hour, in-memory `Map<ip, number[]>`
  (mirrors helpChat.js's per-user limiter). Over limit → HTTP 200 +
  `{ reply: <localized "try again shortly">, rate_limited: true }`. NOT shared
  with `/api/help-chat`'s bucket.
- **Stateless server:** no DB writes, no history stored beyond the request.
  Client keeps the thread in `sessionStorage['nb_landing_chat']` so it survives
  navigation between marketing pages (client-side only).
- **No page-aware chips** (per spec) — 3 generic localized starter questions
  shown before the first message only.
- **In-app drift guard:** system prompt tells the model that if a question is
  about using the app once signed in, say that's covered in-account / point to
  hello@nestbook.io — never fabricate an in-app answer.

## Files touched
- EDIT `server/utils/helpContent.js` (generalize)
- NEW  `server/routes/landingChat.js`
- EDIT `server/index.js` (import + mount public router)
- NEW  `server/public/landing-chat.js` (vanilla widget, self-contained styles + 5-lang copy)
- EDIT 37 × `server/public/**/*.html` (add `<script src="/landing-chat.js"></script>`)

## Ruled out
- Anthropic SDK dependency (spec: plain fetch when no SDK).
- Sharing the route / rate-limit bucket with `/api/help-chat` (spec: keep separate).
- A new language-detection mechanism (spec: reuse `nb-lang` / `?lang=`).
- Page-aware suggestion chips (spec: not this time).
- Plan gating (no logged-in user).
- Touching `book.html` / `calculator.html` / `og-image.html`.

## Verification status (2026-09-07)

Done locally (backend running via `npm run dev:server`, port 3001; there is NO
`ANTHROPIC_API_KEY` in this environment's `server/.env`, same as the in-app help
chat build — so real LLM answer-quality checks are blocked, everything else verified):

- ✅ `node --check` passes on all 4 new/edited server files.
- ✅ `/landing-chat.js` served (200), present on all 37 pages that carry navbar.js
  (index, compare, how-it-works, help, about, contact, cookies, privacy, terms,
  blog/index + 27 posts). `book.html` / `calculator.html` / `og-image.html`
  correctly untouched.
- ✅ Widget renders bottom-right, `position:fixed; z-index:9998; bottom/right:20px`.
  Trigger lifts to `bottom:76px` when `#nb-cookie-banner` is present, resets on
  dismissal (MutationObserver on body). Verified both states on the homepage.
- ✅ Panel: `background rgba(240,237,232,0.92)` + `backdrop-filter blur(14px)
  saturate(1.1)`, `border-radius 18px`, soft shadow — visibly translucent, NOT
  solid white (confirmed via computed styles AND screenshots on homepage / blog /
  how-it-works). Bot/user bubbles are opaque (`#fff` / `#405440`) so text stays
  readable over busy content.
- ✅ Header: `/icon.svg` + "NestBook AI Assistant" + ✕ close, header bg `#405440`.
- ✅ Open/close works; starters hide after first message; typing indicator shows
  then clears; send button disables during the request; user + bot bubbles render.
- ✅ `renderRich()` (tiny safe renderer): escapes HTML (`<script>` → entities),
  linkifies emails → `mailto:`, bare `https://` URLs, `**bold**`, `[label](url)`.
  No double-wrapping of markdown links. Unit-tested in node.
- ✅ Language: switching via the site's own `.lang-btn` updates the widget's title,
  placeholder, send label, footer, greeting and starter chips live. A fresh load
  with `nb-lang=fr` shows the French greeting + French chips, and a French message
  round-trips with `language:'fr'` → French canned reply. (EN + FR confirmed in
  browser; DE/ES/NL strings present in the file, ES rate-limit string confirmed
  via curl.)
- ✅ Rate limit: IP-based, 20 / rolling hour. 20th request in an hour →
  `{ rate_limited:true }` + localized "try again shortly" message (not a raw
  error). Verified via curl loop (EN/FR/ES). Separate Map from `/api/help-chat`
  (which is auth-gated → 401, proving different mount + bucket).
- ✅ Graceful degradation: no `ANTHROPIC_API_KEY` → `{ unavailable:true }` +
  localized "email hello@nestbook.io" message + one `console.warn`. Empty message
  → 400. Over-long message → 400.
- ✅ `readKnowledge('landing')` reads `landing-ai-knowledge.md` FRESH every call
  (appended marker visible immediately, no cache clear / restart). `readKnowledge('help')`
  still works (back-compat wrapper). Unknown key throws.
- ✅ No console errors from the widget. No horizontal page overflow. Mobile
  viewport (375×812): panel goes near-full-width with 14px margins, all controls
  usable.

STILL TO VERIFY (blocked — no ANTHROPIC_API_KEY in this environment; John to run
once the key is confirmed in `server/.env`, same as the in-app help chat):
- ⚠️ Real answer quality: conversational (not quoted), grounded in
  `landing-ai-knowledge.md` (e.g. "what does Pro include" → accurate plan detail).
- ⚠️ Uncovered question → honest "I'm not sure — contact hello@nestbook.io".
- ⚠️ In-app "how do I do X in my account" question → declines, points to the
  in-app assistant / hello@nestbook.io, does NOT fabricate a walkthrough.
- ⚠️ FR/ES/DE/NL question → reply actually written in that language.
- ⚠️ Edit `landing-ai-knowledge.md`, ask again immediately → change reflected
  in the answer with no restart (helper-level fresh-read already proven above).

## Shipped
- Feature build committed to `main` 2026-09-07. Live-ready pending the API key.
- Delete this file once John confirms the 5 blocked answer-quality checks.

## 2026-09-07 follow-up
- Trigger button: added a hover-expand label. Circle → pill on hover, revealing
  "AI Assistant" (5 langs, `assistantLabel` string). Guarded by
  `@media (hover:hover) and (pointer:fine)` so touch devices stay icon-only with
  no sticky-hover. Verified expand/collapse on desktop + no expansion on emulated
  mobile.
