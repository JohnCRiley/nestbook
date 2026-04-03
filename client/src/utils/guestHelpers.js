/**
 * Helpers used on the Guests page.
 */

/** "Sophie Martin" → "SM" */
export function initials(firstName, lastName) {
  return `${(firstName?.[0] ?? '').toUpperCase()}${(lastName?.[0] ?? '').toUpperCase()}`;
}

/**
 * Best-effort country flag emoji derived from the phone number's international prefix.
 * Returns an emoji string, or '' if unrecognised.
 */
const PHONE_FLAGS = [
  // order matters — longer prefixes first to avoid false matches
  ['+358', '🇫🇮'], ['+354', '🇮🇸'], ['+353', '🇮🇪'], ['+352', '🇱🇺'],
  ['+351', '🇵🇹'], ['+350', '🇬🇮'], ['+420', '🇨🇿'], ['+421', '🇸🇰'],
  ['+386', '🇸🇮'], ['+385', '🇭🇷'], ['+382', '🇲🇪'], ['+381', '🇷🇸'],
  ['+380', '🇺🇦'], ['+370', '🇱🇹'], ['+371', '🇱🇻'], ['+372', '🇪🇪'],
  ['+36',  '🇭🇺'], ['+34',  '🇪🇸'], ['+33',  '🇫🇷'], ['+32',  '🇧🇪'],
  ['+31',  '🇳🇱'], ['+30',  '🇬🇷'], ['+49',  '🇩🇪'], ['+48',  '🇵🇱'],
  ['+47',  '🇳🇴'], ['+46',  '🇸🇪'], ['+45',  '🇩🇰'], ['+44',  '🇬🇧'],
  ['+43',  '🇦🇹'], ['+41',  '🇨🇭'], ['+40',  '🇷🇴'], ['+39',  '🇮🇹'],
  ['+38',  '🇷🇸'], ['+27',  '🇿🇦'], ['+1',   '🇺🇸'],
];

export function phoneFlag(phone) {
  if (!phone) return '';
  const clean = phone.replace(/\s/g, '');
  for (const [prefix, flag] of PHONE_FLAGS) {
    if (clean.startsWith(prefix)) return flag;
  }
  return '';
}

/**
 * Derive a best-guess country name from the phone prefix.
 * Returns '' if unrecognised.
 */
const PHONE_COUNTRIES = [
  ['+358', 'Finland'],    ['+353', 'Ireland'],    ['+352', 'Luxembourg'],
  ['+351', 'Portugal'],   ['+420', 'Czech Rep.'], ['+421', 'Slovakia'],
  ['+386', 'Slovenia'],   ['+385', 'Croatia'],    ['+380', 'Ukraine'],
  ['+370', 'Lithuania'],  ['+371', 'Latvia'],     ['+372', 'Estonia'],
  ['+36',  'Hungary'],    ['+34',  'Spain'],       ['+33',  'France'],
  ['+32',  'Belgium'],    ['+31',  'Netherlands'], ['+30',  'Greece'],
  ['+49',  'Germany'],    ['+48',  'Poland'],      ['+47',  'Norway'],
  ['+46',  'Sweden'],     ['+45',  'Denmark'],     ['+44',  'United Kingdom'],
  ['+43',  'Austria'],    ['+41',  'Switzerland'], ['+40',  'Romania'],
  ['+39',  'Italy'],      ['+1',   'United States'],
];

export function phoneCountry(phone) {
  if (!phone) return '';
  const clean = phone.replace(/\s/g, '');
  for (const [prefix, country] of PHONE_COUNTRIES) {
    if (clean.startsWith(prefix)) return country;
  }
  return '';
}

/** "30 Mar 2026" from a YYYY-MM-DD string. */
export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** "€900" or "—" — pass currency symbol to override default €. */
export function fmtPrice(amount, currencySymbol = '€') {
  if (amount == null) return '—';
  return currencySymbol + Number(amount).toLocaleString('en-GB');
}
