// server/utils/createChannexProperty.js
//
// Create a Channex property from a NestBook property record. Phase 2, slice 1.
//
// NOT wired into any route, button, job or schema yet — callable only from a
// script or the Node console. The next slice decides where the returned Channex
// property id is stored on the NestBook side (a new column — deliberately out of
// scope here).
//
// See docs/in-progress/channex-integration-research.md (section 4, 11) and
// docs/in-progress/channex-integration-phase2.md.

import { createProperty, ChannexError } from './channexClient.js';
import { getChannexPropertyType } from './channexPropertyType.js';

// NestBook stores `country` as free text ("England", "Norway", "Spain", …) but
// Channex wants an ISO 3166-1 alpha-2 code. Best-effort conversion for the
// countries NestBook's European customer base actually uses; anything
// unrecognised is omitted rather than sent invalid. country is optional at
// creation and only becomes required at OTA-connect time (a later slice), so a
// missing value here is safe.
const COUNTRY_TO_ISO2 = {
  'united kingdom': 'GB', 'uk': 'GB', 'u.k.': 'GB', 'great britain': 'GB', 'britain': 'GB',
  'england': 'GB', 'scotland': 'GB', 'wales': 'GB', 'northern ireland': 'GB',
  'ireland': 'IE', 'republic of ireland': 'IE',
  'france': 'FR', 'germany': 'DE', 'deutschland': 'DE', 'spain': 'ES', 'españa': 'ES',
  'netherlands': 'NL', 'the netherlands': 'NL', 'holland': 'NL',
  'belgium': 'BE', 'italy': 'IT', 'italia': 'IT', 'portugal': 'PT',
  'norway': 'NO', 'sweden': 'SE', 'denmark': 'DK', 'finland': 'FI',
  'austria': 'AT', 'switzerland': 'CH', 'luxembourg': 'LU', 'poland': 'PL',
  'czech republic': 'CZ', 'czechia': 'CZ', 'greece': 'GR', 'croatia': 'HR',
  'slovenia': 'SI', 'iceland': 'IS',
};

function toIso2Country(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return COUNTRY_TO_ISO2[trimmed.toLowerCase()] ?? null;
}

/**
 * Build the Channex property attributes for a NestBook property record.
 * Exported so a caller (or a test) can inspect exactly what would be sent
 * without making an API call.
 *
 * Only `title` and `currency` are required by Channex at creation. `address` /
 * `city` / `country` are included when present. `timezone`, `email`, `phone`
 * and coordinates are intentionally NOT set here: NestBook has no per-property
 * timezone column, and Channex only requires those when connecting the first
 * OTA — handled in a later slice.
 *
 * @param {object} property   a NestBook `properties` table row
 * @returns {object}          Channex property attributes
 * @throws {Error}            if name/currency are missing or malformed
 */
export function buildChannexPropertyAttributes(property) {
  if (!property || typeof property !== 'object') {
    throw new Error('buildChannexPropertyAttributes: a property record is required');
  }

  const id = property.id ?? '(no id)';

  const title = (property.name ?? '').trim();
  if (!title) {
    throw new Error(`buildChannexPropertyAttributes: property ${id} has no name`);
  }

  const currency = (property.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      `buildChannexPropertyAttributes: property ${id} has currency ${JSON.stringify(property.currency)} — ` +
      `Channex needs a 3-letter ISO 4217 code`
    );
  }

  const attributes = {
    title: title.slice(0, 255),
    currency,
    property_type: getChannexPropertyType(property),
  };

  const address = (property.address ?? '').trim();
  if (address) attributes.address = address.slice(0, 255);

  const city = (property.city ?? '').trim();
  if (city) attributes.city = city.slice(0, 255);

  const country = toIso2Country(property.country);
  if (country) attributes.country = country;

  return attributes;
}

/**
 * Create the Channex property for a NestBook property record.
 *
 * @param {object} property   a NestBook `properties` table row
 * @returns {Promise<{ id: string, propertyType: string, attributes: object, data: object }>}
 *          `id` is the Channex property UUID — the caller is responsible for
 *          storing it (schema decision deferred to the next slice).
 * @throws {ChannexError|Error}
 */
export async function createChannexProperty(property) {
  const attributes = buildChannexPropertyAttributes(property);
  const data = await createProperty(attributes);

  const channexId = data?.id ?? data?.attributes?.id ?? null;
  if (!channexId) {
    throw new ChannexError('Channex reported success creating the property but returned no id', { details: data });
  }

  return { id: channexId, propertyType: attributes.property_type, attributes, data };
}
