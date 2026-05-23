import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import { getClipById } from '../db/repositories/clips.js';
import { assertBinaries } from '../lib/binaries.js';
import { HttpError } from '../middleware/errorHandler.js';
import { playAudio, stopActivePlayback } from '../services/audioPlayer.js';
import { publishBrowserSourceEvent } from '../services/browserSourceHub.js';
import { cutToMp3 } from '../services/ffmpeg.js';
import {
  isValidProcessId,
  readStagingMeta,
  stagingMetaExpired,
} from '../services/stagingRegistry.js';
import {
  isValidTimeString,
  timeStringToSeconds,
} from '../services/timeFormat.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLIP_SECONDS = 30;

export function playRouter(paths: AppPaths): Router {
  const router = Router();

  router.post('/stop', (_req, res) => {
    stopActivePlayback();
    res.json({ status: 'stopped' });
  });

  router.post('/test-play', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
    try {
      assertBinaries(paths);
      const body = (req.body ?? {}) as {
        process_id?: unknown;
        start_time?: unknown;
        end_time?: unknown;
        volume?: unknown;
        audio_normalize?: unknown;
      };
      const processId =
        typeof body.process_id === 'string' ? body.process_id.trim() : '';
      const startStr =
        typeof body.start_time === 'string' ? body.start_time.trim() : '';
      const endStr =
        typeof body.end_time === 'string' ? body.end_time.trim() : '';
      const volume =
        typeof body.volume === 'number' || typeof body.volume === 'string'
          ? clampVolume(Number(body.volume))
          : undefined;
      const normalizeAudio =
        body.audio_normalize === true ||
        body.audio_normalize === 1 ||
        body.audio_normalize === '1' ||
        body.audio_normalize === 'true';
      if (!isValidProcessId(processId)) {
        throw new HttpError(400, 'Invalid process_id.', 'invalid_process_id');
      }
      if (!isValidTimeString(startStr) || !isValidTimeString(endStr)) {
        throw new HttpError(
          400,
          'Invalid times (use HH:MM:SS.mmm).',
          'invalid_time',
        );
      }

      const meta = readStagingMeta(paths.mediaTemp, processId);
      if (!meta || stagingMetaExpired(meta, SEVEN_DAYS_MS)) {
        throw new HttpError(404, 'Staging not found.', 'staging_not_found');
      }
      if (!existsSync(meta.audioPath)) {
        throw new HttpError(404, 'Staging file is missing.', 'staging_file_missing');
      }

      const startSec = timeStringToSeconds(startStr);
      const endSec = timeStringToSeconds(endStr);
      if (endSec <= startSec) {
        throw new HttpError(400, 'end_time must be greater than start_time.', 'invalid_range');
      }
      if (endSec - startSec > MAX_CLIP_SECONDS + 0.001) {
        throw new HttpError(
          400,
          'The segment cannot exceed 30 seconds.',
          'clip_too_long',
        );
      }
      if (startSec < -0.001 || endSec > meta.durationSeconds + 0.05) {
        throw new HttpError(
          400,
          'Segment is outside the downloaded audio duration.',
          'out_of_bounds',
        );
      }

      const previewFile = join(paths.mediaTemp, `${processId}.preview-${Date.now()}.mp3`);
      try {
        await cutToMp3({
          ffmpegExe: paths.ffmpegExe,
          inputFile: meta.audioPath,
          outputFile: previewFile,
          startSeconds: startSec,
          durationSeconds: endSec - startSec,
          sourceDurationSeconds: meta.durationSeconds,
          normalizeAudio,
        });
      } catch {
        try {
          unlinkSync(previewFile);
        } catch {
          /* noop */
        }
        throw new HttpError(502, 'Failed to generate the segment preview.', 'preview_failed');
      }

      playAudio({
        ffplayExe: paths.ffplayExe,
        audioFile: previewFile,
        volume: volume ?? 75,
        cleanupFileOnExit: previewFile,
      });
      res.json({ status: 'playing' });
    } catch (err) {
      next(err);
    }
    })();
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
      if (row.clip_type === 'video') {
        if (!row.video_path || !existsSync(row.video_path)) {
          throw new HttpError(404, 'Video file not found.', 'video_missing');
        }
        stopActivePlayback();
        publishBrowserSourceEvent({
          type: 'play',
          mediaUrl: `/api/clips/${id}/video`,
        });
        res.json({ status: 'playing', playback: 'browser_source' });
        return;
      }
      if (!existsSync(row.audio_path)) {
        throw new HttpError(404, 'Audio file not found.', 'audio_missing');
      }
      stopActivePlayback();
      playAudio({
        ffplayExe: paths.ffplayExe,
        audioFile: row.audio_path,
        volume: row.volume,
      });
      res.json({ status: 'playing', playback: 'local' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 75;
  return Math.max(0, Math.min(300, Math.round(value)));
}

function parseClipIdParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid clip ID.', 'invalid_id');
  }
  return id;
}
