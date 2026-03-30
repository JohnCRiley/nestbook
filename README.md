# NestBook

Booking and property management for small European hospitality businesses — B&Bs, gîtes, guest houses, and holiday cottages.

NestBook has two parts:

1. **Owner dashboard** — manage rooms, bookings, guests, and property settings from a clean web interface
2. **Embeddable booking widget** — a single `<script>` tag that property owners paste into their own website to accept direct bookings

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite (port 5173) |
| Backend | Node.js + Express (port 3001) |
| Database | SQLite via Node's built-in `node:sqlite` (Node 22.5+) |
| Monorepo | npm workspaces + concurrently |

No native addons, no external database server required — SQLite runs embedded inside Node.

**Languages supported:** English · Français · Español · Deutsch

---

## Requirements

- Node.js **22.5 or later** (for the built-in `node:sqlite` module)
- npm 9+

---

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/nestbook.git
cd nestbook
npm install
```

---

## Running locally

### Start both servers (recommended)

```bash
npm run dev
```

This starts the Express API on **port 3001** and the Vite dev server on **port 5173** simultaneously.

### Seed the database (first run)

```bash
npm run db:seed
```

Creates a sample property (Domaine des Lavandes), 6 rooms, 5 guests, and a set of bookings so the dashboard is pre-populated.

### What you can visit

| URL | What it is |
|---|---|
| `http://localhost:5173` | Owner dashboard (React app) |
| `http://localhost:3001` | NestBook marketing landing page |
| `http://localhost:3001/widget-test.html` | Booking widget demo page |

---

## Project structure

```
nestbook/
├── package.json              # Root workspace — scripts, concurrently
│
├── client/                   # React frontend (Vite)
│   └── src/
│       ├── App.jsx           # Router and layout shell
│       ├── main.jsx          # React entry point
│       ├── components/
│       │   ├── Sidebar.jsx   # Navigation sidebar
│       │   └── Icons.jsx     # SVG icon components
│       ├── pages/
│       │   ├── Dashboard.jsx # Overview with live stats
│       │   ├── Bookings.jsx  # Booking list and management
│       │   ├── Calendar.jsx  # Monthly booking calendar
│       │   ├── Rooms.jsx     # Room list with status cards
│       │   ├── Guests.jsx    # Guest records
│       │   └── Settings.jsx  # Property details form
│       ├── dashboard/        # Sub-components for each page
│       └── i18n/             # Internationalisation placeholder
│
└── server/                   # Express backend
    ├── index.js              # Express app and route mounting
    ├── db/
    │   ├── database.js       # SQLite connection and schema init
    │   └── seed.js           # Sample data seeder
    ├── routes/
    │   ├── bookings.js       # GET/POST/PUT/DELETE /api/bookings
    │   ├── rooms.js          # GET/POST/PUT/DELETE /api/rooms
    │   ├── guests.js         # GET/POST/PUT/DELETE /api/guests
    │   ├── properties.js     # GET/PUT /api/properties/:id
    │   ├── users.js          # GET/POST /api/users
    │   └── health.js         # GET /api/health
    └── public/
        ├── index.html        # Marketing landing page (EN/FR/ES/DE)
        ├── widget.js         # Embeddable booking widget (vanilla JS)
        └── widget-test.html  # Widget demo / test page
```

---

## Embedding the booking widget

Paste this one snippet into any HTML page:

```html
<script
  src="https://your-nestbook-server.com/widget.js"
  data-property-id="1"
  data-lang="fr"
  data-currency="EUR"
  async>
</script>
```

A "Book Now" button appears in the bottom-right corner. Clicking it opens a 4-step booking modal (dates → room selection → guest details → confirmation) that writes directly to the NestBook API.

---

## Licence

MIT
