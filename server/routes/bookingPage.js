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
  bnb:          'B&B',
  bb:           'B&B',
  guesthouse:   'Guest House',
  inn:          'Inn',
  hotel:        'Hotel',
  hostel:       'Hostel',
  gite:         'Gîte',
  cottage:      'Holiday Cottage',
  villa:        'Villa',
  apartment:    'Holiday Apartment',
  lodge:        'Lodge',
  caravan:      'Holiday Chalet',
  glamping:     'Glamping',
  shepherds_hut: "Shepherd's Hut",
  treehouse:    'Treehouse',
  narrowboat:   'Narrowboat',
  farmhouse:    'Farmhouse',
  chateau:      'Château',
  ryokan:       'Ryokan',
  minsu:        '民宿',
  homestay:     'Homestay',
  resort_villa: 'Resort Villa',
  other:        '',
};

const CURRENCY_SYMBOLS = { EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' };

const AMENITY_LABELS = {
  wifi: 'WiFi', ensuite: 'En-suite', balcony: 'Balcony', terrace: 'Terrace',
  parking: 'Parking', minibar: 'Minibar', kitchenette: 'Kitchenette',
  aircon: 'Air Con', tv: 'TV', safe: 'Safe', bathtub: 'Bathtub',
};

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
  for (let i = 0; i < 365; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const s = localDateStr(d);
    map[s] = rb.some(b => b.check_in_date <= s && b.check_out_date > s) ? 'booked' : 'available';
  }
  return map;
}

function roomCalendarSection(roomId) {
  return `
<div class="room-availability">
  <h4 class="avail-title" data-i18n="page.availability">Availability</h4>
  <div class="nb-cal-container" data-room-id="${esc(String(roomId))}"></div>
  <p class="avail-hint" data-i18n="page.availabilityHint">Select your dates and click Book Now to check availability and complete your reservation.</p>
</div>`;
}

function getPropertyAvailMap(bookings) {
  const map = {};
  const base = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const s = localDateStr(d);
    map[s] = bookings.some(b => b.check_in_date <= s && b.check_out_date > s) ? 'booked' : 'available';
  }
  return map;
}

function propertyCalendarSection() {
  return `
<div class="room-availability">
  <div class="nb-cal-container" data-room-id="property"></div>
  <p class="avail-hint" data-i18n="page.wholePropertyAvailability">Check when the whole property is available for your dates.</p>
</div>`;
}

// heroPhoto   — filename stored in uploads/properties/ (property cover photo, may be null)
// roomPhotos  — array of {filename, thumb_filename, room_name} from room_photos
// propertyName — used for alt text
function wpGallerySection(heroPhoto, roomPhotos, propertyName) {
  const hasHero   = !!heroPhoto;
  const mainSrc   = hasHero
    ? `/uploads/properties/${esc(heroPhoto)}`
    : (roomPhotos[0] ? `/uploads/rooms/${esc(roomPhotos[0].filename)}` : null);

  if (!mainSrc) return '';

  // Strip photos: first 2 room photos; if hero is absent and first room photo is main, skip it
  const stripPhotos = hasHero ? roomPhotos.slice(0, 2) : roomPhotos.slice(1, 3);

  const totalPhotos = (hasHero ? 1 : 0) + roomPhotos.length;

  const seeAllBtn = totalPhotos > 3
    ? `<button class="wp-gallery-btn" onclick="document.querySelector('.ws-rooms')?.scrollIntoView({behavior:'smooth'})">
        <i class="ti ti-photos"></i> See all ${totalPhotos} photos
      </button>`
    : '';

  if (stripPhotos.length === 0) {
    return `
<div class="wp-gallery">
  <div class="wp-gallery-solo">
    <img src="${mainSrc}" alt="${esc(propertyName)}" loading="eager" />
  </div>
  ${seeAllBtn}
</div>`;
  }

  return `
<div class="wp-gallery">
  <div class="wp-gallery-grid">
    <div class="wp-gallery-main">
      <img src="${mainSrc}" alt="${esc(propertyName)}" loading="eager" />
    </div>
    <div class="wp-gallery-side${stripPhotos.length >= 2 ? ' has-four' : ''}">
      ${stripPhotos.map(p => `<div class="wp-gal-thumb"><img src="/uploads/rooms/${esc(p.thumb_filename || p.filename)}" alt="${esc(p.room_name || propertyName)}" loading="lazy" /></div>`).join('\n      ')}
    </div>
  </div>
  ${seeAllBtn}
</div>`;
}

function wpAlternatingShowcase(rooms, photosByRoom, palette) {
  if (!rooms || rooms.length === 0) return '';

  const rows = rooms.map((room, index) => {
    const photos    = photosByRoom?.[room.id] ?? [];
    const isEven    = index % 2 === 1;
    const primary   = photos[0] ?? null;
    const amenities = (room.amenities ?? '').split(',').map(a => a.trim()).filter(Boolean);
    const typeLabel = room.type && room.type !== 'other'
      ? room.type.charAt(0).toUpperCase() + room.type.slice(1)
      : '';
    const isBedroom = ['single','double','twin','suite'].includes(room.type);
    const cid       = `room-${room.id}`;

    const mainImgHtml = primary
      ? `<img src="/uploads/rooms/${esc(primary.filename)}" alt="${esc(room.name)}" class="ws-main-img" id="${esc(cid)}-main" loading="eager" />`
      : `<div class="ws-no-photo"><i class="ti ti-photo-off"></i></div>`;

    const thumbsHtml = photos.length > 1
      ? `<div class="ws-thumbs">${
          photos.map((photo, i) =>
            `<div class="ws-thumb${i === 0 ? ' active' : ''}" onclick="wsSwap('${esc(cid)}','/uploads/rooms/${esc(photo.filename)}',this)"><img src="/uploads/rooms/${esc(photo.thumb_filename || photo.filename)}" alt="${esc(room.name)} ${i + 1}" loading="lazy" /></div>`
          ).join('')
        }</div>`
      : '';

    const sleepsHtml   = isBedroom && room.capacity
      ? `<span class="ws-amenity"><i class="ti ti-moon"></i> Sleeps ${esc(String(room.capacity))}</span>`
      : '';
    const amenityChips = amenities.map(a => `<span class="ws-amenity">${esc(fmtAmenity(a))}</span>`).join('');
    const descHtml     = room.description ? `<p class="ws-desc">${esc(room.description)}</p>` : '';

    return `
<div class="ws-room">
  <h3 class="ws-room-title">${esc(room.name)}</h3>
  ${typeLabel ? `<div class="ws-room-type">${esc(typeLabel)}</div>` : ''}
  <div class="ws-photo-area${isEven ? ' ws-reverse' : ''}">
    <div class="ws-main-photo" id="${esc(cid)}">
      ${mainImgHtml}
    </div>
    ${photos.length > 1 ? `<div class="ws-thumb-col">${thumbsHtml}</div>` : ''}
  </div>
  <div class="ws-details">
    ${sleepsHtml || amenityChips ? `<div class="ws-amenities-row">${sleepsHtml}${amenityChips}</div>` : ''}
    ${descHtml}
  </div>
  <div class="ws-divider"></div>
</div>`;
  }).join('');

  return `
<div class="ws-rooms">
  <div class="ws-section-title" data-i18n="page.whatsIncluded">What's included</div>
  ${rows}
</div>`;
}

