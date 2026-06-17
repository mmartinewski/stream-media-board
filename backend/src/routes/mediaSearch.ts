import { existsSync } from 'node:fs';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { resolvePaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  assertGiphySearchReady,
  getGiphyIntegrationSettings,
} from '../db/repositories/mediaSearchSettings.js';
import { parseOptionalLayoutAreaId } from '../db/repositories/layoutAreas.js';
import { getPlaybackVolume } from '../db/repositories/settings.js';
import { searchMediaSearchCache, getMediaSearchCacheEntry, getMediaSearchCacheMetadata, updateMediaSearchCacheMetadata, updateMediaSearchCacheUserTags } from '../db/repositories/mediaSearchCache.js';
import { HttpError } from '../middleware/errorHandler.js';
import { mediaGifImportMultipart } from '../middleware/multipart.js';
import {
  browserSourceClientsForEvent,
  publishBrowserSourceEvent,
  publishBrowserSourceStopAll,
} from '../services/browserSourceHub.js';
import {
  fetchGiphyGifById,
  parseGiphyAnalyticsUrl,
  parseMediaSearchExternalId,
  parseMediaSearchLimit,
  parseMediaSearchLocal,
  parseMediaSearchOptionalQuery,
  parseMediaSearchOffset,
  parseMediaSearchProvider,
  parseMediaSearchQuery,
  parseMediaSearchUserTags,
  searchGiphy,
  sendGiphyAnalyticsPingback,
} from '../services/giphyClient.js';
import {
  fetchImportMediaBuffer,
  importMediaGifToCache,
  parseImportMediaSourceUrl,
  parseImportMediaTagsField,
  parseImportMediaTitle,
} from '../services/mediaSearchImport.js';
import {
  cacheEntryHasValidFiles,
  deleteCachedMediaSearch,
  downloadMediaSearchResultToCache,
  ensureCachedMediaReadyForPlay,
  mediaSearchResultFromCacheRow,
  persistMediaSearchResultToCache,
  resolveCacheMediaContentType,
  resolveCachePreviewContentType,
  resolveCachedMediaSearchResult,
} from '../services/mediaSearchCacheStore.js';
import { resolveLayoutAreaForMediaSearch } from '../services/layoutAreaResolveMediaSearch.js';
import { deriveVideoOrientation } from '../services/videoOrientation.js';
import type { MediaSearchResult } from '../services/mediaSearchTypes.js';
import type { MediaSearchCacheRow } from '../db/repositories/mediaSearchCache.js';
import type { GiphyIntegrationSettingsPublic } from '../services/mediaSearchTypes.js';
import type { LayoutAreaDto } from '../services/layoutAreaTypes.js';

function buildMediaSearchPlayEvent(
  gif: MediaSearchResult,
  cacheRow: MediaSearchCacheRow | null,
  integration: GiphyIntegrationSettingsPublic,
  playbackVolume: number,
  layoutArea: LayoutAreaDto,
  orientation: ReturnType<typeof deriveVideoOrientation>,
) {
  const mediaKind = cacheRow?.media_kind ?? (gif.isAnimated ? 'video' : 'image');

  if (mediaKind === 'video') {
    return {
      type: 'play' as const,
      mediaKind: 'video' as const,
      mediaUrl: gif.playUrl,
      playbackVolume,
      width: gif.width,
      height: gif.height,
      orientation,
      layoutArea,
      minimumDisplaySec: integration.minimum_display_seconds,
    };
  }

  const displayDurationSec =
    gif.isAnimated
      ? integration.minimum_display_seconds
      : integration.static_display_seconds;

  return {
    type: 'play' as const,
    mediaKind: 'image' as const,
    mediaUrl: gif.playUrl,
    playbackVolume,
    width: gif.width,
    height: gif.height,
    orientation,
    layoutArea,
    displayDurationSec,
  };
}

