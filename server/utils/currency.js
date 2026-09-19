// Language → billing currency. One rule, used everywhere a price is chosen or
// displayed: EN → GBP; FR/DE/ES/NL → EUR. Any other language falls back to
// GBP (the historical default). Mirrored client-side in
// client/src/utils/currency.js — keep the two in sync.

const EUR_LANGS = new Set(['fr', 'de', 'es', 'nl']);

export function currencyForLanguage(lang) {
  const code = String(lang ?? '').toLowerCase().split(/[-_]/)[0];
  return EUR_LANGS.has(code) ? 'EUR' : 'GBP';
}

// Normalise anything Stripe/DB hands back ('gbp', 'EUR', null) to 'GBP' | 'EUR'.
export function normaliseCurrency(c) {
  return String(c ?? '').toUpperCase() === 'EUR' ? 'EUR' : 'GBP';
}
