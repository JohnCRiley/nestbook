import { Router } from 'express';
import db from '../db/database.js';

export const bookingPageRouter = Router();

// Theme colour palettes — must stay in sync with widget.js THEME_COLOURS
const THEME_COLOURS = {
  forest:   { brand: '#2f771b', dark: '#1a4710', light: '#d9f0cc' },
  royal:    { brand: '#70879E', dark: '#1F3A55', light: '#F6F4EE' },
  ember:    { brand: '#E8A838', dark: '#1A2535', light: '#E9E7E2' },
  ruby:     { brand: '#CF514F', dark: '#490403', light: '#E9E7E7' },
  sky:      { brand: '#878A8C', dark: '#4B779B', light: '#F4F5F6' },
  lavender: { brand: '#928CB1', dark: '#62598F', light: '#E7E7E9' },
  charcoal: { brand: '#8A0505', dark: '#292929', light: '#F4F5F6' },
};

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateBookingPage(property) {
  const palette = THEME_COLOURS[property.theme] ?? THEME_COLOURS.forest;
  const name    = property.name ?? 'Book your stay';
  const propId  = property.id;
  const lang    = property.locale   ?? 'en';
  const currency = property.currency ?? 'EUR';

  return `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Book your stay — ${esc(name)}</title>
<meta name="description" content="Book directly with ${esc(name)} — best rates guaranteed.">
<meta name="robots" content="noindex">

<!-- Open Graph -->
<meta property="og:title"       content="Book your stay at ${esc(name)}">
<meta property="og:description" content="Book directly with ${esc(name)} — best rates guaranteed, no booking fees.">
<meta property="og:type"        content="website">
<meta property="og:image"       content="https://nestbook.io/og-image.png">
<meta property="og:image:width"  content="1200">
<meta property="og:image:height" content="630">

<!-- Twitter Card -->
<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:title"       content="Book your stay at ${esc(name)}">
<meta name="twitter:description" content="Book directly with ${esc(name)} — best rates guaranteed.">
<meta name="twitter:image"       content="https://nestbook.io/og-image.png">

<meta name="theme-color" content="${esc(palette.dark)}">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.json">

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  min-height: 100dvh;
  background: #f8f9fa;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.header {
  width: 100%;
  background: ${esc(palette.dark)};
  color: white;
  padding: 18px 24px;
  text-align: center;
  flex-shrink: 0;
}
.header-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 680px;
  margin: 0 auto;
}
.header-logo {
  width: 32px; height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
}
.header-text h1 {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.2px;
  line-height: 1.2;
}
.header-text p {
  font-size: 0.8rem;
  opacity: 0.7;
  margin-top: 2px;
}
.widget-wrap {
  width: 100%;
  max-width: 680px;
  padding: 28px 16px 16px;
  flex: 1;
}
.powered-by {
  width: 100%;
  text-align: center;
  padding: 16px;
  font-size: 0.72rem;
  color: #aaa;
  flex-shrink: 0;
}
.powered-by a { color: #aaa; text-decoration: none; }
.powered-by a:hover { color: #666; }

/* Push widget trigger button away from edge on mobile */
@media (max-width: 540px) {
  #nb-root .nb-trigger { bottom: 20px; right: 16px; }
}
</style>
</head>
<body>

<header class="header">
  <div class="header-inner">
    <img src="/icon.svg" class="header-logo" alt="NestBook">
    <div class="header-text">
      <h1>${esc(name)}</h1>
      <p>Book your stay directly — best rates guaranteed</p>
    </div>
  </div>
</header>

<div class="widget-wrap">
  <div id="nestbook-widget"></div>
</div>

<div class="powered-by">
  Powered by <a href="https://nestbook.io" target="_blank" rel="noopener">NestBook</a>
</div>

<script
  src="https://nestbook.io/widget.js"
  data-property-id="${esc(String(propId))}"
  data-lang="${esc(lang)}"
  data-currency="${esc(currency)}"
  async>
</script>

</body>
</html>`;
}

// ── GET /book/:identifier ─────────────────────────────────────────────────────
// Accepts numeric ID (backwards compat) or slug.
bookingPageRouter.get('/:identifier', (req, res) => {
  try {
    const { identifier } = req.params;
    let property;

    if (/^\d+$/.test(identifier)) {
      property = db.prepare('SELECT * FROM properties WHERE id = ?').get(Number(identifier));
    } else {
      property = db.prepare('SELECT * FROM properties WHERE booking_slug = ?').get(identifier);
    }

    if (!property) {
      return res.status(404).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Not found</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa;color:#374151}</style>
</head><body><div style="text-align:center"><h1 style="font-size:2rem;margin-bottom:8px">Booking page not found</h1>
<p style="color:#6b7280">This booking link may have expired or the URL is incorrect.</p></div></body></html>`);
    }

    res.send(generateBookingPage(property));
  } catch (err) {
    res.status(500).send('Server error');
  }
});
