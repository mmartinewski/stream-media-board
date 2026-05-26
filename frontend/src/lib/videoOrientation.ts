export type VideoOrientation = 'landscape' | 'portrait';
export type BrowserSourceMode = 'universal' | 'audio' | 'landscape' | 'portrait';

export function parseBrowserSourceMode(value: string | null): BrowserSourceMode {
  const normalized = (value ?? 'universal').trim().toLowerCase();
  if (
    normalized === 'audio' ||
    normalized === 'landscape' ||
    normalized === 'portrait' ||
    normalized === 'universal'
  ) {
    return normalized;
  }
  return 'universal';
}

export function deriveVideoOrientation(width: number, height: number): VideoOrientation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'landscape';
  }
  const ratio = width / height;
  if (ratio < 0.92) return 'portrait';
  return 'landscape';
}

export function normalizeVideoOrientation(value: unknown): VideoOrientation {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'portrait') return 'portrait';
    if (normalized === 'landscape' || normalized === 'square') return 'landscape';
  }
  return 'landscape';
}

export function videoOrientationLabel(value: VideoOrientation): string {
  return value === 'portrait' ? 'Portrait' : 'Landscape';
}
