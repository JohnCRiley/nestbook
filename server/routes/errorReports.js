import { Router } from 'express';
import db from '../db/database.js';
import { sendBugReportAlert } from '../email/emailService.js';

export const errorReportsRouter = Router();

// GET /api/error-reports/enabled — public check for authenticated users
errorReportsRouter.get('/enabled', (req, res) => {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'bug_reporting_enabled'`).get();
  res.json({ enabled: row?.value === 'true' });
});

// POST /api/error-reports — submit a report
errorReportsRouter.post('/', (req, res) => {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'bug_reporting_enabled'`).get();
  if (row?.value !== 'true') {
    return res.status(503).json({ error: 'Bug reporting is currently disabled.' });
  }

  const { category, description, page_url } = req.body;

  if (!description || description.trim().length < 10) {
    return res.status(400).json({ error: 'Please provide a description of at least 10 characters' });
  }

  const user = db.prepare('SELECT id, name, email, plan, property_id FROM users WHERE id = ?')
    .get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  db.prepare(`
    INSERT INTO error_reports
      (user_id, property_id, user_name, user_email, plan, category, description, page_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    user.property_id ?? null,
    user.name || user.email,
    user.email,
    user.plan,
    category || 'general',
    description.trim(),
    page_url || '',
  );

  console.log(`[error-report] New report from ${user.email}: ${category}`);

  sendBugReportAlert({
    userName:    user.name || user.email,
    userEmail:   user.email,
    plan:        user.plan,
    category:    category || 'general',
    description: description.trim(),
  }).catch(() => {});

  res.json({ success: true });
});

// ── Auto-logged reports (system-detected, not user-submitted) ─────────────────
// Reuses the same table/category/admin UI as user-submitted reports rather
// than inventing a parallel mechanism. Distinguished from user reports purely
// by an "[Auto-detected]" description prefix — no schema change, since the
// existing `category: 'email'` filter and the "Contact →" action (which
// already just needs user_name/user_email) both work unmodified either way.
export function logEmailFailureReport({ userId, propertyId, userName, userEmail, plan, emailType, error }) {
  try {
    db.prepare(`
      INSERT INTO error_reports
        (user_id, property_id, user_name, user_email, plan, category, description, page_url)
      VALUES (?, ?, ?, ?, ?, 'email', ?, ?)
    `).run(
      userId,
      propertyId ?? null,
      userName || userEmail || 'Unknown user',
      userEmail ?? '',
      plan ?? null,
      `[Auto-detected] ${emailType} failed to send.\n\nError: ${error?.message ?? String(error)}`,
      '(system-detected — no page)',
    );
    console.log(`[error-report] Auto-logged: ${emailType} failed for ${userEmail} (user #${userId})`);
  } catch (e) {
    console.error('[error-report] Failed to auto-log email failure:', e.message);
  }
}
