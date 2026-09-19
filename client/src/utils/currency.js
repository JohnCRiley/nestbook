// Language → currency, plan prices and Channel Manager access. One rule, used
// everywhere a price is displayed or a currency is chosen: EN → GBP;
// FR/DE/ES/NL → EUR; any other language falls back to GBP.
// Mirrored server-side in server/utils/currency.js + stripePrices.js — keep
// the amounts here in sync with the live Stripe Prices.

const EUR_LANGS = new Set(['fr', 'de', 'es', 'nl']);

export const CURRENCY_SYMBOL = { GBP: '£', EUR: '€' };

export function currencyForLanguage(lang) {
  const code = String(lang ?? '').toLowerCase().split(/[-_]/)[0];
  return EUR_LANGS.has(code) ? 'EUR' : 'GBP';
}

// Monthly price per plan / add-on in major units.
export const PLAN_PRICES = {
  pro:     { GBP: 14, EUR: 16 },
  multi:   { GBP: 25, EUR: 29 },
  charges: { GBP: 4,  EUR: 5  },   // Bar & Charges add-on (Pro only)
  channel: { GBP: 9,  EUR: 10 },   // Channel Manager add-on (Pro only — included in Multi)
};

// { currency, amount, label } for one plan in the visitor's language, e.g.
// planPrice('pro', 'fr') → { currency: 'EUR', amount: 16, label: '€16' }.
export function planPrice(plan, lang) {
  const currency = currencyForLanguage(lang);
  const amount   = PLAN_PRICES[plan]?.[currency];
  return { currency, amount, label: amount == null ? '' : `${CURRENCY_SYMBOL[currency]}${amount}` };
}

// Admin reporting: { GBP, EUR } → '£14 + €16' (zero currencies omitted; '£0' if none).
// Currencies are never summed together.
export function formatMoneyPair(byCurrency, digits = 0) {
  const parts = ['GBP', 'EUR']
    .filter((c) => Number(byCurrency?.[c]) !== 0 && byCurrency?.[c] != null)
    .map((c) => `${CURRENCY_SYMBOL[c]}${Number(byCurrency[c]).toFixed(digits)}`);
  return parts.length ? parts.join(' + ') : `${CURRENCY_SYMBOL.GBP}${(0).toFixed(digits)}`;
}

// Multi includes Channel Manager; Pro needs the add-on flag; Free never.
// Mirrors server/utils/channelManagerAccess.js.
export function hasChannelManagerAccess(plan, hasAddonFlag) {
  if (plan === 'multi') return true;
  return plan === 'pro' && !!hasAddonFlag;
}
