import type { ClipType } from './api';

export function clipVolumeMax(clipType: ClipType): number {
  return clipType === 'audio' ? 300 : 100;
}

export function clampClipVolume(value: number, clipType: ClipType): number {
  const max = clipVolumeMax(clipType);
  if (!Number.isFinite(value)) return 75;
  return Math.max(0, Math.min(max, Math.round(value)));
}

export function effectiveVolumeToElement(
  clipVolume?: number,
  playbackVolume?: number,
): number {
  const clip = clipVolume ?? 100;
  const global = playbackVolume ?? 100;
  if (!Number.isFinite(clip) || !Number.isFinite(global)) return 1;
  return Math.max(0, Math.min(1, (clip / 100) * (global / 100)));
}
