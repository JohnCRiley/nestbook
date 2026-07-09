/**
 * One-off script: rasterize Tabler outline SVGs to branded PNGs.
 *
 * Run from the server/ directory:
 *   node scripts/export-email-icons.mjs
 *
 * Requires: @tabler/icons (devDep) and sharp (dep).
 * Outputs: server/public/images/email-icons/{name}-{color}.png
 *          100 icons × 3 colours = 300 files
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Colour variants ───────────────────────────────────────────────────────────
const COLORS = {
  green: '#1a4710',   // NestBook brand dark green
  white: '#ffffff',   // For use on dark backgrounds
  red:   '#dc2626',   // Warning / cancellation red (matches .badge-cancelled)
};

// ── Icon list (160 icons, 12 categories) ──────────────────────────────────────
export const ICON_GROUPS = {
  'Calendar & Time': [
    'calendar', 'calendar-check', 'calendar-event', 'calendar-off',
    'calendar-plus', 'calendar-time', 'calendar-minus', 'calendar-stats',
    'clock', 'alarm', 'hourglass', 'clock-hour-4',
  ],
  'Communication': [
    'mail', 'mail-opened', 'phone', 'phone-call', 'phone-off',
    'message', 'message-dots', 'message-circle',
    'bell', 'bell-ringing', 'send', 'speakerphone',
    'language', 'external-link', 'link', 'world',
  ],
  'Property & Rooms': [
    'home', 'home-2', 'home-check', 'home-eco',
    'building', 'building-bank', 'building-castle',
    'key', 'door', 'door-enter', 'door-exit',
    'bed', 'bath', 'sofa', 'lamp', 'stairs',
  ],
  'Food & Drink': [
    'coffee', 'mug', 'bowl-spoon', 'glass-full', 'chef-hat',
    'pizza', 'salad', 'apple', 'fish', 'bottle',
  ],
  'Travel & Transport': [
    'plane', 'car', 'bus', 'train', 'map',
    'map-pin', 'compass', 'luggage', 'anchor', 'ticket',
    'sailboat', 'tent',
  ],
  'People & Service': [
    'user', 'users', 'user-check', 'user-plus',
    'id-badge', 'badge',
    'star', 'heart', 'thumb-up', 'mood-happy',
    'award', 'crown', 'gift',
  ],
  'Finance': [
    'currency-dollar', 'currency-pound', 'credit-card',
    'receipt', 'receipt-2', 'receipt-off',
    'coin', 'wallet', 'discount', 'tag', 'percentage',
    'cash', 'pig-money', 'report-money', 'calculator',
  ],
  'Status & Actions': [
    'check', 'circle-check', 'circle-x', 'circle-plus',
    'alert-circle', 'alert-triangle', 'info-circle',
    'ban', 'flag', 'archive', 'replace', 'arrow-up-circle',
    'lock', 'lock-open', 'shield',
    'edit', 'trash', 'copy', 'download',
    'clipboard', 'clipboard-list', 'notes', 'rocket',
  ],
  'Media & Files': [
    'photo', 'camera', 'camera-plus',
    'file-text', 'file-download', 'file-import',
    'pencil', 'table', 'printer',
    'qrcode', 'barcode', 'scan', 'share', 'eye',
  ],
  'Nature & Weather': [
    'sun', 'moon', 'cloud', 'leaf', 'tree',
    'droplet', 'wave-sine', 'mountain', 'flame', 'snowflake',
    'plant-2', 'sparkles',
  ],
  'Charts & Data': [
    'chart-bar', 'chart-line', 'chart-pie', 'trending-up',
    'adjustments', 'adjustments-horizontal', 'list-details', 'settings',
  ],
  'Tech & Brands': [
    'device-mobile', 'plug-connected', 'brush', 'bug',
    'category', 'palette',
    'brand-airbnb', 'brand-booking', 'brand-facebook',
  ],
};

const ALL_ICONS = Object.values(ICON_GROUPS).flat();

// ── Locate @tabler/icons SVG directory ────────────────────────────────────────
// npm workspace hoists packages to root node_modules
const searchRoots = [
  path.join(__dirname, '../node_modules/@tabler/icons'),   // server-local
  path.join(__dirname, '../../node_modules/@tabler/icons'), // workspace root
];

let svgDir = null;
for (const base of searchRoots) {
  for (const sub of ['icons/outline', 'icons']) {
    const p = path.join(base, sub);
    if (fs.existsSync(p)) { svgDir = p; break; }
  }
  if (svgDir) break;
}

if (!svgDir) {
  console.error('ERROR: @tabler/icons not found. Run: npm install in server/');
  process.exit(1);
}
console.log(`Using SVG dir: ${svgDir}`);

// ── Output directory ──────────────────────────────────────────────────────────
const outputDir = path.join(__dirname, '../public/images/email-icons');
fs.mkdirSync(outputDir, { recursive: true });

// ── Export loop ───────────────────────────────────────────────────────────────
let exported = 0;
const missing = [];

for (const iconName of ALL_ICONS) {
  const svgPath = path.join(svgDir, `${iconName}.svg`);
  if (!fs.existsSync(svgPath)) {
    missing.push(iconName);
    continue;
  }

  const svgContent = fs.readFileSync(svgPath, 'utf-8');

  for (const [colorKey, colorHex] of Object.entries(COLORS)) {
    const colored = svgContent.replace(/currentColor/g, colorHex);
    const outPath = path.join(outputDir, `${iconName}-${colorKey}.png`);
    await sharp(Buffer.from(colored), { density: 300 })
      .resize(40, 40)
      .png()
      .toFile(outPath);
    exported++;
  }

  process.stdout.write(`✓ ${iconName}\n`);
}

console.log(`\nDone. Exported ${exported} PNGs to ${outputDir}`);
if (missing.length) {
  console.warn(`\nMissing icons (not found in @tabler/icons — check names):`);
  missing.forEach(n => console.warn(`  - ${n}`));
}
