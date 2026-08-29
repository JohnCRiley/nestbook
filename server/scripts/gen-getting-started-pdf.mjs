// Regenerates server/public/nestbook-getting-started-guide.pdf from its HTML
// source at server/public/marketing/getting-started-guide.html.
//
// The PDF is a static file served at /nestbook-getting-started-guide.pdf and
// linked from the onboarding email (server/email/emailService.js). It is NOT
// wired into marketingRouter — it stays a committed static asset at its stable
// URL. Run this script after editing the HTML source, then commit the new PDF.
//
//   node server/scripts/gen-getting-started-pdf.mjs
//
// Uses the same Puppeteer + A4 + zero-margin + printBackground setup as
// server/routes/marketing.js (the project's established HTML->PDF pipeline).

import puppeteer from 'puppeteer';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'public', 'marketing', 'getting-started-guide.html');
const OUT = join(__dirname, '..', 'public', 'nestbook-getting-started-guide.pdf');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(SRC).href, { waitUntil: 'load', timeout: 30000 });

  const pageDivs = await page.$$eval('.page', (els) => els.length);
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  writeFileSync(OUT, pdf);

  const rendered = Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  console.log(`Wrote ${OUT}`);
  console.log(`  ${pdf.length.toLocaleString()} bytes · ${rendered} PDF pages · ${pageDivs} .page divs`);
  if (rendered !== pageDivs) {
    console.warn(`  WARNING: page count (${rendered}) != .page div count (${pageDivs}) — content may be overflowing a page.`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
