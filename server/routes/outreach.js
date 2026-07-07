import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/database.js';
import { sendOutreachEmail } from '../email/emailService.js';

export const outreachRouter = Router();

// ── Status pipeline ───────────────────────────────────────────────────────────
const BLOCKED_STATUSES = new Set(['unsubscribed', 'complained', 'converted']);

function getNextStatus(current) {
  const pipeline = {
    'new':               '1st_contact_sent',
    '1st_contact_sent':  '1st_followup_sent',
    '1st_followup_sent': '2nd_followup_sent',
    '2nd_followup_sent': '3rd_followup_sent',
  };
  return pipeline[current] ?? current;
}

// ── Unsubscribe token generator ───────────────────────────────────────────────
function makeUnsubToken() {
  return crypto.randomBytes(24).toString('hex');
}

// ── Stats ─────────────────────────────────────────────────────────────────────
outreachRouter.get('/stats', (req, res) => {
  const total       = db.prepare(`SELECT COUNT(*) AS n FROM prospects`).get().n;
  const byStatus    = db.prepare(`SELECT status, COUNT(*) AS n FROM prospects GROUP BY status`).all();
  const sentToday   = db.prepare(
    `SELECT COUNT(*) AS n FROM prospect_emails WHERE DATE(sent_at) = DATE('now')`
  ).get().n;
  const sentTotal   = db.prepare(`SELECT COUNT(*) AS n FROM prospect_emails`).get().n;
  const campaigns   = db.prepare(`SELECT COUNT(*) AS n FROM outreach_campaigns`).get().n;

  const statusMap = {};
  for (const row of byStatus) statusMap[row.status] = row.n;

  res.json({ total, byStatus: statusMap, sentToday, sentTotal, campaigns });
});

// ── Prospects — list ──────────────────────────────────────────────────────────
outreachRouter.get('/prospects', (req, res) => {
  const { status, source, q } = req.query;
  let sql = `SELECT * FROM prospects WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND status = ?`; params.push(status); }
  if (source) { sql += ` AND source = ?`; params.push(source); }
  if (q)      { sql += ` AND (name LIKE ? OR email LIKE ? OR company LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ` ORDER BY created_at DESC`;

  const rows = db.prepare(sql).all(...params);

  let countSql = `SELECT COUNT(*) AS n FROM prospects WHERE 1=1`;
  const countParams = [];
  if (status) { countSql += ` AND status = ?`; countParams.push(status); }
  if (source) { countSql += ` AND source = ?`; countParams.push(source); }
  if (q)      { countSql += ` AND (name LIKE ? OR email LIKE ? OR company LIKE ?)`; countParams.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const total = db.prepare(countSql).get(...countParams).n;

  res.json({ prospects: rows, total });
});

// ── Prospects — follow-up queue ───────────────────────────────────────────────
// Shows prospects whose follow_up_date is today or in the past.
// Prospects with no follow_up_date never appear here.
outreachRouter.get('/prospects/follow-up', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, MAX(pe.sent_at) AS last_contacted
    FROM prospects p
    LEFT JOIN prospect_emails pe ON pe.prospect_id = p.id
    WHERE p.status NOT IN ('unsubscribed', 'complained', 'converted', 'replied')
      AND p.follow_up_date IS NOT NULL
      AND p.follow_up_date <= date('now')
    GROUP BY p.id
    ORDER BY p.follow_up_date ASC
    LIMIT 100
  `).all();
  res.json(rows);
});

// ── Prospects — single ────────────────────────────────────────────────────────
outreachRouter.get('/prospects/:id', (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const emails = db.prepare(`SELECT * FROM prospect_emails WHERE prospect_id = ? ORDER BY sent_at DESC`).all(req.params.id);
  res.json({ ...p, emails });
});

