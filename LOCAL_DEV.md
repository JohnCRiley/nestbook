# Local Development Environment

This directory is a standalone local dev clone of NestBook — separate from production.
There is no staging server; this environment serves that purpose.

## Prerequisites

- **Node.js** — production runs Node 22.x; this machine has Node 24.x installed.
  Both work fine. If you need to pin to 22 exactly, install it via nvm.

## Starting the servers

From the repo root, start both servers in one command:

```bash
npm run dev
```

Or start them individually:

```bash
# Terminal 1 — API server (port 3001)
npm run dev:server

# Terminal 2 — React dev server (port 5173)
npm run dev:client
```

- **App:** http://localhost:5173/app/
- **API:** http://localhost:3001/api/health
- **Landing page:** http://localhost:3001/

## Environment configuration

The server reads from `server/.env`. This file is **gitignored** and must be created locally.
It already exists on this machine. If you re-clone, copy this template:

```
PORT=3001
NODE_ENV=development
APP_URL=http://localhost:3001
APP_BASE_URL=http://localhost:3001
BASE_URL=http://localhost:3001
JWT_SECRET=local-dev-secret-not-for-production

SUPER_ADMIN_PASSWORD=localdevadmin
```

## Database

SQLite — created automatically at `server/nestbook.db` on first server start.
All tables and migrations run without any manual steps.
The `.db` file is gitignored; delete it to start with a clean slate.

## What is NOT configured here

| Feature | Status |
|---|---|
| Stripe payments | **Disabled** — no key configured; routes load but all Stripe calls will fail |
| Email (Resend) | **Disabled** — no API key; emails are skipped silently |
| Google Places | Not configured |

## API routing

The Vite dev server proxies `/api` and `/uploads` to `http://localhost:3001`.
All client API calls use relative paths — there is no hardcoded production URL in the client.

## No production data

This environment has no production data. Create a test account via the registration page at
http://localhost:5173/app and add test properties/rooms manually through the UI.

## Public-Facing Pages — Local Reference

All pages below are served directly by Express from `server/public/` — no Vite, no build step, just live files. View them at `http://localhost:3001/...` once `npm run dev` is running (not the client's 5173/5174 port — that's only for the React /app dashboard).

### Marketing site
- `server/public/index.html` → `/`
- `server/public/about.html` → `/about`
- `server/public/compare.html` → `/compare`
- `server/public/how-it-works.html` → `/how-it-works`
- `server/public/help.html` → `/help` (⚠️ uses its own self-contained base64 i18n system — separate from the main app's translations)
- `server/public/calculator.html` → `/calculator`
- `server/public/contact.html` → `/contact`
- `server/public/privacy.html`, `terms.html`, `cookies.html`

### Blog
- `server/public/blog/index.html` → `/blog/`
- Individual posts: `server/public/blog/[slug].html` → `/blog/[slug]`

### Guest payment pages
- `server/public/pay/success.html` → `/pay/success`
- `server/public/pay/cancelled.html` → `/pay/cancelled`
- `server/public/pay/recover.html` → `/pay/recover`

### Widget
- Script: `server/public/widget.js`
- Preview: `server/public/widget-test.html` → `/widget-test`
- ⚠️ Hardcoded to `data-property-id="1"` — works fine if your first local test property is ID 1, but check this if testing a second property

### Booking page (server-rendered, not static)
- Handler: `server/routes/bookingPage.js`
- URL: `/book/[slug]` or `/book/[numeric-id]`
- ⚠️ Fragile file — nested template-literal i18n block, avoid straight ASCII quote issues (see earlier session notes on the curly-quote crash)
- Needs at least one room created on the property to show meaningful availability

### Print marketing templates
- `server/public/marketing/*.html` → `/marketing/[filename]`
- Flyers, business cards, car door magnets, feather flags — mostly EN with FR/DE/ES/NL variants where noted

### Not pages (shared assets)
- `widget.js`, `cookie-banner.js`, `navbar.js`/`navbar.css`
- PDFs: `direct-booking-checklist.pdf`, `nestbook-getting-started-guide.pdf`
- `sitemap.xml`, `robots.txt`, `manifest.json`
