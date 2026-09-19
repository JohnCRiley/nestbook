// Single source of truth for NestBook's Stripe Price IDs and plan amounts.
//
// Pro / Multi / Bar & Charges each have one FIXED price per currency (no
// Adaptive Pricing — currency is chosen explicitly, see utils/currency.js).
// Env vars are read lazily so this works regardless of dotenv load order.

import { normaliseCurrency } from './currency.js';

const env = (k) => (process.env[k] ?? '').trim() || null;

export function planPriceId(plan, currency) {
  const c = normaliseCurrency(currency);
  if (plan === 'pro')   return env(`STRIPE_PRICE_PRO_${c}`);
  if (plan === 'multi') return env(`STRIPE_PRICE_MULTI_${c}`);
  return null;
}

export function chargesAddonPriceId(currency) {
  return env(`STRIPE_PRICE_CHARGES_ADDON_${normaliseCurrency(currency)}`);
}

export function channelAddonPriceId(currency) {
  return env(`STRIPE_PRICE_CHANNEL_ADDON_${normaliseCurrency(currency)}`);
}

// Legacy single Adaptive-Pricing IDs (STRIPE_PRICE_PRO / STRIPE_PRICE_MULTI).
// No longer used to CREATE anything, but still recognised when reading an
// existing subscription so a customer who hasn't been migrated yet keeps the
// right plan. Remove once every subscription is on the new Prices.
function legacyPlanIds(plan) {
  const id = env(plan === 'multi' ? 'STRIPE_PRICE_MULTI' : 'STRIPE_PRICE_PRO');
  return id ? [id] : [];
}

const ids = (...vals) => vals.filter(Boolean);

export function multiPriceIds() {
  return ids(planPriceId('multi', 'GBP'), planPriceId('multi', 'EUR'), ...legacyPlanIds('multi'));
}
export function proPriceIds() {
  return ids(planPriceId('pro', 'GBP'), planPriceId('pro', 'EUR'), ...legacyPlanIds('pro'));
}

// Which plan does this Price ID belong to? null if it isn't a plan price
// (e.g. an add-on line item).
export function planFromPriceId(priceId) {
  if (!priceId) return null;
  if (multiPriceIds().includes(priceId)) return 'multi';
  if (proPriceIds().includes(priceId))   return 'pro';
  return null;
}

export function isChargesAddonPrice(priceId) {
  return !!priceId && ['GBP', 'EUR'].some(c => chargesAddonPriceId(c) === priceId);
}
export function isChannelAddonPrice(priceId) {
  return !!priceId && ['GBP', 'EUR'].some(c => channelAddonPriceId(c) === priceId);
}

// Find the plan line item on a Stripe subscription (the add-ons are extra
// items) and resolve it. Falls back to 'pro' like the old code did.
export function planFromSubscription(sub) {
  const item = sub?.items?.data?.find(i => planFromPriceId(i.price?.id));
  return { plan: item ? planFromPriceId(item.price.id) : 'pro', item: item ?? null };
}

// Monthly recurring amount per plan per currency (major units). Must match
// the live Stripe Prices — used only for admin MRR/reporting.
export const PLAN_MRR = {
  pro:   { GBP: 14, EUR: 16 },
  multi: { GBP: 25, EUR: 29 },
};

export function mrrFor(plan, currency) {
  return PLAN_MRR[plan]?.[normaliseCurrency(currency)] ?? 0;
}

// rows: [{ plan, currency, count }] → { GBP, EUR }
export function sumMrr(rows) {
  const out = { GBP: 0, EUR: 0 };
  for (const r of rows) out[normaliseCurrency(r.currency)] += (r.count ?? 1) * mrrFor(r.plan, r.currency);
  return out;
}
