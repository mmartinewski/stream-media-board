import { randomUUID } from 'node:crypto';
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Database as BetterDatabase } from 'better-sqlite3';
import type { AppPaths } from '../config/paths.js';
import { upsertMediaSearchCacheEntry } from '../db/repositories/mediaSearchCache.js';
import { HttpError } from '../middleware/errorHandler.js';
import { tryTranscodeToStageMp4 } from './ffmpeg.js';
import { probeVideoDimensions } from './ffprobe.js';
import {
  buildCacheFileBasename,
  localCacheMediaUrl,
  mediaSearchResultFromCacheRow,
} from './mediaSearchCacheStore.js';
import { toStoredMediaPath } from './storedMediaPaths.js';
import type { MediaSearchResult } from './mediaSearchTypes.js';
import { parseMediaSearchUserTags } from './giphyClient.js';

const MIME_TO_EXT: Record<string, string> = {
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
};

const ALLOWED_EXTENSIONS = new Set(['.gif', '.jpg', '.jpeg', '.png', '.webp', '.mp4']);

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export interface ImportMediaGifInput {
  title: string;
  userTags: string[];
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

function detectMediaExtension(
  buffer: Buffer,
  mimeType: string,
  originalName?: string,
): string {
  if (buffer.length >= 12) {
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return '.gif';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return '.png';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return '.jpg';
    if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return '.webp';
    }
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
      return '.mp4';
    }
  }

  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const fromMime = MIME_TO_EXT[normalized];
  if (fromMime) return fromMime;

  const fromName = extname(originalName ?? '').toLowerCase();
  if (fromName && ALLOWED_EXTENSIONS.has(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName;
  }

  throw new HttpError(
    400,
    'Unrecognized media file. Paste a GIF/image or choose a file.',
    'media_import_unrecognized',
  );
}

function shouldTranscodeForStage(ext: string): boolean {
  return ext === '.gif' || ext === '.webp';
}

async function tryTranscodeForStage(
  paths: AppPaths,
  sourcePath: string,
  outputPath: string,
): Promise<boolean> {
  return tryTranscodeToStageMp4({
    ffmpegExe: paths.ffmpegExe,
    inputFile: sourcePath,
    outputFile: outputPath,
  });
}

function inferAnimated(ext: string): boolean {
  return ext === '.gif' || ext === '.mp4' || ext === '.webp';
}

function inferMediaKind(ext: string): 'video' | 'image' {
  return ext === '.mp4' ? 'video' : 'image';
}

function writeBufferToFile(buffer: Buffer, destPath: string): void {
  const tmpPath = `${destPath}.tmp`;
  writeFileSync(tmpPath, buffer);
  try {
    renameSync(tmpPath, destPath);
  } catch {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failure
    }
    throw new HttpError(502, 'Could not save imported media file.', 'media_import_write_failed');
  }
}

async function probeMediaDimensions(
  paths: AppPaths,
  filePath: string,
  ext: string,
): Promise<{ width: number; height: number }> {
  try {
    return await probeVideoDimensions(paths.ffprobeExe, filePath);
  } catch {
    if (ext === '.jpg' || ext === '.png' || ext === '.webp' || ext === '.gif') {
      return { width: 480, height: 270 };
    }
    throw new HttpError(
      400,
      'Could not read media dimensions. Try another file format.',
      'media_import_probe_failed',
    );
  }
}

export function parseImportMediaTitle(raw: unknown): string {
  const title = typeof raw === 'string' ? raw.trim() : '';
  if (!title) {
    throw new HttpError(400, 'Title is required.', 'missing_title');
  }
  if (title.length > 200) {
    throw new HttpError(400, 'Title is too long.', 'invalid_title');
  }
  return title;
}

export function parseImportMediaSourceUrl(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    throw new HttpError(400, 'source_url is required.', 'missing_source_url');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, 'source_url is invalid.', 'invalid_source_url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'source_url must be http or https.', 'invalid_source_url');
  }
  return parsed.toString();
}

export async function fetchImportMediaBuffer(
  sourceUrl: string,
): Promise<{ buffer: Buffer; mimeType: string; originalName?: string }> {
  let response: Response;
  try {
    response = await fetch(sourceUrl, { redirect: 'follow' });
  } catch {
    throw new HttpError(502, 'Could not download media from URL.', 'media_import_download_failed');
  }

  if (!response.ok) {
    throw new HttpError(
      502,
      `Media download failed (${response.status}).`,
      'media_import_download_failed',
    );
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_IMPORT_BYTES) {
    throw new HttpError(400, 'Media file is too large (max 50 MB).', 'media_import_too_large');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new HttpError(400, 'Downloaded media file is empty.', 'media_import_empty');
  }
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new HttpError(400, 'Media file is too large (max 50 MB).', 'media_import_too_large');
  }

  const mimeType =
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? 'image/gif';
  let originalName: string | undefined;
  try {
    const pathname = new URL(sourceUrl).pathname;
    const base = pathname.split('/').pop();
    if (base) originalName = base;
  } catch {
    // ignore
  }

  return { buffer, mimeType, originalName };
}

export async function importMediaGifToCache(
  paths: AppPaths,
  db: BetterDatabase,
  input: ImportMediaGifInput,
): Promise<MediaSearchResult> {
  if (input.buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new HttpError(400, 'Media file is too large (max 50 MB).', 'media_import_too_large');
  }

  const ext = detectMediaExtension(input.buffer, input.mimeType, input.originalName);
  if (!ALLOWED_EXTENSIONS.has(ext) && ext !== '.jpg') {
    throw new HttpError(
      400,
      'Unsupported media type. Use GIF, PNG, JPEG, WebP, or MP4.',
      'media_import_unsupported_type',
    );
  }

  const externalId = randomUUID();
  const base = buildCacheFileBasename('imported', externalId);
  const sourcePath = join(paths.mediaGifs, `${base}${ext}`);
  writeBufferToFile(input.buffer, sourcePath);

  let mediaPath = sourcePath;
  let previewPath: string | null = null;
  let mediaKind = inferMediaKind(ext);
  let isAnimated = inferAnimated(ext);

  if (shouldTranscodeForStage(ext)) {
    previewPath = sourcePath;
    const mp4Path = join(paths.mediaGifs, `${base}.mp4`);
    const transcoded = await tryTranscodeForStage(paths, sourcePath, mp4Path);
    if (transcoded) {
      mediaPath = mp4Path;
      mediaKind = 'video';
      isAnimated = true;
    } else {
      mediaPath = sourcePath;
      previewPath = null;
      mediaKind = 'image';
      isAnimated = true;
    }
  }

  const probeExt = extname(mediaPath).toLowerCase() || ext;
  const { width, height } = await probeMediaDimensions(paths, mediaPath, probeExt);
  const playUrl = localCacheMediaUrl('imported', externalId);

  const row = upsertMediaSearchCacheEntry(db, {
    provider: 'imported',
    externalId,
    title: input.title,
    tags: [],
    userTags: input.userTags,
    mediaPath: toStoredMediaPath(paths, mediaPath),
    previewPath: previewPath ? toStoredMediaPath(paths, previewPath) : null,
    mediaKind,
    width,
    height,
    isAnimated,
    sourcePlayUrl: playUrl,
    sourcePreviewUrl: playUrl,
  });

  return mediaSearchResultFromCacheRow(row);
}

export function parseImportMediaTagsField(raw: unknown): string[] {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      return parseMediaSearchUserTags(JSON.parse(trimmed) as unknown);
    } catch {
      return parseMediaSearchUserTags(trimmed.split(','));
    }
  }
  return parseMediaSearchUserTags(raw);
}
