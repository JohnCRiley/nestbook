# AI Help Chat — in-progress notes

Slug: `ai-help-chat`. Started 2026-09-06.

## Goal
Floating help button on every authenticated app page → right-side slide-out chat
panel → Claude (Haiku) answers questions grounded in the live `help.html`
content, in the user's language. Available on ALL plans (support feature, not premium).

## Confirmed facts (do not re-check)

### help.html i18n blob
- File: `server/public/help.html` (~1225 lines; line 1177 holds the blob).
- Structure: `const I18N = JSON.parse(decodeURIComponent(escape(atob('<base64>'))))`.
- Decoded JSON: `{ en:{...}, fr:{...}, de:{...}, es:{...}, nl:{...} }` — **all 5 langs
  have all 296 keys**, English included (no fallback gymnastics needed).
- Keys are flat dotted strings (`help.s.start`, `help.start.signup.p`, …) and appear
  in the HTML as `data-i18n="<key>"` attributes on the element that renders them.
- Help body content sits between `<div class="help-body">` and `<!-- CTA BAND -->`
  (~246 `data-i18n` keys there). Extraction = scan that slice for `data-i18n` in
  document order, emit `I18N[lang][key]`, strip tags/entities, join with `\n`.
  Produces ~22–26k chars (~8k tokens) of clean plain text per language.
- Implemented in `server/utils/helpContent.js` — reads the file **fresh every call**
  (no cache), so any help.html edit is picked up with zero extra steps.

### Anthropic client
- **No Anthropic SDK anywhere in the repo** (checked package.json x3 + grep). Per spec,
  used a plain `fetch` to `https://api.anthropic.com/v1/messages`
  (`anthropic-version: 2023-06-01`, `x-api-key`). Model: `claude-haiku-4-5`.
- System prompt (help content block) carries `cache_control: ephemeral` to cut cost.

### API key
- `server/.env` currently has: PORT, NODE_ENV, APP_URL, APP_BASE_URL, BASE_URL,
  JWT_SECRET, SUPER_ADMIN_PASSWORD. **No `ANTHROPIC_API_KEY`** — John must add it.
- Server dev script already runs with `--env-file=.env`, so once added it just works.
- Per the STRIPE_MODE lesson: key goes in `server/.env` ONLY, never ecosystem.config.cjs.
- Route degrades gracefully (friendly message + console warn) when the key is absent.

### Language resolution (backend)
- JWT payload = `{ userId, role, propertyId }` (`req.user.userId`).
- `users.language` column exists (TEXT NOT NULL DEFAULT 'en', set at registration,
  on `/api/auth/me`, and in localStorage `nb_user`).
- Route resolves: validated `req.body.language` → `SELECT language FROM users` → `'en'`.
- Frontend sends `language` = `useAuth().user?.language || useLocale().locale`.

### Rate limit
- In-memory `Map<userId, number[]>` of request timestamps, 30 / rolling hour.
  Pattern mirrors `server/routes/superAdminAuth.js`. Over limit → HTTP 200 with
  `{ reply: <localized "give it a moment">, rate_limited: true }` (not an error).

### Frontend
- `.detail-panel` + `.panel-backdrop` CSS live in `client/src/index.css` ~line 1400.
  420px desktop / 100vw ≤479px / `slideInRight 0.22s`. Panel REUSES these classes;
  only chat-specific bits (`.help-chat-*`) are new CSS.
- Mounted once in `App.jsx` → `AppLayout` (covers all owner/manager/staff pages).
  `charges_staff` kiosk shell deliberately excluded.
- Route read via `useLocation().pathname` — **basename is `/app`**, so pathname is
  `/dashboard`, `/settings`, … (NO `/app` prefix). Chip config keyed by those.
- UI copy + route→chips config: `client/src/components/helpChatStrings.js`
  (self-contained 5-lang module — NOT added to the 8000-line i18n/index.js).
