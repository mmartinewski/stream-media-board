import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StagingMediaKind = 'audio' | 'video';

export interface StagingMeta {
  readonly processId: string;
  readonly youtubeUrl: string;
  readonly audioPath: string;
  readonly durationSeconds: number;
  readonly createdAt: string;
  readonly mediaKind: StagingMediaKind;
  readonly videoPath?: string;
}

export function isValidProcessId(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export function newStagingProcessId(): string {
  return randomUUID();
}

export function metaPath(mediaTempDir: string, processId: string): string {
  return join(mediaTempDir, `${processId}.staging.json`);
}

export function writeStagingMeta(
  mediaTempDir: string,
  meta: StagingMeta,
): void {
  writeFileSync(metaPath(mediaTempDir, meta.processId), JSON.stringify(meta), 'utf8');
}

export function readStagingMeta(
  mediaTempDir: string,
  processId: string,
): StagingMeta | null {
  if (!isValidProcessId(processId)) return null;
  const p = metaPath(mediaTempDir, processId);
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf8');
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof o.processId !== 'string' ||
      typeof o.youtubeUrl !== 'string' ||
      typeof o.audioPath !== 'string' ||
      typeof o.durationSeconds !== 'number' ||
      typeof o.createdAt !== 'string'
    ) {
      return null;
    }
    const mediaKind =
      o.mediaKind === 'video' || o.mediaKind === 'audio'
        ? o.mediaKind
        : 'audio';
    const videoPath =
      typeof o.videoPath === 'string' && o.videoPath.length > 0
        ? o.videoPath
        : undefined;
    return {
      processId: o.processId,
      youtubeUrl: o.youtubeUrl,
      audioPath: o.audioPath,
      durationSeconds: o.durationSeconds,
      createdAt: o.createdAt,
      mediaKind,
      videoPath,
    };
  } catch {
    return null;
  }
}

export function stagingInputPath(meta: StagingMeta): string {
  if (meta.mediaKind === 'video' && meta.videoPath) {
    return meta.videoPath;
  }
  return meta.audioPath;
}

export function deleteStagingBundle(
  mediaTempDir: string,
  processId: string,
): void {
  if (!isValidProcessId(processId)) return;
  const meta = readStagingMeta(mediaTempDir, processId);
  try {
    unlinkSync(metaPath(mediaTempDir, processId));
  } catch {
    /* noop */
  }
  if (meta) {
    const paths = new Set([meta.audioPath, meta.videoPath].filter(Boolean) as string[]);
    for (const filePath of paths) {
      try {
        unlinkSync(filePath);
      } catch {
        /* noop */
      }
    }
  }
}

export function stagingMetaExpired(
  meta: StagingMeta,
  ttlMs: number,
): boolean {
  const t = Date.parse(meta.createdAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > ttlMs;
}

export function guessMimeFromPath(filePath: string): string {
  const ext = basename(filePath).toLowerCase();
  if (ext.endsWith('.mp4')) return 'video/mp4';
  if (ext.endsWith('.webm')) return 'video/webm';
  if (ext.endsWith('.m4a') || ext.endsWith('.mp4')) return 'audio/mp4';
  if (ext.endsWith('.webm')) return 'audio/webm';
  if (ext.endsWith('.opus')) return 'audio/opus';
  if (ext.endsWith('.ogg')) return 'audio/ogg';
  if (ext.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}
