/**
 * Prepares a chosen file for upload.
 *
 * Resizing happens in the browser rather than on the server so the add-on
 * needs no native image library: `sharp` and friends are large, architecture
 * specific, and would have to be compiled into an image that currently builds
 * from plain node:22-alpine in seconds.
 *
 * It also means a 12 megapixel phone photo becomes about 400 kB before it ever
 * crosses the network, which matters on a Home Assistant box with a small SD
 * card — /data is the volume HA backs up, so every byte here is a byte in
 * every future backup.
 */

/** Long edge, in pixels. Generous for a card that renders about 600 wide. */
export const MAX_EDGE = 1600;

const QUALITY = 0.85;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That is not an image file.');
  }

  // `imageOrientation: 'from-image'` applies the EXIF rotation. Without it a
  // photo taken in portrait on a phone draws on its side, because the canvas
  // reads pixels and the orientation lives in metadata it does not consult —
  // and since we re-encode, that metadata would then be discarded, baking the
  // wrong rotation in permanently.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('That image could not be read. Try a JPEG or PNG.');
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot resize images.');

    // A photo re-encoded as JPEG has no alpha channel, so anything transparent
    // would otherwise composite against black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY);
    });
    if (!blob) throw new Error('That image could not be converted.');

    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
