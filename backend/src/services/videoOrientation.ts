export type VideoOrientation = 'landscape' | 'portrait';
export type BrowserSourceMode = 'universal' | 'audio' | 'landscape' | 'portrait' | 'stage';

const ORIENTATION_SET = new Set<string>(['landscape', 'portrait']);
const MODE_SET = new Set<string>(['universal', 'audio', 'landscape', 'portrait', 'stage']);

export function deriveVideoOrientation(
  width: number,
  height: number,
): VideoOrientation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'landscape';
  }
  const ratio = width / height;
  if (ratio < 0.92) return 'portrait';
  return 'landscape';
}

export function parseVideoOrientation(value: unknown): VideoOrientation | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'square') return 'landscape';
  return ORIENTATION_SET.has(normalized) ? (normalized as VideoOrientation) : null;
}

/** Stored orientation, else dimensions, else landscape (legacy clips). */
export function resolveClipVideoOrientation(
  storedOrientation: unknown,
  width?: number | null,
  height?: number | null,
): VideoOrientation {
  const parsed = parseVideoOrientation(storedOrientation);
  if (parsed) return parsed;
  if (
    width != null &&
    height != null &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return deriveVideoOrientation(width, height);
  }
  return 'landscape';
}

export function parseBrowserSourceMode(value: unknown): BrowserSourceMode {
  if (typeof value !== 'string') return 'universal';
  const normalized = value.trim().toLowerCase();
  return MODE_SET.has(normalized) ? (normalized as BrowserSourceMode) : 'universal';
}

export function browserSourceModeAcceptsClip(
  mode: BrowserSourceMode,
  clipOrientation: VideoOrientation | null | undefined,
  mediaKind?: 'audio' | 'video' | 'image',
): boolean {
  if (mediaKind === 'audio') {
    return mode === 'audio' || mode === 'universal' || mode === 'stage';
  }
  if (mode === 'audio') return false;
  if (mode === 'stage' || mode === 'universal') return true;
  const resolved = clipOrientation ?? 'landscape';
  return mode === resolved;
}
