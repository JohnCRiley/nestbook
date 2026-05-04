// Node.js v22.5+ ships a built-in SQLite module — no native packages needed.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'nestbook.db');

const db = new DatabaseSync(DB_PATH);

// Enforce foreign key constraints on every connection open
db.exec('PRAGMA foreign_keys = ON');

export default db;
