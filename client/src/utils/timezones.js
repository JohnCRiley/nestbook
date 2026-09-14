// IANA timezone list for the Settings "Timezone" picker.
//
// Prefers the browser's own canonical list (Intl.supportedValuesOf) — genuine,
// complete, zero maintenance — and falls back to a curated static list of
// common zones for older browsers that don't support that API yet.
const FALLBACK_TIMEZONES = [
  'UTC',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon',
  'Europe/Madrid', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/Brussels',
  'Europe/Berlin', 'Europe/Zurich', 'Europe/Rome', 'Europe/Vienna',
  'Europe/Prague', 'Europe/Warsaw', 'Europe/Copenhagen', 'Europe/Oslo',
  'Europe/Stockholm', 'Europe/Helsinki', 'Europe/Athens', 'Europe/Bucharest',
  'Europe/Budapest', 'Europe/Sofia', 'Europe/Istanbul', 'Europe/Moscow',
  'Atlantic/Reykjavik', 'Atlantic/Azores',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Mexico_City',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
  'Asia/Dubai', 'Asia/Jerusalem', 'Asia/Kolkata', 'Asia/Bangkok',
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
  'Pacific/Auckland',
];

let cached = null;

export function getTimezoneOptions() {
  if (cached) return cached;
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const zones = Intl.supportedValuesOf('timeZone');
      if (Array.isArray(zones) && zones.length > 0) {
        cached = zones;
        return cached;
      }
    }
  } catch { /* fall through to static list */ }
  cached = FALLBACK_TIMEZONES;
  return cached;
}
