/**
 * Two copies of every dish photo, and which one to ask for.
 */

/** Longest edge of the display copy. Comfortably fills a full-width hero. */
export const DISPLAY_WIDTH = 2000;

/** Quality of the display copy. Visually lossless at this size. */
export const DISPLAY_QUALITY = 0.88;

/** The stored path of the display copy that belongs to an original. */
export function displayPath(originalPath: string) {
  return `${originalPath.replace(/\.[^./]+$/, '')}-lg.jpg`;
}

/**
 * The URL a card, hero or thumbnail should load.
 *
 * Anything that is not one of our uploads — a data URI from before photos had a
 * bucket, or a link typed in by hand — is handed back untouched, because no
 * smaller copy of it exists.
 */
export function displayPhoto(url: string) {
  if (!url || url.startsWith('data:') || !url.includes('/dish-photos/')) return url;
  const [path, query] = url.split('?');
  return displayPath(path) + (query ? `?${query}` : '');
}

/**
 * Shrinks a picked file to the display size, as a JPEG.
 *
 * Returns null when the browser cannot decode it, which is the honest outcome
 * for a format it does not support — the original still uploads, and the card
 * falls back to it.
 */
export async function makeDisplayCopy(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const scale = Math.min(1, DISPLAY_WIDTH / Math.max(bitmap.width, bitmap.height));
  // Already small enough. Re-encoding it would only lose detail for nothing.
  if (scale === 1 && file.type === 'image/jpeg') {
    bitmap.close();
    return null;
  }

  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', DISPLAY_QUALITY),
  );
}
