import { Router } from 'express';
import db from '../db/database.js';

export const prospectFinderRouter = Router();

function sse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function scrapeEmailFromWebsite(websiteUrl) {
  try {
    const base = websiteUrl.replace(/\/+$/, '');
    const pages = [base, base + '/contact', base + '/contact-us', base + '/about'];

    for (const pageUrl of pages) {
      try {
        const r = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NestBook/1.0)' },
          signal: AbortSignal.timeout(5000),
          redirect: 'follow',
        });
        if (!r.ok) continue;
        const html = await r.text();

        // mailto: links are most reliable
        const mailtoMatch = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
        if (mailtoMatch) return mailtoMatch[1].toLowerCase();

        // Fall back to email patterns in text
        const emailMatches = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
        if (emailMatches) {
          const filtered = emailMatches.filter(e =>
            !e.includes('sentry.io') && !e.includes('example.com') &&
            !e.includes('wordpress.') && !e.includes('schema.org') &&
            !e.includes('wixpress.') && !e.includes('@2x') &&
            !e.includes('yourdomain') && !e.endsWith('.png') &&
            !e.endsWith('.jpg') && !e.endsWith('.gif') &&
            e.includes('@') && !/^\d/.test(e)
          );
          if (filtered.length > 0) return filtered[0].toLowerCase();
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── POST /api/admin/prospect-finder/search  (SSE streaming) ─────────────────
prospectFinderRouter.post('/search', async (req, res) => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Google Places API key not configured. Add GOOGLE_PLACES_API_KEY to server/.env' });
  }

  const { area, propertyTypes = [], radius = 10000, language = 'en', minReviews = 0 } = req.body;
  if (!area?.trim()) return res.status(400).json({ error: 'area is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const types = propertyTypes.length > 0 ? propertyTypes : ['bed and breakfast'];
    const query = `${types.join(' OR ')} in ${area.trim()}`;

    sse(res, { type: 'status', message: `Searching Google Places for ${types.join(', ')} in ${area.trim()}…` });

    // ── Collect places across up to 3 pages (60 results max) ──────────────
    const seenIds = new Set();
    const places = [];
    let pageToken = null;
    let page = 0;

    do {
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json` +
        `?query=${encodeURIComponent(query)}` +
        `&radius=${Number(radius)}` +
        `&language=${language}` +
        `&key=${key}`;
      if (pageToken) url += `&pagetoken=${encodeURIComponent(pageToken)}`;

      const data = await fetch(url, { signal: AbortSignal.timeout(10000) }).then(r => r.json());

      if (data.status === 'REQUEST_DENIED') {
        sse(res, { type: 'error', message: `Google Places API error: ${data.error_message || data.status}` });
        return res.end();
      }
      if (data.status === 'OVER_QUERY_LIMIT') {
        sse(res, { type: 'error', message: 'Google Places API quota exceeded. Try again later.' });
        return res.end();
      }
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        sse(res, { type: 'error', message: `Google Places returned: ${data.status}` });
        return res.end();
      }

      for (const p of (data.results || [])) {
        if (seenIds.has(p.place_id)) continue;
        seenIds.add(p.place_id);
        if (Number(minReviews) > 0 && (p.user_ratings_total ?? 0) < Number(minReviews)) continue;
        places.push({
          place_id: p.place_id,
          name:     p.name,
          address:  p.formatted_address,
          ratings:  p.user_ratings_total ?? 0,
        });
      }

      pageToken = data.next_page_token || null;
      page++;

      if (pageToken && page < 3) {
        // Google requires a 2-second delay before page tokens become valid
        await new Promise(r => setTimeout(r, 2000));
      }
    } while (pageToken && page < 3);

    if (places.length === 0) {
      sse(res, { type: 'done', results: [], emailsFound: 0, message: 'No properties found. Try a broader area or different property types.' });
      return res.end();
    }

    sse(res, { type: 'status', message: `Found ${places.length} properties. Fetching websites…` });

    // ── Fetch Place Details to get website URLs ────────────────────────────
    const withDetails = [];
    for (const p of places) {
      try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json` +
          `?place_id=${p.place_id}` +
          `&fields=name,website,formatted_address,user_ratings_total` +
          `&key=${key}`;
        const data = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
        const r = data.result || {};
        withDetails.push({
          ...p,
          name:    r.name    || p.name,
          address: r.formatted_address || p.address,
          website: r.website || null,
        });
      } catch {
        withDetails.push({ ...p, website: null });
      }
    }

    // ── Scrape emails in batches of 5 ─────────────────────────────────────
    sse(res, { type: 'progress', current: 0, total: withDetails.length, message: `Scraping emails… (0 of ${withDetails.length})` });

    const results = [];
    const BATCH = 5;

    for (let i = 0; i < withDetails.length; i += BATCH) {
      const batch = withDetails.slice(i, i + BATCH);
      const emails = await Promise.all(
        batch.map(p => p.website ? scrapeEmailFromWebsite(p.website) : Promise.resolve(null))
      );
      for (let j = 0; j < batch.length; j++) {
        const p = batch[j];
        const email = emails[j];
        results.push({
          name:    p.name,
          address: p.address,
          website: p.website,
          email,
          ratings: p.ratings,
          status:  email ? 'email_found' : (p.website ? 'no_email' : 'no_website'),
        });
      }
      const done = Math.min(i + BATCH, withDetails.length);
      sse(res, { type: 'progress', current: done, total: withDetails.length, message: `Scraping emails… (${done} of ${withDetails.length})` });
    }

    const emailsFound = results.filter(r => r.email).length;
    sse(res, {
      type: 'done',
      results,
      emailsFound,
      message: `Done. ${emailsFound} email${emailsFound !== 1 ? 's' : ''} found out of ${results.length} properties.`,
    });

  } catch (err) {
    console.error('[prospect-finder] Search error:', err.message);
    sse(res, { type: 'error', message: `Search failed: ${err.message}` });
  }

  res.end();
});

// ── POST /api/admin/prospect-finder/import ────────────────────────────────────
prospectFinderRouter.post('/import', (req, res) => {
  const { prospects: list, language = 'en' } = req.body;
  if (!Array.isArray(list) || list.length === 0) {
    return res.status(400).json({ error: 'No prospects provided.' });
  }

  const langToCountry = { en: 'UK', fr: 'France', de: 'Germany', es: 'Spain', nl: 'Netherlands' };
  const country = langToCountry[language] || '';

  const insert = db.prepare(`
    INSERT OR IGNORE INTO prospects (name, email, website, source, country, language, status)
    VALUES (?, ?, ?, 'google_places', ?, ?, 'new')
  `);

  let imported = 0;
  let skipped = 0;

  db.exec('BEGIN');
  try {
    for (const p of list) {
      if (!p.email) continue;
      const result = insert.run(
        (p.name || 'Unknown').trim(),
        p.email.toLowerCase().trim(),
        p.website || null,
        country,
        language,
      );
      if (result.changes > 0) imported++;
      else skipped++;
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[prospect-finder] Import error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  console.log(`[prospect-finder] Imported ${imported}, skipped ${skipped} (already in CRM)`);
  res.json({ imported, skipped });
});
