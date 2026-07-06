import { existsSync } from 'node:fs';
import type { Database as BetterDatabase } from 'better-sqlite3';
import type { AppPaths } from '../config/paths.js';
import { getClipById } from '../db/repositories/clips.js';
import {
  getAlertMediaTrigger,
  isConfigurableAlertKind,
} from '../db/repositories/alertMediaTriggers.js';
import { getMediaSearchCacheEntry } from '../db/repositories/mediaSearchCache.js';
import { getGiphyIntegrationSettings } from '../db/repositories/mediaSearchSettings.js';
import { logger } from '../lib/logger.js';
import type { AlertKind } from './alertTemplates.js';
import { probeDurationSeconds } from './ffprobe.js';
import {
  cacheEntryHasValidFiles,
  resolveCachedMediaSearchResult,
} from './mediaSearchCacheStore.js';
import { timeStringToSeconds } from './timeFormat.js';
import { resolveStoredMediaPath } from './storedMediaPaths.js';

async function probeMediaFileDurationSec(
  paths: AppPaths,
  filePath: string,
): Promise<number | null> {
  if (!existsSync(filePath) || !existsSync(paths.ffprobeExe)) return null;
  try {
    const sec = await probeDurationSeconds(paths.ffprobeExe, filePath);
    if (!Number.isFinite(sec) || sec <= 0) return null;
    return sec;
  } catch (err) {
    logger.warn('alert media duration probe failed', {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function clipSegmentDurationSec(
  startTime: string,
  endTime: string,
): number | null {
  try {
    const sec = timeStringToSeconds(endTime) - timeStringToSeconds(startTime);
    if (!Number.isFinite(sec) || sec <= 0) return null;
    return sec;
  } catch {
    return null;
  }
}

export async function estimateAlertTriggerMediaDurationSec(
  paths: AppPaths,
  db: BetterDatabase,
  alertKind: AlertKind,
): Promise<number | null> {
  if (!isConfigurableAlertKind(alertKind)) return null;

  const trigger = getAlertMediaTrigger(db, alertKind);
  if (!trigger) return null;

  if (trigger.media_source === 'clip') {
    if (trigger.clip_id == null) return null;
    const row = getClipById(db, trigger.clip_id);
    if (!row) return null;

    const filePath =
      row.clip_type === 'video' && row.video_path
        ? resolveStoredMediaPath(paths, row.video_path)
        : resolveStoredMediaPath(paths, row.audio_path);

    const probed = await probeMediaFileDurationSec(paths, filePath);
    if (probed != null) return probed;

    return clipSegmentDurationSec(row.start_time, row.end_time);
  }

  if (!trigger.gif_provider || !trigger.gif_external_id) return null;

  const cacheRow = getMediaSearchCacheEntry(
    db,
    trigger.gif_provider,
    trigger.gif_external_id,
  );
  if (!cacheRow || !cacheEntryHasValidFiles(paths, cacheRow)) return null;

  const integration = getGiphyIntegrationSettings(db);
  const mediaKind = cacheRow.media_kind;

  if (mediaKind === 'image') {
    return cacheRow.is_animated
      ? integration.minimum_display_seconds
      : integration.static_display_seconds;
  }

  const mediaPath = resolveStoredMediaPath(paths, cacheRow.media_path);
  const probed = await probeMediaFileDurationSec(paths, mediaPath);
  const minSec = integration.minimum_display_seconds;
  if (probed != null) return Math.max(minSec, probed);

  const gif = resolveCachedMediaSearchResult(
    paths,
    db,
    trigger.gif_provider,
    trigger.gif_external_id,
  );
  if (gif?.isAnimated) return minSec;

  return minSec;
}
