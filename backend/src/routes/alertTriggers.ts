import { Router, type NextFunction, type Request, type Response } from 'express';
import { resolvePaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  CONFIGURABLE_ALERT_KINDS,
  deleteAlertMediaTrigger,
  getAlertMediaTrigger,
  listAlertMediaTriggers,
  parseAlertMediaTriggerInput,
  parseConfigurableAlertKind,
  upsertAlertMediaTrigger,
} from '../db/repositories/alertMediaTriggers.js';
import { getClipById } from '../db/repositories/clips.js';
import { getMediaSearchCacheEntry } from '../db/repositories/mediaSearchCache.js';
import { HttpError } from '../middleware/errorHandler.js';
import { playAlertMediaTrigger } from '../services/alertMediaTriggerPlayback.js';
import { playClipById } from '../services/clipPlayback.js';
import { playMediaSearchById } from '../services/mediaSearchPlayback.js';
import {
  cacheEntryHasValidFiles,
  mediaSearchResultFromCacheRow,
} from '../services/mediaSearchCacheStore.js';

const ALERT_KIND_LABELS: Record<(typeof CONFIGURABLE_ALERT_KINDS)[number], string> = {
  follow: 'Novo seguidor',
  sub: 'Nova inscrição',
  sub_prime: 'Inscrição Prime',
  resub: 'Renovação de inscrição',
  gift_sub: 'Inscrição presenteada',
  gift_bomb: 'Gift bomb',
  pay_it_forward: 'Inscrição em frente',
  gift_paid_upgrade: 'Sub presenteada renovada',
  prime_paid_upgrade: 'Prime → paga',
  cheer: 'Bits',
  raid: 'Raid recebida',
  channel_points: 'Pontos de canal',
  hype_train_start: 'Hype Train',
  hype_train_level: 'Hype Train',
  hype_train_end: 'Hype Train',
};

const ALERT_KIND_ICONS: Record<(typeof CONFIGURABLE_ALERT_KINDS)[number], string> = {
  follow: '❤️',
  sub: '🎉',
  sub_prime: '⭐',
  resub: '💜',
  gift_sub: '🎁',
  gift_bomb: '🎁',
  pay_it_forward: '💜',
  gift_paid_upgrade: '💜',
  prime_paid_upgrade: '⭐',
  cheer: '💎',
  raid: '🚀',
  channel_points: '🎯',
  hype_train_start: '🚂',
  hype_train_level: '🔥',
  hype_train_end: '🎉',
};

interface ResolvedTriggerDto {
  media_source: 'clip' | 'gif';
  clip_id?: number;
  gif_provider?: string;
  gif_external_id?: string;
  title: string;
  thumbnail_url?: string;
  clip_type?: 'audio' | 'video';
  is_animated?: boolean;
  updated_at: string;
}

function resolveTriggerMetadata(
  paths: ReturnType<typeof resolvePaths>,
  db: ReturnType<typeof getDb>,
  trigger: NonNullable<ReturnType<typeof getAlertMediaTrigger>>,
): ResolvedTriggerDto | null {
  if (trigger.media_source === 'clip') {
    if (trigger.clip_id == null) return null;
    const clip = getClipById(db, trigger.clip_id);
    if (!clip) return null;
    return {
      media_source: 'clip',
      clip_id: clip.id,
      title: clip.title,
      thumbnail_url: `/api/thumbnails/${clip.id}/cropped`,
      clip_type: clip.clip_type === 'video' ? 'video' : 'audio',
      updated_at: trigger.updated_at,
    };
  }

  if (!trigger.gif_provider || !trigger.gif_external_id) return null;
  const cacheRow = getMediaSearchCacheEntry(
    db,
    trigger.gif_provider,
    trigger.gif_external_id,
  );
  if (!cacheRow || !cacheEntryHasValidFiles(paths, cacheRow)) return null;
  const gif = mediaSearchResultFromCacheRow(cacheRow);
  return {
    media_source: 'gif',
    gif_provider: trigger.gif_provider,
    gif_external_id: trigger.gif_external_id,
    title: gif.title,
    thumbnail_url: gif.previewUrl,
    is_animated: gif.isAnimated,
    updated_at: trigger.updated_at,
  };
}

export function alertTriggersRouter(): Router {
  const router = Router();
  const paths = resolvePaths();

  router.get('/', (_req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    const triggers = listAlertMediaTriggers(db);
    const triggerByKind = new Map(triggers.map((row) => [row.alert_kind, row]));

    const rows = CONFIGURABLE_ALERT_KINDS.map((kind) => {
      const triggerRow = triggerByKind.get(kind) ?? null;
      const trigger = triggerRow ? resolveTriggerMetadata(paths, db, triggerRow) : null;
      return {
        kind,
        label: ALERT_KIND_LABELS[kind],
        icon: ALERT_KIND_ICONS[kind],
        trigger,
      };
    });

    res.json({ triggers: rows });
  });

  router.put('/:kind', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const kind = parseConfigurableAlertKind(req.params.kind);
      const input = parseAlertMediaTriggerInput(req.body);

      if (input.media_source === 'clip') {
        const clip = getClipById(db, input.clip_id!);
        if (!clip) {
          throw new HttpError(404, 'Clip not found.', 'clip_not_found');
        }
      } else {
        const cacheRow = getMediaSearchCacheEntry(
          db,
          input.gif_provider!,
          input.gif_external_id!,
        );
        if (!cacheRow || !cacheEntryHasValidFiles(paths, cacheRow)) {
          throw new HttpError(404, 'GIF not found in local cache.', 'media_cache_not_found');
        }
      }

      const saved = upsertAlertMediaTrigger(db, kind, input);
      const trigger = resolveTriggerMetadata(paths, db, saved);
      res.json({
        kind,
        label: ALERT_KIND_LABELS[kind],
        icon: ALERT_KIND_ICONS[kind],
        trigger,
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:kind', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const kind = parseConfigurableAlertKind(req.params.kind);
      const removed = deleteAlertMediaTrigger(db, kind);
      if (!removed) {
        throw new HttpError(404, 'Alert trigger not found.', 'alert_trigger_not_found');
      }
      res.json({ status: 'deleted', kind });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:kind/test', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const db = getDb(paths.databaseFile);
        const kind = parseConfigurableAlertKind(req.params.kind);
        const trigger = getAlertMediaTrigger(db, kind);
        if (!trigger) {
          throw new HttpError(404, 'No media trigger configured for this alert.', 'alert_trigger_not_found');
        }

        if (trigger.media_source === 'clip') {
          if (trigger.clip_id == null) {
            throw new HttpError(404, 'Clip trigger is invalid.', 'alert_trigger_invalid');
          }
          const result = playClipById(paths, db, trigger.clip_id);
          res.json({ status: 'triggered', kind, playback: result });
          return;
        }

        if (!trigger.gif_provider || !trigger.gif_external_id) {
          throw new HttpError(404, 'GIF trigger is invalid.', 'alert_trigger_invalid');
        }

        const result = await playMediaSearchById(
          paths,
          db,
          trigger.gif_provider,
          trigger.gif_external_id,
        );
        res.json({ status: 'triggered', kind, playback: result });
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}