// ── Prospects — create ────────────────────────────────────────────────────────
outreachRouter.post('/prospects', (req, res) => {
  const { name, company, email, phone, property_type, source = 'manual', notes, follow_up_date, country, region, town, language, website } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

  const existing = db.prepare(`SELECT id FROM prospects WHERE email = ?`).get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'A prospect with this email already exists', id: existing.id });

  const token = makeUnsubToken();
  const result = db.prepare(
    `INSERT INTO prospects (name, company, email, phone, property_type, source, notes, follow_up_date, country, region, town, language, website, unsubscribe_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name.trim(), company?.trim() || null, email.toLowerCase().trim(),
    phone?.trim() || null, property_type || null,
    source, notes || null, follow_up_date || null,
    country || null, region || null, town?.trim() || null,
    language || null, website?.trim() || null, token
  );

  res.status(201).json({ id: result.lastInsertRowid });
});

// ── Prospects — update ────────────────────────────────────────────────────────
outreachRouter.put('/prospects/:id', (req, res) => {
  const { name, company, email, status, notes, follow_up_date, country, language, website } = req.body;
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE prospects SET
      name = ?, company = ?, email = ?, status = ?, notes = ?, follow_up_date = ?,
      country = ?, language = ?, website = ?
    WHERE id = ?
  `).run(
    name !== undefined ? (name ?? '').trim() : p.name,
    company ?? p.company,
    email ? email.toLowerCase().trim() : p.email,
    status ?? p.status,
    notes !== undefined ? notes : p.notes,
    follow_up_date !== undefined ? follow_up_date : p.follow_up_date,
    country !== undefined ? country : p.country,
    language !== undefined ? language : p.language,
    website !== undefined ? (website?.trim() || null) : p.website,
    req.params.id,
  );
  res.json({ ok: true });
});

// ── Prospects — delete ────────────────────────────────────────────────────────
outreachRouter.delete('/prospects/:id', (req, res) => {
  db.prepare(`DELETE FROM prospects WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ── Prospects — bulk CSV import ───────────────────────────────────────────────
// Expects { rows: [{ name, company, email, phone, property_type, country, region, town, language, website, source, notes }] }
outreachRouter.post('/prospects/bulk-import', (req, res) => {
  const { rows } = req.body;
  console.log('[outreach/import] received:', rows?.length ?? 0, 'rows', rows?.[0] ?? '');
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows array required' });

  const insert = db.prepare(
    `INSERT INTO prospects
       (name, company, email, phone, property_type, source, country, region, town, language, website, notes, unsubscribe_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const checkEmail = db.prepare(`SELECT id FROM prospects WHERE email = ?`);

  let imported = 0;
  let skipped  = 0;
  const errors = [];

  // node:sqlite has no db.transaction() — use explicit SQL transaction
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      if (!r.email) { skipped++; continue; }
      const normalEmail = r.email.toLowerCase().trim();
      if (checkEmail.get(normalEmail)) { skipped++; continue; } // duplicate
      try {
        const token   = makeUnsubToken();
        const phone   = r.phone || r.Phone || r.telephone || r.Telephone || null;
        const source  = r.source || r.Source || 'csv';
        insert.run(
          (r.name || '').trim(),
          r.company?.trim() || null,
          normalEmail,
          phone?.trim() || null,
          r.property_type || r.type || null,
          source,
          r.country?.trim() || null,
          r.region || r.Region || null,
          r.town || r.Town || r.city || r.City || null,
          r.language?.trim() || null,
          r.website?.trim() || null,
          r.notes?.trim() || null,
          token,
        );
        imported++;
      } catch (err) {
        errors.push(`Row "${r.name}" (${r.email}): ${err.message}`);
        skipped++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message, imported: 0, skipped: 0, errors: [] });
  }

  console.log('[outreach/import] result:', { imported, skipped }, errors.length ? errors : '');
  res.json({ imported, skipped, errors });
});

// ── Email history for a prospect ──────────────────────────────────────────────
outreachRouter.get('/prospects/:id/emails', (req, res) => {
  const rows = db.prepare(`
    SELECT pe.*, et.name AS template_name, oc.name AS campaign_name
    FROM prospect_emails pe
    LEFT JOIN email_templates et ON et.id = pe.template_id
    LEFT JOIN outreach_campaigns oc ON oc.id = pe.campaign_id
    WHERE pe.prospect_id = ?
    ORDER BY pe.sent_at DESC
  `).all(req.params.id);
  res.json(rows);
});

