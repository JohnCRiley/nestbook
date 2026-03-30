import { Router } from 'express';
import db from '../db/database.js';

export const healthRouter = Router();

// GET /api/health — confirms the server and database are alive
healthRouter.get('/health', (req, res) => {
  const row = db.prepare('SELECT sqlite_version() AS version').get();

  res.json({
    status: 'ok',
    app: 'NestBook',
    sqlite: row.version,
  });
});