export function mediaSearchRouter(): Router {
  const router = Router();
  const paths = resolvePaths();

  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const db = getDb(paths.databaseFile);
        const offset = parseMediaSearchOffset(req.query.offset);
        const limit = parseMediaSearchLimit(req.query.limit);
        const localOnly = parseMediaSearchLocal(req.query.local);

        if (localOnly) {
          const query = parseMediaSearchOptionalQuery(req.query.q);
          const { rows, totalCount } = searchMediaSearchCache(db, query, offset, limit);
          const results = rows
            .filter((row) => cacheEntryHasValidFiles(paths, row))
            .map((row) => mediaSearchResultFromCacheRow(row));

          res.json({
            results,
            pagination: {
              offset,
              count: results.length,
              totalCount,
            },
          });
          return;
        }

        const query = parseMediaSearchQuery(req.query.q);
        const { apiKey, rating, customerId } = assertGiphySearchReady(db);
        const result = await searchGiphy({
          apiKey,
          query,
          offset,
          limit,
          rating,
          customerId,
        });

        res.json(result);
      } catch (err) {
        next(err);
      }
    })();
  });

  router.get(
    '/cache/:provider/:external_id',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const provider = parseMediaSearchProvider(req.params.provider);
        const externalId = parseMediaSearchExternalId(provider, req.params.external_id);
        const row = getMediaSearchCacheEntry(db, provider, externalId);
        const metadata = getMediaSearchCacheMetadata(db, provider, externalId);
        if (!metadata || !row || !cacheEntryHasValidFiles(paths, row)) {
          res.json({
            provider,
            external_id: externalId,
            cached: false,
            title: null,
            provider_tags: [],
            user_tags: [],
          });
          return;
        }
        res.json({
          provider: metadata.provider,
          external_id: metadata.externalId,
          title: metadata.title,
          provider_tags: metadata.providerTags,
          user_tags: metadata.userTags,
          cached: true,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/cache', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const db = getDb(paths.databaseFile);
        const body = (req.body ?? {}) as { provider?: unknown; external_id?: unknown };
        const provider = parseMediaSearchProvider(body.provider);
        if (provider !== 'giphy') {
          throw new HttpError(400, 'Only GIPHY GIFs can be cached this way.', 'unsupported_provider');
        }
        const externalId = parseMediaSearchExternalId(provider, body.external_id);

        const cached = await downloadMediaSearchResultToCache(
          paths,
          db,
          provider,
          externalId,
          async () => {
            const { apiKey, rating, customerId } = assertGiphySearchReady(db);
            return fetchGiphyGifById({
              apiKey,
              gifId: externalId,
              rating,
              customerId,
            });
          },
        );

        res.json({
          ok: true,
          cached: true,
          result: cached,
        });
      } catch (err) {
        next(err);
      }
    })();
  });

  router.put(
    '/cache/:provider/:external_id/metadata',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const provider = parseMediaSearchProvider(req.params.provider);
        const externalId = parseMediaSearchExternalId(provider, req.params.external_id);
        const body = (req.body ?? {}) as { title?: unknown; tags?: unknown };
        const title = parseImportMediaTitle(body.title);
        const userTags = parseMediaSearchUserTags(body.tags);

        const row = getMediaSearchCacheEntry(db, provider, externalId);
        if (!row || !cacheEntryHasValidFiles(paths, row)) {
          throw new HttpError(
            404,
            'Save this GIF locally before editing metadata.',
            'media_cache_not_found',
          );
        }

        updateMediaSearchCacheMetadata(db, provider, externalId, { title, userTags });
        const metadata = getMediaSearchCacheMetadata(db, provider, externalId);
        res.json({
          ok: true,
          provider,
          external_id: externalId,
          title: metadata?.title ?? title,
          provider_tags: metadata?.providerTags ?? [],
          user_tags: metadata?.userTags ?? [],
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'media_search_cache_not_found') {
          next(new HttpError(404, 'Cached GIF not found.', 'media_cache_not_found'));
          return;
        }
        if (err instanceof Error && err.message === 'media_search_cache_title_required') {
          next(new HttpError(400, 'Title is required.', 'missing_title'));
          return;
        }
        next(err);
      }
    },
  );

  router.put(
    '/cache/:provider/:external_id/tags',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const provider = parseMediaSearchProvider(req.params.provider);
        const externalId = parseMediaSearchExternalId(provider, req.params.external_id);
        const body = (req.body ?? {}) as { tags?: unknown };
        const userTags = parseMediaSearchUserTags(body.tags);

        const row = getMediaSearchCacheEntry(db, provider, externalId);
        if (!row || !cacheEntryHasValidFiles(paths, row)) {
          throw new HttpError(
            404,
            'Save this GIF locally before editing tags.',
            'media_cache_not_found',
          );
        }

        updateMediaSearchCacheUserTags(db, provider, externalId, userTags);
        const metadata = getMediaSearchCacheMetadata(db, provider, externalId);
        res.json({
          ok: true,
          provider,
          external_id: externalId,
          provider_tags: metadata?.providerTags ?? [],
          user_tags: metadata?.userTags ?? [],
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'media_search_cache_not_found') {
          next(new HttpError(404, 'Cached GIF not found.', 'media_cache_not_found'));
          return;
        }
        next(err);
      }
    },
  );

  router.delete(
    '/cache/:provider/:external_id',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const provider = parseMediaSearchProvider(req.params.provider);
        const externalId = parseMediaSearchExternalId(provider, req.params.external_id);
        deleteCachedMediaSearch(paths, db, provider, externalId);
        res.json({ ok: true, provider, external_id: externalId });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/cache/:provider/:external_id/media',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const provider = parseMediaSearchProvider(req.params.provider);
        const externalId = parseMediaSearchExternalId(provider, req.params.external_id);
        const row = getMediaSearchCacheEntry(db, provider, externalId);
        if (!row || !cacheEntryHasValidFiles(paths, row)) {
          throw new HttpError(404, 'Cached media not found.', 'media_cache_not_found');
        }
        res.setHeader('Content-Type', resolveCacheMediaContentType(row));
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        res.sendFile(row.media_path);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/cache/:provider/:external_id/preview',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const provider = parseMediaSearchProvider(req.params.provider);
        const externalId = parseMediaSearchExternalId(provider, req.params.external_id);
        const row = getMediaSearchCacheEntry(db, provider, externalId);
        if (!row?.preview_path || !existsSync(row.preview_path)) {
          if (row && existsSync(row.media_path)) {
            res.setHeader('Content-Type', resolveCacheMediaContentType(row));
            res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
            res.sendFile(row.media_path);
            return;
          }
          throw new HttpError(404, 'Cached preview not found.', 'media_cache_preview_not_found');
        }
        res.setHeader('Content-Type', resolveCachePreviewContentType(row.preview_path));
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        res.sendFile(row.preview_path);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/import', mediaGifImportMultipart.single('file'), (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const db = getDb(paths.databaseFile);
        const fields = (req.body ?? {}) as { title?: unknown; tags?: unknown; source_url?: unknown };
        const title = parseImportMediaTitle(fields.title);
        const userTags = parseImportMediaTagsField(fields.tags);

        let buffer: Buffer;
        let mimeType: string;
        let originalName: string | undefined;

        if (req.file?.buffer?.byteLength) {
          buffer = req.file.buffer;
          mimeType = req.file.mimetype || 'image/gif';
          originalName = req.file.originalname;
        } else {
          const sourceUrl = parseImportMediaSourceUrl(fields.source_url);
          const fetched = await fetchImportMediaBuffer(sourceUrl);
          buffer = fetched.buffer;
          mimeType = fetched.mimeType;
          originalName = fetched.originalName;
        }

        const result = await importMediaGifToCache(paths, db, {
          title,
          userTags,
          buffer,
          mimeType,
          originalName,
        });

        res.json({
          ok: true,
          cached: true,
          result,
        });
      } catch (err) {
        next(err);
      }
    })();
  });

  router.post('/analytics', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const db = getDb(paths.databaseFile);
        const body = (req.body ?? {}) as { url?: unknown };
        const url = parseGiphyAnalyticsUrl(body.url);
        const { customerId } = assertGiphySearchReady(db);
        await sendGiphyAnalyticsPingback(url, customerId);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    })();
  });

  router.post('/play', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const db = getDb(paths.databaseFile);
        const body = (req.body ?? {}) as {
          provider?: unknown;
          external_id?: unknown;
          layout_area_id?: unknown;
        };

        const provider = parseMediaSearchProvider(body.provider);
        const externalId = parseMediaSearchExternalId(provider, body.external_id);
        const integration = getGiphyIntegrationSettings(db);
        const playbackVolume = getPlaybackVolume(db);

        const existingRow = getMediaSearchCacheEntry(db, provider, externalId);
        if (existingRow && cacheEntryHasValidFiles(paths, existingRow)) {
          await ensureCachedMediaReadyForPlay(paths, db, provider, externalId);
        }

        let gif = resolveCachedMediaSearchResult(paths, db, provider, externalId);
        const cached = gif !== null;
        let cacheRow = getMediaSearchCacheEntry(db, provider, externalId);

        if (!gif) {
          if (provider === 'imported') {
            throw new HttpError(404, 'Imported GIF not found.', 'media_cache_not_found');
          }

          const { apiKey, rating, customerId } = assertGiphySearchReady(db);
          const remote = await fetchGiphyGifById({
            apiKey,
            gifId: externalId,
            rating,
            customerId,
          });
          await persistMediaSearchResultToCache(paths, db, remote);
          gif = resolveCachedMediaSearchResult(paths, db, provider, externalId);
          cacheRow = getMediaSearchCacheEntry(db, provider, externalId);
          if (!gif) {
            throw new HttpError(
              502,
              'Could not prepare cached media for playback.',
              'media_cache_prepare_failed',
            );
          }
        }

        const requestedLayoutAreaId = parseOptionalLayoutAreaId(body.layout_area_id);
        const layoutArea = resolveLayoutAreaForMediaSearch(
          db,
          requestedLayoutAreaId,
          gif.width,
          gif.height,
        );
        const orientation = deriveVideoOrientation(gif.width, gif.height);

        publishBrowserSourceStopAll();

        const playEvent = buildMediaSearchPlayEvent(
          gif,
          cacheRow,
          integration,
          playbackVolume,
          layoutArea,
          orientation,
        );

        publishBrowserSourceEvent(playEvent);
        res.json({
          status: 'playing',
          playback: 'browser_source',
          connected_clients: browserSourceClientsForEvent(playEvent),
          provider,
          external_id: externalId,
          is_animated: gif.isAnimated,
          cached,
        });
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}
