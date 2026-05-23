import { createReadStream, existsSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { assertBinaries } from '../lib/binaries.js';
import { HttpError } from '../middleware/errorHandler.js';
import { cutToMp3, cutToMp4 } from '../services/ffmpeg.js';
import {
  guessMimeFromPath,
  isValidProcessId,
  readStagingMeta,
  stagingInputPath,
  stagingMetaExpired,
} from '../services/stagingRegistry.js';
import { isValidTimeString, timeStringToSeconds } from '../services/timeFormat.js';
import { getYoutubeThumbnailCandidates } from '../services/youtube.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLIP_SECONDS = 30;

export function stagingRouter(paths: AppPaths): Router {
  const router = Router();

  router.get('/:processId/thumbnail', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const processId = String(req.params.processId ?? '');
        if (!isValidProcessId(processId)) {
          throw new HttpError(400, 'Invalid process_id.', 'invalid_process_id');
        }
        const meta = readStagingMeta(paths.mediaTemp, processId);
        if (!meta) {
          throw new HttpError(404, 'Staging not found or expired.', 'staging_not_found');
        }
        if (stagingMetaExpired(meta, SEVEN_DAYS_MS)) {
          throw new HttpError(410, 'Staging expired.', 'staging_expired');
        }

        const image = await fetchYoutubeThumbnail(meta.youtubeUrl);
        res.setHeader('Content-Type', image.contentType);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.send(image.buffer);
      } catch (err) {
        next(err);
      }
    })();
  });

  router.get('/:processId/preview', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      let previewFile = '';
      try {
        assertBinaries(paths);
        const processId = String(req.params.processId ?? '');
        if (!isValidProcessId(processId)) {
          throw new HttpError(400, 'Invalid process_id.', 'invalid_process_id');
        }

        const startTime = typeof req.query.start_time === 'string' ? req.query.start_time.trim() : '';
        const endTime = typeof req.query.end_time === 'string' ? req.query.end_time.trim() : '';
        if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) {
          throw new HttpError(400, 'Invalid times (use HH:MM:SS.mmm).', 'invalid_time');
        }

        const meta = readStagingMeta(paths.mediaTemp, processId);
        if (!meta) {
          throw new HttpError(404, 'Staging not found or expired.', 'staging_not_found');
        }
        if (stagingMetaExpired(meta, SEVEN_DAYS_MS)) {
          throw new HttpError(410, 'Staging expired.', 'staging_expired');
        }
        const inputPath = stagingInputPath(meta);
        if (!existsSync(inputPath)) {
          throw new HttpError(404, 'Staging media file not found.', 'staging_file_missing');
        }

        const startSec = timeStringToSeconds(startTime);
        const endSec = timeStringToSeconds(endTime);
        if (endSec <= startSec) {
          throw new HttpError(400, 'end_time must be greater than start_time.', 'invalid_range');
        }
        if (endSec - startSec > MAX_CLIP_SECONDS + 0.001) {
          throw new HttpError(400, 'The segment cannot exceed 30 seconds.', 'clip_too_long');
        }
        if (startSec < -0.001 || endSec > meta.durationSeconds + 0.05) {
          throw new HttpError(
            400,
            meta.mediaKind === 'video'
              ? 'Segment is outside the downloaded video duration.'
              : 'Segment is outside the downloaded audio duration.',
            'out_of_bounds',
          );
        }

        const durationSec = endSec - startSec;
        if (meta.mediaKind === 'video') {
          previewFile = join(paths.mediaTemp, `${processId}.client-preview-${Date.now()}.mp4`);
          await cutToMp4({
            ffmpegExe: paths.ffmpegExe,
            inputFile: inputPath,
            outputFile: previewFile,
            startSeconds: startSec,
            durationSeconds: durationSec,
          });
          const stat = statSync(previewFile);
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', String(stat.size));
          res.setHeader('Cache-Control', 'no-store');
          res.on('finish', () => cleanupQuiet(previewFile));
          res.on('close', () => cleanupQuiet(previewFile));
          createReadStream(previewFile).pipe(res);
          return;
        }

        const normalizeAudio = req.query.audio_normalize === '1' || req.query.audio_normalize === 'true';
        previewFile = join(paths.mediaTemp, `${processId}.client-preview-${Date.now()}.mp3`);
        await cutToMp3({
          ffmpegExe: paths.ffmpegExe,
          inputFile: inputPath,
          outputFile: previewFile,
          startSeconds: startSec,
          durationSeconds: durationSec,
          sourceDurationSeconds: meta.durationSeconds,
          normalizeAudio,
        });

        const stat = statSync(previewFile);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', String(stat.size));
        res.setHeader('Cache-Control', 'no-store');
        res.on('finish', () => cleanupQuiet(previewFile));
        res.on('close', () => cleanupQuiet(previewFile));
        createReadStream(previewFile).pipe(res);
      } catch (err) {
        if (previewFile) cleanupQuiet(previewFile);
        next(err);
      }
    })();
  });

  router.get('/:processId/video', (req: Request, res: Response, next: NextFunction) => {
    try {
      const processId = String(req.params.processId ?? '');
      if (!isValidProcessId(processId)) {
        throw new HttpError(400, 'Invalid process_id.', 'invalid_process_id');
      }
      const meta = readStagingMeta(paths.mediaTemp, processId);
      if (!meta || meta.mediaKind !== 'video') {
        throw new HttpError(404, 'Video staging not found.', 'staging_not_found');
      }
      if (stagingMetaExpired(meta, SEVEN_DAYS_MS)) {
        throw new HttpError(410, 'Staging expired.', 'staging_expired');
      }
      const filePath = meta.videoPath ?? meta.audioPath;
      if (!existsSync(filePath)) {
        throw new HttpError(404, 'Staging video file not found.', 'staging_file_missing');
      }
      streamMediaFile(req, res, filePath);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:processId/audio', (req: Request, res: Response, next: NextFunction) => {
    try {
      const processId = String(req.params.processId ?? '');
      if (!isValidProcessId(processId)) {
        throw new HttpError(400, 'Invalid process_id.', 'invalid_process_id');
      }
      const meta = readStagingMeta(paths.mediaTemp, processId);
      if (!meta) {
        throw new HttpError(404, 'Staging not found or expired.', 'staging_not_found');
      }
      if (stagingMetaExpired(meta, SEVEN_DAYS_MS)) {
        throw new HttpError(410, 'Staging expired.', 'staging_expired');
      }
      const filePath = meta.audioPath;
      if (!existsSync(filePath)) {
        throw new HttpError(404, 'Staging audio file not found.', 'staging_file_missing');
      }
      streamMediaFile(req, res, filePath);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function streamMediaFile(req: Request, res: Response, filePath: string): void {
  const stat = statSync(filePath);
  const size = stat.size;
  const mime = guessMimeFromPath(filePath);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);

  const range = req.headers.range;
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const parts = range.replace(/bytes=/, '').split('-');
    let start = parseInt(parts[0] ?? '0', 10);
    let end = parts[1] ? parseInt(parts[1], 10) : size - 1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end) {
      throw new HttpError(416, 'Invalid range.', 'invalid_range');
    }
    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', String(chunkSize));
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.setHeader('Content-Length', String(size));
  createReadStream(filePath).pipe(res);
}

function cleanupQuiet(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    /* noop */
  }
}

async function fetchYoutubeThumbnail(youtubeUrl: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const candidates = getYoutubeThumbnailCandidates(youtubeUrl);
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || !contentType.startsWith('image/')) continue;
      const arrayBuffer = await response.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType,
      };
    } catch {
      /* try the next candidate */
    }
  }
  throw new HttpError(404, 'YouTube thumbnail not found.', 'thumbnail_not_found');
}
