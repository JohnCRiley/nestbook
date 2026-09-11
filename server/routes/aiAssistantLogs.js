// Super Admin read-only viewer for ai_chat_logs (server/utils/aiChatLog.js).
// Purely a browsing surface — no writes happen here; the two assistants
// (server/routes/helpChat.js, server/routes/landingChat.js) do the logging.
import { Router } from 'express';
import db from '../db/database.js';

export const aiAssistantLogsRouter = Router();

const SOURCES = new Set(['help_chat', 'landing_chat']);

// GET /api/admin/ai-assistant/logs?source=help_chat|landing_chat&page=&limit=
aiAssistantLogsRouter.get('/logs', (req, res) => {
  const source = SOURCES.has(req.query.source) ? req.query.source : 'help_chat';
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const total = db.prepare(
    `SELECT COUNT(*) AS n FROM ai_chat_logs WHERE source = ?`
  ).get(source).n;
  const last7 = db.prepare(
    `SELECT COUNT(*) AS n FROM ai_chat_logs WHERE source = ? AND created_at >= datetime('now', '-7 days')`
  ).get(source).n;
  const last30 = db.prepare(
    `SELECT COUNT(*) AS n FROM ai_chat_logs WHERE source = ? AND created_at >= datetime('now', '-30 days')`
  ).get(source).n;
  const logs = db.prepare(`
    SELECT id, created_at, question, language, plan, mode
    FROM ai_chat_logs
    WHERE source = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(source, limit, offset);

  res.json({
    logs, total, last7, last30, page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});