function showcaseRoomCard(room, palette, photos) {
  const amenities = (room.amenities ?? '').split(',').map(a => a.trim()).filter(Boolean);
  const typeLabel = room.type
    ? room.type.charAt(0).toUpperCase() + room.type.slice(1)
    : '';

  const amenityTags = amenities.map(a =>
    `<span class="amenity-tag">${esc(fmtAmenity(a))}</span>`
  ).join('');

  const descHtml = room.description
    ? `<p class="room-desc">${esc(room.description)}</p>`
    : '';

  const photoHtml = photos && photos.length > 0 ? `
  <div class="room-photo">
    <img src="/uploads/rooms/${esc(photos[0].filename)}" alt="${esc(room.name)}" loading="lazy" />
  </div>
  ${photos.length > 1 ? `<div class="photo-strip">
    ${photos.map((p, i) => `<img src="/uploads/rooms/${esc(p.filename)}" class="photo-strip-thumb${i === 0 ? ' active' : ''}" loading="lazy" alt="" />`).join('\n    ')}
  </div>` : ''}` : '';

  return `
<div class="room-card room-card-showcase">
  ${photoHtml}
  <div class="room-card-body">
    <div class="room-header">
      <h3>${esc(room.name)}</h3>
      <span class="room-type-badge">${esc(typeLabel)}</span>
    </div>
    ${descHtml}
    ${amenityTags ? `<div class="amenities">${amenityTags}</div>` : ''}
  </div>
</div>`;
}

