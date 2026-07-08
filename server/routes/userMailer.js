import { Router } from 'express';
import db from '../db/database.js';
import { sendOutreachEmail } from '../email/emailService.js';

export const userMailerRouter = Router();

// ── Templates ─────────────────────────────────────────────────────────────────

userMailerRouter.get('/templates', (req, res) => {
  const rows = db.prepare('SELECT * FROM user_email_templates ORDER BY updated_at DESC').all();
  res.json(rows);
});

userMailerRouter.post('/templates', (req, res) => {
  const { name, subject, html } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
  if (!html?.trim()) return res.status(400).json({ error: 'html is required' });

  const result = db.prepare(`
    INSERT INTO user_email_templates (name, subject, html) VALUES (?, ?, ?)
  `).run(name.trim(), subject.trim(), html);

  const row = db.prepare('SELECT * FROM user_email_templates WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

userMailerRouter.put('/templates/:id', (req, res) => {
  const { name, subject, html } = req.body;
  const row = db.prepare('SELECT id FROM user_email_templates WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Template not found' });

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
  const row = db.prepare('SELECT id FROM user_email_templates WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Template not found' });
  db.prepare('DELETE FROM user_email_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Preview count ──────────────────────────────────────────────────────────────

userMailerRouter.get('/preview-count', (req, res) => {
  const { plan, verifiedOnly } = req.query;

  const conditions = ['u.suspended = 0', 'u.email IS NOT NULL', "u.email != ''"];
  const params = [];

  if (plan && plan !== 'all') {
    conditions.push('u.plan = ?');
    params.push(plan);
  }
  if (verifiedOnly === 'true') {
    conditions.push('u.email_verified = 1');
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  const { n } = db.prepare(`SELECT COUNT(*) as n FROM users u ${where}`).get(...params);
  res.json({ count: n });
});

// ── Send test email to SA's own address ───────────────────────────────────────

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

// ── Send broadcast ─────────────────────────────────────────────────────────────
// Fires asynchronously — returns the broadcast record immediately, then sends in background.

userMailerRouter.post('/send', async (req, res) => {
  const { subject, html, filterPlan, filterVerified } = req.body;
  if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
  if (!html?.trim())    return res.status(400).json({ error: 'html is required' });

  const conditions = ['u.suspended = 0', 'u.email IS NOT NULL', "u.email != ''"];
  const params = [];
  if (filterPlan && filterPlan !== 'all') {
    conditions.push('u.plan = ?');
    params.push(filterPlan);
  }
  if (filterVerified === true || filterVerified === 'true') {
    conditions.push('u.email_verified = 1');
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const recipients = db.prepare(
    `SELECT u.id, u.email, u.name FROM users u ${where} ORDER BY u.id ASC`
  ).all(...params);

  if (recipients.length === 0) {
    return res.status(400).json({ error: 'No recipients match the selected filters.' });
  }

  const broadcastResult = db.prepare(`
    INSERT INTO user_broadcasts
      (subject, html, filter_plan, filter_verified, recipient_count, status, sent_by)
    VALUES (?, ?, ?, ?, ?, 'sending', ?)
  `).run(
    subject.trim(),
    html,
    filterPlan && filterPlan !== 'all' ? filterPlan : null,
    filterVerified === true || filterVerified === 'true' ? 1 : null,
    recipients.length,
    req.user.userId,
  );
  const broadcastId = broadcastResult.lastInsertRowid;

  res.json({
    broadcastId,
    recipientCount: recipients.length,
    message: `Sending to ${recipients.length} users…`,
  });

  // Send emails asynchronously after responding
  (async () => {
    let sent = 0;
    for (const user of recipients) {
      try {
        await sendOutreachEmail({ to: user.email, subject: subject.trim(), html });
        sent++;
        // Update progress every 10 sends
        if (sent % 10 === 0) {
          db.prepare('UPDATE user_broadcasts SET sent_count = ? WHERE id = ?').run(sent, broadcastId);
        }
      } catch (err) {
        console.error(`[user-mailer] Failed to send to ${user.email}:`, err.message);
      }
    }
    db.prepare(`
      UPDATE user_broadcasts
      SET sent_count = ?, status = 'done', completed_at = datetime('now')
      WHERE id = ?
    `).run(sent, broadcastId);
    console.log(`[user-mailer] Broadcast ${broadcastId} complete: ${sent}/${recipients.length} sent`);
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

// ── Single broadcast status (for polling) ─────────────────────────────────────

userMailerRouter.get('/broadcasts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM user_broadcasts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
