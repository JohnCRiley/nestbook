import { Router } from 'express';
import db from '../db/database.js';

// ── Feature Interest ─────────────────────────────────────────────────────────
// Generic, reusable "would you use this?" interest gauge. Any page can embed
// server/public/feature-interest-widget.{css,js} with a new `feature_slug` and
// these endpoints work for it immediately — no backend changes needed per feature.
//
// Dedup is deliberately client-side only (localStorage, see the widget JS) — this
// is a lightweight interest gauge, not a security-critical count, so there's no
// server-side dedup, IP tracking, or account requirement here on purpose.
export const featureInterestRouter = Router();

function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9-]{2,64}$/.test(slug);
}

function countFor(slug) {
  return db.prepare('SELECT COUNT(*) AS count FROM feature_interest_votes WHERE feature_slug = ?').get(slug).count;
}

// ── GET /api/feature-interest/count?slug=xxx ──────────────────────────────────
featureInterestRouter.get('/count', (req, res) => {
  const slug = req.query.slug;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid or missing slug' });

  res.json({ slug, count: countFor(slug) });
});

// ── POST /api/feature-interest/vote ───────────────────────────────────────────
// Body: { slug }
featureInterestRouter.post('/vote', (req, res) => {
  const { slug } = req.body ?? {};
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid or missing slug' });

  db.prepare('INSERT INTO feature_interest_votes (feature_slug) VALUES (?)').run(slug);
  res.json({ slug, count: countFor(slug) });
});

// ── POST /api/feature-interest/email ──────────────────────────────────────────
// Body: { slug, email }. Always optional on the frontend — only ever sent after a
// vote, and only if the visitor chooses to leave an email.
featureInterestRouter.post('/email', (req, res) => {
  const { slug, email } = req.body ?? {};
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid or missing slug' });

  const trimmed = typeof email === 'string' ? email.trim() : '';
  if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.') || trimmed.length > 200) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  db.prepare('INSERT INTO feature_interest_emails (feature_slug, email) VALUES (?, ?)').run(slug, trimmed);
  res.json({ success: true });
});
