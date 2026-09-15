// server/utils/createChannexProperty.js
//
// Create/update a Channex property from a NestBook property record.
// Originally Phase 2 slice 1 (create only); updateChannexProperty() added
// later to let an already-connected property's details (title/currency/
// property_type/timezone/country/address/city) be re-sent after the fact —
// closes the case where timezone/country were saved in Settings but never
// reached Channex because they weren't set (or weren't mappable) at the
// moment "Connect" was first clicked.
//
// Wired into both server/routes/admin.js (Super Admin) and
// server/routes/properties.js (owner-facing Channel Manager page) — both
// call these same functions, never duplicate the attribute-building logic.
//
// See docs/completed/channel-manager-page.md and
// docs/in-progress/channex-integration-phase2.md.

import countries from 'i18n-iso-countries';
import enCountries from 'i18n-iso-countries/langs/en.json' with { type: 'json' };
import frCountries from 'i18n-iso-countries/langs/fr.json' with { type: 'json' };
import deCountries from 'i18n-iso-countries/langs/de.json' with { type: 'json' };
import esCountries from 'i18n-iso-countries/langs/es.json' with { type: 'json' };
import nlCountries from 'i18n-iso-countries/langs/nl.json' with { type: 'json' };
import { createProperty, updateProperty, ChannexError } from './channexClient.js';
import { getChannexPropertyType } from './channexPropertyType.js';

// NestBook stores `country` as free text ("England", "Norway", "USA", …) but
// Channex wants a real ISO 3166-1 alpha-2 code. A hand-maintained map kept
// silently dropping unrecognised countries (confirmed cause of #118's missing
// country — the original map was European-only, no US/CA/AU/etc entries at
// all) — replaced with i18n-iso-countries, which covers every real country in
// all 5 of NestBook's supported languages, so this only needs to grow for
// genuine non-ISO informal names going forward, not for whole countries.
countries.registerLocale(enCountries);
countries.registerLocale(frCountries);
countries.registerLocale(deCountries);
countries.registerLocale(esCountries);
countries.registerLocale(nlCountries);
const COUNTRY_LOOKUP_LOCALES = ['en', 'fr', 'de', 'es', 'nl'];

// Names the library genuinely can't resolve: the UK's constituent countries
// aren't sovereign nations and have no ISO 3166-1 code of their own (Channex
// only has one option — the UK), plus a couple of common informal names.
const COUNTRY_ALIASES = {
  england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  britain: 'GB', holland: 'NL',
};

function toIso2Country(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[A-Za-z]{2}$/.test(trimmed) && countries.isValid(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    const fromAlpha3 = countries.alpha3ToAlpha2(trimmed.toUpperCase());
    if (fromAlpha3) return fromAlpha3;
  }
  for (const locale of COUNTRY_LOOKUP_LOCALES) {
    const code = countries.getAlpha2Code(trimmed, locale);
    if (code) return code;
  }
  return COUNTRY_ALIASES[trimmed.toLowerCase()] ?? null;
}

/**
 * Build the Channex property attributes for a NestBook property record.
 * Exported so a caller (or a test) can inspect exactly what would be sent
 * without making an API call.
 *
 * Only `title` and `currency` are required by Channex at creation. `address` /
 * `city` / `country` / `timezone` / `website` are included when present.
 * `email` / `phone` (Slice D) are always included, even as `null` — see the
 * comment at their assignment below. Coordinates are intentionally NOT set
 * here: Channex only requires those when connecting the first OTA — handled
 * in a later slice. `timezone` is only sent when the owner has set one in
 * Settings (`properties.timezone`) — never guessed from `country`, since a
 * wrong guess is worse than omitting it.
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

  const timezone = (property.timezone ?? '').trim();
  if (timezone) attributes.timezone = timezone;

  // Always included, even as null — Slice B (docs/completed/
  // channex-photo-parity-slice-a.md's replace-vs-merge lesson applies here
  // too, confirmed live 2026-09-15): content.description is a genuine scalar
  // with normal replace semantics, but OMITTING it entirely on an update
  // leaves the OLD value in place rather than clearing it (content's
  // sub-fields are preserved independently when absent from the payload).
  // Since a NestBook description can legitimately be cleared back to empty,
  // this must always be sent, unlike address/city/country/timezone above
  // which are fine to omit (there's no "clear it" requirement for those yet).
  attributes.content = { description: (property.description ?? '').trim() || null };

  // Slice D — property contact details. email/phone are always included,
  // even as null, for the same reason as content.description above
  // (confirmed live 2026-09-15): omitting them on an update leaves the OLD
  // value in place rather than clearing it, and an owner clearing a
  // previously-set contact detail must actually clear it on Channex too.
  // Deliberately sourced ONLY from properties.email/phone (the owner's own
  // public listing contact, set explicitly in Settings) — NEVER from
  // users.email (their login credential), which must never be silently
  // exposed as a public contact address.
  attributes.email = (property.email ?? '').trim() || null;
  attributes.phone = (property.phone ?? '').trim() || null;

  // website — derived from the property's own always-present public booking
  // page, not a Settings field. Unlike email/phone this is never "cleared"
  // by an owner (every property has a booking_slug), so the simpler
  // omit-when-empty convention (matching address/city/country/timezone
  // above) is fine — there's no legitimate empty state to preserve.
  const bookingSlug = (property.booking_slug ?? '').trim();
  if (bookingSlug) {
    const base = (process.env.APP_URL ?? 'https://nestbook.io').replace(/\/+$/, '');
    attributes.website = `${base}/book/${bookingSlug}`;
  }

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

/**
 * Re-send a NestBook property's current details to its already-connected
 * Channex property (PUT, not POST) — for correcting/refreshing title,
 * currency, property_type, timezone, country, address or city after the
 * initial connect, without disconnecting (which would delete every
 * channex_room_mappings row and orphan the existing Channex room types /
 * rate plans — see disconnectChannexProperty() in channexPushInventory.js).
 *
 * Builds attributes exactly the same way createChannexProperty() does, so
 * "Update Property Details" always reflects whatever the property looks like
 * right now — never a stale copy of what was true at connect time.
 *
 * @param {object} property   a NestBook `properties` table row; must already
 *                             have `channex_property_id` set
 * @returns {Promise<{ attributes: object, data: object }>}
 * @throws {Error}         if the property isn't connected yet
 * @throws {ChannexError}  on an API failure
 */
export async function updateChannexProperty(property) {
  if (!property?.channex_property_id) {
    throw new Error(
      `updateChannexProperty: property ${property?.id ?? '(no id)'} is not connected yet — ` +
      `connect it first`
    );
  }
  const attributes = buildChannexPropertyAttributes(property);
  const data = await updateProperty(property.channex_property_id, attributes);
  return { attributes, data };
}
