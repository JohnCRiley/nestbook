// Extracts the plain-text Help Centre content for a given language, straight
// from the live server/public/help.html file.
//
// help.html renders its UI through a base64-packed i18n blob:
//
//   const I18N = JSON.parse(decodeURIComponent(escape(atob('<base64>'))))
//
// which decodes to { en:{...}, fr:{...}, de:{...}, es:{...}, nl:{...} }, each a
// flat map of dotted keys ("help.start.signup.p") to translated strings. The
// rendered elements carry those keys as data-i18n="<key>" attributes, in
// document order. So to get readable help text in any language we walk the help
// body for data-i18n keys in order and emit the matching translation.
//
// The file is read FRESH on every call (no caching) so any edit to help.html is
// picked up immediately with no restart, rebuild, or cache-bust step.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HELP_HTML_PATH = join(__dirname, '..', 'public', 'help.html');

export const SUPPORTED_HELP_LANGS = ['en', 'fr', 'de', 'es', 'nl'];

const NAMED_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&mdash;': '—',
  '&ndash;': '–', '&hellip;': '…', '&rsquo;': '’', '&lsquo;': '‘',
  '&raquo;': '»', '&laquo;': '«', '&eacute;': 'é',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-zA-Z][a-zA-Z0-9]+;/g, (m) => NAMED_ENTITIES[m] ?? m);
}

function stripToText(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse the I18N blob out of the raw help.html source.
function parseI18nBlob(rawHtml) {
  const m = rawHtml.match(/atob\('([A-Za-z0-9+/=]+)'\)/);
  if (!m) throw new Error('help.html: could not locate the base64 i18n blob');
  // Mirror the page's own decode: atob -> escape/unescape roundtrip for UTF-8.
  const binary = Buffer.from(m[1], 'base64').toString('binary');
  const json = decodeURIComponent(escape(binary));
  return JSON.parse(json);
}

/**
 * Returns the Help Centre body as clean plain text in the requested language.
 * Falls back to English for any unsupported language code.
 *
 * @param {string} lang  one of 'en' | 'fr' | 'de' | 'es' | 'nl'
 * @returns {{ text: string, lang: string }}
 */
export function extractHelpText(lang) {
  const useLang = SUPPORTED_HELP_LANGS.includes(lang) ? lang : 'en';
  const rawHtml = readFileSync(HELP_HTML_PATH, 'utf8');
  const i18n = parseI18nBlob(rawHtml);
  const dict = i18n[useLang] ?? i18n.en ?? {};
  const enDict = i18n.en ?? {};

  // Scope to the help body — everything between the body wrapper and the CTA
  // band. Falls back to the whole document if those markers ever change.
  const startIdx = rawHtml.indexOf('<div class="help-body">');
  const endIdx = rawHtml.indexOf('<!-- CTA BAND -->');
  const body = (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx)
    ? rawHtml.slice(startIdx, endIdx)
    : rawHtml;

  const seen = new Set();
  const lines = [];
  for (const match of body.matchAll(/data-i18n="([^"]+)"/g)) {
    const key = match[1];
    // The same key can legitimately appear twice (e.g. TOC + section heading);
    // keep the first occurrence only to avoid noisy duplication.
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = dict[key] ?? enDict[key];
    if (raw == null) continue;
    const text = stripToText(raw);
    if (text) lines.push(text);
  }

  return { text: lines.join('\n'), lang: useLang };
}
