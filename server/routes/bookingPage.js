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

const TYPE_LABELS = {
  bnb: 'B&B', gite: 'Gîte', guesthouse: 'Guest House', hotel: 'Hotel', other: '',
};

const CURRENCY_SYMBOLS = { EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' };

const AMENITY_LABELS = {
  wifi: 'WiFi', ensuite: 'En-suite', balcony: 'Balcony', terrace: 'Terrace',
  parking: 'Parking', minibar: 'Minibar', kitchenette: 'Kitchenette',
  aircon: 'Air Con', tv: 'TV', safe: 'Safe', bathtub: 'Bathtub',
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtAmenity(str) {
  return AMENITY_LABELS[str.toLowerCase()] ?? (str.charAt(0).toUpperCase() + str.slice(1));
}

function getAvailabilityMap(bookings, totalRooms) {
  const map = {};
  const base = new Date();
  for (let i = 0; i < 62; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const s = d.toISOString().split('T')[0];
    const booked = bookings.filter(b => b.check_in_date <= s && b.check_out_date > s).length;
    map[s] = (totalRooms === 0 || booked < totalRooms) ? 'available' : 'booked';
  }
  return map;
}

function calendarMonth(year, month, availMap, today, palette) {
  const firstDow  = new Date(year, month, 1).getDay(); // 0=Sun
  const offset    = (firstDow + 6) % 7;               // Monday-first
  const daysCount = new Date(year, month + 1, 0).getDate();
  const headers   = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  let h = `<div class="cal-month">`;
  h += `<h3>${MONTH_NAMES[month]} ${year}</h3>`;
  h += `<div class="cal-days">`;
  for (const d of headers) h += `<div class="cal-header">${d}</div>`;
  for (let i = 0; i < offset; i++) h += `<div class="cal-day cal-empty"></div>`;

  for (let d = 1; d <= daysCount; d++) {
    const s = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = 'cal-day';
    if (s === today)       cls += ' cal-today';
    else if (s < today)    cls += ' cal-past';
    else if (availMap[s] === 'booked') cls += ' cal-booked';
    else                   cls += ' cal-available';
    h += `<div class="${cls}">${d}</div>`;
  }
  h += `</div></div>`;
  return h;
}

function roomCard(room, currSym, palette, photos) {
  const amenities = (room.amenities ?? '').split(',').map(a => a.trim()).filter(Boolean);
  const price = Number(room.price_per_night ?? 0).toFixed(0);
  const typeLabel = room.type
    ? room.type.charAt(0).toUpperCase() + room.type.slice(1)
    : '';

  const amenityTags = amenities.map(a =>
    `<span class="amenity-tag">${esc(fmtAmenity(a))}</span>`
  ).join('');

  const bfBadge = room.breakfast_included
    ? `<div class="room-breakfast">🍳 Breakfast included</div>`
    : '';

  const descHtml = room.description
    ? `<p class="room-desc">${esc(room.description)}</p>`
    : '';

  const photoHtml = photos && photos.length > 0 ? `
  <div class="room-photo">
    <img src="/uploads/rooms/${esc(photos[0])}" alt="${esc(room.name)}" loading="lazy" />
  </div>
  ${photos.length > 1 ? `
  <div class="photo-strip">
    ${photos.map(f => `<img src="/uploads/rooms/${esc(f)}" class="photo-strip-thumb" loading="lazy" alt="" />`).join('')}
  </div>` : ''}` : '';

  return `
<div class="room-card">
  ${photoHtml}
  <div class="room-card-body">
    <div class="room-header">
      <h3>${esc(room.name)}</h3>
      <span class="room-type-badge">${esc(typeLabel)}</span>
    </div>
    <div class="room-price">${esc(currSym)}${esc(price)}<span class="room-price-unit">/night</span></div>
    <div class="room-capacity">👥 Up to ${esc(String(room.capacity ?? 2))} guests</div>
    ${descHtml}
    ${amenityTags ? `<div class="amenities">${amenityTags}</div>` : ''}
    ${bfBadge}
    <button class="btn-book" onclick="openWidget()">Book this room</button>
  </div>
</div>`;
}

function generateBookingPage(property, rooms, availMap, photosByRoom) {
  const palette  = THEME_COLOURS[property.theme] ?? THEME_COLOURS.forest;
  const name     = property.name    ?? 'Book your stay';
  const city     = property.city    ?? '';
  const country  = property.country ?? '';
  const address  = [property.address, city, country].filter(Boolean).join(', ');
  const mapQuery = encodeURIComponent(address || name);
  const propId   = property.id;
  const lang     = property.locale   ?? 'en';
  const currency = property.currency ?? 'EUR';
  const currSym  = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  const typeLabel = TYPE_LABELS[property.type] ?? '';
  const slug     = property.booking_slug ?? String(propId);

  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();
  const m0    = { year: now.getFullYear(), month: now.getMonth() };
  const next  = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const m1    = { year: next.getFullYear(), month: next.getMonth() };

  const cal0 = calendarMonth(m0.year, m0.month, availMap, today, palette);
  const cal1 = calendarMonth(m1.year, m1.month, availMap, today, palette);

  const roomCards = rooms.map(r => roomCard(r, currSym, palette, photosByRoom?.[r.id])).join('\n');

  const metaDesc = property.description
    ? esc(property.description.slice(0, 155))
    : `Book your stay at ${esc(name)} in ${esc(city)} directly — best rates guaranteed. ${rooms.length} room${rooms.length !== 1 ? 's' : ''} available.`;

  const heroStyle = property.hero_photo
    ? `background-image:url('/uploads/properties/${esc(property.hero_photo)}');background-size:cover;background-position:center;background-color:${esc(palette.dark)}`
    : `background:${esc(palette.dark)}`;

  const heroInner = property.hero_photo
    ? `<div class="hero-overlay" style="background:linear-gradient(rgba(0,0,0,0.3),rgba(0,0,0,0.72));position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;justify-content:flex-end;padding:28px 32px;">`
    : `<div class="hero-overlay">`;

  const heroSection = `
<div class="hero" style="${heroStyle}">
  ${!property.hero_photo && address ? `
  <iframe
    src="https://maps.google.com/maps?q=${mapQuery}&output=embed&z=15"
    class="hero-map"
    allowfullscreen=""
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade">
  </iframe>` : ''}
  ${heroInner}
    ${typeLabel ? `<div class="hero-badge">${esc(typeLabel)}</div>` : ''}
    <h1>${esc(name)}</h1>
    ${(city || country) ? `<p class="hero-location">${esc([city, country].filter(Boolean).join(', '))}</p>` : ''}
    <div class="hero-meta">
      <span>🕐 Check-in from ${esc(property.check_in_time ?? '15:00')}</span>
      <span>🕐 Check-out by ${esc(property.check_out_time ?? '11:00')}</span>
    </div>
  </div>
</div>`;

  const aboutSection = property.description ? `
<section class="about">
  <div class="section-inner">
    <h2>About us</h2>
    <p>${esc(property.description)}</p>
  </div>
</section>` : '';

  const roomsSection = rooms.length > 0 ? `
<section class="rooms">
  <div class="section-inner">
    <h2>Our Rooms</h2>
    <div class="rooms-grid">
      ${roomCards}
    </div>
  </div>
</section>` : '';

  const availSection = `
<section class="availability">
  <div class="section-inner">
    <h2>Availability</h2>
    <p class="avail-legend">
      <span class="legend-dot legend-available"></span> Available &nbsp;
      <span class="legend-dot legend-booked"></span> Booked
    </p>
    <div class="calendar-grid">
      ${cal0}
      ${cal1}
    </div>
    <p class="calendar-note">
      Select your dates and click <strong>Book Now</strong> to check live availability and complete your reservation.
    </p>
  </div>
</section>`;

  const ctaSection = `
<section class="cta">
  <div class="section-inner cta-inner">
    <h2>Ready to book?</h2>
    <p>Book directly with us for the best rates — no booking fees, payment goes straight to us.</p>
    <button class="btn-primary-large" onclick="openWidget()">Check availability &amp; book →</button>
  </div>
</section>`;

  const footerSection = `
<footer>
  <p>© ${new Date().getFullYear()} ${esc(name)}</p>
  <p>Powered by <a href="https://nestbook.io" target="_blank" rel="noopener">NestBook</a> — booking software for independent properties</p>
</footer>`;

  return `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)} — Book direct${city ? ' | ' + esc(city) : ''}${country ? ', ' + esc(country) : ''}</title>
<meta name="description" content="${metaDesc}">
<link rel="canonical" href="https://nestbook.io/book/${esc(slug)}">

<!-- Open Graph -->
<meta property="og:title"       content="${esc(name)} — Book your stay">
<meta property="og:description" content="${metaDesc}">
<meta property="og:type"        content="website">
<meta property="og:url"         content="https://nestbook.io/book/${esc(slug)}">
<meta property="og:image"       content="https://nestbook.io/og-image.png">
<meta property="og:image:width"  content="1200">
<meta property="og:image:height" content="630">

<!-- Twitter Card -->
<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:title"       content="${esc(name)} — Book your stay">
<meta name="twitter:description" content="${metaDesc}">
<meta name="twitter:image"       content="https://nestbook.io/og-image.png">

<meta name="theme-color" content="${esc(palette.dark)}">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon-192.png">

<!-- Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet">

<!-- Structured data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LodgingBusiness",
  "name": "${esc(name)}",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "${esc(property.address ?? '')}",
    "addressLocality": "${esc(city)}",
    "addressCountry": "${esc(country)}"
  },
  "url": "https://nestbook.io/book/${esc(slug)}",
  "priceRange": "££"
}
</script>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  background: #f8f9fa;
  color: #1e293b;
  line-height: 1.6;
}

/* ── Hero ──────────────────────────────────────────────────────────── */
.hero {
  position: relative;
  height: 400px;
  overflow: hidden;
}
.hero-map {
  width: 100%;
  height: 100%;
  border: none;
  filter: brightness(0.55);
  display: block;
}
.hero-overlay {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 28px 32px;
  background: linear-gradient(transparent, rgba(0,0,0,0.72));
  color: #fff;
}
.hero-badge {
  display: inline-block;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
  backdrop-filter: blur(4px);
}
.hero-overlay h1 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(1.8rem, 5vw, 2.8rem);
  font-weight: 700;
  line-height: 1.15;
  margin-bottom: 4px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.hero-location {
  font-size: 1rem;
  opacity: 0.85;
  margin-bottom: 10px;
}
.hero-meta {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 0.83rem;
  opacity: 0.82;
}
@media (max-width: 540px) {
  .hero { height: 320px; }
  .hero-overlay { padding: 20px 18px; }
}

/* ── Sections ──────────────────────────────────────────────────────── */
.section-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 52px 24px;
}
section h2 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(1.5rem, 3.5vw, 1.9rem);
  font-weight: 700;
  color: ${esc(palette.dark)};
  margin-bottom: 24px;
}

/* ── About ─────────────────────────────────────────────────────────── */
.about { background: #fff; }
.about p {
  font-size: 1.05rem;
  color: #374151;
  line-height: 1.75;
  max-width: 720px;
}

/* ── Rooms ─────────────────────────────────────────────────────────── */
.rooms { background: #f8f9fa; }
.rooms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}
.room-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-top: 4px solid ${esc(palette.brand)};
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.room-card-body {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}
.room-photo {
  width: 100%;
  height: 200px;
  overflow: hidden;
  flex-shrink: 0;
}
.room-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
  display: block;
}
.room-card:hover .room-photo img { transform: scale(1.03); }
.photo-strip {
  display: flex;
  gap: 4px;
  padding: 8px 22px 0;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.photo-strip::-webkit-scrollbar { display: none; }
.photo-strip-thumb {
  width: 56px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 0.15s;
}
.photo-strip-thumb:hover { opacity: 1; }
.room-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.room-header h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
}
.room-type-badge {
  font-size: 0.72rem;
  font-weight: 600;
  background: ${esc(palette.light)};
  color: ${esc(palette.dark)};
  padding: 3px 9px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.room-price {
  font-size: 1.55rem;
  font-weight: 700;
  color: ${esc(palette.dark)};
}
.room-price-unit {
  font-size: 0.9rem;
  font-weight: 400;
  color: #64748b;
}
.room-capacity {
  font-size: 0.85rem;
  color: #475569;
}
.room-desc {
  font-size: 0.88rem;
  color: #475569;
  line-height: 1.55;
}
.amenities {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.amenity-tag {
  background: ${esc(palette.light)};
  color: ${esc(palette.dark)};
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 500;
}
.room-breakfast {
  font-size: 0.82rem;
  font-weight: 600;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 5px 10px;
}
.btn-book {
  margin-top: auto;
  background: ${esc(palette.dark)};
  color: #fff;
  border: none;
  padding: 11px 18px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.14s;
}
.btn-book:hover { background: ${esc(palette.brand)}; }

/* ── Availability ──────────────────────────────────────────────────── */
.availability { background: #fff; }
.avail-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 24px;
}
.legend-dot {
  display: inline-block;
  width: 12px; height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}
.legend-available { background: ${esc(palette.light)}; border: 1px solid ${esc(palette.brand)}; }
.legend-booked    { background: #f1f5f9; border: 1px solid #cbd5e1; }
.calendar-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  margin-bottom: 20px;
}
@media (max-width: 600px) { .calendar-grid { grid-template-columns: 1fr; } }
.cal-month h3 {
  font-size: 0.95rem;
  font-weight: 700;
  color: ${esc(palette.dark)};
  text-align: center;
  margin-bottom: 10px;
}
.cal-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.cal-header {
  font-size: 0.7rem;
  font-weight: 700;
  color: #94a3b8;
  text-align: center;
  padding: 4px 0;
  text-transform: uppercase;
}
.cal-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 500;
}
.cal-empty  { background: none; }
.cal-past   { color: #cbd5e1; }
.cal-available { background: ${esc(palette.light)}; color: ${esc(palette.dark)}; }
.cal-booked    { background: #f1f5f9; color: #94a3b8; }
.cal-today  {
  background: ${esc(palette.dark)};
  color: #fff;
  font-weight: 700;
  border-radius: 50%;
}
.calendar-note {
  font-size: 0.83rem;
  color: #64748b;
}

/* ── CTA ───────────────────────────────────────────────────────────── */
.cta { background: ${esc(palette.light)}; }
.cta-inner { text-align: center; }
.cta h2    { color: ${esc(palette.dark)}; }
.cta p {
  font-size: 1rem;
  color: #475569;
  max-width: 520px;
  margin: 0 auto 24px;
}
.btn-primary-large {
  background: ${esc(palette.dark)};
  color: #fff;
  border: none;
  padding: 15px 40px;
  border-radius: 8px;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.14s;
}
.btn-primary-large:hover { background: ${esc(palette.brand)}; }

/* ── Footer ────────────────────────────────────────────────────────── */
footer {
  text-align: center;
  padding: 28px 24px;
  font-size: 0.82rem;
  color: #94a3b8;
  border-top: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
footer a { color: ${esc(palette.brand)}; text-decoration: none; }
footer a:hover { text-decoration: underline; }

/* Push widget trigger away from edge on mobile */
@media (max-width: 540px) {
  #nb-root .nb-trigger { bottom: 20px; right: 16px; }
}
</style>
</head>
<body>

${heroSection}
${aboutSection}
${roomsSection}
${availSection}
${ctaSection}
${footerSection}

<script>
function openWidget() {
  var btn = document.querySelector('.nb-trigger');
  if (btn) btn.click();
}
</script>

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

    const rooms = db.prepare(
      `SELECT * FROM rooms WHERE property_id = ? AND status != 'maintenance' ORDER BY price_per_night ASC`
    ).all(property.id);

    const bookings = db.prepare(`
      SELECT b.check_in_date, b.check_out_date, b.room_id
      FROM bookings b
      JOIN rooms r ON r.id = b.room_id
      WHERE r.property_id = ?
        AND b.status IN ('confirmed', 'arriving')
        AND b.check_out_date >= date('now')
    `).all(property.id);

    const availMap = getAvailabilityMap(bookings, rooms.length);

    const allPhotos = db.prepare(`
      SELECT rp.room_id, rp.filename
      FROM room_photos rp
      JOIN rooms r ON r.id = rp.room_id
      WHERE r.property_id = ?
      ORDER BY rp.room_id, rp.display_order
    `).all(property.id);
    const photosByRoom = {};
    for (const p of allPhotos) {
      if (!photosByRoom[p.room_id]) photosByRoom[p.room_id] = [];
      photosByRoom[p.room_id].push(p.filename);
    }

    res.send(generateBookingPage(property, rooms, availMap, photosByRoom));
  } catch (err) {
    console.error('[bookingPage]', err);
    res.status(500).send('Server error');
  }
});
