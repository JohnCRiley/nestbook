import { Router } from 'express';
import https from 'https';
import http from 'http';
import db from '../db/database.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const icalRouter = Router();

// ── iCal export — public, token-authenticated ─────────────────────────────────

// GET /api/ical/:propertyId/:roomId/:token — per-room feed
icalRouter.get('/:propertyId/:roomId/:token', (req, res) => {
  const { propertyId, roomId, token } = req.params;

  const room = db.prepare(
    'SELECT * FROM rooms WHERE id = ? AND property_id = ? AND ical_token = ?'
  ).get(roomId, propertyId, token);

  if (!room) return res.status(404).send('Not found');

  const bookings = db.prepare(`
    SELECT id, check_in_date, check_out_date
    FROM bookings
    WHERE room_id = ? AND property_id = ? AND status != 'cancelled'
    ORDER BY check_in_date
  `).all(roomId, propertyId);

  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NestBook//NestBook//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${room.name}`,
  ];

  for (const b of bookings) {
    const dtstart = b.check_in_date.replace(/-/g, '');
    const dtend   = b.check_out_date.replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:booking-${b.id}@nestbook.io`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      'SUMMARY:Booked',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="nestbook-room-${room.id}.ics"`);
  res.send(lines.join('\r\n'));
});

// GET /api/ical/:propertyId/property/:token — whole-property feed
icalRouter.get('/:propertyId/property/:token', (req, res) => {
  const { propertyId, token } = req.params;

  const property = db.prepare(
    'SELECT * FROM properties WHERE id = ? AND ical_token = ?'
  ).get(propertyId, token);

  if (!property) return res.status(404).send('Not found');

  const bookings = db.prepare(`
    SELECT b.id, b.check_in_date, b.check_out_date
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    WHERE r.property_id = ?
      AND b.status IN ('confirmed', 'arriving', 'in_house', 'checked_out')
      AND b.check_out_date >= date('now', '-1 day')
    ORDER BY b.check_in_date
  `).all(propertyId);

  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NestBook//NestBook//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${property.name ?? 'Property Calendar'}`,
  ];

  for (const b of bookings) {
    const dtstart = b.check_in_date.replace(/-/g, '');
    const dtend   = b.check_out_date.replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:booking-${b.id}@nestbook.io`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      'SUMMARY:Booked',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');

  const slug = property.booking_slug ?? String(property.id);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-calendar.ics"`);
  res.send(lines.join('\r\n'));
});

// ── iCal import — helpers ─────────────────────────────────────────────────────

function fetchIcalUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseIcalDate(val) {
  if (!val) return null;
  const clean = val.replace(/T.*$/, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return null;
}

function parseIcal(data) {
  const events = [];
  // Unfold continuation lines (RFC 5545 §3.1)
  const unfolded = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
  const lines = unfolded.split('\n');

  let inEvent = false;
  let event = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      event = {};
    } else if (line === 'END:VEVENT') {
      if (event.start && event.end && event.uid) {
        events.push(event);
      }
      inEvent = false;
    } else if (inEvent) {
      if (line.startsWith('DTSTART')) {
        const val = line.split(':').slice(1).join(':').trim();
        event.start = parseIcalDate(val);
      } else if (line.startsWith('DTEND')) {
        const val = line.split(':').slice(1).join(':').trim();
        event.end = parseIcalDate(val);
      } else if (line.startsWith('SUMMARY')) {
        event.summary = line.split(':').slice(1).join(':').trim();
      } else if (line.startsWith('UID')) {
        event.uid = line.split(':').slice(1).join(':').trim();
      }
    }
  }

  return events;
}

export async function syncFeed(feedId) {
  const feed = db.prepare('SELECT * FROM ical_feeds WHERE id = ?').get(feedId);
  if (!feed) throw new Error('Feed not found');

  try {
    const data   = await fetchIcalUrl(feed.url);
    const events = parseIcal(data);

    db.prepare('DELETE FROM ical_blocks WHERE feed_id = ?').run(feedId);

    const insert = db.prepare(`
      INSERT OR IGNORE INTO ical_blocks
        (property_id, room_id, feed_id, start_date, end_date, summary, uid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const event of events) {
      if (!event.start || !event.end) continue;
      if (event.end >= today) {
        insert.run(
          feed.property_id,
          feed.room_id,
          feedId,
          event.start,
          event.end,
          event.summary || 'External booking',
          event.uid
        );
        count++;
      }
    }

    db.prepare(`
      UPDATE ical_feeds SET last_synced_at = datetime('now'), last_error = NULL WHERE id = ?
    `).run(feedId);

    console.log(`[ical-sync] Feed ${feedId} synced — ${count} events`);
    return count;
  } catch (e) {
    db.prepare(`UPDATE ical_feeds SET last_error = ? WHERE id = ?`).run(e.message, feedId);
    console.error(`[ical-sync] Feed ${feedId} error:`, e.message);
    throw e;
  }
}

// ── iCal import — CRUD routes (auth-protected) ───────────────────────────────

// GET /api/ical/feeds — list all feeds for this owner's property
icalRouter.get('/feeds', requireAuth, (req, res) => {
  try {
    const property = db.prepare(
      'SELECT id FROM properties WHERE owner_id = ? LIMIT 1'
    ).get(req.user.userId);
    if (!property) return res.status(404).json({ error: 'No property found' });

    const feeds = db.prepare(`
      SELECT f.*, r.name AS room_name
      FROM ical_feeds f
      LEFT JOIN rooms r ON r.id = f.room_id
      WHERE f.property_id = ?
      ORDER BY f.created_at ASC
    `).all(property.id);

    res.json({ feeds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ical/blocks?property_id=X — external blocks for calendar display
icalRouter.get('/blocks', requireAuth, (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) return res.status(400).json({ error: 'property_id required' });

    const blocks = db.prepare(`
      SELECT ib.*, f.name AS feed_name
      FROM ical_blocks ib
      JOIN ical_feeds f ON f.id = ib.feed_id
      WHERE ib.property_id = ?
        AND ib.end_date >= date('now')
      ORDER BY ib.start_date ASC
    `).all(property_id);

    res.json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ical/feeds — add a new feed
icalRouter.post('/feeds', requireAuth, async (req, res) => {
  try {
    const { url, name, room_id } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const property = db.prepare(
      'SELECT id FROM properties WHERE owner_id = ? LIMIT 1'
    ).get(req.user.userId);
    if (!property) return res.status(404).json({ error: 'No property found' });

    try {
      await fetchIcalUrl(url);
    } catch {
      return res.status(400).json({
        error: 'Could not fetch that calendar URL. Please check it is correct and publicly accessible.',
      });
    }

    const result = db.prepare(`
      INSERT INTO ical_feeds (property_id, room_id, name, url)
      VALUES (?, ?, ?, ?)
    `).run(property.id, room_id || null, name || 'External calendar', url);

    await syncFeed(result.lastInsertRowid);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ical/feeds/:id
icalRouter.delete('/feeds/:id', requireAuth, (req, res) => {
  try {
    const property = db.prepare(
      'SELECT id FROM properties WHERE owner_id = ? LIMIT 1'
    ).get(req.user.userId);
    if (!property) return res.status(404).json({ error: 'No property found' });

    db.prepare('DELETE FROM ical_feeds WHERE id = ? AND property_id = ?')
      .run(req.params.id, property.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ical/feeds/:id/sync — manual sync
icalRouter.post('/feeds/:id/sync', requireAuth, async (req, res) => {
  try {
    const count = await syncFeed(req.params.id);
    res.json({ success: true, blocked: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
