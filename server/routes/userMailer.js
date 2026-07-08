import { Router } from 'express';
import db from '../db/database.js';
import { sendOutreachEmail } from '../email/emailService.js';

export const userMailerRouter = Router();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Build WHERE clause + JOIN for user queries based on targeting mode
function buildUserQuery(mode, plans, langs, verifiedOnly) {
  const conditions = ['u.suspended = 0', 'u.email IS NOT NULL', "u.email != ''"];
  const params = [];
  let propJoin = '';

  if (mode === 'plan' && plans?.length) {
    const ph = plans.map(() => '?').join(',');
    conditions.push(`u.plan IN (${ph})`);
    params.push(...plans);
  }

  if (mode === 'language' && langs?.length) {
    propJoin = 'LEFT JOIN properties p ON p.id = u.property_id';
    const ph = langs.map(() => '?').join(',');
    conditions.push(`p.locale IN (${ph})`);
    params.push(...langs);
  }

  if (verifiedOnly === true || verifiedOnly === 'true' || verifiedOnly === 1) {
    conditions.push('u.email_verified = 1');
  }

  return { propJoin, where: 'WHERE ' + conditions.join(' AND '), params };
}

// ── Templates ─────────────────────────────────────────────────────────────────

userMailerRouter.get('/templates', (req, res) => {
  const rows = db.prepare('SELECT * FROM user_email_templates ORDER BY updated_at DESC').all();
  res.json(rows);
});

userMailerRouter.post('/templates', (req, res) => {
  const { name, subject, html } = req.body;
  if (!name?.trim())    return res.status(400).json({ error: 'name is required' });
  if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
  if (!html?.trim())    return res.status(400).json({ error: 'html is required' });

  const result = db.prepare(
    'INSERT INTO user_email_templates (name, subject, html) VALUES (?, ?, ?)'
  ).run(name.trim(), subject.trim(), html);

  res.status(201).json(db.prepare('SELECT * FROM user_email_templates WHERE id = ?').get(result.lastInsertRowid));
});