// ── Send email ────────────────────────────────────────────────────────────────
// Body: { prospect_ids: [id, ...], subject, body, template_id?, campaign_id?, followUpDays? }
outreachRouter.post('/send', async (req, res) => {
  const { prospect_ids, subject, body, template_id, campaign_id, followUpDays } = req.body;
  if (!Array.isArray(prospect_ids) || prospect_ids.length === 0) return res.status(400).json({ error: 'prospect_ids required' });
  if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });

  const limitRow = db.prepare(`SELECT value FROM app_settings WHERE key = 'outreach_limit_enabled'`).get();
  const limitEnabled = limitRow?.value === '1';
  if (limitEnabled) {
    const todayCount = db.prepare(
      `SELECT COUNT(*) as count FROM outreach_send_log WHERE date(sent_at) = date('now')`
    ).get().count;
    if (todayCount >= 100) {
      return res.status(429).json({ error: 'Daily sending limit reached. Disable the limiter in settings to send more.' });
    }
  }

  const results = [];
  let sent = 0;
  let skipped = 0;
  const skippedReasons = [];
  for (const pid of prospect_ids) {
    const p = db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(pid);
    if (!p) {
      results.push({ id: pid, ok: false, reason: 'not found' });
      skipped++; skippedReasons.push(`${pid}: not found`);
      continue;
    }
    if (BLOCKED_STATUSES.has(p.status)) {
      results.push({ id: pid, ok: false, reason: p.status });
      skipped++; skippedReasons.push(`${p.email}: ${p.status}`);
      continue;
    }

    // Apply merge fields to both subject and body
    const SOURCE_LABELS = {
      facebook:    'Facebook',
      instagram:   'Instagram',
      google:      'Google',
      booking_com: 'Booking.com',
      airbnb:      'Airbnb',
      referral:    'a referral',
      manual:      'Google',
      csv:         'Google',
      other:       'Google',
    };
    // Language-aware fallbacks: non-English greetings stand alone without a filler word
    const firstNameFallbacks = { en: 'there', fr: '', es: '', de: '', nl: '' };
    const nameFallback = firstNameFallbacks[p.language] ?? 'there';

    const substitutions = {
      '{{name}}':       p.name || nameFallback,
      '{{company}}':    p.company || p.name || '',
      '{{first_name}}': (p.name || '').split(' ')[0] || nameFallback,
      '{{email}}':      p.email || '',
      '{{source}}':     SOURCE_LABELS[p.source] || p.source || 'Google',
      '{{website}}':    p.website || '',
      '{{country}}':    p.country || '',
    };
    let finalSubject = subject;
    let finalBody    = body;
    Object.entries(substitutions).forEach(([key, value]) => {
      const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g');
      finalSubject = finalSubject.replace(regex, value);
      finalBody    = finalBody.replace(regex, value);
    });
    // Remove stray space before comma when fallback is empty (e.g. "Bonjour ," → "Bonjour,")
    finalSubject = finalSubject.replace(/\s+,/g, ',');
    finalBody    = finalBody.replace(/\s+,/g, ',');

    // Tag nestbook.io links with prospect language so landing pages auto-switch
    const prospectLang = p.language && ['en','fr','de','es','nl'].includes(p.language) ? p.language : null;
    if (prospectLang && prospectLang !== 'en') {
      finalBody = finalBody.replace(
        /(https?:\/\/(?:www\.)?nestbook\.io[^\s"'<>]*)/g,
        (url) => url.includes('?') ? `${url}&lang=${prospectLang}` : `${url}?lang=${prospectLang}`
      );
    }

    // Body is HTML when sent from Quill editor; fall back to wrapping plain text for old templates
    const bodyHtml = finalBody.trim().startsWith('<')
      ? finalBody
      : finalBody
          .split(/\n{2,}/)
          .map(para => `<p style="margin:0 0 16px 0;line-height:1.7">${para.replace(/\n/g, '<br>')}</p>`)
          .join('\n');

    const unsubUrl = `${process.env.BASE_URL || 'https://nestbook.io'}/api/outreach/unsubscribe?token=${p.unsubscribe_token}`;

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:#1a4710;padding:28px 32px;">
    <img src="https://nestbook.io/icon-192.png" width="36" height="36"
         style="border-radius:8px;vertical-align:middle;display:inline-block;">
    <span style="color:#ffffff;font-size:22px;font-weight:bold;margin-left:12px;vertical-align:middle;">NestBook</span>
    <div style="color:#a8d5a2;font-size:13px;margin-top:6px;">Booking software for independent properties</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 32px 0px;color:#1a2e14;font-size:15px;line-height:1.6;">
    <div style="color:#1a2e14;">
      ${bodyHtml}
    </div>

    <!-- Signature -->
    <div style="margin-top:32px;padding:24px;border-top:1px solid #d9f0cc;">
      <img src="https://nestbook.io/icon-192.png" width="28" height="28"
           style="border-radius:6px;vertical-align:middle;display:inline-block;">
      <strong style="color:#1a4710;margin-left:8px;vertical-align:middle;font-size:15px;">The NestBook Team</strong><br>
      <span style="color:#5a7a52;font-size:13px;line-height:1.8;">
        <a href="mailto:hello@nestbook.io" style="color:#1a4710;text-decoration:none;">hello@nestbook.io</a>
        &nbsp;&middot;&nbsp;
        <a href="https://nestbook.io" style="color:#1a4710;text-decoration:none;">nestbook.io</a>
      </span>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f0f7ed;padding:20px 32px;border-top:1px solid #d9f0cc;">
    <p style="margin:0;font-size:12px;color:#5a7a52;text-align:center;line-height:1.6;">
      You received this email because you manage a hospitality property and we thought NestBook might be useful to you.<br>
      <a href="${unsubUrl}" style="color:#5a7a52;text-decoration:underline;">Unsubscribe</a>
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`;

    try {
      await sendOutreachEmail({ to: p.email, subject: finalSubject, html: htmlBody });
      const safeCampaignId = campaign_id && db.prepare('SELECT id FROM outreach_campaigns WHERE id = ?').get(campaign_id) ? campaign_id : null;
      const safeTemplateId = template_id && db.prepare('SELECT id FROM email_templates WHERE id = ?').get(template_id) ? template_id : null;
      db.prepare(
        `INSERT INTO prospect_emails (prospect_id, campaign_id, template_id, subject, body) VALUES (?, ?, ?, ?, ?)`
      ).run(pid, safeCampaignId, safeTemplateId, finalSubject, finalBody);
      db.prepare(
        `INSERT INTO outreach_send_log (recipient_email, prospect_id, campaign) VALUES (?, ?, ?)`
      ).run(p.email, pid, campaign_id ? String(campaign_id) : '');

      const days = (Number.isInteger(followUpDays) && followUpDays > 0) ? followUpDays : 7;
      const nextStatus = getNextStatus(p.status);
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + days);
      // Once the prospect reaches 3rd_followup_sent, clear follow_up_date so they
      // don't keep cycling back into the follow-up queue.
      const followUpStr = nextStatus === '3rd_followup_sent' ? null : followUpDate.toISOString().split('T')[0];
      db.prepare(`UPDATE prospects SET follow_up_date = ?, status = ?, emails_sent_count = emails_sent_count + 1 WHERE id = ?`)
        .run(followUpStr, nextStatus, pid);
      results.push({ id: pid, ok: true });
      sent++;
    } catch (err) {
      results.push({ id: pid, ok: false, reason: err.message });
    }
  }

  if (campaign_id) {
    db.prepare(`UPDATE outreach_campaigns SET sent_count = sent_count + ? WHERE id = ?`).run(sent, campaign_id);
  }

  const message = skipped > 0
    ? `Sent ${sent}, skipped ${skipped} (${skippedReasons.slice(0, 3).join(', ')}${skippedReasons.length > 3 ? '…' : ''})`
    : `Sent ${sent}`;
  res.json({ sent, skipped, skippedReasons, results, message });
});

// ── Daily send count ─────────────────────────────────────────────────────────
outreachRouter.get('/daily-count', (req, res) => {
  const count = db.prepare(
    `SELECT COUNT(*) as count FROM outreach_send_log WHERE date(sent_at) = date('now')`
  ).get().count;
  const limitRow = db.prepare(`SELECT value FROM app_settings WHERE key = 'outreach_limit_enabled'`).get();
  const limitEnabled = limitRow?.value === '1';
  const limit = 100;
  res.json({
    count,
    limit,
    limitEnabled,
    remaining: limitEnabled ? Math.max(0, limit - count) : null,
    canSend:   limitEnabled ? count < limit : true,
  });
});

// ── Outreach limit toggle ─────────────────────────────────────────────────────
outreachRouter.get('/limit-status', (req, res) => {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'outreach_limit_enabled'`).get();
  res.json({ enabled: row?.value === '1' });
});

