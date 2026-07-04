import type { Database as BetterDatabase } from 'better-sqlite3';
import type { AppPaths } from '../config/paths.js';
import {
  assertGiphySearchReady,
  getGiphyIntegrationSettings,
} from '../db/repositories/mediaSearchSettings.js';
import { getMediaSearchCacheEntry } from '../db/repositories/mediaSearchCache.js';
import { getPlaybackVolume } from '../db/repositories/settings.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  fetchGiphyGifById,
  parseMediaSearchExternalId,
  parseMediaSearchProvider,
} from './giphyClient.js';
import {
  browserSourceClientsForEvent,
  publishBrowserSourceEvent,
  publishBrowserSourceStopAll,
  type BrowserSourcePlayEvent,
} from './browserSourceHub.js';
import { resolveLayoutAreaForMediaSearch } from './layoutAreaResolveMediaSearch.js';
import {
  cacheEntryHasValidFiles,
  ensureCachedMediaReadyForPlay,
  persistMediaSearchResultToCache,
  resolveCachedMediaSearchResult,
} from './mediaSearchCacheStore.js';
import type { MediaSearchResult } from './mediaSearchTypes.js';
import type { MediaSearchCacheRow } from '../db/repositories/mediaSearchCache.js';
import type { GiphyIntegrationSettingsPublic } from './mediaSearchTypes.js';
import type { LayoutAreaDto } from './layoutAreaTypes.js';
import { deriveVideoOrientation } from './videoOrientation.js';

export interface MediaSearchPlaybackResult {
  status: 'playing';
  playback: 'browser_source';
  connected_clients: number;
  provider: string;
  external_id: string;
  is_animated: boolean;
  cached: boolean;
}

function buildMediaSearchPlayEvent(
  gif: MediaSearchResult,
  cacheRow: MediaSearchCacheRow | null,
  integration: GiphyIntegrationSettingsPublic,
  playbackVolume: number,
  layoutArea: LayoutAreaDto,
  orientation: ReturnType<typeof deriveVideoOrientation>,
): BrowserSourcePlayEvent {
  const mediaKind = cacheRow?.media_kind ?? (gif.isAnimated ? 'video' : 'image');

  if (mediaKind === 'video') {
    return {
      type: 'play',
      mediaKind: 'video',
      mediaUrl: gif.playUrl,
      playbackVolume,
      width: gif.width,
      height: gif.height,
      orientation,
      layoutArea,
      minimumDisplaySec: integration.minimum_display_seconds,
    };
  }

  const displayDurationSec = gif.isAnimated
    ? integration.minimum_display_seconds
    : integration.static_display_seconds;

  return {
    type: 'play',
    mediaKind: 'image',
    mediaUrl: gif.playUrl,
    playbackVolume,
    width: gif.width,
    height: gif.height,
    orientation,
    layoutArea,
    displayDurationSec,
  };
}

export async function playMediaSearchById(
  paths: AppPaths,
  db: BetterDatabase,
  providerRaw: string,
  externalIdRaw: string,
  requestedLayoutAreaId?: number | null,
): Promise<MediaSearchPlaybackResult> {
  const provider = parseMediaSearchProvider(providerRaw);
  const externalId = parseMediaSearchExternalId(provider, externalIdRaw);
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

  const layoutArea = resolveLayoutAreaForMediaSearch(
    db,
    requestedLayoutAreaId ?? null,
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

  return {
    status: 'playing',
    playback: 'browser_source',
    connected_clients: browserSourceClientsForEvent(playEvent),
    provider,
    external_id: externalId,
    is_animated: gif.isAnimated,
    cached,
  };
}
