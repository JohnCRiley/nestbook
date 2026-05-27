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
