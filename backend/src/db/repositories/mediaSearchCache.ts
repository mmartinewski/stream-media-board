import type { Database as BetterDatabase } from 'better-sqlite3';
import type {
  MediaSearchProviderId,
  MediaSearchResult,
} from '../../services/mediaSearchTypes.js';

export interface MediaSearchCacheRow {
  provider: string;
  external_id: string;
  title: string;
  search_text: string;
  tags_json: string | null;
  user_tags_json: string | null;
  media_path: string;
  preview_path: string | null;
  media_kind: 'video' | 'image';
  width: number | null;
  height: number | null;
  is_animated: number;
  source_play_url: string | null;
  source_preview_url: string | null;
  fetched_at: string;
  last_played_at: string | null;
  play_count: number;
}

export interface MediaSearchCacheUpsertInput {
  provider: MediaSearchProviderId;
  externalId: string;
  title: string;
  tags: string[];
  userTags?: string[];
  mediaPath: string;
  previewPath: string | null;
  mediaKind: 'video' | 'image';
  width: number;
  height: number;
  isAnimated: boolean;
  sourcePlayUrl: string;
  sourcePreviewUrl: string;
}

const CACHE_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS media_search_cache (
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  tags_json TEXT,
  media_path TEXT NOT NULL,
  preview_path TEXT,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('video', 'image')),
  width INTEGER,
  height INTEGER,
  is_animated INTEGER NOT NULL DEFAULT 1,
  source_play_url TEXT,
  source_preview_url TEXT,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_played_at TIMESTAMP,
  play_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, external_id)
);
CREATE INDEX IF NOT EXISTS idx_media_search_cache_search
  ON media_search_cache(search_text);
