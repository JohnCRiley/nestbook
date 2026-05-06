import puppeteer from 'puppeteer';
import { Router } from 'express';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const marketingRouter = Router();

// Map of URL-safe names → file config
const MARKETING_FILES = {
  'flyer-a4':             { file: 'flyer-a4.html',                      format: 'A4' },
  'flyer-a4-fr':          { file: 'flyer-a4-fr.html',                   format: 'A4' },
  'flyer-a4-de':          { file: 'flyer-a4-de.html',                   format: 'A4' },
  'flyer-a4-nl':          { file: 'flyer-a4-nl.html',                   format: 'A4' },
  'flyer-a4-es':          { file: 'flyer-a4-es.html',                   format: 'A4' },
  'handout-a5':           { file: 'handout-a5.html',                    format: 'A5' },
  'handout-a5-fr':        { file: 'handout-a5-fr.html',                 format: 'A5' },
  'handout-a5-de':        { file: 'handout-a5-de.html',                 format: 'A5' },
  'handout-a5-nl':        { file: 'handout-a5-nl.html',                 format: 'A5' },
  'handout-a5-es':        { file: 'handout-a5-es.html',                 format: 'A5' },
  'aframe':               { file: 'aframe.html',                        width: '594mm', height: '841mm' },
  'aframe-fr':            { file: 'aframe-fr.html',                     width: '594mm', height: '841mm' },
  'aframe-de':            { file: 'aframe-de.html',                     width: '594mm', height: '841mm' },
  'aframe-nl':            { file: 'aframe-nl.html',                     width: '594mm', height: '841mm' },
  'aframe-es':            { file: 'aframe-es.html',                     width: '594mm', height: '841mm' },
  'feather-flag':         { file: 'feather-flag.html',                  width: '600px', height: '1800px' },
  'business-card':        { file: 'business-card.html',                 format: 'A4' },
  'car-door-portrait':    { file: 'car-door-magnetic-portrait.html',    width: '300mm', height: '450mm' },
  'car-door-portrait-fr': { file: 'car-door-magnetic-portrait-fr.html', width: '300mm', height: '450mm' },
  'car-door-landscape':   { file: 'car-door-magnetic-landscape.html',   width: '450mm', height: '300mm' },
};

marketingRouter.get('/marketing/pdf/:name', async (req, res) => {
  const config = MARKETING_FILES[req.params.name];
  if (!config) return res.status(404).json({ error: 'Marketing file not found.' });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    const fileUrl = pathToFileURL(
      join(__dirname, '..', 'public', 'marketing', config.file)
    ).href;

    await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });

    const pdfOptions = {
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    };

    if (config.format) {
      pdfOptions.format = config.format;
    } else {
      pdfOptions.width  = config.width;
      pdfOptions.height = config.height;
    }

    const pdf = await page.pdf(pdfOptions);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="nestbook-${req.params.name}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('[marketing/pdf]', err);
    res.status(500).json({ error: `PDF generation failed: ${err.message}` });
  } finally {
    if (browser) await browser.close();
  }
});
