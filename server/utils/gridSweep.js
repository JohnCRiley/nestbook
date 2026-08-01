/**
 * Generate an evenly-spaced lat/lng grid across a bounding box, for sweeping
 * Google Places Text Search across a whole country instead of one named area.
 */
export function generateGrid(bounds, spacingKm = 35) {
  const { latMin, latMax, lngMin, lngMax } = bounds;
  const kmPerDegLat = 111;
  const midLat = (latMin + latMax) / 2;
  const kmPerDegLng = 111 * Math.cos(midLat * Math.PI / 180);

  const latStep = spacingKm / kmPerDegLat;
  const lngStep = spacingKm / kmPerDegLng;

  const points = [];
  for (let lat = latMin; lat <= latMax; lat += latStep) {
    for (let lng = lngMin; lng <= lngMax; lng += lngStep) {
      points.push({ lat, lng });
    }
  }
  return points;
}

// Fisher-Yates shuffle — returns a new array, doesn't mutate the input.
// Used only for maxPoints test runs, so a small sample is spread across the
// whole grid instead of always landing on the first N points (same corner
// of the country) in generateGrid()'s fixed nested-loop order.
export function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Rough bounding boxes — good enough for a first-pass sweep, not survey-grade
export const COUNTRY_BOUNDS = {
  uk: { latMin: 49.9, latMax: 58.7, lngMin: -8.2, lngMax: 1.8 },
  fr: { latMin: 41.3, latMax: 51.1, lngMin: -5.1, lngMax: 9.6 },
  es: { latMin: 36.0, latMax: 43.8, lngMin: -9.3, lngMax: 3.3 },
  de: { latMin: 47.3, latMax: 55.1, lngMin: 5.9,  lngMax: 15.0 },
  nl: { latMin: 50.8, latMax: 53.6, lngMin: 3.4,  lngMax: 7.2 },
  be: { latMin: 49.5, latMax: 51.5, lngMin: 2.5,  lngMax: 6.4 },
  ch: { latMin: 45.8, latMax: 47.8, lngMin: 5.9,  lngMax: 10.5 },
};
