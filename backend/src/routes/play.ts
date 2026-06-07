import { existsSync } from 'node:fs';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import { getClipById } from '../db/repositories/clips.js';
import { getPlaybackVolume } from '../db/repositories/settings.js';
import { assertBinaries } from '../lib/binaries.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  publishBrowserSourceEvent,
  publishBrowserSourceStopAll,
  browserSourceClientsForEvent,
} from '../services/browserSourceHub.js';
import { resolveLayoutAreaForClip } from '../services/layoutAreaResolve.js';
import { resolveClipVideoOrientation } from '../services/videoOrientation.js';

export function playRouter(paths: AppPaths): Router {
  const router = Router();

  router.post('/stop', (_req, res) => {
    publishBrowserSourceStopAll();
    res.json({ status: 'stopped', playback: 'browser_source' });
  });

  router.post('/:id/play', (req: Request, res: Response, next: NextFunction) => {
    try {
      assertBinaries(paths);
      const id = parseClipIdParam(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getClipById(db, id);
      if (!row) {
        throw new HttpError(404, 'Clip not found.', 'clip_not_found');
      }
      const playbackVolume = getPlaybackVolume(db);
      const body = (req.body ?? {}) as { layout_area_id?: unknown };
      const requestedLayoutAreaId = parseOptionalLayoutAreaId(body.layout_area_id);
      if (row.clip_type === 'video') {
        if (!row.video_path || !existsSync(row.video_path)) {
          throw new HttpError(404, 'Video file not found.', 'video_missing');
        }
        publishBrowserSourceStopAll();
        const layoutArea = resolveLayoutAreaForClip(db, row, requestedLayoutAreaId);
        const playEvent = {
          type: 'play' as const,
          mediaKind: 'video' as const,
          mediaUrl: `/api/clips/${id}/video`,
          volume: row.volume,
          playbackVolume,
          width: row.video_width ?? undefined,
          height: row.video_height ?? undefined,
          orientation: resolveClipVideoOrientation(
            row.video_orientation,
            row.video_width,
            row.video_height,
          ),
          layoutArea,
        };
        publishBrowserSourceEvent(playEvent);
        res.json({
          status: 'playing',
          playback: 'browser_source',
          connected_clients: browserSourceClientsForEvent(playEvent),
        });
        return;
      }
      if (!existsSync(row.audio_path)) {
        throw new HttpError(404, 'Audio file not found.', 'audio_missing');
      }
      publishBrowserSourceStopAll();
      const playEvent = {
        type: 'play' as const,
        mediaKind: 'audio' as const,
        mediaUrl: `/api/clips/${id}/audio`,
        volume: row.volume,
        playbackVolume,
      };
      publishBrowserSourceEvent(playEvent);
      res.json({
        status: 'playing',
        playback: 'browser_source',
        connected_clients: browserSourceClientsForEvent(playEvent),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function parseOptionalLayoutAreaId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

function parseClipIdParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid clip ID.', 'invalid_id');
  }
  return id;
}
