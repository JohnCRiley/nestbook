/**
 * Generate a URL-safe booking slug from a property name.
 * Handles European accented characters (French, German, Dutch, Spanish).
 */
export function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

/**
 * Ensure a slug is unique in the properties table.
 * Appends -2, -3, … if the base slug is already taken.
 * Pass excludeId to allow the current property to keep its own slug.
 */
export function uniqueSlug(db, baseSlug, excludeId = null) {
  let candidate = baseSlug;
  let counter   = 2;
  while (true) {
    const row = db.prepare('SELECT id FROM properties WHERE booking_slug = ?').get(candidate);
    if (!row || (excludeId !== null && Number(row.id) === Number(excludeId))) break;
    candidate = `${baseSlug}-${counter++}`;
  }
  return candidate;
}
