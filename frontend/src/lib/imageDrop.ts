export const MAX_THUMBNAIL_BYTES = 1024 * 1024;
const VALID_THUMBNAIL_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VALID_THUMBNAIL_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateThumbnailFile(file: File): string | null {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  const hasValidType = VALID_THUMBNAIL_TYPES.has(type);
  const hasValidExtension = Array.from(VALID_THUMBNAIL_EXTENSIONS).some((ext) =>
    name.endsWith(ext),
  );
  if (!hasValidType && !hasValidExtension) {
    return 'Only JPEG, PNG, and WebP images are supported.';
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return 'Image is too large (max 1 MB).';
  }
  return null;
}

export function imageExtensionFromMime(type: string): 'jpg' | 'png' | 'webp' {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

export function firstDroppedImageFile(dataTransfer: DataTransfer): File | null {
  return Array.from(dataTransfer.files).find((file) => file.type.startsWith('image/')) ?? null;
}

export function droppedImageUrl(dataTransfer: DataTransfer): string {
  const html = dataTransfer.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const imgSrc = doc.querySelector('img')?.getAttribute('src')?.trim();
    if (imgSrc) return imgSrc;
  }

  const uriList = dataTransfer
    .getData('text/uri-list')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  if (uriList) return uriList;

  const plain = dataTransfer.getData('text/plain').trim();
  return isValidHttpUrl(plain) ? plain : '';
}
