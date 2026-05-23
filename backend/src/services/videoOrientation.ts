export type VideoOrientation = 'landscape' | 'portrait';
export type BrowserSourceMode = 'universal' | 'landscape' | 'portrait';

const ORIENTATION_SET = new Set<string>(['landscape', 'portrait']);
const MODE_SET = new Set<string>(['universal', 'landscape', 'portrait']);

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

export function parseBrowserSourceMode(value: unknown): BrowserSourceMode {
  if (typeof value !== 'string') return 'universal';
  const normalized = value.trim().toLowerCase();
  return MODE_SET.has(normalized) ? (normalized as BrowserSourceMode) : 'universal';
}

export function browserSourceModeAcceptsClip(
  mode: BrowserSourceMode,
  clipOrientation: VideoOrientation | null | undefined,
): boolean {
  if (mode === 'universal') return true;
  if (!clipOrientation) return false;
  return mode === clipOrientation;
}