userMailerRouter.put('/templates/:id', (req, res) => {
  const { name, subject, html } = req.body;
  if (!db.prepare('SELECT id FROM user_email_templates WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const updates = [];
  const params = [];
  if (name    !== undefined) { updates.push('name = ?');    params.push(name.trim()); }
  if (subject !== undefined) { updates.push('subject = ?'); params.push(subject.trim()); }
  if (html    !== undefined) { updates.push('html = ?');    params.push(html); }
  if (updates.length === 0)  return res.json({ success: true });

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare(`UPDATE user_email_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(db.prepare('SELECT * FROM user_email_templates WHERE id = ?').get(req.params.id));
});

userMailerRouter.delete('/templates/:id', (req, res) => {
  if (!db.prepare('SELECT id FROM user_email_templates WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Template not found' });
  }
  db.prepare('DELETE FROM user_email_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Preview count ─────────────────────────────────────────────────────────────
// GET /preview-count?mode=all|plan|language|individual
//   &plans=free&plans=pro   (mode=plan)
//   &langs=en&langs=fr       (mode=language)
//   &userIds=1&userIds=2     (mode=individual)
//   &verifiedOnly=true

userMailerRouter.get('/preview-count', (req, res) => {
  const { mode = 'all', verifiedOnly } = req.query;
  const plans = [req.query.plans ?? []].flat().filter(Boolean);
  const langs  = [req.query.langs  ?? []].flat().filter(Boolean);

  try {
    if (mode === 'individual') {
      const ids = [req.query.userIds ?? []].flat().map(Number).filter(Boolean);
      // Count how many of those IDs are real, non-suspended users
      if (!ids.length) return res.json({ count: 0 });
      const ph = ids.map(() => '?').join(',');
      const conditions = [`u.id IN (${ph})`, 'u.suspended = 0'];
      if (verifiedOnly === 'true') conditions.push('u.email_verified = 1');
      const { n } = db.prepare(
        `SELECT COUNT(*) as n FROM users u WHERE ${conditions.join(' AND ')}`
      ).get(...ids);
      return res.json({ count: n });
    }

    if (mode === 'plan'     && !plans.length) return res.json({ count: 0 });
    if (mode === 'language' && !langs.length)  return res.json({ count: 0 });

    const { propJoin, where, params } = buildUserQuery(mode, plans, langs, verifiedOnly);
    const { n } = db.prepare(
      `SELECT COUNT(*) as n FROM users u ${propJoin} ${where}`
    ).get(...params);
    res.json({ count: n });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Send test email to SA's own address ──────────────────────────────────────

userMailerRouter.post('/send-test', async (req, res) => {
  const { subject, html } = req.body;
  if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
  if (!html?.trim())    return res.status(400).json({ error: 'html is required' });

  const saUser = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.userId);
  if (!saUser) return res.status(404).json({ error: 'Super admin user not found' });

  try {
    await sendOutreachEmail({ to: saUser.email, subject: `[TEST] ${subject}`, html });
    res.json({ success: true, sentTo: saUser.email });
  } catch (err) {
    console.error('[user-mailer/send-test]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Send broadcast ────────────────────────────────────────────────────────────
// Body: { subject, html, mode, plans?, langs?, userIds?, filterVerified?, additionalEmails? }

userMailerRouter.post('/send', async (req, res) => {
  const {
    subject, html,
    mode = 'all',
    plans = [],
    langs = [],
    userIds = [],
    filterVerified = false,
    additionalEmails = [],
  } = req.body;

  if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
  if (!html?.trim())    return res.status(400).json({ error: 'html is required' });

  // Resolve user recipients
  let userRecipients = [];
  try {
    if (mode === 'individual') {
      if (userIds.length) {
        const ph = userIds.map(() => '?').join(',');
        const conditions = [`u.id IN (${ph})`, 'u.suspended = 0'];
        if (filterVerified) conditions.push('u.email_verified = 1');
        userRecipients = db.prepare(
          `SELECT u.id, u.email, u.name FROM users u WHERE ${conditions.join(' AND ')} ORDER BY u.id`
        ).all(...userIds);
      }
    } else {
      if (mode === 'plan'     && !plans.length) return res.status(400).json({ error: 'Select at least one plan.' });
      if (mode === 'language' && !langs.length)  return res.status(400).json({ error: 'Select at least one language.' });

      const { propJoin, where, params } = buildUserQuery(mode, plans, langs, filterVerified);
      userRecipients = db.prepare(
        `SELECT u.id, u.email, u.name FROM users u ${propJoin} ${where} ORDER BY u.id ASC`
      ).all(...params);
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve recipients: ' + err.message });
  }

  // Validate and dedupe additional emails
  const userEmailSet = new Set(userRecipients.map(u => u.email.toLowerCase()));
  const adhocRecipients = [];
  const seen = new Set();
  for (const raw of additionalEmails) {
    const email = String(raw).trim().toLowerCase();
    if (!EMAIL_RE.test(email))      continue; // skip invalid
    if (userEmailSet.has(email))    continue; // already in user list
    if (seen.has(email))            continue; // dedupe within adhoc
    seen.add(email);
    adhocRecipients.push({ email, name: email, source: 'adhoc' });
  }

  const taggedUserRecipients = userRecipients.map(u => ({ email: u.email, name: u.name || u.email, source: 'user' }));
  const allRecipients = [...taggedUserRecipients, ...adhocRecipients];

  if (allRecipients.length === 0) {
    return res.status(400).json({ error: 'No recipients match the selected filters.' });
  }

  // Save broadcast record
  const broadcastResult = db.prepare(`
    INSERT INTO user_broadcasts
      (subject, html, filter_mode, filter_plan, filter_plans, filter_langs,
       filter_verified, recipient_count, adhoc_count, status, sent_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sending', ?)
  `).run(
    subject.trim(),
    html,
    mode,
    mode === 'plan' && plans.length === 1 ? plans[0] : (mode === 'all' ? null : null),
    mode === 'plan'     ? JSON.stringify(plans) : null,
    mode === 'language' ? JSON.stringify(langs)  : null,
    filterVerified ? 1 : null,
    allRecipients.length,
    adhocRecipients.length,
    req.user.userId,
  );
  const broadcastId = broadcastResult.lastInsertRowid;

  res.json({
    broadcastId,
    recipientCount: allRecipients.length,
    userCount:  taggedUserRecipients.length,
    adhocCount: adhocRecipients.length,
    message: `Sending to ${allRecipients.length} recipients…`,
  });

  // Async send loop
  (async () => {
    let sent = 0;
    for (const r of allRecipients) {
      try {
        await sendOutreachEmail({ to: r.email, subject: subject.trim(), html });
        sent++;
        if (sent % 10 === 0) {
          db.prepare('UPDATE user_broadcasts SET sent_count = ? WHERE id = ?').run(sent, broadcastId);
        }
      } catch (err) {
        console.error(`[user-mailer] Failed to send to ${r.email}:`, err.message);
      }
    }
    db.prepare(`
      UPDATE user_broadcasts
      SET sent_count = ?, status = 'done', completed_at = datetime('now')
      WHERE id = ?
    `).run(sent, broadcastId);
    console.log(`[user-mailer] Broadcast ${broadcastId} complete: ${sent}/${allRecipients.length} sent`);
  })().catch(err => {
    console.error('[user-mailer] Broadcast error:', err.message);
    db.prepare(`UPDATE user_broadcasts SET status = 'failed', error = ? WHERE id = ?`)
      .run(err.message, broadcastId);
  });
});

// ── Broadcast history ─────────────────────────────────────────────────────────

userMailerRouter.get('/broadcasts', (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, u.email AS sent_by_email
    FROM user_broadcasts b
    LEFT JOIN users u ON u.id = b.sent_by
    ORDER BY b.created_at DESC
    LIMIT 100
  `).all();
  res.json(rows);
});

userMailerRouter.get('/broadcasts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM user_broadcasts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
