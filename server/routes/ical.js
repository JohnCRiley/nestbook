import { Router } from 'express';
import db from '../db/database.js';

export const icalRouter = Router();

// Public — no auth. Booking.com / Airbnb fetch this URL directly on a schedule.
// The token makes the URL unguessable without requiring a login.
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

// ── GET /api/ical/:propertyId/property/:token ─────────────────────────────────
// Whole-property iCal feed — covers all bookings across every room.
// The 'property' segment is a literal path component that distinguishes this
// route from the per-room route above (which has a numeric roomId).
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
