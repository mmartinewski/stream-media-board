import { existsSync } from 'node:fs';
import type { Database as BetterDatabase } from 'better-sqlite3';
import type { AppPaths } from '../config/paths.js';
import { getClipById } from '../db/repositories/clips.js';
import {
  getAlertMediaTrigger,
  isConfigurableAlertKind,
} from '../db/repositories/alertMediaTriggers.js';
import { getMediaSearchCacheEntry } from '../db/repositories/mediaSearchCache.js';
import { logger } from '../lib/logger.js';
import type { AlertKind } from './alertTemplates.js';
import { playClipById } from './clipPlayback.js';
import { playMediaSearchById } from './mediaSearchPlayback.js';
import {
  cacheEntryHasValidFiles,
  resolveCachedMediaSearchResult,
} from './mediaSearchCacheStore.js';
import { resolveStoredMediaPath } from './storedMediaPaths.js';

export function playAlertMediaTrigger(
  paths: AppPaths,
  db: BetterDatabase,
  alertKind: AlertKind,
): void {
  if (!isConfigurableAlertKind(alertKind)) return;

  const trigger = getAlertMediaTrigger(db, alertKind);
  if (!trigger) return;

  try {
    if (trigger.media_source === 'clip') {
      if (trigger.clip_id == null) return;
      const row = getClipById(db, trigger.clip_id);
      if (!row) {
        logger.warn('alert media trigger clip missing', {
          alertKind,
          clipId: trigger.clip_id,
        });
        return;
      }
      if (row.clip_type === 'video') {
        const videoPath = row.video_path ? resolveStoredMediaPath(paths, row.video_path) : '';
        if (!videoPath || !existsSync(videoPath)) {
          logger.warn('alert media trigger video file missing', {
            alertKind,
            clipId: trigger.clip_id,
          });
          return;
        }
      } else {
        const audioPath = resolveStoredMediaPath(paths, row.audio_path);
        if (!existsSync(audioPath)) {
          logger.warn('alert media trigger audio file missing', {
            alertKind,
            clipId: trigger.clip_id,
          });
          return;
        }
      }
      playClipById(paths, db, trigger.clip_id);
      return;
    }

    if (!trigger.gif_provider || !trigger.gif_external_id) return;

    const cacheRow = getMediaSearchCacheEntry(
      db,
      trigger.gif_provider,
      trigger.gif_external_id,
    );
    if (!cacheRow || !cacheEntryHasValidFiles(paths, cacheRow)) {
      logger.warn('alert media trigger gif missing', {
        alertKind,
        provider: trigger.gif_provider,
        externalId: trigger.gif_external_id,
      });
      return;
    }

    const gif = resolveCachedMediaSearchResult(
      paths,
      db,
      trigger.gif_provider,
      trigger.gif_external_id,
    );
    if (!gif) {
      logger.warn('alert media trigger gif not resolvable', {
        alertKind,
        provider: trigger.gif_provider,
        externalId: trigger.gif_external_id,
      });
      return;
    }

    void playMediaSearchById(
      paths,
      db,
      trigger.gif_provider,
      trigger.gif_external_id,
    ).catch((err: unknown) => {
      logger.warn('alert media trigger gif play failed', {
        alertKind,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  } catch (err) {
    logger.warn('alert media trigger play failed', {
      alertKind,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
