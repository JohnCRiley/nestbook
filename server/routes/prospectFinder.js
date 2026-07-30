import { Router } from 'express';
import { generateGrid, COUNTRY_BOUNDS } from '../utils/gridSweep.js';

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

// ── Shared Places search + email scrape ──────────────────────────────────────
// Used by both /search (one named area) and /sweep (looped over a grid of
// lat/lng points). `location` is optional — only the sweep route sets it, to
// bias the text search toward a grid point instead of a named area.
async function runPlacesSearch({ query, location, radius, language = 'en', minReviews = 0, onEvent }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('Google Places API key not configured. Add GOOGLE_PLACES_API_KEY to server/.env');

  onEvent({ type: 'status', message: `Searching Google Places for: ${query}` });

  const params = new URLSearchParams({ query, radius: String(radius), language, key });
  if (location) params.set('location', location); // "lat,lng" bias — used by sweep mode only

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
  const data = await fetch(url, { signal: AbortSignal.timeout(10000) }).then(r => r.json());

  if (data.status === 'REQUEST_DENIED') {
    onEvent({ type: 'error', message: `Google Places API error: ${data.error_message || data.status}` });
    return { results: [], emailsFound: 0 };
  }
  if (data.status === 'OVER_QUERY_LIMIT') {
    onEvent({ type: 'error', message: 'Google Places API quota exceeded. Try again later.' });
    return { results: [], emailsFound: 0 };
  }
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    onEvent({ type: 'error', message: `Google Places returned: ${data.status}` });
    return { results: [], emailsFound: 0 };
  }

  const places = (data.results || [])
    .filter(p => Number(minReviews) === 0 || (p.user_ratings_total ?? 0) >= Number(minReviews))
    .map(p => ({
      place_id: p.place_id,
      name:     p.name,
      address:  p.formatted_address,
      ratings:  p.user_ratings_total ?? 0,
    }));

  if (places.length === 0) {
    onEvent({ type: 'status', message: 'No properties found at this point.' });
    return { results: [], emailsFound: 0 };
  }

  onEvent({ type: 'status', message: `Found ${places.length} properties. Fetching websites…` });

  // ── Fetch Place Details to get website URLs ────────────────────────────
  const withDetails = [];
  for (const p of places) {
    try {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${p.place_id}` +
        `&fields=name,website,formatted_address,user_ratings_total` +
        `&key=${key}`;
      const detail = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
      const r = detail.result || {};
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
  onEvent({ type: 'progress', current: 0, total: withDetails.length, message: `Scraping emails… (0 of ${withDetails.length})` });

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
    onEvent({ type: 'progress', current: done, total: withDetails.length, message: `Scraping emails… (${done} of ${withDetails.length})` });
  }

  const emailsFound = results.filter(r => r.email).length;
  return { results, emailsFound };
}

// ── POST /api/admin/prospect-finder/search  (SSE streaming) ─────────────────
prospectFinderRouter.post('/search', async (req, res) => {
  const { area, propertyTypes = [], radius = 10000, language = 'en', minReviews = 0 } = req.body;
  if (!area?.trim()) return res.status(400).json({ error: 'area is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const types = propertyTypes.length > 0 ? propertyTypes : ['bed and breakfast'];
    const query = `${types.join(' OR ')} in ${area.trim()}`;

    // ── Single fetch — up to 20 results (pagination dropped: page tokens unreliable) ──
    const { results, emailsFound } = await runPlacesSearch({
      query,
      radius: Number(radius),
      language,
      minReviews,
      onEvent: (e) => sse(res, e),
    });

    sse(res, {
      type: 'done',
      results,
      emailsFound,
      message: results.length === 0
        ? 'No properties found. Try a broader area or different property types.'
        : `Done. ${emailsFound} email${emailsFound !== 1 ? 's' : ''} found out of ${results.length} properties.`,
    });

  } catch (err) {
    console.error('[prospect-finder] Search error:', err.message);
    sse(res, { type: 'error', message: `Search failed: ${err.message}` });
  }

  res.end();
});

// ── POST /api/admin/prospect-finder/sweep  (SSE streaming, grid across a country) ──
prospectFinderRouter.post('/sweep', async (req, res) => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Google Places API key not configured. Add GOOGLE_PLACES_API_KEY to server/.env' });
  }

  const { country, propertyTypes = [], spacingKm = 35, radiusMeters = 20000, language = 'en', minReviews = 0, maxPoints } = req.body;
  const bounds = COUNTRY_BOUNDS[country];
  if (!bounds) return res.status(400).json({ error: 'Unknown country' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let points = generateGrid(bounds, Number(spacingKm));
  if (maxPoints) points = points.slice(0, Number(maxPoints)); // ALWAYS use for test runs

  const types = propertyTypes.length > 0 ? propertyTypes : ['bed and breakfast'];
  const query = types.join(' OR ');

  const seen = new Set(); // dedupe across overlapping grid circles — no place_id survives
                          // to the final result shape, so dedupe on website or name+address
  const allResults = [];
  let totalEmails = 0;
  let totalDetailCalls = 0; // real cost driver — log this so spend is visible

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    sse(res, { type: 'status', message: `Grid point ${i + 1} of ${points.length} (${point.lat.toFixed(2)}, ${point.lng.toFixed(2)})…` });

    try {
      const { results } = await runPlacesSearch({
        query,
        location: `${point.lat},${point.lng}`,
        radius: Math.min(Number(radiusMeters), 50000), // Google caps radius at 50km
        language,
        minReviews,
        onEvent: () => {}, // suppress per-point noise, report at grid level below
      });

      for (const r of results) {
        const dedupeKey = r.website || `${r.name}|${r.address}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          allResults.push(r);
          if (r.email) totalEmails++;
        }
      }
      totalDetailCalls += results.length;
    } catch (err) {
      console.error(`[prospect-finder] Sweep grid point ${i} failed:`, err.message);
      // one bad point should not kill the whole sweep — continue
    }

    sse(res, {
      type: 'progress',
      current: i + 1,
      total: points.length,
      foundSoFar: allResults.length,
      emailsSoFar: totalEmails,
    });
  }

  sse(res, {
    type: 'done',
    results: allResults,
    emailsFound: totalEmails,
    gridPoints: points.length,
    detailCallsUsed: totalDetailCalls, // so real spend is visible, not just guessed at
    message: `Sweep complete. ${totalEmails} email${totalEmails !== 1 ? 's' : ''} found out of ${allResults.length} unique properties across ${points.length} grid points (${totalDetailCalls} detail lookups).`,
  });
  res.end();
});
