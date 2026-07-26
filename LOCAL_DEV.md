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
