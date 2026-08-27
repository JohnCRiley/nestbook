/**
 * One-off script: rasterize guest-facing property icons to PNGs.
 *
 * Run from the server/ directory:
 *   node scripts/export-guest-icons.mjs
 *
 * Separate sibling to export-email-icons.mjs rather than an extension of it —
 * this library has a completely different colour model (fixed per icon: black
 * by default, real un-recoloured brand colour for the 10 platform logos +
 * Messenger) and a different vocabulary (guest-facing property content, not
 * internal email content), so folding it into the email script would mean
 * threading two unrelated colour systems through one config. Reuses the same
 * mechanics (sharp rasterization, @tabler/icons as the primary source).
 *
 * Sources:
 *  - Most icons: @tabler/icons outline SVGs (same source as the email
 *    library), colour baked in by replacing `currentColor`.
 *  - "binoculars": not present in the installed @tabler/icons@2.47 outline
 *    set (added in a later major version). Rather than bump that shared
 *    devDependency — Tabler renamed/reshaped icons across the v2→v3 jump,
 *    which risks silently changing the 300 existing email icons — the single
 *    binoculars.svg was vendored from the current @tabler/icons@3.46 package
 *    into ./vendor-icons/. Same `currentColor` outline convention, so it
 *    rasterizes identically to everything else.
 *  - The 10 platform logos + Messenger: real, un-recoloured brand marks.
 *    Rather than add `simple-icons` (a ~16MB package) as a project
 *    dependency for ~10 files, the individual brand SVGs were vendored
 *    directly into ./vendor-icons/brand/ (each a few hundred bytes to ~2KB).
 *    LinkedIn was removed from simple-icons at some point (trademark
 *    request), so it falls back to the Tabler outline `brand-linkedin.svg`
 *    recoloured to LinkedIn's own documented brand blue (#0A66C2) — the only
 *    one of the 11 that's an outline rather than a solid mark.
 *
 * Requires: @tabler/icons (devDep, already installed) and sharp (dep).
 * Outputs: server/public/images/guest-icons/{name}.png — one file per icon,
 *          no colour suffix (each icon has exactly one correct variant here).
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BLACK = '#000000';

// ── Icon manifest (100 icons, 8 categories) ─────────────────────────────────
// Each entry is either:
//   'tabler-slug'                                       → black, sourced from @tabler/icons
//   { source: 'vendor', file: 'x.svg' }                 → black, sourced from ./vendor-icons/
//   { source: 'brand', file: 'x.svg', color }           → real brand colour, ./vendor-icons/brand/. These SVGs (vendored
//                                                          from simple-icons) ship with no fill baked in — simple-icons
//                                                          keeps each brand's hex in its metadata, not the SVG itself —
//                                                          so `color` here is that published hex, applied as the SVG's
//                                                          fill (not an invented recolour).
//   { source: 'tabler-brand', slug: 'brand-x', color }  → real colour, Tabler outline recoloured (LinkedIn only)
// The object's own `name` (the manifest key) is always the output filename.
export const GUEST_ICON_GROUPS = {
  'Pets & Animals': {
    paw: 'paw',
    dog: 'dog',
    'dog-bowl': 'dog-bowl',
    cat: 'cat',
    bird: 'feather',              // no direct "bird" icon — feather is the nearest match
    fish: 'fish',
    horse: 'horse',
    'farm-barn': 'building-cottage',
  },
  'Food & Drink': {
    'coffee-cup': 'coffee',
    tea: 'cup',
    'breakfast-plate': 'egg',     // no dedicated breakfast-plate icon — egg is the nearest match
    'wine-glass': 'glass-full',
    beer: 'beer',
    'bread-bakery': 'bread',
    fruit: 'apple',
    'restaurant-cutlery': 'tools-kitchen-2',
    'bbq-grill': 'grill',
    fridge: 'fridge',
    'ice-cream': 'ice-cream',
    'birthday-cake': 'cake',
  },
  'Outdoors & Activity': {
    'hiking-boot': 'shoe',        // no dedicated hiking-boot icon — shoe is the nearest match
    'trail-map': 'map',
    bicycle: 'bike',
    mountain: 'mountain',
    'beach-umbrella': 'beach',
    'waves-sea': 'wave-sine',
    tree: 'tree',
    'garden-flower': 'flower',
    campfire: 'campfire',
    tent: 'tent',
    binoculars: { source: 'vendor', file: 'binoculars.svg' }, // not in installed @tabler/icons@2.47 — vendored from v3
    'fishing-rod': 'fish-hook',
    golf: 'golf',
    'kayak-canoe': 'kayak',
    ski: 'snowboarding',          // no ski icon exists in the set — nearest winter-sport icon, per confirmation
    backpack: 'backpack',
  },
  'Comfort & Amenities': {
    wifi: 'wifi',
    bed: 'bed',
    bath: 'bath',
    shower: 'droplet',
    pool: 'pool',
    'hot-tub': 'bath',            // no hot-tub/jacuzzi icon exists — reuses "bath", per confirmation
    'air-conditioning': 'air-conditioning',
    'heating-radiator': 'flame',  // no radiator icon exists — reuses "flame" (same as fireplace), per confirmation
    tv: 'device-tv',
    'washing-machine': 'wash-machine',
    iron: 'ironing',
    hairdryer: 'wind',            // no hairdryer icon exists — "wind" (moving air) is the nearest match
    safe: 'lock-square',          // no dedicated safe icon — plain square padlock, per confirmation
    balcony: 'building',          // no dedicated balcony icon — nearest match
    fireplace: 'flame',
    sofa: 'sofa',
  },
  'Practical / Property Info': {
    parking: 'parking',
    key: 'key',
    clock: 'clock',
    'location-pin': 'map-pin',
    luggage: 'luggage',
    lift: 'elevator',
    stairs: 'stairs',
    'no-smoking': 'smoking-no',
    'fire-extinguisher': 'fire-extinguisher',
    'first-aid': 'first-aid-kit',
    'umbrella-weather': 'umbrella',
    cash: 'cash',
    'credit-card': 'credit-card',
    calendar: 'calendar',
    door: 'door',
    bell: 'bell',
  },
  'People & Access': {
    family: 'friends',            // no dedicated family icon — nearest match
    child: 'baby-carriage',       // no dedicated child icon — nearest match
    wheelchair: 'wheelchair',
    'group-friends': 'users',
    couple: 'heart-handshake',    // no dedicated couple icon — nearest match
    'pet-friendly': 'paw',
    'no-pets': 'paw-off',
    'single-traveller': 'user',
  },
  'Weather / Ambience': {
    sun: 'sun',
    cloud: 'cloud',
    rain: 'cloud-rain',
    snow: 'snowflake',
    'moon-night': 'moon',
    wind: 'wind',
    thermometer: 'temperature',
    'night-sky-stars': 'sparkles',
  },
  'Social Media & Contact': {
    google:      { source: 'brand', file: 'google.svg',      color: '#4285F4' },
    facebook:    { source: 'brand', file: 'facebook.svg',    color: '#0866FF' },
    instagram:   { source: 'brand', file: 'instagram.svg',   color: '#FF0069' },
    whatsapp:    { source: 'brand', file: 'whatsapp.svg',    color: '#25D366' },
    x:           { source: 'brand', file: 'x.svg',           color: '#000000' },
    tripadvisor: { source: 'brand', file: 'tripadvisor.svg', color: '#34E0A1' },
    youtube:     { source: 'brand', file: 'youtube.svg',     color: '#FF0000' },
    linkedin:    { source: 'tabler-brand', slug: 'brand-linkedin', color: '#0A66C2' }, // removed from simple-icons — LinkedIn's own documented brand blue
    pinterest:   { source: 'brand', file: 'pinterest.svg',   color: '#BD081C' },
    tiktok:      { source: 'brand', file: 'tiktok.svg',      color: '#000000' },
    'phone-call': 'phone-call',
    email: 'mail',
    'message-chat': 'message-circle',
    'website-globe': 'world',
    messenger:   { source: 'brand', file: 'messenger.svg', color: '#0866FF' }, // bundled with the same colour source as the 10 platform logos above — treated the same way
    'qr-code': 'qrcode',
  },
};

const ALL_ENTRIES = Object.values(GUEST_ICON_GROUPS)
  .flatMap(group => Object.entries(group));

if (ALL_ENTRIES.length !== 100) {
  console.error(`ERROR: expected exactly 100 icons, manifest has ${ALL_ENTRIES.length}`);
  process.exit(1);
}

// ── Locate @tabler/icons SVG directory (same search as export-email-icons.mjs) ──
const searchRoots = [
  path.join(__dirname, '../node_modules/@tabler/icons'),
  path.join(__dirname, '../../node_modules/@tabler/icons'),
];

let tablerDir = null;
for (const base of searchRoots) {
  for (const sub of ['icons/outline', 'icons']) {
    const p = path.join(base, sub);
    if (fs.existsSync(p)) { tablerDir = p; break; }
  }
  if (tablerDir) break;
}

if (!tablerDir) {
  console.error('ERROR: @tabler/icons not found. Run: npm install in server/');
  process.exit(1);
}
console.log(`Using Tabler SVG dir: ${tablerDir}`);

const vendorDir = path.join(__dirname, 'vendor-icons');
const vendorBrandDir = path.join(vendorDir, 'brand');

// ── Output directory ─────────────────────────────────────────────────────────
const outputDir = path.join(__dirname, '../public/images/guest-icons');
fs.mkdirSync(outputDir, { recursive: true });

// ── Export loop ───────────────────────────────────────────────────────────────
let exported = 0;
const missing = [];

for (const [name, def] of ALL_ENTRIES) {
  let svgContent;
  let isPrecolored = false;

  if (typeof def === 'string') {
    // Plain Tabler slug → black
    const svgPath = path.join(tablerDir, `${def}.svg`);
    if (!fs.existsSync(svgPath)) { missing.push(name); continue; }
    svgContent = fs.readFileSync(svgPath, 'utf-8').replace(/currentColor/g, BLACK);

  } else if (def.source === 'vendor') {
    // Vendored Tabler-style outline (currentColor) → black
    const svgPath = path.join(vendorDir, def.file);
    if (!fs.existsSync(svgPath)) { missing.push(name); continue; }
    svgContent = fs.readFileSync(svgPath, 'utf-8').replace(/currentColor/g, BLACK);

  } else if (def.source === 'brand') {
    // Vendored brand SVG (from simple-icons). The SVG itself ships with no
    // fill — simple-icons keeps each brand's hex in separate metadata, not
    // baked into the artwork — so inject that published hex as the fill on
    // the root <svg>, where it inherits down to the path with no fill of its
    // own. This is the brand's real colour, not an invented recolour.
    const svgPath = path.join(vendorBrandDir, def.file);
    if (!fs.existsSync(svgPath)) { missing.push(name); continue; }
    const raw = fs.readFileSync(svgPath, 'utf-8');
    svgContent = raw.replace('<svg ', `<svg fill="${def.color}" `);
    isPrecolored = true;

  } else if (def.source === 'tabler-brand') {
    // Tabler outline recoloured to a documented brand hex (LinkedIn)
    const svgPath = path.join(tablerDir, `${def.slug}.svg`);
    if (!fs.existsSync(svgPath)) { missing.push(name); continue; }
    svgContent = fs.readFileSync(svgPath, 'utf-8').replace(/currentColor/g, def.color);
    isPrecolored = true;

  } else {
    missing.push(name);
    continue;
  }

  const outPath = path.join(outputDir, `${name}.png`);
  await sharp(Buffer.from(svgContent), { density: 300 })
    .resize(40, 40)
    .png()
    .toFile(outPath);
  exported++;
  process.stdout.write(`✓ ${name}${isPrecolored ? ' (brand colour)' : ''}\n`);
}

console.log(`\nDone. Exported ${exported} PNGs to ${outputDir}`);
if (missing.length) {
  console.warn(`\nMissing icons (source file not found — check names/paths):`);
  missing.forEach(n => console.warn(`  - ${n}`));
  process.exitCode = 1;
}
