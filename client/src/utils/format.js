/**
 * Shared date and currency formatters used across the app.
 * All date functions accept ISO strings (YYYY-MM-DD) and use local time
 * to avoid UTC-midnight drift issues.
 */

export const LOCALE_MAP = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', nl: 'nl-NL' };

/** Returns today as YYYY-MM-DD in local time. */
export function localToday() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** "30 Mar" */
export function formatDateShort(dateStr, locale = 'en') {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', {
    day: 'numeric', month: 'short',
  });
}

/** "30 Mar 2026" */
export function formatDateMedium(dateStr, locale = 'en') {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** "Monday, 30 March 2026" */
export function formatDateLong(dateStr, locale = 'en') {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Number of nights between two YYYY-MM-DD strings. */
export function nightsBetween(checkIn, checkOut) {
  const [y1, m1, d1] = checkIn.split('-').map(Number);
  const [y2, m2, d2] = checkOut.split('-').map(Number);
  return Math.round(
    (new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86_400_000
  );
}

/** Add N days to YYYY-MM-DD, returns YYYY-MM-DD. */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const r = new Date(y, m - 1, d + n);
  return [
    r.getFullYear(),
    String(r.getMonth() + 1).padStart(2, '0'),
    String(r.getDate()).padStart(2, '0'),
  ].join('-');
}

/** "€900" or "€1,850" — returns "—" for null/undefined/NaN. */
export function formatCurrency(amount, currency = 'EUR') {
  if (amount == null) return '—';
  const num = parseFloat(amount);
  if (isNaN(num)) return '—';
  const symbol = { EUR: '€', GBP: '£', USD: '$', CHF: '₣' }[currency] ?? currency;
  return symbol + num.toLocaleString('en-GB');
}
