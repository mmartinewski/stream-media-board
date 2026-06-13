import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { Database as BetterDatabase } from 'better-sqlite3';
import type { AppPaths } from '../config/paths.js';
import {
  cacheRowToMediaSearchResult,
  getMediaSearchCacheEntry,
  type MediaSearchCacheRow,
  parseProviderTagsJson,
  touchMediaSearchCachePlayed,
  upsertMediaSearchCacheEntry,
} from '../db/repositories/mediaSearchCache.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { MediaSearchProviderId, MediaSearchResult } from './mediaSearchTypes.js';

function assertPathUnderDir(dir: string, filePath: string): void {
  const base = resolve(dir) + sep;
  const target = resolve(filePath);
  if (!target.toLowerCase().startsWith(base.toLowerCase())) {
    throw new HttpError(500, 'Path is outside the allowed directory.', 'path_safety');
  }
}

export function buildCacheFileBasename(provider: string, externalId: string): string {
  const safeProvider = provider.replace(/[^a-z0-9_-]/gi, '_');
  const safeId = externalId.replace(/[^a-z0-9_-]/gi, '_');
  return `${safeProvider}_${safeId}`;
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const ext = extname(new URL(url).pathname).toLowerCase();
    if (ext && ext.length <= 8) return ext;
  } catch {
    // ignore invalid URL
  }
  return fallback;
}

export function buildCacheMediaPaths(
  paths: AppPaths,
  provider: MediaSearchProviderId,
  externalId: string,
  isAnimated: boolean,
): { mediaPath: string; previewPath: string } {
  const base = buildCacheFileBasename(provider, externalId);
  return {
    mediaPath: join(paths.mediaGifs, `${base}${isAnimated ? '.mp4' : '.jpg'}`),
    previewPath: join(paths.mediaGifs, `${base}_preview.jpg`),
  };
}

export function localCacheMediaUrl(
  provider: MediaSearchProviderId,
  externalId: string,
): string {
  return `/api/media-search/cache/${encodeURIComponent(provider)}/${encodeURIComponent(externalId)}/media`;
}

export function localCachePreviewUrl(
  provider: MediaSearchProviderId,
  externalId: string,
): string {
  return `/api/media-search/cache/${encodeURIComponent(provider)}/${encodeURIComponent(externalId)}/preview`;
}

export function cacheEntryHasValidFiles(
  paths: AppPaths,
  row: MediaSearchCacheRow,
): boolean {
  assertPathUnderDir(paths.mediaGifs, row.media_path);
  if (!existsSync(row.media_path)) return false;
  if (row.preview_path) {
    assertPathUnderDir(paths.mediaGifs, row.preview_path);
    if (!existsSync(row.preview_path)) return false;
  }
  return true;
}

async function downloadUrlToFile(url: string, destPath: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new HttpError(502, 'Could not download media file.', 'media_cache_download_failed');
  }

  if (!response.ok) {
    throw new HttpError(
      502,
      `Media download failed (${response.status}).`,
      'media_cache_download_failed',
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
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
    throw new HttpError(502, 'Could not save cached media file.', 'media_cache_write_failed');
  }
}

export async function persistMediaSearchResultToCache(
  paths: AppPaths,
  db: BetterDatabase,
  item: MediaSearchResult,
): Promise<MediaSearchCacheRow> {
  const { mediaPath } = buildCacheMediaPaths(
    paths,
    item.provider,
    item.externalId,
    item.isAnimated,
  );

  const mediaExt = extensionFromUrl(item.playUrl, item.isAnimated ? '.mp4' : '.jpg');
  const resolvedMediaPath =
    extname(mediaPath) === mediaExt
      ? mediaPath
      : join(paths.mediaGifs, `${buildCacheFileBasename(item.provider, item.externalId)}${mediaExt}`);

  await downloadUrlToFile(item.playUrl, resolvedMediaPath);
  assertPathUnderDir(paths.mediaGifs, resolvedMediaPath);

  let resolvedPreviewPath: string | null = null;
  if (item.previewUrl) {
    const previewExt = extensionFromUrl(item.previewUrl, '.jpg');
    resolvedPreviewPath = join(
      paths.mediaGifs,
      `${buildCacheFileBasename(item.provider, item.externalId)}_preview${previewExt}`,
    );
    await downloadUrlToFile(item.previewUrl, resolvedPreviewPath);
    assertPathUnderDir(paths.mediaGifs, resolvedPreviewPath);
  }

  const existing = getMediaSearchCacheEntry(db, item.provider, item.externalId);
  const preservedUserTags = existing
    ? parseProviderTagsJson(existing.user_tags_json)
    : [];

  return upsertMediaSearchCacheEntry(db, {
    provider: item.provider,
    externalId: item.externalId,
    title: item.title,
    tags: item.tags ?? [],
    userTags: preservedUserTags,
    mediaPath: resolvedMediaPath,
    previewPath: resolvedPreviewPath,
    mediaKind: item.isAnimated ? 'video' : 'image',
    width: item.width,
    height: item.height,
    isAnimated: item.isAnimated,
    sourcePlayUrl: item.playUrl,
    sourcePreviewUrl: item.previewUrl,
  });
}

export function mediaSearchResultFromCacheRow(row: MediaSearchCacheRow): MediaSearchResult {
  const provider = row.provider as MediaSearchProviderId;
  const previewUrl = row.preview_path
    ? localCachePreviewUrl(provider, row.external_id)
    : localCacheMediaUrl(provider, row.external_id);
  const playUrl = localCacheMediaUrl(provider, row.external_id);
  return cacheRowToMediaSearchResult(row, previewUrl, playUrl);
}

export function resolveCachedMediaSearchResult(
  paths: AppPaths,
  db: BetterDatabase,
  provider: MediaSearchProviderId,
  externalId: string,
): MediaSearchResult | null {
  const row = getMediaSearchCacheEntry(db, provider, externalId);
  if (!row || !cacheEntryHasValidFiles(paths, row)) return null;
  touchMediaSearchCachePlayed(db, provider, externalId);
  return mediaSearchResultFromCacheRow(row);
}

export function resolveCacheMediaContentType(row: MediaSearchCacheRow): string {
  if (row.media_kind === 'video') return 'video/mp4';
  const ext = extname(row.media_path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

export function resolveCachePreviewContentType(previewPath: string): string {
  const ext = extname(previewPath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

export async function downloadMediaSearchResultToCache(
  paths: AppPaths,
  db: BetterDatabase,
  provider: MediaSearchProviderId,
  externalId: string,
  fetchRemote: () => Promise<MediaSearchResult>,
): Promise<MediaSearchResult> {
  const existing = getMediaSearchCacheEntry(db, provider, externalId);
  if (existing && cacheEntryHasValidFiles(paths, existing)) {
    return mediaSearchResultFromCacheRow(existing);
  }

  const remote = await fetchRemote();
  if (remote.externalId !== externalId || remote.provider !== provider) {
    throw new HttpError(502, 'Remote media id mismatch.', 'media_cache_id_mismatch');
  }

  await persistMediaSearchResultToCache(paths, db, remote);
  const row = getMediaSearchCacheEntry(db, provider, externalId);
  if (!row || !cacheEntryHasValidFiles(paths, row)) {
    throw new HttpError(
      502,
      'Could not save media to local cache.',
      'media_cache_prepare_failed',
    );
  }
  return mediaSearchResultFromCacheRow(row);
}
