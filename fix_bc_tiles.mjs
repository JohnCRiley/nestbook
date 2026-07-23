// fix_bc_tiles.mjs — fix CTA link and compare.html double-price issue
import { readFileSync, writeFileSync } from 'fs';

// ── 1. Fix CTA href in index.html ────────────────────────────────────────────
let idx = readFileSync('server/public/index.html', 'utf8');
idx = idx.replace('href="/pricing" class="btn btn-white"', 'href="#pricing" class="btn btn-white"');
writeFileSync('server/public/index.html', idx, 'utf8');
console.log('1. CTA href → #pricing:', idx.includes('href="#pricing" class="btn btn-white"'));

// ── 2. compare.html ───────────────────────────────────────────────────────────
let ch = readFileSync('server/public/compare.html', 'utf8');

// 2a. Desktop table: add data-i18n to the FIRST badge (Room charges)
//     and replace the SECOND badge (Service categories) with "Included with add-on"
// The file has two identical badge spans; we process them sequentially.
const badgeStyle = 'font-size:0.78rem;color:#92400e;background:#fef3c7;border-radius:10px;padding:2px 8px;white-space:nowrap';
const badgeOld   = `<span class="cell-text" style="${badgeStyle}">+£6/mo add-on</span>`;
const badge1New  = `<span class="cell-text" style="${badgeStyle}" data-i18n="compare.addon.price">+£6/mo add-on</span>`;
const badge2New  = `<span class="cell-text" style="${badgeStyle}" data-i18n="compare.addon.included">Included with add-on</span>`;

// Replace first occurrence → price badge with data-i18n
const firstIdx = ch.indexOf(badgeOld);
if (firstIdx !== -1) {
  ch = ch.slice(0, firstIdx) + badge1New + ch.slice(firstIdx + badgeOld.length);
}
// Replace second (now only remaining) occurrence → included badge
const secondIdx = ch.indexOf(badgeOld);
if (secondIdx !== -1) {
  ch = ch.slice(0, secondIdx) + badge2New + ch.slice(secondIdx + badgeOld.length);
}
console.log('2a. Desktop badge1 (price):', ch.includes('data-i18n="compare.addon.price">+£6/mo'));
console.log('2a. Desktop badge2 (included):', ch.includes('data-i18n="compare.addon.included">Included'));

// 2b. Mobile Pro card: restructure "Not included" cross rows
//     Replace the two cross-icon rows for charges/categories with an "Add-on available" section
const mobileChargesOld =
`          <div class="mpc-feat-row"><span class="mpc-feat-icon cross-icon"></span><span class="mpc-feat-label" style="color:var(--muted)" data-i18n="feat.charges">Room charges (bar, restaurant)</span></div>
          <div class="mpc-feat-row"><span class="mpc-feat-icon cross-icon"></span><span class="mpc-feat-label" style="color:var(--muted)" data-i18n="feat.categories">Service categories with tax rates</span></div>`;

const mobileChargesNew =
`          <div class="mpc-group-label" style="color:#92400e" data-i18n="compare.addon.label">Add-on available</div>
          <div class="mpc-feat-row"><span class="mpc-feat-icon" style="color:#92400e;font-weight:700;font-size:1rem">+</span><span class="mpc-feat-label" data-i18n="feat.charges">Room charges (bar, restaurant)</span><span class="mpc-feat-value" style="font-size:0.7rem;color:#92400e;background:#fef3c7;border-radius:8px;padding:1px 6px;white-space:nowrap" data-i18n="compare.addon.price">+£6/mo add-on</span></div>
          <div class="mpc-feat-row"><span class="mpc-feat-icon" style="color:#92400e;font-weight:700;font-size:1rem">+</span><span class="mpc-feat-label" data-i18n="feat.categories">Service categories with tax rates</span><span class="mpc-feat-value" style="font-size:0.7rem;color:#92400e;background:#fef3c7;border-radius:8px;padding:1px 6px;white-space:nowrap" data-i18n="compare.addon.included">Included with add-on</span></div>`;

// Try LF version first, then CRLF
if (ch.includes(mobileChargesOld)) {
  ch = ch.replace(mobileChargesOld, mobileChargesNew);
  console.log('2b. Mobile card restructured (LF): true');
} else {
  const mobileChargesOldCR = mobileChargesOld.replace(/\n/g, '\r\n');
  if (ch.includes(mobileChargesOldCR)) {
    ch = ch.replace(mobileChargesOldCR, mobileChargesNew);
    console.log('2b. Mobile card restructured (CRLF): true');
  } else {
    console.log('2b. Mobile card NOT found — manual check needed');
  }
}

// 2c. Add i18n keys to each language block (insert before compare.pro.addon)
const insertBefore = (anchor, additions) => {
  if (ch.includes(anchor)) {
    ch = ch.replace(anchor, additions + '\n    ' + anchor);
  } else {
    console.log('  anchor not found:', anchor.slice(0, 50));
  }
};

insertBefore(
  "'compare.pro.addon': 'Bar & Charges add-on (£6/mo · €7/mo)'",
  "    'compare.addon.price': '+£6/mo add-on',\n    'compare.addon.included': 'Included with add-on',\n    'compare.addon.label': 'Add-on available',"
);
insertBefore(
  "'compare.pro.addon': 'Option Bar & Charges (£6/mois · €7/mois)'",
  "    'compare.addon.price': '+£6/mois en option',\n    'compare.addon.included': \"Inclus dans l'option\",\n    'compare.addon.label': 'Option disponible',"
);
insertBefore(
  "'compare.pro.addon': 'Complemento Bar & Charges (£6/mes · €7/mes)'",
  "    'compare.addon.price': '+£6/mes complemento',\n    'compare.addon.included': 'Incluido con el complemento',\n    'compare.addon.label': 'Complemento disponible',"
);
insertBefore(
  "'compare.pro.addon': 'Bar & Charges Add-on (£6/Monat · €7/Monat)'",
  "    'compare.addon.price': '+£6/Monat Add-on',\n    'compare.addon.included': 'Im Add-on enthalten',\n    'compare.addon.label': 'Add-on verfügbar',"
);
insertBefore(
  "'compare.pro.addon': 'Bar & Charges-add-on (£6/maand · €7/maand)'",
  "    'compare.addon.price': '+£6/mnd add-on',\n    'compare.addon.included': 'Inbegrepen bij add-on',\n    'compare.addon.label': 'Add-on beschikbaar',"
);

writeFileSync('server/public/compare.html', ch, 'utf8');

// Verify
const priceCount    = (ch.match(/compare\.addon\.price/g) || []).length;
const includedCount = (ch.match(/compare\.addon\.included/g) || []).length;
const labelCount    = (ch.match(/compare\.addon\.label/g) || []).length;
console.log(`2c. compare.addon.price occurrences: ${priceCount} (expect 7: 1 desktop + 1 mobile + 5 i18n)`);
console.log(`2c. compare.addon.included occurrences: ${includedCount} (expect 7)`);
console.log(`2c. compare.addon.label occurrences: ${labelCount} (expect 6: 1 mobile + 5 i18n)`);
console.log('Done.');
