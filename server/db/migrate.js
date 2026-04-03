/**
 * One-off migration: set is_super_admin = 1 for demo@nestbook.io.
 * Safe to run multiple times.
 */

import { initSchema } from './schema.js';
import db from './database.js';

initSchema();

const result = db
  .prepare(`UPDATE users SET is_super_admin = 1 WHERE email = 'demo@nestbook.io'`)
  .run();

if (result.changes === 0) {
  console.log('No rows updated — demo@nestbook.io not found or already set.');
} else {
  console.log(`✓ is_super_admin = 1 set for demo@nestbook.io (${result.changes} row updated).`);
}
