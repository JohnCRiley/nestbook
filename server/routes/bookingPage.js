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

const CURRENCY_SYMBOLS = { EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' };

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

function escapeJs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function fmtAmenity(str) {
  return AMENITY_LABELS[str.toLowerCase()] ?? (str.charAt(0).toUpperCase() + str.slice(1));
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getRoomAvailMap(bookings, roomId) {
  const rb = bookings.filter(b => b.room_id === roomId);
  const map = {};
  const base = new Date();
  for (let i = 0; i < 62; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const s = localDateStr(d);
    map[s] = rb.some(b => b.check_in_date <= s && b.check_out_date > s) ? 'booked' : 'available';
  }
  return map;
}

function roomCalMonth(year, month, availMap, today) {
  const firstDow  = new Date(year, month, 1).getDay();
  const offset    = (firstDow + 6) % 7; // Monday-first
  const daysCount = new Date(year, month + 1, 0).getDate();

  let h = `<div class="room-cal-month">`;
  h += `<div class="room-cal-header">${MONTH_NAMES[month]} ${year}</div>`;
  h += `<div class="room-cal-days">`;
  for (const d of ['M','T','W','T','F','S','S']) h += `<span class="cal-dow">${d}</span>`;
  for (let i = 0; i < offset; i++) h += `<span class="cal-day cal-empty"></span>`;

  for (let d = 1; d <= daysCount; d++) {
    const s = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = 'cal-day';
    if (s < today)                     cls += ' cal-empty';
    else if (s === today)              cls += ' cal-today';
    else if (availMap[s] === 'booked') cls += ' cal-booked';
    else                               cls += ' cal-available';
    h += `<span class="${cls}">${s >= today ? d : ''}</span>`;
  }
  h += `</div></div>`;
  return h;
}

function roomCalendarSection(availMap) {
  const today = localDateStr(new Date());
  const now   = new Date();
  const m0    = { year: now.getFullYear(), month: now.getMonth() };
  const next  = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const m1    = { year: next.getFullYear(), month: next.getMonth() };
  return `
<div class="room-availability">
  <h4 class="avail-title" data-i18n="page.availability">Availability</h4>
  <div class="room-cal-grid">
    ${roomCalMonth(m0.year, m0.month, availMap, today)}
    ${roomCalMonth(m1.year, m1.month, availMap, today)}
  </div>
  <p class="avail-hint" data-i18n="page.availabilityHint">Select your dates and click Book Now to check availability and complete your reservation.</p>
  <div class="cal-legend">
    <span><span class="legend-dot legend-available"></span> <span data-i18n="page.available">Available</span></span>
    <span><span class="legend-dot legend-booked"></span> <span data-i18n="page.booked">Booked</span></span>
  </div>
</div>`;
}

function roomCard(room, currSym, palette, photos, availMap) {
  const amenities = (room.amenities ?? '').split(',').map(a => a.trim()).filter(Boolean);
  const price = Number(room.price_per_night ?? 0).toFixed(0);
  const typeLabel = room.type
    ? room.type.charAt(0).toUpperCase() + room.type.slice(1)
    : '';

  const amenityTags = amenities.map(a =>
    `<span class="amenity-tag">${esc(fmtAmenity(a))}</span>`
  ).join('');

  const bfBadge = room.breakfast_included
    ? `<div class="room-breakfast">🍳 <span data-i18n="page.breakfastIncluded">Breakfast included</span></div>`
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
    ${photos.map((f, i) => `<img src="/uploads/rooms/${esc(f)}" class="photo-strip-thumb${i === 0 ? ' active' : ''}" loading="lazy" alt="" />`).join('')}
  </div>` : ''}` : '';

  return `
<div class="room-card">
  ${photoHtml}
  <div class="room-card-body">
    <div class="room-header">
      <h3>${esc(room.name)}</h3>
      <span class="room-type-badge">${esc(typeLabel)}</span>
    </div>
    <div class="room-price">${esc(currSym)}${esc(price)}<span class="room-price-unit"> <span data-i18n="page.perNight">per night</span></span></div>
    <div class="room-capacity">👥 <span data-i18n="page.upTo">Up to</span> ${esc(String(room.capacity ?? 2))} <span data-i18n="page.guests">guests</span></div>
    ${descHtml}
    ${amenityTags ? `<div class="amenities">${amenityTags}</div>` : ''}
    ${bfBadge}
    ${availMap ? roomCalendarSection(availMap) : ''}
    <button class="btn-book" onclick="openWidget()" data-i18n="page.bookThisRoom">Book this room</button>
  </div>
</div>`;
}

// Map property locale to 2-letter page language code
const LANG_MAP = {
  'en': 'en', 'en-GB': 'en', 'en-US': 'en',
  'fr': 'fr', 'fr-FR': 'fr',
  'de': 'de', 'de-DE': 'de',
  'es': 'es', 'es-ES': 'es',
  'nl': 'nl', 'nl-NL': 'nl',
};

function generateBookingPage(property, rooms, bookings, photosByRoom) {
  const palette  = THEME_COLOURS[property.theme] ?? THEME_COLOURS.forest;
  const name     = property.name    ?? 'Book your stay';
  const city     = property.city    ?? '';
  const country  = property.country ?? '';
  const address  = [property.address, city, country].filter(Boolean).join(', ');
  const mapQuery = encodeURIComponent(address || name);
  const propId   = property.id;
  const lang     = property.locale   ?? 'en';
  const defaultLang = LANG_MAP[lang] || 'en';
  const currency = property.currency ?? 'EUR';
  const currSym  = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  const typeLabel = TYPE_LABELS[property.type] ?? '';
  const slug     = property.booking_slug ?? String(propId);

  const availMapsByRoom = {};
  for (const r of rooms) availMapsByRoom[r.id] = getRoomAvailMap(bookings, r.id);

  const roomCards = rooms.map(r => roomCard(r, currSym, palette, photosByRoom?.[r.id], availMapsByRoom[r.id])).join('\n');

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
      <span>🕐 <span data-i18n="page.checkIn">Check-in from</span> ${esc(property.check_in_time ?? '15:00')}</span>
      <span>🕐 <span data-i18n="page.checkOut">Check-out by</span> ${esc(property.check_out_time ?? '11:00')}</span>
    </div>
  </div>
</div>`;

  const aboutSection = property.description ? `
<section class="about">
  <div class="section-inner">
    <h2 data-i18n="page.aboutUs">About us</h2>
    <p>${esc(property.description)}</p>
  </div>
</section>` : '';

  const roomsSection = rooms.length > 0 ? `
<section class="rooms">
  <div class="section-inner">
    <h2 data-i18n="page.ourRooms">Our Rooms</h2>
    <div class="rooms-grid">
      ${roomCards}
    </div>
  </div>
</section>` : '';

  const ctaSection = `
<section class="cta">
  <div class="section-inner cta-inner">
    <h2 data-i18n="page.bookNow">Ready to book?</h2>
    <p data-i18n="page.ctaHint">Book directly with us for the best rates — no booking fees, payment goes straight to us.</p>
    <button class="btn-primary-large" onclick="openWidget()" data-i18n="page.checkAvailability">Check availability &amp; book →</button>
  </div>
</section>`;

  const footerSection = `
<footer>
  <p>© ${new Date().getFullYear()} ${esc(name)}</p>
  <p><span data-i18n="page.poweredBy">Powered by</span> <a href="https://nestbook.io" target="_blank" rel="noopener">NestBook</a> — booking software for independent properties</p>
</footer>`;

  return `<!DOCTYPE html>
<html lang="${esc(defaultLang)}">
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

/* ── Language switcher ─────────────────────────────────────────────── */
.lang-switcher {
  position: fixed;
  top: 0; right: 0;
  display: flex;
  gap: 4px;
  padding: 7px 10px;
  z-index: 200;
  background: rgba(0,0,0,0.32);
  border-radius: 0 0 0 8px;
  backdrop-filter: blur(4px);
}
.lang-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.35);
  color: rgba(255,255,255,0.75);
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0.06em;
  transition: background 0.12s, color 0.12s;
}
.lang-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
.lang-btn.active { background: rgba(255,255,255,0.22); color: #fff; border-color: rgba(255,255,255,0.6); }

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
  align-self: flex-start;
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 20px;
  padding: 4px 14px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 10px;
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
.photo-strip-thumb.active { opacity: 1; outline: 2px solid ${esc(palette.brand)}; outline-offset: 1px; }
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

/* ── Room availability calendar ────────────────────────────────────── */
.room-availability {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f1f5f9;
}
.avail-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: ${esc(palette.dark)};
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.room-cal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.room-cal-header {
  text-align: center;
  font-weight: 600;
  color: ${esc(palette.dark)};
  margin-bottom: 6px;
  font-size: 0.75rem;
}
.room-cal-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}
.cal-dow {
  text-align: center;
  font-size: 0.6rem;
  color: #94a3b8;
  padding: 2px 0;
  font-weight: 600;
  text-transform: uppercase;
}
.cal-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-size: 0.68rem;
  font-weight: 500;
}
.cal-empty     { background: none; color: transparent; }
.cal-available { background: ${esc(palette.light)}; color: ${esc(palette.dark)}; }
.cal-booked    { background: #f1f5f9; color: #cbd5e1; text-decoration: line-through; }
.cal-today     { background: ${esc(palette.brand)}; color: #fff; font-weight: 700; border-radius: 50%; }
.avail-hint {
  font-size: 0.72rem;
  color: #94a3b8;
  margin: 8px 0 4px;
  line-height: 1.4;
}
.cal-legend {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 0.72rem;
  color: #94a3b8;
}
.legend-dot {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 2px;
  margin-right: 3px;
  vertical-align: middle;
}
.legend-available { background: ${esc(palette.light)}; }
.legend-booked    { background: #f1f5f9; border: 1px solid #e2e8f0; }
@media (max-width: 480px) {
  .room-cal-grid { grid-template-columns: 1fr; }
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

<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-5R87S4LXP6"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-5R87S4LXP6');
</script>
</head>
<body>

<div class="lang-switcher">
  <button class="lang-btn" data-lang="en" onclick="applyLang('en')">EN</button>
  <button class="lang-btn" data-lang="fr" onclick="applyLang('fr')">FR</button>
  <button class="lang-btn" data-lang="es" onclick="applyLang('es')">ES</button>
  <button class="lang-btn" data-lang="de" onclick="applyLang('de')">DE</button>
  <button class="lang-btn" data-lang="nl" onclick="applyLang('nl')">NL</button>
</div>

${heroSection}
${aboutSection}
${roomsSection}
${ctaSection}
${footerSection}

<script>
try {
// ── i18n ──────────────────────────────────────────────────────────────────────
// Add zh-CN, ja, th, vi, ms, id etc. here when nestbook.asia launches.
var I18N = {
  en: {
    "page.aboutUs":           "About us",
    "page.ourRooms":          "Our Rooms",
    "page.availability":      "Availability",
    "page.bookNow":           "Ready to book?",
    "page.perNight":          "per night",
    "page.upTo":              "Up to",
    "page.guests":            "guests",
    "page.breakfastIncluded": "Breakfast included",
    "page.bookThisRoom":      "Book this room",
    "page.availabilityHint":  "Select your dates and click Book Now to check availability and complete your reservation.",
    "page.available":         "Available",
    "page.booked":            "Booked",
    "page.ctaHint":           "Book directly with us for the best rates — no booking fees, payment goes straight to us.",
    "page.checkAvailability": "Check availability & book →",
    "page.poweredBy":         "Powered by",
    "page.demoNotice":        "This is a NestBook demonstration page — rooms shown are for illustration only. No real bookings will be processed.",
    "page.checkIn":           "Check-in from",
    "page.checkOut":          "Check-out by",
    "page.noDescription":     "",
    "page.bookDirect":        "Book your stay directly — best rates guaranteed"
  },
  fr: {
    "page.aboutUs":           "À propos de nous",
    "page.ourRooms":          "Nos chambres",
    "page.availability":      "Disponibilités",
    "page.bookNow":           "Prêt à réserver ?",
    "page.perNight":          "par nuit",
    "page.upTo":              "Jusqu'à",
    "page.guests":            "personnes",
    "page.breakfastIncluded": "Petit-déjeuner inclus",
    "page.bookThisRoom":      "Réserver cette chambre",
    "page.availabilityHint":  "Sélectionnez vos dates et cliquez sur Réserver pour vérifier les disponibilités.",
    "page.available":         "Disponible",
    "page.booked":            "Réservé",
    "page.ctaHint":           "Réservez directement avec nous pour les meilleurs tarifs — sans frais de réservation.",
    "page.checkAvailability": "Vérifier les disponibilités →",
    "page.poweredBy":         "Propulsé par",
    "page.demoNotice":        "Ceci est une page de démonstration NestBook — les chambres affichées sont à titre d'illustration uniquement.",
    "page.checkIn":           "Arrivée à partir de",
    "page.checkOut":          "Départ avant",
    "page.noDescription":     "",
    "page.bookDirect":        "Réservez votre séjour directement — meilleurs tarifs garantis"
  },
  de: {
    "page.aboutUs":           "Über uns",
    "page.ourRooms":          "Unsere Zimmer",
    "page.availability":      "Verfügbarkeit",
    "page.bookNow":           "Bereit zu buchen?",
    "page.perNight":          "pro Nacht",
    "page.upTo":              "Bis zu",
    "page.guests":            "Gäste",
    "page.breakfastIncluded": "Frühstück inklusive",
    "page.bookThisRoom":      "Dieses Zimmer buchen",
    "page.availabilityHint":  "Wählen Sie Ihre Daten und klicken Sie auf Buchen, um die Verfügbarkeit zu prüfen.",
    "page.available":         "Verfügbar",
    "page.booked":            "Gebucht",
    "page.ctaHint":           "Buchen Sie direkt bei uns für die besten Preise — keine Buchungsgebühren.",
    "page.checkAvailability": "Verfügbarkeit prüfen →",
    "page.poweredBy":         "Unterstützt von",
    "page.demoNotice":        "Dies ist eine NestBook-Demonstrationsseite — die gezeigten Zimmer dienen nur zur Illustration.",
    "page.checkIn":           "Check-in ab",
    "page.checkOut":          "Check-out bis",
    "page.noDescription":     "",
    "page.bookDirect":        "Buchen Sie Ihren Aufenthalt direkt — beste Preise garantiert"
  },
  es: {
    "page.aboutUs":           "Sobre nosotros",
    "page.ourRooms":          "Nuestras habitaciones",
    "page.availability":      "Disponibilidad",
    "page.bookNow":           "¿Listo para reservar?",
    "page.perNight":          "por noche",
    "page.upTo":              "Hasta",
    "page.guests":            "personas",
    "page.breakfastIncluded": "Desayuno incluido",
    "page.bookThisRoom":      "Reservar esta habitación",
    "page.availabilityHint":  "Seleccione sus fechas y haga clic en Reservar para comprobar disponibilidad.",
    "page.available":         "Disponible",
    "page.booked":            "Reservado",
    "page.ctaHint":           "Reserve directamente con nosotros para las mejores tarifas — sin gastos de reserva.",
    "page.checkAvailability": "Comprobar disponibilidad →",
    "page.poweredBy":         "Desarrollado por",
    "page.demoNotice":        "Esta es una página de demostración de NestBook — las habitaciones mostradas son solo ilustrativas.",
    "page.checkIn":           "Entrada a partir de",
    "page.checkOut":          "Salida antes de",
    "page.noDescription":     "",
    "page.bookDirect":        "Reserve su estancia directamente — mejores tarifas garantizadas"
  },
  nl: {
    "page.aboutUs":           "Over ons",
    "page.ourRooms":          "Onze kamers",
    "page.availability":      "Beschikbaarheid",
    "page.bookNow":           "Klaar om te boeken?",
    "page.perNight":          "per nacht",
    "page.upTo":              "Tot",
    "page.guests":            "personen",
    "page.breakfastIncluded": "Ontbijt inbegrepen",
    "page.bookThisRoom":      "Deze kamer boeken",
    "page.availabilityHint":  "Selecteer uw datums en klik op Boeken om beschikbaarheid te controleren.",
    "page.available":         "Beschikbaar",
    "page.booked":            "Geboekt",
    "page.ctaHint":           "Boek rechtstreeks bij ons voor de beste tarieven — geen boekingskosten.",
    "page.checkAvailability": "Beschikbaarheid controleren →",
    "page.poweredBy":         "Mogelijk gemaakt door",
    "page.demoNotice":        "Dit is een NestBook-demonstratiepagina — de getoonde kamers zijn alleen ter illustratie.",
    "page.checkIn":           "Inchecken vanaf",
    "page.checkOut":          "Uitchecken voor",
    "page.noDescription":     "",
    "page.bookDirect":        "Boek uw verblijf direct — beste tarieven gegarandeerd"
  }
  // Future: add zh-CN, ja, th, vi, ms, id for nestbook.asia
};

function applyLang(lang) {
  var t = I18N[lang] || I18N.en;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    if (t[key] !== undefined) el.textContent = t[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    if (t[key] !== undefined) el.placeholder = t[key];
  });
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });
  try {
    localStorage.setItem('nb-lang', lang);
    localStorage.setItem('nestbook_lang', lang);
  } catch(_) {}
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('[NestBook] Script executing');
  var lang = '${escapeJs(defaultLang)}';
  try { lang = localStorage.getItem('nb-lang') || lang; } catch(_) {}
  console.log('[NestBook] Language:', lang);
  applyLang(lang);
  console.log('[NestBook] applyLang called with:', lang);
});
// ─────────────────────────────────────────────────────────────────────────────

} catch(e) {
  console.error('[NestBook] Script error:', e.message, e.stack);
}

function openWidget() {
  var btn = document.querySelector('.nb-trigger');
  if (btn) btn.click();
}

document.querySelectorAll('.photo-strip-thumb').forEach(function(thumb) {
  thumb.addEventListener('click', function() {
    var card = this.closest('.room-card');
    var mainImg = card.querySelector('.room-photo img');
    if (mainImg) mainImg.src = this.src;
    card.querySelectorAll('.photo-strip-thumb').forEach(function(t) { t.classList.remove('active'); });
    this.classList.add('active');
  });
});
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
        AND b.status IN ('confirmed', 'arriving', 'in_house')
        AND b.check_out_date >= date('now')
    `).all(property.id);

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

    res.send(generateBookingPage(property, rooms, bookings, photosByRoom));
  } catch (err) {
    console.error('[bookingPage]', err);
    res.status(500).send('Server error');
  }
});
