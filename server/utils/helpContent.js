// Reads an AI-assistant knowledge base FRESH on every call (no caching), so any
// edit to the source file is live immediately with no restart, rebuild, or
// cache-bust step.
//
// Two assistants share this helper:
//   - the in-app Help Chat        → docs/help-bot-knowledge.md
//   - the landing-page Assistant   → docs/landing-ai-knowledge.md
//
// Both files are single English-only Markdown documents. The respective system
// prompts tell the model to answer in the visitor's language, so there is no
// per-language extraction step here — this module just hands back raw text.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, '..', 'docs');

// Fixed whitelist — callers pass a key, never a path, so this can't be used to
// read arbitrary files.
const KNOWLEDGE_FILES = {
  help:    'help-bot-knowledge.md',
  landing: 'landing-ai-knowledge.md',
};

/**
 * Returns a knowledge file as text, read fresh from disk on every call. Throws
 * if the key is unknown or the file can't be read — callers degrade to a
 * friendly "not available" message.
 *
 * @param {'help'|'landing'} which
 * @returns {string}
 */
export function readKnowledge(which) {
  const name = KNOWLEDGE_FILES[which];
  if (!name) throw new Error(`Unknown knowledge file: ${which}`);
  return readFileSync(join(DOCS_DIR, name), 'utf8');
}

/**
 * Back-compat wrapper for the in-app Help Chat route.
 * @returns {string}
 */
export function readHelpKnowledge() {
  return readKnowledge('help');
}
