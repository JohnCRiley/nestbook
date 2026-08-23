import fs from 'fs';

/**
 * Best-effort deletion of an uploaded file (replaced photo, temp upload,
 * removed hero/logo/access image, etc). Never throws — a failed delete
 * just leaves an orphan file on disk, which is harmless, so callers fire
 * this without awaiting/checking a result. Failures are still logged
 * server-side so they're not completely invisible.
 */
export function cleanupFile(path) {
  try {
    fs.unlinkSync(path);
  } catch (err) {
    console.error(`[file-cleanup] Failed to delete ${path}:`, err.message);
  }
}
