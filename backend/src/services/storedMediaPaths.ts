import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Database as BetterDatabase } from 'better-sqlite3';
import type { AppPaths } from '../config/paths.js';
import { HttpError } from '../middleware/errorHandler.js';

export function mediaRoot(paths: AppPaths): string {
  return join(paths.appData, 'media');
}

/** Absolute filesystem path from a DB value (relative or legacy absolute). */
export function resolveStoredMediaPath(
  paths: AppPaths,
  stored: string | null | undefined,
): string {
  if (!stored) return '';
  if (isAbsolute(stored)) return resolve(stored);
  const normalized = stored.replace(/\\/g, '/').replace(/^\/+/, '');
  return resolve(join(paths.appData, 'media'), ...normalized.split('/'));
}

/** Relative path under `media/` for persisting in SQLite. */
export function toStoredMediaPath(paths: AppPaths, absolutePath: string): string {
  const root = resolve(mediaRoot(paths)) + sep;
  const target = resolve(absolutePath);
  if (!target.toLowerCase().startsWith(root.toLowerCase())) {
    throw new HttpError(500, 'Path is outside the media directory.', 'path_safety');
  }
  return relative(mediaRoot(paths), target).split(sep).join('/');
}

/**
 * Converts absolute (current or legacy machine) and relative values to the
 * canonical stored form: forward-slash path relative to `media/`.
 */
export function normalizeStoredMediaPath(
  paths: AppPaths,
  stored: string | null | undefined,
): string | null {
  if (stored == null || stored.trim() === '') return stored ?? null;

  const forward = stored.replace(/\\/g, '/');
  if (!isAbsolute(stored)) {
    return forward.replace(/^\/+/, '');
  }

  const resolved = resolve(stored);
  const root = resolve(mediaRoot(paths));
  const rootPrefix = `${root}${sep}`;
  if (resolved.toLowerCase().startsWith(rootPrefix.toLowerCase())) {
    return relative(root, resolved).split(sep).join('/');
  }

  // Cross-machine copy: strip any prefix through `/media/`.
  const match = forward.match(/\/media\/(.+)$/i);
  if (match?.[1]) return match[1];

  return stored;
}

export function assertStoredPathUnderDir(
  paths: AppPaths,
  allowedDir: string,
  stored: string | null | undefined,
): string {
  const absolute = resolveStoredMediaPath(paths, stored);
  if (!absolute) {
    throw new HttpError(404, 'File not found.', 'file_missing');
  }
  const base = `${resolve(allowedDir)}${sep}`;
  if (!absolute.toLowerCase().startsWith(base.toLowerCase())) {
    throw new HttpError(500, 'Path is outside the allowed directory.', 'path_safety');
  }
  return absolute;
}

function normalizeColumn(
  paths: AppPaths,
  value: string | null | undefined,
): string | null {
  if (value == null || value.trim() === '') return value ?? null;
  return normalizeStoredMediaPath(paths, value);
}

/** One-time migration: absolute / legacy paths -> relative under media/. */
export function migrateStoredMediaPaths(db: BetterDatabase, paths: AppPaths): number {
  let changes = 0;

  const clipRows = db
    .prepare(
      `SELECT id, audio_path, video_path, thumbnail_original_path, thumbnail_cropped_path FROM clips`,
    )
    .all() as Array<{
    id: number;
    audio_path: string;
    video_path: string | null;
    thumbnail_original_path: string;
    thumbnail_cropped_path: string;
  }>;

  const updateClip = db.prepare(
    `UPDATE clips SET audio_path = ?, video_path = ?, thumbnail_original_path = ?, thumbnail_cropped_path = ? WHERE id = ?`,
  );

  for (const row of clipRows) {
    const audio = normalizeColumn(paths, row.audio_path) ?? row.audio_path;
    const video = normalizeColumn(paths, row.video_path);
    const orig = normalizeColumn(paths, row.thumbnail_original_path) ?? row.thumbnail_original_path;
    const crop = normalizeColumn(paths, row.thumbnail_cropped_path) ?? row.thumbnail_cropped_path;
    if (
      audio === row.audio_path &&
      video === row.video_path &&
      orig === row.thumbnail_original_path &&
      crop === row.thumbnail_cropped_path
    ) {
      continue;
    }
    updateClip.run(audio, video, orig, crop, row.id);
    changes += 1;
  }

  const categoryRows = db
    .prepare(`SELECT id, thumbnail_original_path, thumbnail_cropped_path FROM categories`)
    .all() as Array<{
    id: number;
    thumbnail_original_path: string | null;
    thumbnail_cropped_path: string | null;
  }>;

  const updateCategory = db.prepare(
    `UPDATE categories SET thumbnail_original_path = ?, thumbnail_cropped_path = ? WHERE id = ?`,
  );

  for (const row of categoryRows) {
    const orig = normalizeColumn(paths, row.thumbnail_original_path);
    const crop = normalizeColumn(paths, row.thumbnail_cropped_path);
    if (orig === row.thumbnail_original_path && crop === row.thumbnail_cropped_path) continue;
    updateCategory.run(orig, crop, row.id);
    changes += 1;
  }

  const cacheRows = db
    .prepare(`SELECT provider, external_id, media_path, preview_path FROM media_search_cache`)
    .all() as Array<{
    provider: string;
    external_id: string;
    media_path: string;
    preview_path: string | null;
  }>;

  const updateCache = db.prepare(
    `UPDATE media_search_cache SET media_path = ?, preview_path = ? WHERE provider = ? AND external_id = ?`,
  );

  for (const row of cacheRows) {
    const media = normalizeColumn(paths, row.media_path) ?? row.media_path;
    const preview = normalizeColumn(paths, row.preview_path);
    if (media === row.media_path && preview === row.preview_path) continue;
    updateCache.run(media, preview, row.provider, row.external_id);
    changes += 1;
  }

  return changes;
}
