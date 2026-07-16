import { Router } from 'express';
import puppeteer from 'puppeteer';
import db from '../db/database.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const infoSheetRouter = Router();

function requireProOwner(req, res) {
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
  if (!user || (user.plan !== 'pro' && user.plan !== 'multi')) {
    res.status(403).json({ error: 'Pro or Multi plan required.' });
    return false;
  }
  return true;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escNl(str) {
  return esc(str).replace(/\n/g, '<br>');
}

function buildLogoDataUrl(logoFilename) {
  if (!logoFilename) return null;
  try {
    const logoPath = join(__dirname, '../uploads/logos', logoFilename);
    const data = readFileSync(logoPath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

function buildHtml(prop) {
  const logoDataUrl = buildLogoDataUrl(prop.logo_url);

  const logoHtml = logoDataUrl
    ? `<img class="logo" src="${logoDataUrl}" alt="${esc(prop.name)}">`
    : '';

  const locationLine = [prop.city, prop.country].filter(Boolean).join(', ');

  // WiFi section
  const wifiSection = (prop.wifi_network_name || prop.wifi_password) ? `
    <div class="section">
      <div class="section-title">📶 WiFi</div>
      <div class="grid-2">
        ${prop.wifi_network_name ? `<div><div class="field-label">Network</div><div class="field-value">${esc(prop.wifi_network_name)}</div></div>` : ''}
        ${prop.wifi_password ? `<div><div class="field-label">Password</div><div class="field-value wifi-pw">${esc(prop.wifi_password)}</div></div>` : ''}
      </div>
    </div>` : '';

  // Check-in / check-out section
  const checkSection = `
    <div class="section">
      <div class="section-title">🕐 Check-in &amp; Check-out</div>
      <div class="grid-2">
        <div><div class="field-label">Check-in from</div><div class="field-value">${esc(prop.check_in_time || '15:00')}</div></div>
        <div><div class="field-label">Check-out by</div><div class="field-value">${esc(prop.check_out_time || '11:00')}</div></div>
      </div>
    </div>`;

  // Breakfast section
  const breakfastSection = prop.breakfast_included ? `
    <div class="section">
      <div class="section-title">☕ Breakfast</div>
      <div class="grid-2">
        <div><div class="field-label">Served</div><div class="field-value">${esc(prop.breakfast_start_time || '07:00')} – ${esc(prop.breakfast_end_time || '11:00')}</div></div>
        ${prop.breakfast_price > 0 ? `<div><div class="field-label">Price per person</div><div class="field-value">${esc(prop.currency || '€')}${parseFloat(prop.breakfast_price).toFixed(2)}</div></div>` : ''}
      </div>
    </div>` : '';

  // House rules section
  const rulesSection = prop.house_rules?.trim() ? `
    <div class="section">
      <div class="section-title">📋 House Rules</div>
      <div class="rules-text">${escNl(prop.house_rules)}</div>
    </div>` : '';

  // Local tips section
  const tipsSection = prop.local_tips?.trim() ? `
    <div class="section">
      <div class="section-title">📍 Local Tips</div>
      <div class="rules-text">${escNl(prop.local_tips)}</div>
    </div>` : '';

  // Special offer banner
  const specialSection = (prop.special_banner_enabled && prop.special_banner_text?.trim()) ? `
    <div class="special-banner">
      <div class="special-title">✨ Special Offer</div>
      <div class="special-text">${escNl(prop.special_banner_text)}</div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { size: A4; margin: 0; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  background: #fff;
  color: #1a1a2e;
  padding: 36px 44px 36px 44px;
  max-width: 210mm;
}
.header {
  display: flex;
  align-items: center;
  gap: 18px;
  padding-bottom: 20px;
  border-bottom: 3px solid #1e6e5e;
  margin-bottom: 22px;
}
.logo {
  width: 72px;
  height: 72px;
  object-fit: contain;
  border-radius: 6px;
  flex-shrink: 0;
}
.property-name {
  font-size: 24px;
  font-weight: bold;
  color: #1e6e5e;
  line-height: 1.2;
}
.welcome-text {
  font-size: 13px;
  color: #888;
  margin-top: 4px;
  font-style: italic;
}
.sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.section {
  background: #f7fffe;
  border: 1px solid #c8e8e2;
  border-radius: 6px;
  padding: 14px 18px;
}
.section-title {
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #1e6e5e;
  margin-bottom: 10px;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.field-label {
  font-size: 10px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.field-value {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  margin-top: 2px;
}
.wifi-pw {
  font-family: 'Courier New', monospace;
  background: #e6f4f0;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 14px;
}
.rules-text {
  font-size: 13px;
  line-height: 1.75;
  color: #444;
}
.special-banner {
  background: #1e6e5e;
  color: #fff;
  border-radius: 6px;
  padding: 14px 18px;
}
.special-title {
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #a8e6da;
  margin-bottom: 6px;
}
.special-text {
  font-size: 14px;
  line-height: 1.55;
}
.footer {
  margin-top: 22px;
  padding-top: 14px;
  border-top: 1px solid #e0e0e0;
  font-size: 10px;
  color: #bbb;
  text-align: center;
}
</style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <div>
      <div class="property-name">${esc(prop.name)}</div>
      <div class="welcome-text">Welcome to your stay${locationLine ? ` · ${esc(locationLine)}` : ''}</div>
    </div>
  </div>

  <div class="sections">
    ${wifiSection}
    ${checkSection}
    ${breakfastSection}
    ${rulesSection}
    ${tipsSection}
    ${specialSection}
  </div>

  <div class="footer">Managed with NestBook · nestbook.io</div>
</body>
</html>`;
}

infoSheetRouter.put('/info-sheet/:propertyId', (req, res) => {
  if (!requireProOwner(req, res)) return;

  const propId = Number(req.params.propertyId);
  const prop = db.prepare('SELECT id FROM properties WHERE id = ? AND owner_id = ?')
    .get(propId, req.user.userId);
  if (!prop) return res.status(404).json({ error: 'Property not found.' });

  const { house_rules, local_tips } = req.body;
  db.prepare(`UPDATE properties SET house_rules = ?, local_tips = ? WHERE id = ?`)
    .run(house_rules?.trim() || null, local_tips?.trim() || null, propId);

  const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(propId);
  res.json(updated);
});

infoSheetRouter.get('/info-sheet/pdf/:propertyId', async (req, res) => {
  if (!requireProOwner(req, res)) return;

  const propId = Number(req.params.propertyId);
  const prop = db.prepare('SELECT * FROM properties WHERE id = ? AND owner_id = ?')
    .get(propId, req.user.userId);

  if (!prop) return res.status(404).json({ error: 'Property not found.' });

  let browser;
  try {
    const html = buildHtml(prop);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="nestbook-info-sheet-${propId}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('[info-sheet/pdf]', err);
    res.status(500).json({ error: `PDF generation failed: ${err.message}` });
  } finally {
    if (browser) await browser.close();
  }
});