outreachRouter.post('/limit-status', (req, res) => {
  const { enabled } = req.body;
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES ('outreach_limit_enabled', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(enabled ? '1' : '0');
  res.json({ ok: true, enabled });
});

// ── Templates — list ──────────────────────────────────────────────────────────
outreachRouter.get('/templates', (req, res) => {
  res.json(db.prepare(`SELECT * FROM email_templates ORDER BY is_default DESC, name`).all());
});

// ── Templates — create ────────────────────────────────────────────────────────
outreachRouter.post('/templates', (req, res) => {
  const { name, subject, body } = req.body;
  if (!name || !subject || !body) return res.status(400).json({ error: 'name, subject and body required' });
  const r = db.prepare(`INSERT INTO email_templates (name, subject, body) VALUES (?, ?, ?)`).run(name, subject, body);
  res.status(201).json({ id: r.lastInsertRowid });
});

// ── Templates — update ────────────────────────────────────────────────────────
outreachRouter.put('/templates/:id', (req, res) => {
  const { name, subject, body } = req.body;
  db.prepare(`UPDATE email_templates SET name=?, subject=?, body=?, updated_at=datetime('now') WHERE id=?`)
    .run(name, subject, body, req.params.id);
  res.json({ ok: true });
});

// ── Templates — delete ────────────────────────────────────────────────────────
outreachRouter.delete('/templates/:id', (req, res) => {
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE prospect_emails SET template_id = NULL WHERE template_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM email_templates WHERE id = ?`).run(req.params.id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// ── Campaigns — list ──────────────────────────────────────────────────────────
outreachRouter.get('/campaigns', (req, res) => {
  res.json(db.prepare(`SELECT * FROM outreach_campaigns ORDER BY created_at DESC`).all());
});

// ── Campaigns — create ────────────────────────────────────────────────────────
outreachRouter.post('/campaigns', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare(`INSERT INTO outreach_campaigns (name, description) VALUES (?, ?)`).run(name, description || null);
  res.status(201).json({ id: r.lastInsertRowid });
});

// ── Campaigns — update status ─────────────────────────────────────────────────
outreachRouter.put('/campaigns/:id', (req, res) => {
  const { name, description, status } = req.body;
  db.prepare(`UPDATE outreach_campaigns SET name=?, description=?, status=? WHERE id=?`)
    .run(name, description || null, status, req.params.id);
  res.json({ ok: true });
});

// ── Campaigns — delete ────────────────────────────────────────────────────────
outreachRouter.delete('/campaigns/:id', (req, res) => {
  db.prepare(`DELETE FROM outreach_campaigns WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ── Public: unsubscribe ───────────────────────────────────────────────────────
// This handler is exported separately and mounted as a PUBLIC route in index.js
export function handleUnsubscribe(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).send('Invalid unsubscribe link.');

  const p = db.prepare(`SELECT id, name, unsubscribed_at FROM prospects WHERE unsubscribe_token = ?`).get(token);
  if (!p) return res.status(404).send('Unsubscribe link not found or already used.');

  if (!p.unsubscribed_at) {
    db.prepare(`UPDATE prospects SET status='unsubscribed', unsubscribed_at=datetime('now') WHERE id=?`).run(p.id);
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed — NestBook</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
.box{text-align:center;max-width:400px;padding:40px 24px}
h1{color:#1a4710;font-size:1.5rem}p{color:#475569}</style>
</head>
<body>
<div class="box">
  <h1>You've been unsubscribed</h1>
  <p>You won't receive any more outreach emails from NestBook.</p>
  <p style="font-size:0.85rem;color:#94a3b8">Changed your mind? Email us at <a href="mailto:hello@nestbook.io">hello@nestbook.io</a></p>
</div>
</body></html>`);
}

// ── Auto-detect prospect signup (called from auth.js registration) ────────────
export function checkAndConvertProspect(email, userId) {
  try {
    const p = db.prepare(`SELECT id FROM prospects WHERE email = ?`).get(email.toLowerCase().trim());
    if (p) {
      db.prepare(`UPDATE prospects SET status='converted', converted_at=datetime('now'), user_id=? WHERE id=?`)
        .run(userId, p.id);
    }
  } catch { /* never block registration */ }
}
