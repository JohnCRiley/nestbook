import { join } from 'path';
import fs from 'fs';
import { processRoomPhoto, ROOM_UPLOAD_DIR } from './processRoomPhoto.js';
import { cleanupFile } from './fileCleanup.js';

// A photo_url must point straight at an image file, not at a webpage that
// displays one (e.g. a pexels.com/photo/... gallery page, which 403s an HTML
// page). Query strings are fine — image CDNs routinely append them.
const IMAGE_URL_RE = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?|heic)(\?|#|$)/i;

/**
 * Fetches one image URL and attaches it to `roomId` via processRoomPhoto.
 * Never throws. Returns `{ attached: true }` on success, or
 * `{ attached: false, error }` with a user-facing message. `label` is
 * prepended to every message (e.g. `Row 3 ("Garden Room")`).
 *
 * Shared by both CSV importers (Named Rooms + Room Categories) so the
 * fetch/validation/"that's a webpage link" messaging lives in one place.
 */
export async function attachRoomPhotoFromUrl(roomId, url, label = 'Photo') {
  if (!/^https?:\/\/.+/i.test(url)) {
    return { attached: false, error: `${label}: "${url}" is not a valid http(s) URL` };
  }

  // The URL shape is the discriminator: no image extension → treat any failure
  // as "that's a webpage link"; a real .jpg that 404s still gets the plain
  // HTTP-status message.
  const looksLikeImageUrl = IMAGE_URL_RE.test(url);
  const webpageMsg = `${label}: "${url}" looks like a webpage link, not a direct image link — it should point straight at an image file (ending in .jpg, .png, etc.)`;

  const tmpName = `${roomId}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const tmpPath = join(ROOM_UPLOAD_DIR, tmpName);

  try {
    const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const ctype = (resp.headers.get('content-type') || '').toLowerCase();

    if (!resp.ok) {
      return {
        attached: false,
        error: looksLikeImageUrl ? `${label}: ${url} returned HTTP ${resp.status}` : webpageMsg,
      };
    }
    if (!ctype.startsWith('image/')) {
      return {
        attached: false,
        error: looksLikeImageUrl
          ? `${label}: ${url} returned ${ctype || 'a non-image response'} instead of an image`
          : webpageMsg,
      };
    }

    fs.writeFileSync(tmpPath, Buffer.from(await resp.arrayBuffer()));
    await processRoomPhoto(tmpPath, roomId);
    return { attached: true };
  } catch (e) {
    cleanupFile(tmpPath);
    return { attached: false, error: `${label}: could not fetch ${url} (${e.message})` };
  }
}
