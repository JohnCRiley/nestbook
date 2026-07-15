import { Router } from 'express';
import db from '../db/database.js';
import { verifyGuestNoteToken } from '../lib/recoveryToken.js';

export const guestNotesPublicRouter  = Router();
export const guestNotesProtectedRouter = Router();

// ── Public: GET /api/guest-notes/form ────────────────────────────────────────
// Verifies token and returns form pre-fill data. No auth required.
guestNotesPublicRouter.get('/form', (req, res) => {
  const { b: bookingId, exp, t } = req.query;
  if (!verifyGuestNoteToken(bookingId, exp, t)) {
    return res.status(401).json({ error: 'Invalid or expired link.' });
  }
  const row = db.prepare(`
    SELECT g.first_name, p.name AS property_name, p.locale, p.guest_notes_enabled
    FROM bookings b
    JOIN guests g   ON g.id = b.guest_id
    JOIN properties p ON p.id = b.property_id
    WHERE b.id = ?
  `).get(Number(bookingId));
  if (!row) return res.status(404).json({ error: 'Booking not found.' });
  if (!row.guest_notes_enabled) return res.status(403).json({ error: 'Guest notes not enabled.' });
  const existing = db.prepare(`SELECT id FROM guest_notes WHERE booking_id = ?`).get(Number(bookingId));
  if (existing) return res.status(409).json({ error: 'already_submitted' });
  res.json({ firstName: row.first_name || '', propertyName: row.property_name, locale: row.locale || 'en' });
});

// ── Public: POST /api/guest-notes/submit ─────────────────────────────────────
// Verifies token, inserts note as pending, creates content_flag for moderation.
guestNotesPublicRouter.post('/submit', (req, res) => {
  const { b: bookingId, exp, t, guestName, noteText } = req.body;
  if (!verifyGuestNoteToken(bookingId, exp, t)) {
    return res.status(401).json({ error: 'Invalid or expired link.' });
  }
  const booking = db.prepare(`
    SELECT b.id, b.property_id, p.guest_notes_enabled
    FROM bookings b
    JOIN properties p ON p.id = b.property_id
    WHERE b.id = ?
  `).get(Number(bookingId));
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (!booking.guest_notes_enabled) return res.status(403).json({ error: 'Guest notes not enabled.' });

  const text = (noteText || '').trim().slice(0, 400);
  if (!text) return res.status(400).json({ error: 'Note text is required.' });

  const existing = db.prepare(`SELECT id FROM guest_notes WHERE booking_id = ?`).get(Number(bookingId));
  if (existing) return res.status(409).json({ error: 'already_submitted' });

  const name = (guestName || '').trim().slice(0, 100) || null;

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO guest_notes (property_id, booking_id, guest_name, note_text, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(booking.property_id, Number(bookingId), name, text);

  db.prepare(`
    INSERT INTO content_flags (property_id, content_type, content_ref, preview_text)
    VALUES (?, 'guest_note', ?, ?)
  `).run(booking.property_id, String(lastInsertRowid), text.slice(0, 200));

  res.json({ ok: true });
});

// ── Protected: GET /api/guest-notes/my ───────────────────────────────────────
// Returns approved notes for the owner's active property.
guestNotesProtectedRouter.get('/my', (req, res) => {
  const propId = req.user.propertyId;
  if (!propId) return res.status(400).json({ error: 'No active property.' });
  const notes = db.prepare(`
    SELECT id, guest_name, note_text, owner_visible, submitted_at
    FROM guest_notes
    WHERE property_id = ? AND status = 'approved'
    ORDER BY submitted_at DESC
  `).all(Number(propId));
  res.json(notes);
});

// ── Protected: PATCH /api/guest-notes/:id/visibility ─────────────────────────
// Owner toggles whether an approved note shows on their public page.
guestNotesProtectedRouter.patch('/:id/visibility', (req, res) => {
  const propId = req.user.propertyId;
  const note = db.prepare(`SELECT * FROM guest_notes WHERE id = ?`).get(Number(req.params.id));
  if (!note || note.property_id !== Number(propId)) {
    return res.status(404).json({ error: 'Not found.' });
  }
  db.prepare(`UPDATE guest_notes SET owner_visible = ? WHERE id = ?`)
    .run(req.body.owner_visible ? 1 : 0, note.id);
  res.json({ ok: true });
});