function roomCard(room, currSym, palette, photos, availMap, isPaidPlan) {
  const amenities = (room.amenities ?? '').split(',').map(a => a.trim()).filter(Boolean);
  const price = Number(room.price_per_night ?? 0).toFixed(0);
  const typeLabel = room.type
    ? room.type.charAt(0).toUpperCase() + room.type.slice(1)
    : '';

  const amenityTags = amenities.map(a =>
    `<span class="amenity-tag">${esc(fmtAmenity(a))}</span>`
  ).join('');

  const bfBadge = room.breakfast_included
    ? `<div class="room-breakfast"><i class="ti ti-coffee"></i> <span data-i18n="page.breakfastIncluded">Breakfast included</span></div>`
    : '';

  const descHtml = room.description
    ? `<p class="room-desc">${esc(room.description)}</p>`
    : '';

  const photoHtml = photos && photos.length > 0 ? `
  <div class="room-photo">
    <img src="/uploads/rooms/${esc(photos[0].filename)}" alt="${esc(room.name)}" loading="lazy" />
  </div>
  ${photos.length > 1 ? `
  <div class="photo-strip">
    ${photos.map((p, i) => `<img src="/uploads/rooms/${esc(p.filename)}" class="photo-strip-thumb${i === 0 ? ' active' : ''}" loading="lazy" alt="" />`).join('')}
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
    <div class="room-capacity"><i class="ti ti-users"></i> <span data-i18n="page.upTo">Up to</span> ${esc(String(room.capacity ?? 2))} <span data-i18n="page.guests">guests</span></div>
    ${descHtml}
    ${amenityTags ? `<div class="amenities">${amenityTags}</div>` : ''}
    ${bfBadge}
    ${roomCalendarSection(room.id)}
    <button class="btn-book" onclick="${isPaidPlan ? 'openWidget()' : 'scrollToEnquiry()'}" data-i18n="page.bookThisRoom">Book this room</button>
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

function generateBookingPage(property, rooms, bookings, photosByRoom, isPaidPlan) {
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
  const isWholeProperty = property.rental_type === 'whole_property';
  const isDemo = property.is_demo === 1;

  const availMapsByRoom = {};
  for (const r of rooms) availMapsByRoom[r.id] = getRoomAvailMap(bookings, r.id);

  const propAvailMap = isWholeProperty ? getPropertyAvailMap(bookings) : null;

  // Build availability JSON for client-side navigable calendars
  const availJson = {};
  if (isWholeProperty) {
    availJson['property'] = propAvailMap;
  } else {
    for (const r of rooms) availJson[String(r.id)] = availMapsByRoom[r.id];
  }

  const roomCards = rooms.map(r => roomCard(r, currSym, palette, photosByRoom?.[r.id], availMapsByRoom[r.id], isPaidPlan)).join('\n');

  const metaDesc = property.description
    ? esc(property.description.slice(0, 155))
    : `Book your stay at ${esc(name)} in ${esc(city)} directly — best rates guaranteed. ${rooms.length} room${rooms.length !== 1 ? 's' : ''} available.`;

  const heroStyle = property.hero_photo
    ? `background-image:url('/uploads/properties/${esc(property.hero_photo)}');background-size:cover;background-position:center;background-color:${esc(palette.dark)}`
    : `background:${esc(palette.dark)}`;

  const heroInner = property.hero_photo
    ? `<div class="hero-overlay" style="background:linear-gradient(rgba(0,0,0,0.3),rgba(0,0,0,0.72));position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;justify-content:flex-end;padding:28px 32px;">`
    : `<div class="hero-overlay">`;

  const mapIframe = !property.hero_photo && address ? `
  <iframe
    src="https://maps.google.com/maps?q=${mapQuery}&output=embed&z=15"
    class="hero-map"
    allowfullscreen=""
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade">
  </iframe>` : '';

  // Collect all room photos in display order for the WP gallery
  const wpRoomPhotos = rooms.flatMap(r => (photosByRoom?.[r.id] ?? []).map(p => ({ ...p, room_name: r.name })));
  const gallerySection = isWholeProperty ? wpGallerySection(property.hero_photo || null, wpRoomPhotos, name) : '';

  let heroSection;
  if (isWholeProperty) {
    const rate = property.whole_property_rate;
    const rateDisplay = rate ? `${esc(currSym)}${esc(Number(rate).toFixed(0))}` : '';

    // Build stats bar for WP (sticky below gallery)
    const statsDetails = [
      property.total_capacity ? `<span><i class="ti ti-users"></i> ${esc(String(property.total_capacity))} guests</span>` : '',
      property.bedroom_count  ? `<span class="wp-stats-sep">·</span><span><i class="ti ti-bed"></i> ${esc(String(property.bedroom_count))} bedrooms</span>` : '',
      property.bathroom_count ? `<span class="wp-stats-sep">·</span><span><i class="ti ti-bath"></i> ${esc(String(property.bathroom_count))} bathrooms</span>` : '',
      rateDisplay             ? `<span class="wp-stats-sep">·</span><span class="wp-stats-rate">${rateDisplay} <span class="room-price-unit">/ night</span></span>` : '',
    ].filter(Boolean).join('');

    // If photos exist, use gallery as hero; if not, fall back to the photo/map hero
    if (gallerySection) {
      heroSection = `${gallerySection}
<div class="wp-stats-bar">
  <div class="wp-stats-inner">
    <div class="wp-stats-name">
      ${typeLabel ? `<div class="hero-badge" style="position:relative;background:${esc(palette.light)};border-color:${esc(palette.brand)};color:${esc(palette.dark)}">${esc(typeLabel)}</div>` : ''}
      <h1>${esc(name)}</h1>
    </div>
    ${statsDetails ? `<div class="wp-stats-details">${statsDetails}</div>` : ''}
    ${isPaidPlan ? `<button class="wp-stats-btn" onclick="openWidget()">Check availability →</button>` : `<button class="wp-stats-btn" onclick="scrollToEnquiry()">Send enquiry</button>`}
  </div>
</div>`;
    } else {
      // No photos — use existing hero style
      const statsHtml = [
        property.total_capacity ? `<span><i class="ti ti-users"></i> ${esc(String(property.total_capacity))} <span data-i18n="page.guests">guests</span></span>` : '',
        property.bedroom_count  ? `<span><i class="ti ti-bed"></i> ${esc(String(property.bedroom_count))} bedrooms</span>` : '',
        property.bathroom_count ? `<span><i class="ti ti-bath"></i> ${esc(String(property.bathroom_count))} bathrooms</span>` : '',
      ].filter(Boolean).join('');
      heroSection = `
<div class="hero hero-whole" style="${heroStyle}">
  ${mapIframe}
  ${heroInner}
    ${typeLabel ? `<div class="hero-badge">${esc(typeLabel)}</div>` : ''}
    <h1>${esc(name)}</h1>
    ${(city || country) ? `<p class="hero-location">${esc([city, country].filter(Boolean).join(', '))}</p>` : ''}
    ${statsHtml ? `<div class="hero-stats">${statsHtml}</div>` : ''}
    ${rateDisplay ? `<div class="hero-price">${rateDisplay}<span class="room-price-unit"> / <span data-i18n="page.perNight">per night</span></span></div>` : ''}
  </div>
</div>`;
    }
  } else {
    heroSection = `
<div class="hero" style="${heroStyle}">
  ${mapIframe}
  ${heroInner}
    ${typeLabel ? `<div class="hero-badge">${esc(typeLabel)}</div>` : ''}
    <h1>${esc(name)}</h1>
    ${(city || country) ? `<p class="hero-location">${esc([city, country].filter(Boolean).join(', '))}</p>` : ''}
    <div class="hero-meta">
      <span><i class="ti ti-clock"></i> <span data-i18n="page.checkIn">Check-in from</span> ${esc(property.check_in_time ?? '15:00')}</span>
      <span><i class="ti ti-clock"></i> <span data-i18n="page.checkOut">Check-out by</span> ${esc(property.check_out_time ?? '11:00')}</span>
    </div>
  </div>
</div>`;
  }

  const aboutSection = property.description ? `
<section class="about">
  <div class="section-inner">
    <h2 data-i18n="page.aboutUs">About us</h2>
    <p>${esc(property.description)}</p>
  </div>
</section>` : '';

  let roomsSection;
  if (isWholeProperty) {
    roomsSection = `
${rooms.length > 0 ? wpAlternatingShowcase(rooms, photosByRoom, palette) : ''}
<section class="availability">
  <div class="section-inner">
    <h2 data-i18n="page.availability">Availability</h2>
    ${propertyCalendarSection()}
  </div>
</section>`;
  } else {
    roomsSection = rooms.length > 0 ? `
<section class="rooms">
  <div class="section-inner">
    <h2 data-i18n="page.ourRooms">Our Rooms</h2>
    <div class="rooms-grid">
      ${roomCards}
    </div>
  </div>
</section>` : '';
  }

  const bookOrEnquiryBtn = isPaidPlan
    ? `<button class="btn-primary-large" onclick="openWidget()" data-i18n="page.checkAvailability">Check availability &amp; book →</button>`
    : `<button class="btn-primary-large" onclick="scrollToEnquiry()" data-i18n="page.sendEnquiry">Send a booking enquiry</button>`;

  const cancellationDays = property.cancellation_days ?? 7;
  const cancellationText = cancellationDays > 0
    ? `Free cancellation up to ${cancellationDays} days before arrival`
    : 'Flexible cancellation — contact owner';

  let ctaSection;
  if (isWholeProperty) {
    ctaSection = `
<section class="cta-section">
  <div class="cta-inner">
    <h2 data-i18n="page.bookNow">Ready to book?</h2>
    <p data-i18n="page.ctaHint">Book directly with us for the best rates — no booking fees, payment goes straight to us.</p>
    ${bookOrEnquiryBtn}
    <div class="nb-step-item" style="margin-top:16px;display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#475569;">
      <span class="nb-step-num" style="display:flex;align-items:center;">
        <i class="ti ti-shield-check" style="font-size:1.1rem;color:#16a34a;"></i>
      </span>
      <span>${esc(cancellationText)}</span>
    </div>
  </div>
</section>`;
  } else {
    ctaSection = `
<section class="cta">
  <div class="section-inner cta-inner">
    <h2 data-i18n="page.bookNow">Ready to book?</h2>
    <p data-i18n="page.ctaHint">Book directly with us for the best rates — no booking fees, payment goes straight to us.</p>
    ${bookOrEnquiryBtn}
  </div>
</section>`;
  }

  const footerSection = `
<footer>
  <p>© ${new Date().getFullYear()} ${esc(name)}</p>
  <p><span data-i18n="page.poweredBy">Powered by</span> <a href="https://nestbook.io" target="_blank" rel="noopener">NestBook</a> — booking software for independent properties</p>
  <div class="lang-switcher">
    <button class="lang-btn" data-lang="en" onclick="applyLang('en')">EN</button>
    <button class="lang-btn" data-lang="fr" onclick="applyLang('fr')">FR</button>
    <button class="lang-btn" data-lang="es" onclick="applyLang('es')">ES</button>
    <button class="lang-btn" data-lang="de" onclick="applyLang('de')">DE</button>
    <button class="lang-btn" data-lang="nl" onclick="applyLang('nl')">NL</button>
  </div>
</footer>`;

  const hasLocation = city || property.address;
  const mapSection = hasLocation ? `
<section class="wp-map-section" id="wp-map-section">
  <div class="wp-map-fallback" id="wp-map-fallback"></div>
  <div class="wp-map-embed" id="wp-map-embed" style="opacity:0;">
    <iframe
      id="wp-map-iframe"
      src="https://maps.google.com/maps?q=${mapQuery}&output=embed&z=13"
      width="100%"
      height="100%"
      style="border:0;"
      allowfullscreen=""
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      title="Location of ${esc(name)}"
    ></iframe>
  </div>
</section>
<script>
(function() {
  var iframe = document.getElementById('wp-map-iframe');
  var embed  = document.getElementById('wp-map-embed');
  var fallback = document.getElementById('wp-map-fallback');
  var section  = document.getElementById('wp-map-section');
  if (!iframe || !embed || !fallback) return;
  var timeout = setTimeout(showFallback, 5000);
  iframe.addEventListener('load', function() {
    clearTimeout(timeout);
    setTimeout(function() {
      try {
        var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (doc && doc.body && doc.body.innerHTML.length > 100) {
          showMap();
        } else {
          showFallback();
        }
      } catch(e) {
        showMap(); // cross-origin = loaded correctly
      }
    }, 500);
  });
  iframe.addEventListener('error', function() {
    clearTimeout(timeout);
    showFallback();
  });
  function showMap() {
    embed.style.transition = 'opacity 0.4s ease';
    embed.style.opacity = '1';
    fallback.style.display = 'none';
    section.classList.add('map-loaded');
  }
  function showFallback() {
    embed.style.display = 'none';
    fallback.style.display = 'block';
    section.classList.add('map-fallback');
  }
})();
</script>` : '';

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
<!-- Tabler Icons -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">

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

/* ── Language switcher (subtle footer) ─────────────────────────────── */
.lang-switcher {
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 10px 0 2px;
}
.lang-btn {
  background: transparent;
  border: 1px solid #e2e8f0;
  color: #94a3b8;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0.06em;
  transition: background 0.12s, color 0.12s;
}
.lang-btn:hover { background: #f1f5f9; color: #475569; }
.lang-btn.active { background: #e2e8f0; color: #475569; border-color: #cbd5e1; }

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

/* ── WP Photo Gallery ─────────────────────────────────────────────── */
.wp-gallery {
  position: relative;
  background: #111;
  overflow: hidden;
}
.wp-gallery-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  height: 60vh;
  min-height: 380px;
  max-height: 600px;
  gap: 3px;
}
.wp-gallery-main { overflow: hidden; }
.wp-gallery-main img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wp-gallery-side {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 3px;
}
.wp-gallery-side.has-four { grid-template-rows: 1fr 1fr; }
.wp-gal-thumb { overflow: hidden; }
.wp-gal-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wp-gallery-solo { height: 60vh; min-height: 380px; max-height: 600px; overflow: hidden; }
.wp-gallery-solo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wp-gallery-btn {
  position: absolute;
  bottom: 16px;
  right: 16px;
  background: rgba(255,255,255,0.92);
  border: 1.5px solid rgba(0,0,0,0.15);
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(4px);
  transition: background 0.12s;
}
.wp-gallery-btn:hover { background: #fff; }
@media (max-width: 640px) {
  .wp-gallery-grid { grid-template-columns: 1fr; height: 55vw; min-height: 220px; }
  .wp-gallery-side { display: none; }
}

/* ── WP Stats Bar ─────────────────────────────────────────────────── */
.wp-stats-bar {
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
}
.wp-stats-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.wp-stats-name {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 180px;
}
.wp-stats-name h1 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wp-stats-details {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
  font-size: 0.85rem;
  color: #475569;
}
.wp-stats-sep { color: #cbd5e1; }
.wp-stats-rate { font-weight: 700; color: ${esc(palette.dark)}; }
.wp-stats-btn {
  background: ${esc(palette.dark)};
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: background 0.14s;
  flex-shrink: 0;
}
.wp-stats-btn:hover { background: ${esc(palette.brand)}; }
@media (max-width: 640px) {
  .wp-stats-details { gap: 10px; font-size: 0.78rem; }
  .wp-stats-btn { width: 100%; }
}

/* ── WP Room Showcase ─────────────────────────────────────────────── */
.ws-rooms {
  max-width: 1100px;
  margin: 0 auto;
  padding: 48px 24px;
}
.ws-section-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(1.4rem, 3vw, 1.7rem);
  font-weight: 700;
  color: ${esc(palette.dark)};
  margin-bottom: 48px;
}
.ws-room { margin-bottom: 64px; }
.ws-room-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: ${esc(palette.dark)};
  margin: 0 0 4px;
  letter-spacing: -0.02em;
}
.ws-room-type {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  margin-bottom: 16px;
}
.ws-photo-area {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 20px;
}
.ws-reverse { flex-direction: row-reverse; }
.ws-main-photo {
  flex: 2;
  min-width: 0;
  aspect-ratio: 4/3;
  overflow: hidden;
  background: #f1f5f9;
}
.ws-main-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  transition: opacity 0.25s ease;
}
.ws-no-photo {
  width: 100%;
  height: 100%;
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  font-size: 3rem;
}
.ws-thumb-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
}
.ws-thumbs {
  display: contents;
}
.ws-thumb {
  flex: 1 1 calc(50% - 4px);
  min-width: calc(50% - 4px);
  max-width: calc(50% - 4px);
  aspect-ratio: 4/3;
  overflow: hidden;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.2s ease;
  background: #f1f5f9;
}
.ws-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  min-height: 0;
}
.ws-thumb:hover { opacity: 1; }
.ws-thumb.active {
  opacity: 1;
  outline: 2px solid ${esc(palette.dark)};
  outline-offset: -2px;
}
.ws-details { margin-top: 16px; }
.ws-amenities-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.ws-amenity {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.82rem;
  color: #475569;
  background: #f8fafc;
  padding: 4px 10px;
}
.ws-amenity .ti { font-size: 0.85rem; color: ${esc(palette.dark)}; }
.ws-desc {
  font-size: 0.95rem;
  color: #475569;
  line-height: 1.75;
  max-width: 680px;
  margin: 0;
}
.ws-divider {
  height: 1px;
  background: #f1f5f9;
  margin-top: 48px;
}
.ws-room:last-child .ws-divider { display: none; }

