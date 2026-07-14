import { Router } from 'express';
import db from '../db/database.js';
import { sendOutreachEmail } from '../email/emailService.js';
import { wrapGuestMailerEmail } from '../utils/emailWrapper.js';

export const guestMailerRouter = Router();

// Domains whose emails must never be used for outbound marketing.
// These are OTA relay/platform addresses — using them violates Airbnb/Booking.com ToS.
const BLOCKED_DOMAINS = [
  'guest.airbnb.com',
  'airbnb.com',
  'booking.com',
  'messages.booking.com',
  'reply.booking.com',
  'relay.booking.com',
  'm.booking.com',
  'expedia.com',
  'homeaway.com',
  'vrbo.com',
  'tripadvisor.com',
  'flipkey.com',
  'holidaylettings.co.uk',
  'housetrip.com',
];

function isBlockedEmail(email) {
  if (!email || typeof email !== 'string') return true;
  const at = email.toLowerCase().indexOf('@');
  if (at < 0) return true;
  const domain = email.toLowerCase().slice(at + 1);
  return BLOCKED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

function requireProOwner(req, res) {
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
  if (!user || (user.plan !== 'pro' && user.plan !== 'multi')) {
    res.status(403).json({ error: 'Pro or Multi plan required.' });
    return false;
  }
  return true;
}

function getOwnedProperty(req, propertyId) {
  return db.prepare('SELECT * FROM properties WHERE id = ? AND owner_id = ?')
    .get(Number(propertyId), req.user.userId);
}

function buildLogoUrl(prop) {
  if (!prop.logo_url) return null;
  const base = process.env.APP_BASE_URL || 'https://nestbook.io';
  return `${base}/uploads/logos/${prop.logo_url}`;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ── GET /api/guest-mailer/recipients ─────────────────────────────────────────
guestMailerRouter.get('/recipients', (req, res) => {
  try {
    if (!requireProOwner(req, res)) return;
    const pid = Number(req.query.property_id);
    if (!getOwnedProperty(req, pid)) return res.status(403).json({ error: 'Access denied.' });

    const rows = db.prepare(`
      SELECT g.id, g.first_name, g.last_name, g.email,
             MAX(b.check_out_date) AS last_stay
      FROM guests g
      LEFT JOIN bookings b ON b.guest_id = g.id AND b.property_id = g.property_id
      WHERE g.property_id = ?
        AND g.deleted = 0
        AND g.email IS NOT NULL
        AND TRIM(g.email) != ''
      GROUP BY g.id
      ORDER BY last_stay DESC NULLS LAST, g.last_name, g.first_name
    `).all(pid);

    res.json(rows.filter(r => !isBlockedEmail(r.email)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/guest-mailer/preview ───────────────────────────────────────────
guestMailerRouter.post('/preview', (req, res) => {
  try {
    if (!requireProOwner(req, res)) return;
    const { property_id, body_html, cta_label, cta_url, cta_enabled } = req.body;
    const prop = getOwnedProperty(req, property_id);
    if (!prop) return res.status(403).json({ error: 'Access denied.' });

    const html = wrapGuestMailerEmail(body_html || '', {
      propertyName:    prop.name,
      logoAbsUrl:      buildLogoUrl(prop),
      ctaLabel:        cta_label || null,
      ctaUrl:          cta_url   || null,
      ctaEnabled:      Boolean(cta_enabled),
      mailerSignature: prop.mailer_signature || null,
    });

    res.json({ html });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/guest-mailer/send ───────────────────────────────────────────────
guestMailerRouter.post('/send', async (req, res) => {
  const {
    property_id, subject, body_html,
    cta_label, cta_url, cta_enabled,
    recipient_ids, additional_emails, test_mode,
  } = req.body;

  try {
    if (!requireProOwner(req, res)) return;
    const ownerUser = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.userId);
    const prop = getOwnedProperty(req, property_id);
    if (!prop) return res.status(403).json({ error: 'Access denied.' });

    if (!subject?.trim()) return res.status(400).json({ error: 'Subject is required.' });
    if (!body_html?.trim()) return res.status(400).json({ error: 'Message body is required.' });

    // Re-resolve recipients server-side — never trust the client list
    const allGuests = db.prepare(`
      SELECT id, email FROM guests
      WHERE property_id = ? AND deleted = 0
        AND email IS NOT NULL AND TRIM(email) != ''
    `).all(Number(property_id));

    const eligibleGuests = allGuests.filter(g => !isBlockedEmail(g.email));
    const selectedSet    = new Set((recipient_ids || []).map(Number));
    const selected       = eligibleGuests.filter(g => selectedSet.has(g.id));

    // Parse and validate additional_emails
    const additionalRaw = (additional_emails || [])
      .flatMap(e => e.split(/[\n,]+/))
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    const blocked  = additionalRaw.filter(e => isBlockedEmail(e));
    if (blocked.length > 0) {
      return res.status(400).json({
        error: `Platform-relay addresses cannot be used: ${blocked.join(', ')}`,
      });
    }
    const invalid = additionalRaw.filter(e => !EMAIL_RE.test(e));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid email format: ${invalid.join(', ')}` });
    }

    const guestEmails    = new Set(selected.map(g => g.email.toLowerCase()));
    const uniqueAdditional = [...new Set(additionalRaw)].filter(e => !guestEmails.has(e));

    const allRecipients = [
      ...selected.map(g => g.email),
      ...uniqueAdditional,
    ];

    const trimmedSubject = subject.trim();

    const wrappedHtml = wrapGuestMailerEmail(body_html, {
      propertyName:    prop.name,
      logoAbsUrl:      buildLogoUrl(prop),
      ctaLabel:        cta_label || null,
      ctaUrl:          cta_url   || null,
      ctaEnabled:      Boolean(cta_enabled),
      mailerSignature: prop.mailer_signature || null,
    });

    // Test mode: send only to owner, no logging
    if (test_mode) {
      await sendOutreachEmail({
        to:      ownerUser.email,
        subject: `[TEST] ${trimmedSubject}`,
        html:    wrappedHtml,
      });
      return res.json({ ok: true, test: true, message: `Test email sent to ${ownerUser.email}` });
    }

    if (allRecipients.length === 0) {
      return res.status(400).json({ error: 'No recipients selected.' });
    }

    // Log before sending
    let logId;
    try {
      db.exec('BEGIN');
      const result = db.prepare(`
        INSERT INTO guest_mailer_log
          (property_id, subject, body_html, cta_label, cta_url, cta_enabled, recipient_count, recipients_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(property_id),
        trimmedSubject,
        body_html,
        cta_label || null,
        cta_url   || null,
        cta_enabled ? 1 : 0,
        allRecipients.length,
        JSON.stringify(allRecipients),
      );
      logId = result.lastInsertRowid;
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    // Respond immediately; send async
    res.json({ ok: true, recipientCount: allRecipients.length, logId });

    for (const email of allRecipients) {
      try {
        await sendOutreachEmail({ to: email, subject: trimmedSubject, html: wrappedHtml });
      } catch (e) {
        console.error('[guest-mailer] send failed →', email, e.message);
      }
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── GET /api/guest-mailer/history ────────────────────────────────────────────
guestMailerRouter.get('/history', (req, res) => {
  try {
    if (!requireProOwner(req, res)) return;
    const pid = Number(req.query.property_id);
    if (!getOwnedProperty(req, pid)) return res.status(403).json({ error: 'Access denied.' });

    const rows = db.prepare(`
      SELECT id, subject, cta_enabled, recipient_count, sent_at
      FROM guest_mailer_log
      WHERE property_id = ?
      ORDER BY sent_at DESC
      LIMIT 100
    `).all(pid);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/guest-mailer/history/:id ────────────────────────────────────────
guestMailerRouter.get('/history/:id', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT gml.*, p.owner_id
      FROM guest_mailer_log gml
      JOIN properties p ON p.id = gml.property_id
      WHERE gml.id = ?
    `).get(Number(req.params.id));

    if (!row || row.owner_id !== req.user.userId) {
      return res.status(404).json({ error: 'Not found.' });
    }
    const { owner_id, ...rest } = row;
    res.json(rest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