CREATE INDEX IF NOT EXISTS idx_media_search_cache_last_played
  ON media_search_cache(last_played_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_search_cache_play_count
  ON media_search_cache(play_count DESC, last_played_at DESC);
`;

export function ensureMediaSearchCacheSchema(db: BetterDatabase): void {
  db.exec(CACHE_SCHEMA_DDL);
  ensureMediaSearchCacheColumn(db, 'user_tags_json', 'TEXT');
}

function ensureMediaSearchCacheColumn(
  db: BetterDatabase,
  column: string,
  definition: string,
): void {
  const rows = db.prepare('PRAGMA table_info(media_search_cache)').all() as Array<{
    name: string;
  }>;
  if (rows.some((row) => row.name === column)) return;
  db.exec(`ALTER TABLE media_search_cache ADD COLUMN ${column} ${definition}`);
}

export function parseProviderTagsJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function buildMediaSearchText(
  title: string,
  providerTags: string[],
  userTags: string[] = [],
): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  const titlePart = title.trim().toLowerCase();
  if (titlePart) {
    seen.add(titlePart);
    parts.push(titlePart);
  }
  for (const tag of [...providerTags, ...userTags]) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    parts.push(normalized);
  }
  return parts.join(' ');
}

export function getMediaSearchCacheEntry(
  db: BetterDatabase,
  provider: MediaSearchProviderId,
  externalId: string,
): MediaSearchCacheRow | null {
  const row = db
    .prepare(
      `SELECT provider, external_id, title, search_text, tags_json, user_tags_json, media_path, preview_path,
              media_kind, width, height, is_animated, source_play_url, source_preview_url,
              fetched_at, last_played_at, play_count
       FROM media_search_cache
       WHERE provider = ? AND external_id = ?`,
    )
    .get(provider, externalId) as MediaSearchCacheRow | undefined;
  return row ?? null;
}

export function upsertMediaSearchCacheEntry(
  db: BetterDatabase,
  input: MediaSearchCacheUpsertInput,
): MediaSearchCacheRow {
  const providerTags = input.tags;
  const userTags = input.userTags ?? [];
  const searchText = buildMediaSearchText(input.title, providerTags, userTags);
  const tagsJson = providerTags.length > 0 ? JSON.stringify(providerTags) : null;
  const userTagsJson = userTags.length > 0 ? JSON.stringify(userTags) : null;

  db.prepare(
    `INSERT INTO media_search_cache (
       provider, external_id, title, search_text, tags_json, user_tags_json, media_path, preview_path,
       media_kind, width, height, is_animated, source_play_url, source_preview_url
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, external_id) DO UPDATE SET
       title = excluded.title,
       search_text = excluded.search_text,
       tags_json = excluded.tags_json,
       user_tags_json = excluded.user_tags_json,
       media_path = excluded.media_path,
       preview_path = excluded.preview_path,
       media_kind = excluded.media_kind,
       width = excluded.width,
       height = excluded.height,
       is_animated = excluded.is_animated,
       source_play_url = excluded.source_play_url,
       source_preview_url = excluded.source_preview_url,
       fetched_at = CURRENT_TIMESTAMP`,
  ).run(
    input.provider,
    input.externalId,
    input.title,
    searchText,
    tagsJson,
    userTagsJson,
    input.mediaPath,
    input.previewPath,
    input.mediaKind,
    input.width,
    input.height,
    input.isAnimated ? 1 : 0,
    input.sourcePlayUrl,
    input.sourcePreviewUrl,
  );

  const row = getMediaSearchCacheEntry(db, input.provider, input.externalId);
  if (!row) {
    throw new Error('Failed to persist media search cache entry.');
  }
  return row;
}

export function touchMediaSearchCachePlayed(
  db: BetterDatabase,
  provider: MediaSearchProviderId,
  externalId: string,
): void {
  db.prepare(
    `UPDATE media_search_cache
     SET last_played_at = CURRENT_TIMESTAMP,
         play_count = play_count + 1
     WHERE provider = ? AND external_id = ?`,
  ).run(provider, externalId);
}

export function searchMediaSearchCache(
  db: BetterDatabase,
  query: string,
  offset: number,
  limit: number,
): { rows: MediaSearchCacheRow[]; totalCount: number } {
  const normalized = query.trim().toLowerCase();
  const hasQuery = normalized.length > 0;
  const like = `%${normalized.replace(/[%_]/g, '')}%`;

  const totalRow = hasQuery
    ? (db
        .prepare(
          `SELECT COUNT(*) AS total
           FROM media_search_cache
           WHERE search_text LIKE ?`,
        )
        .get(like) as { total: number })
    : (db.prepare(`SELECT COUNT(*) AS total FROM media_search_cache`).get() as { total: number });

  const rows = hasQuery
    ? (db
        .prepare(
          `SELECT provider, external_id, title, search_text, tags_json, user_tags_json, media_path, preview_path,
                  media_kind, width, height, is_animated, source_play_url, source_preview_url,
                  fetched_at, last_played_at, play_count
           FROM media_search_cache
           WHERE search_text LIKE ?
           ORDER BY play_count DESC, COALESCE(last_played_at, fetched_at) DESC, fetched_at DESC
           LIMIT ? OFFSET ?`,
        )
        .all(like, limit, offset) as MediaSearchCacheRow[])
    : (db
        .prepare(
          `SELECT provider, external_id, title, search_text, tags_json, user_tags_json, media_path, preview_path,
                  media_kind, width, height, is_animated, source_play_url, source_preview_url,
                  fetched_at, last_played_at, play_count
           FROM media_search_cache
           ORDER BY play_count DESC, COALESCE(last_played_at, fetched_at) DESC, fetched_at DESC
           LIMIT ? OFFSET ?`,
        )
        .all(limit, offset) as MediaSearchCacheRow[]);

  return { rows, totalCount: totalRow.total };
}

export function updateMediaSearchCacheUserTags(
  db: BetterDatabase,
  provider: MediaSearchProviderId,
  externalId: string,
  userTags: string[],
): MediaSearchCacheRow {
  const row = getMediaSearchCacheEntry(db, provider, externalId);
  if (!row) {
    throw new Error('media_search_cache_not_found');
  }

  return updateMediaSearchCacheMetadata(db, provider, externalId, {
    title: row.title,
    userTags,
  });
}

export function updateMediaSearchCacheMetadata(
  db: BetterDatabase,
  provider: MediaSearchProviderId,
  externalId: string,
  input: { title: string; userTags: string[] },
): MediaSearchCacheRow {
  const row = getMediaSearchCacheEntry(db, provider, externalId);
  if (!row) {
    throw new Error('media_search_cache_not_found');
  }

  const title = input.title.trim();
  if (!title) {
    throw new Error('media_search_cache_title_required');
  }

  const providerTags = parseProviderTagsJson(row.tags_json);
  const userTags = input.userTags;
  const searchText = buildMediaSearchText(title, providerTags, userTags);
  const userTagsJson = userTags.length > 0 ? JSON.stringify(userTags) : null;

  db.prepare(
    `UPDATE media_search_cache
     SET title = ?, user_tags_json = ?, search_text = ?
     WHERE provider = ? AND external_id = ?`,
  ).run(title, userTagsJson, searchText, provider, externalId);

  const updated = getMediaSearchCacheEntry(db, provider, externalId);
  if (!updated) {
    throw new Error('Failed to update media search cache metadata.');
  }
  return updated;
}

export function deleteMediaSearchCacheEntry(
  db: BetterDatabase,
  provider: MediaSearchProviderId,
  externalId: string,
): MediaSearchCacheRow | null {
  const row = getMediaSearchCacheEntry(db, provider, externalId);
  if (!row) return null;
  db.prepare(`DELETE FROM media_search_cache WHERE provider = ? AND external_id = ?`).run(
    provider,
    externalId,
  );
  return row;
}

export function getMediaSearchCacheMetadata(
  db: BetterDatabase,
  provider: MediaSearchProviderId,
  externalId: string,
): {
  provider: MediaSearchProviderId;
  externalId: string;
  title: string;
  providerTags: string[];
  userTags: string[];
  cached: boolean;
} | null {
  const row = getMediaSearchCacheEntry(db, provider, externalId);
  if (!row) return null;
  return {
    provider,
    externalId,
    title: row.title,
    providerTags: parseProviderTagsJson(row.tags_json),
    userTags: parseProviderTagsJson(row.user_tags_json),
    cached: true,
  };
}

export function cacheRowToMediaSearchResult(
  row: MediaSearchCacheRow,
  previewUrl: string,
  playUrl: string,
): MediaSearchResult {
  return {
    provider: row.provider as MediaSearchProviderId,
    externalId: row.external_id,
    title: row.title,
    previewUrl,
    playUrl,
    width: row.width ?? 480,
    height: row.height ?? 270,
    isAnimated: row.is_animated === 1,
    cached: true,
  };
}
