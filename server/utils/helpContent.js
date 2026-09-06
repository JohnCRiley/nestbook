// Reads the AI Help Chat knowledge base — server/docs/help-bot-knowledge.md —
// FRESH on every call (no caching), so any edit to that file is live
// immediately with no restart, rebuild, or cache-bust step.
//
// The knowledge file is a single English-only Markdown document. The
// /api/help-chat system prompt tells the model to translate its answer into
// the user's language, so there is no per-language extraction step here — this
// module just hands back the file's raw text.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = join(__dirname, '..', 'docs', 'help-bot-knowledge.md');

/**
 * Returns the full help-bot knowledge file as text, read fresh from disk on
 * every call. Throws if the file can't be read — the caller degrades to a
 * friendly "not available" message.
 *
 * @returns {string}
 */
export function readHelpKnowledge() {
  return readFileSync(KNOWLEDGE_PATH, 'utf8');
}