@media (max-width: 768px) {
  .ws-photo-area { flex-direction: column !important; }
  .ws-main-photo { flex: none; width: 100%; }
  .ws-thumb-col {
    flex: none;
    width: 100%;
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .ws-thumb {
    flex: 0 0 80px;
    min-width: 80px;
    max-width: 80px;
  }
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
.avail-hint {
  font-size: 0.72rem;
  color: #94a3b8;
  margin: 8px 0 4px;
  line-height: 1.4;
}
/* Navigable calendar */
.nb-cal-wrapper {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 4px;
}
.availability .nb-cal-wrapper { gap: 32px; }
.nb-cal-month { font-size: 0.78rem; }
.nb-cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.nb-cal-month-name {
  font-weight: 600;
  font-size: 0.75rem;
  color: ${esc(palette.dark)};
}
.nb-cal-nav {
  background: none;
  border: none;
  cursor: pointer;
  color: ${esc(palette.dark)};
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  transition: background 0.15s;
  font-family: inherit;
  line-height: 1;
}
.nb-cal-nav:hover { background: ${esc(palette.light)}; }
.nb-cal-nav-disabled {
  color: #e2e8f0;
  padding: 2px 4px;
  cursor: default;
  display: flex;
  align-items: center;
  line-height: 1;
}
.nb-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}
.nb-cal-dow {
  text-align: center;
  font-size: 0.6rem;
  color: #94a3b8;
  padding: 2px 0;
  font-weight: 600;
}
.nb-cal-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-size: 0.68rem;
  font-weight: 500;
}
.nb-cal-empty    { background: none; color: transparent; }
.nb-cal-past     { background: none; color: #e2e8f0; }
.nb-cal-available { background: ${esc(palette.light)}; color: ${esc(palette.dark)}; }
.nb-cal-booked   { background: #f1f5f9; color: #cbd5e1; text-decoration: line-through; }
.nb-cal-today    { background: ${esc(palette.brand)} !important; color: #fff !important; font-weight: 700; border-radius: 50%; text-decoration: none !important; }
.nb-cal-legend {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  font-size: 0.72rem;
  color: #94a3b8;
  grid-column: span 2;
}
.nb-leg-dot {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 2px;
  margin-right: 3px;
  vertical-align: middle;
}
.nb-leg-available { background: ${esc(palette.light)}; border: 1px solid ${esc(palette.brand)}33; }
.nb-leg-booked    { background: #f1f5f9; border: 1px solid #e2e8f0; }
@media (max-width: 480px) {
  .nb-cal-wrapper { grid-template-columns: 1fr; }
  .nb-cal-legend  { grid-column: span 1; }
}

/* ── Tabler icons ──────────────────────────────────────────────────── */
.ti { vertical-align: middle; }
.hero-stats .ti, .hero-meta .ti { font-size: 0.95rem; opacity: 0.85; }
.room-capacity .ti, .room-breakfast .ti { font-size: 0.9rem; }
#enquirySuccess .ti { font-size: 1.1rem; color: #16a34a; margin-right: 4px; }

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

/* ── Whole property hero ───────────────────────────────────────────── */
.hero-whole { height: 520px; }
.hero-stats {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  margin: 10px 0 4px;
  font-size: 0.88rem;
  opacity: 0.9;
}
.hero-price {
  font-size: 1.4rem;
  font-weight: 700;
  opacity: 0.95;
  margin: 8px 0 10px;
}
.btn-hero {
  display: inline-block;
  background: rgba(255,255,255,0.15);
  border: 2px solid rgba(255,255,255,0.5);
  color: #fff;
  padding: 12px 28px;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.14s;
  backdrop-filter: blur(4px);
}
.btn-hero:hover { background: rgba(255,255,255,0.25); }
@media (max-width: 540px) { .hero-whole { height: 420px; } }

/* ── What's included (whole property showcase) ─────────────────────── */
.whats-included { background: #f8f9fa; }
.whats-included > .section-inner > p {
  font-size: 0.95rem;
  color: #64748b;
  margin-bottom: 4px;
}
.rooms-grid-showcase {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  margin-top: 20px;
}
.room-card-showcase {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-top: 4px solid ${esc(palette.brand)};
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Availability section (whole property) ─────────────────────────── */
.availability { background: #fff; }

/* ── CTA whole property ─────────────────────────────────────────────── */
.cta-whole { background: ${esc(palette.dark)}; }
.cta-whole h2 { color: #fff; }
.cta-whole p { color: rgba(255,255,255,0.82); }
.cta-section {
  background: ${esc(palette.dark)};
  color: #ffffff;
  padding: 60px 24px;
  text-align: center;
}
.cta-section .cta-inner { max-width: 600px; margin: 0 auto; }
.cta-section h2 { font-size: 2rem; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
.cta-section p { font-size: 1.1rem; color: rgba(255,255,255,0.85); margin-bottom: 24px; }
.btn-cta {
  background: #ffffff;
  color: ${esc(palette.dark)};
  border: none;
  padding: 14px 32px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}
.btn-cta:hover { background: #f0fdf4; transform: translateY(-1px); }
.price-display {
  font-size: 2.2rem;
  font-weight: 700;
  color: #fff;
  margin: 8px 0 16px;
  line-height: 1.1;
}
.price-unit { font-size: 1rem; font-weight: 400; opacity: 0.8; }

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

/* ── Enquiry form (Free plan) ───────────────────────────────────────── */
.enquiry-section { background: #f8f9fa; }
.enquiry-hint {
  font-size: 0.95rem;
  color: #64748b;
  margin-bottom: 24px;
  max-width: 560px;
}
.booking-request-form {
  max-width: 560px;
}
.booking-request-form .form-group {
  margin-bottom: 14px;
}
.booking-request-form label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 5px;
}
.booking-request-form input,
.booking-request-form textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  color: #1e293b;
  background: #fff;
  transition: border-color 0.15s;
}
.booking-request-form input:focus,
.booking-request-form textarea:focus {
  outline: none;
  border-color: ${esc(palette.brand)};
  box-shadow: 0 0 0 3px ${esc(palette.light)};
}
.booking-request-form textarea { resize: vertical; }
#enquirySuccess {
  padding: 20px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  color: #166534;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.6;
}

/* ── Map section ────────────────────────────────────────────────── */
.wp-map-section {
  width: 100%;
  height: 25vh;
  min-height: 140px;
  position: relative;
  overflow: hidden;
  display: block;
  background: ${esc(palette.dark)};
}
.wp-map-section::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.40);
  pointer-events: none;
  transition: background 0.3s ease;
  z-index: 1;
}
.wp-map-section:hover::after {
  background: rgba(0, 0, 0, 0.05);
}
.wp-map-section.map-fallback::after {
  display: none;
}
.wp-map-embed {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}
.wp-map-embed iframe {
  width: 100%;
  height: 100%;
  display: block;
  border: 0;
}
.wp-map-fallback {
  display: none;
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
  background: ${esc(palette.dark)};
}
@media (max-width: 768px) {
  .wp-map-section {
    height: 30vh;
    min-height: 160px;
  }
}
.demo-banner {
  background: #fffbeb;
  border-bottom: 2px solid #f59e0b;
  color: #92400e;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 10px 20px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  line-height: 1.5;
}
.demo-banner a {
  color: #92400e;
  text-decoration: underline;
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

${isDemo ? `<div class="demo-banner">
  <i class="ti ti-eye"></i>
  DEMONSTRATION PAGE — This is a NestBook showcase. No real bookings will be processed.
  <a href="https://nestbook.io/app/register">Create your own free page →</a>
</div>` : ''}
${heroSection}
${aboutSection}
${roomsSection}
${ctaSection}
${mapSection}
${isPaidPlan ? '' : `
<section id="booking-enquiry" class="enquiry-section">
  <div class="section-inner">
    <h2 data-i18n="page.sendEnquiry">Send a booking enquiry</h2>
    <p class="enquiry-hint" data-i18n="page.enquiryHint">Fill in your details and the property owner will contact you to confirm availability and arrange payment.</p>
    <div class="booking-request-form">
      <form id="enquiryForm">
        <div class="form-group">
          <label data-i18n="page.yourName">Your name</label>
          <input type="text" id="guestName" required />
        </div>
        <div class="form-group">
          <label data-i18n="page.yourEmail">Email address</label>
          <input type="email" id="guestEmail" required />
        </div>
        <div class="form-group">
          <label data-i18n="page.checkIn">Check-in date</label>
          <input type="date" id="checkIn" required />
        </div>
        <div class="form-group">
          <label data-i18n="page.checkOut">Check-out date</label>
          <input type="date" id="checkOut" required />
        </div>
        <div class="form-group">
          <label data-i18n="page.guests">Number of guests</label>
          <input type="number" id="guestCount" min="1" value="2" required />
        </div>
        <div class="form-group">
          <label data-i18n="page.message">Message (optional)</label>
          <textarea id="message" rows="3" data-i18n-placeholder="page.message"></textarea>
        </div>
        <button type="submit" class="btn-primary-large" data-i18n="page.sendEnquiry">Send enquiry</button>
      </form>
      <div id="enquirySuccess" style="display:none;">
        <p><i class="ti ti-circle-check"></i> <span data-i18n="page.enquirySuccess">Your enquiry has been sent! The property owner will be in touch shortly.</span></p>
      </div>
    </div>
    <p style="text-align:center;font-size:0.78rem;color:#94a3b8;margin-top:20px;">
      Are you the owner of this property?
      <a href="https://nestbook.io/app/pricing" style="color:#1a4710;">Upgrade to Pro</a>
      to accept direct online bookings.
    </p>
  </div>
</section>

<script>
document.getElementById('enquiryForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  var btn = this.querySelector('[type="submit"]');
  btn.disabled = true;
  var data = {
    propertyId: ${propId},
    guestName:  document.getElementById('guestName').value,
    guestEmail: document.getElementById('guestEmail').value,
    checkIn:    document.getElementById('checkIn').value,
    checkOut:   document.getElementById('checkOut').value,
    guests:     document.getElementById('guestCount').value,
    message:    document.getElementById('message').value,
  };
  try {
    var res = await fetch('/api/enquiries', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (res.ok) {
      document.getElementById('enquiryForm').style.display = 'none';
      document.getElementById('enquirySuccess').style.display = 'block';
    } else {
      btn.disabled = false;
    }
  } catch(err) {
    console.error('Enquiry failed:', err);
    btn.disabled = false;
  }
});
</script>`}
${footerSection}

<script>
// ── Availability data (server-injected) ──────────────────────────────────────
var NB_AVAILABILITY = ${JSON.stringify(availJson)};

// ── Navigable availability calendars ─────────────────────────────────────────
var calState = {};

function renderCalendar(roomId, startMonth, startYear) {
  var container = document.querySelector('[data-room-id="' + roomId + '"]');
  if (!container) return;

  var avail = NB_AVAILABILITY[roomId] || {};
  var today = new Date();
  var todayStr = today.getFullYear() + '-'
    + String(today.getMonth() + 1).padStart(2, '0') + '-'
    + String(today.getDate()).padStart(2, '0');
  var canPrev = !(startYear === today.getFullYear() && startMonth === today.getMonth());

  var html = '<div class="nb-cal-wrapper">';

  for (var m = 0; m < 2; m++) {
    var mo = startMonth + m;
    var yr = startYear;
    if (mo > 11) { mo -= 12; yr++; }

    var firstDow    = new Date(yr, mo, 1).getDay();
    var offset      = (firstDow + 6) % 7;
    var daysInMonth = new Date(yr, mo + 1, 0).getDate();
    var monthLabel  = new Date(yr, mo, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    html += '<div class="nb-cal-month"><div class="nb-cal-header">';

    if (m === 0) {
      html += canPrev
        ? '<button class="nb-cal-nav nb-prev" data-sm="' + startMonth + '" data-sy="' + startYear + '"><i class="ti ti-chevron-left"></i></button>'
        : '<span class="nb-cal-nav-disabled"><i class="ti ti-chevron-left"></i></span>';
    } else {
      html += '<span></span>';
    }

    html += '<span class="nb-cal-month-name">' + monthLabel + '</span>';

    if (m === 1) {
      html += '<button class="nb-cal-nav nb-next" data-sm="' + startMonth + '" data-sy="' + startYear + '"><i class="ti ti-chevron-right"></i></button>';
    } else {
      html += '<span></span>';
    }

    html += '</div><div class="nb-cal-grid">';

    var dows = ['M','T','W','T','F','S','S'];
    for (var di = 0; di < 7; di++) html += '<span class="nb-cal-dow">' + dows[di] + '</span>';
    for (var ei = 0; ei < offset; ei++) html += '<span class="nb-cal-day nb-cal-empty"></span>';

    for (var d = 1; d <= daysInMonth; d++) {
      var ds = yr + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var isPast  = ds < todayStr;
      var isToday = ds === todayStr;
      var status  = isPast ? 'past' : (avail[ds] || 'available');
      var cls     = 'nb-cal-day nb-cal-' + status + (isToday ? ' nb-cal-today' : '');
      html += '<span class="' + cls + '">' + (isPast ? '' : d) + '</span>';
    }
    html += '</div></div>';
  }

  html += '<div class="nb-cal-legend">'
    + '<span><span class="nb-leg-dot nb-leg-available"></span> Available</span>'
    + '<span><span class="nb-leg-dot nb-leg-booked"></span> Booked</span>'
    + '</div></div>';

  container.innerHTML = html;
  calState[roomId] = { month: startMonth, year: startYear };

  // Attach nav listeners (avoids inline onclick + quote-escaping in template literal)
  var prevBtn = container.querySelector('.nb-prev');
  if (prevBtn) prevBtn.addEventListener('click', function() {
    calNav(roomId, +this.dataset.sm, +this.dataset.sy, -1);
  });
  var nextBtn = container.querySelector('.nb-next');
  if (nextBtn) nextBtn.addEventListener('click', function() {
    calNav(roomId, +this.dataset.sm, +this.dataset.sy, 1);
  });
}

function calNav(roomId, curMonth, curYear, dir) {
  var nm = curMonth + dir, ny = curYear;
  if (nm < 0)  { nm = 11; ny--; }
  if (nm > 11) { nm = 0;  ny++; }
  var t = new Date();
  if (ny < t.getFullYear() || (ny === t.getFullYear() && nm < t.getMonth())) return;
  renderCalendar(roomId, nm, ny);
}

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
    "page.noDescription":             "",
    "page.bookDirect":                "Book your stay directly — best rates guaranteed",
    "page.wholeProperty":             "Entire property",
    "page.whatsIncluded":             "What's included",
    "page.whatsIncludedHint":         "",
    "page.wholePropertyAvailability": "Check when the whole property is available for your dates.",
    "page.bookTheProperty":           "Book the whole property",
    "page.ctaWholeHint":              "Book directly — best rates guaranteed, no booking fees.",
    "page.sendEnquiry":               "Send a booking enquiry",
    "page.enquiryHint":               "Fill in your details and the property owner will contact you to confirm availability and arrange payment.",
    "page.yourName":                  "Your name",
    "page.yourEmail":                 "Email address",
    "page.message":                   "Message (optional)",
    "page.enquirySuccess":            "Your enquiry has been sent! The property owner will be in touch shortly."
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
    "page.noDescription":             "",
    "page.bookDirect":                "Réservez votre séjour directement — meilleurs tarifs garantis",
    "page.wholeProperty":             "Propriété entière",
    "page.whatsIncluded":             "Ce qui est inclus",
    "page.whatsIncludedHint":         "",
    "page.wholePropertyAvailability": "Vérifiez quand la propriété entière est disponible pour vos dates.",
    "page.bookTheProperty":           "Réserver la propriété entière",
    "page.ctaWholeHint":              "Réservez directement — meilleurs tarifs garantis, sans frais de réservation.",
    "page.sendEnquiry":               "Envoyer une demande de réservation",
    "page.enquiryHint":               "Remplissez vos coordonnées et le propriétaire vous contactera pour confirmer la disponibilité et organiser le paiement.",
    "page.yourName":                  "Votre nom",
    "page.yourEmail":                 "Adresse e-mail",
    "page.message":                   "Message (optionnel)",
    "page.enquirySuccess":            "Votre demande a été envoyée ! Le propriétaire vous contactera prochainement."
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
    "page.noDescription":             "",
    "page.bookDirect":                "Buchen Sie Ihren Aufenthalt direkt — beste Preise garantiert",
    "page.wholeProperty":             "Gesamtes Objekt",
    "page.whatsIncluded":             "Was enthalten ist",
    "page.whatsIncludedHint":         "",
    "page.wholePropertyAvailability": "Prüfen Sie, wann das gesamte Objekt für Ihre Daten verfügbar ist.",
    "page.bookTheProperty":           "Das gesamte Objekt buchen",
    "page.ctaWholeHint":              "Direkt buchen — beste Preise garantiert, keine Buchungsgebühren.",
    "page.sendEnquiry":               "Buchungsanfrage senden",
    "page.enquiryHint":               "Füllen Sie Ihre Daten aus und der Eigentümer wird sich mit Ihnen in Verbindung setzen, um die Verfügbarkeit zu bestätigen.",
    "page.yourName":                  "Ihr Name",
    "page.yourEmail":                 "E-Mail-Adresse",
    "page.message":                   "Nachricht (optional)",
    "page.enquirySuccess":            "Ihre Anfrage wurde gesendet! Der Eigentümer wird sich in Kürze melden."
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
    "page.noDescription":             "",
    "page.bookDirect":                "Reserve su estancia directamente — mejores tarifas garantizadas",
    "page.wholeProperty":             "Propiedad completa",
    "page.whatsIncluded":             "Qué está incluido",
    "page.whatsIncludedHint":         "",
    "page.wholePropertyAvailability": "Compruebe cuándo está disponible la propiedad completa para sus fechas.",
    "page.bookTheProperty":           "Reservar la propiedad completa",
    "page.ctaWholeHint":              "Reserve directamente — mejores tarifas garantizadas, sin gastos de reserva.",
    "page.sendEnquiry":               "Enviar una consulta de reserva",
    "page.enquiryHint":               "Complete sus datos y el propietario se pondrá en contacto para confirmar la disponibilidad y organizar el pago.",
    "page.yourName":                  "Su nombre",
    "page.yourEmail":                 "Correo electrónico",
    "page.message":                   "Mensaje (opcional)",
    "page.enquirySuccess":            "¡Su consulta ha sido enviada! El propietario se pondrá en contacto pronto."
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
    "page.noDescription":             "",
    "page.bookDirect":                "Boek uw verblijf direct — beste tarieven gegarandeerd",
    "page.wholeProperty":             "Hele accommodatie",
    "page.whatsIncluded":             "Wat is inbegrepen",
    "page.whatsIncludedHint":         "",
    "page.wholePropertyAvailability": "Controleer wanneer de hele accommodatie beschikbaar is voor uw data.",
    "page.bookTheProperty":           "De hele accommodatie boeken",
    "page.ctaWholeHint":              "Boek direct — beste tarieven gegarandeerd, geen boekingskosten.",
    "page.sendEnquiry":               "Stuur een boekingsaanvraag",
    "page.enquiryHint":               "Vul uw gegevens in en de eigenaar neemt contact met u op om de beschikbaarheid te bevestigen en de betaling te regelen.",
    "page.yourName":                  "Uw naam",
    "page.yourEmail":                 "E-mailadres",
    "page.message":                   "Bericht (optioneel)",
    "page.enquirySuccess":            "Uw aanvraag is verzonden! De eigenaar neemt binnenkort contact met u op."
  }
  // Future: add zh-CN, ja, th, vi, ms, id for nestbook.asia
};

function applyLang(lang) {
  var t = I18N[lang] || I18N.en;
  var elements = document.querySelectorAll('[data-i18n]');
  console.log('[NestBook] data-i18n elements found:', elements.length);
  document.documentElement.lang = lang;
  elements.forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    console.log('[NestBook] updating:', key, '→', t[key]);
    if (t[key] !== undefined) el.textContent = t[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    if (t[key] !== undefined) el.placeholder = t[key];
  });
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });
  try { sessionStorage.setItem('nb-guest-lang', lang); } catch(_) {}
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('[NestBook] Script executing');
  var propertyLang = '${escapeJs(defaultLang)}';
  var guestLang = null;
  try { guestLang = sessionStorage.getItem('nb-guest-lang'); } catch(_) {}
  var lang = (guestLang && I18N[guestLang]) ? guestLang : propertyLang;
  console.log('[NestBook] Language:', lang);
  applyLang(lang);
  console.log('[NestBook] applyLang called with:', lang);

  // Initialise all navigable calendars
  var now = new Date();
  document.querySelectorAll('.nb-cal-container').forEach(function(c) {
    renderCalendar(c.dataset.roomId, now.getMonth(), now.getFullYear());
  });
});
// ─────────────────────────────────────────────────────────────────────────────

} catch(e) {
  console.error('[NestBook] Script error:', e.message, e.stack);
}

function openWidget() {
  var btn = document.querySelector('.nb-trigger');
  if (btn) btn.click();
}

function scrollToEnquiry() {
  var el = document.getElementById('booking-enquiry');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
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

// ── WP room showcase photo swap ───────────────────────────────────────────────
function wsSwap(carouselId, src, thumbEl) {
  var wrap = document.getElementById(carouselId);
  if (!wrap) return;
  var img = wrap.querySelector('.ws-main-img');
  if (img) {
    img.style.opacity = '0';
    setTimeout(function() { img.src = src; img.style.opacity = '1'; }, 150);
  }
  var col = thumbEl.closest('.ws-thumb-col');
  if (col) {
    col.querySelectorAll('.ws-thumb').forEach(function(t) { t.classList.remove('active'); });
  }
  thumbEl.classList.add('active');
}
</script>

${isPaidPlan ? `<script
  src="https://nestbook.io/widget.js"
  data-property-id="${esc(String(propId))}"
  data-lang="${esc(lang)}"
  data-currency="${esc(currency)}"
  async>
</script>` : ''}

</body>
</html>`;
}

// ── GET /book/:identifier ─────────────────────────────────────────────────────
// Accepts numeric ID (backwards compat) or slug.
bookingPageRouter.get('/:identifier', (req, res) => {
  try {
    const { identifier } = req.params;
    let property;

    const propQuery = `
      SELECT p.*, u.plan
      FROM properties p
      JOIN users u ON u.id = p.owner_id
      WHERE `;
    if (/^\d+$/.test(identifier)) {
      property = db.prepare(propQuery + 'p.id = ?').get(Number(identifier));
    } else {
      property = db.prepare(propQuery + 'p.booking_slug = ?').get(identifier);
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
        AND b.status IN ('confirmed', 'arriving', 'in_house', 'pending_owner_approval')
        AND b.check_out_date >= date('now')
    `).all(property.id);

    const allPhotos = db.prepare(`
      SELECT rp.room_id, rp.filename, rp.thumb_filename
      FROM room_photos rp
      JOIN rooms r ON r.id = rp.room_id
      WHERE r.property_id = ?
      ORDER BY rp.room_id, rp.display_order
    `).all(property.id);
    const photosByRoom = {};
    for (const p of allPhotos) {
      if (!photosByRoom[p.room_id]) photosByRoom[p.room_id] = [];
      photosByRoom[p.room_id].push({ filename: p.filename, thumb_filename: p.thumb_filename });
    }

    const isPaidPlan = ['pro', 'multi'].includes(property.plan);
    res.send(generateBookingPage(property, rooms, bookings, photosByRoom, isPaidPlan));
  } catch (err) {
    console.error('[bookingPage]', err);
    res.status(500).send('Server error');
  }
});