- First-time pulse/badge: localStorage flag `nb_helpchat_seen`, set on first open.

### Discoverability
- **No existing dashboard onboarding-tips / hint mechanism** (checked Dashboard,
  Onboarding, Sidebar). Per spec: did NOT build one. In-app discoverability =
  the first-time pulse on the trigger button.
- Getting Started guide: source `server/public/marketing/getting-started-guide.html`,
  regen script `node server/scripts/gen-getting-started-pdf.mjs` → overwrites
  `server/public/nestbook-getting-started-guide.pdf` (committed static asset).
  Added a short line to **Step 15 ("Getting help whenever you need it")**.

## Files touched
- NEW `server/utils/helpContent.js`
- NEW `server/routes/helpChat.js`
- EDIT `server/index.js` (mount router under requireAuth)
- NEW `client/src/components/HelpChatPanel.jsx`
- NEW `client/src/components/helpChatStrings.js`
- EDIT `client/src/index.css` (help-chat styles)
- EDIT `client/src/App.jsx` (mount panel in AppLayout)
- EDIT `server/public/marketing/getting-started-guide.html` (Step 15 line)
- REGEN `server/public/nestbook-getting-started-guide.pdf`

## Ruled out
- Adding `@anthropic-ai/sdk` dependency — spec says plain fetch if no SDK exists.
- Plan gating — explicitly all-plans.
- New onboarding-tips mechanism — none exists, spec says don't build one.
- Putting strings in `client/src/i18n/index.js` — too risky in an 8000-line file;
  local module instead.

## Verification status (2026-09-06)
Done locally:
- ✅ `client && npm run build` — succeeds.
- ✅ PDF regen — `node server/scripts/gen-getting-started-pdf.mjs` → 19 pages == 19
  .page divs (no overflow).
- ✅ Panel parity — DOM has `class="detail-panel help-chat-panel"`, computed
  width 420px desktop / 375px (100vw) mobile, `animation-name: slideInRight`,
  `.panel-backdrop` present. Exact reuse.
- ✅ Chips change per route — verified /dashboard, /calendar, /settings, /rooms,
  /pricing each show their configured chips; unlisted routes (/guests) show none.
  `useLocation().pathname` returns `/calendar` etc. (basename stripped) — config
  keyed on those.
- ✅ Chip click → sends full question through the normal chat flow, input clears.
- ✅ First-time cue — `.help-chat-trigger-cue` pulse + "New" badge show when
  `nb_helpchat_seen` unset; on first open the flag is set and after reload both
  are gone.
- ✅ Live help.html edit — re-encoded the i18n blob with a changed value; the
  very next `extractHelpText()` call reflected it (no restart/rebuild). Reverted.
- ✅ Rate limit — 31 calls in a row → friendly localized `{ rate_limited: true }`
  message, not a raw error. (EN + FR strings checked.)
- ✅ Graceful degradation — no `ANTHROPIC_API_KEY` → friendly "not available"
  message + one `console.warn`. Auth 401, empty message 400.
- ✅ Theme-aware — bubbles/chip/send use `--card-bg` / `--accent` / `--border`;
  confirmed they follow `data-theme` (e.g. ruby → accent #7D5E61).

STILL TO VERIFY (blocked — no ANTHROPIC_API_KEY in this environment):
- ⚠️ Real answer quality: conversational (not quoted), grounded in help.html,
  honest "I'm not sure — try the error-report tool" for uncovered questions,
  replies in the user's language. The system prompt in `server/routes/helpChat.js`
  instructs all of this; needs a live key to confirm behaviour.
  **John: add `ANTHROPIC_API_KEY=sk-ant-...` to `server/.env`, restart, then run
  the two answer-quality checks from the spec.**

## Shipped
Committed to `main` 2026-09-06 (see commit). Feature is live-ready pending the
API key. Delete this file once John confirms the two answer-quality checks pass.
