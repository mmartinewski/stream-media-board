import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { copyFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AppPaths } from '../config/paths.js';
import { assertBinaries } from '../lib/binaries.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  downloadBestAudio,
  downloadBestVideo,
  getYoutubeTitle,
  isValidYoutubeUrl,
  normalizeYoutubeUrl,
  YoutubeDownloadError,
} from '../services/youtube.js';
import { probeDurationSeconds } from '../services/ffprobe.js';
import {
  newStagingProcessId,
  writeStagingMeta,
  type StagingMeta,
} from '../services/stagingRegistry.js';

const MAX_SOURCE_SECONDS = 600;
const MAX_MP3_BYTES = 50 * 1024 * 1024;
const mp3Upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MP3_BYTES,
    files: 1,
    fields: 4,
  },
});

export function prefetchRouter(paths: AppPaths): Router {
  const router = Router();

  const handler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertBinaries(paths);
      const body = (req.body ?? {}) as { youtube_url?: unknown };
      const url =
        typeof body.youtube_url === 'string' ? body.youtube_url.trim() : '';
      if (!isValidYoutubeUrl(url)) {
        throw new HttpError(400, 'Invalid YouTube URL.', 'invalid_youtube_url');
      }

      const normalizedUrl = normalizeYoutubeUrl(url);
      const processId = newStagingProcessId();
      const outputBase = join(paths.mediaTemp, processId);

      logger.info('prefetch: downloading audio', { processId, url: normalizedUrl });
      const title = await getYoutubeTitle(
        paths.ytDlpExe,
        paths.configFile,
        paths.youtubeCookiesFile,
        url,
        paths.ytDlpNodeExe,
      ).catch(() => '');
      const audioPath = await downloadBestAudio({
        ytDlpExe: paths.ytDlpExe,
        ytDlpNodeExe: paths.ytDlpNodeExe,
        ffmpegExe: paths.ffmpegExe,
        configFile: paths.configFile,
        youtubeCookiesFile: paths.youtubeCookiesFile,
        url,
        outputBase,
      });

      const response = await stageAudioFile(paths, {
        processId,
        sourceUrl: normalizedUrl,
        audioPath,
        title,
        thumbnailUrl: `/api/staging/${processId}/thumbnail`,
      });
      res.json(response);
    } catch (err) {
      if (err instanceof HttpError) {
        next(err);
        return;
      }
      if (err instanceof YoutubeDownloadError) {
        logger.error('prefetch failed', err);
        next(new HttpError(502, err.message, err.code));
        return;
      }
      logger.error('prefetch failed', err);
      next(
        new HttpError(
          502,
          'Could not download the audio (YouTube / yt-dlp).',
          'prefetch_failed',
        ),
      );
    }
  };

  router.post('/', handler);
  router.post('', handler);

  router.post('/video', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        assertBinaries(paths);
        const body = (req.body ?? {}) as { youtube_url?: unknown };
        const url =
          typeof body.youtube_url === 'string' ? body.youtube_url.trim() : '';
        if (!isValidYoutubeUrl(url)) {
          throw new HttpError(400, 'Invalid YouTube URL.', 'invalid_youtube_url');
        }

        const normalizedUrl = normalizeYoutubeUrl(url);
        const processId = newStagingProcessId();
        const outputBase = join(paths.mediaTemp, processId);

        logger.info('prefetch: downloading video', { processId, url: normalizedUrl });
        const title = await getYoutubeTitle(
          paths.ytDlpExe,
          paths.configFile,
          paths.youtubeCookiesFile,
          url,
          paths.ytDlpNodeExe,
        ).catch(() => '');
        const videoPath = await downloadBestVideo({
          ytDlpExe: paths.ytDlpExe,
          ytDlpNodeExe: paths.ytDlpNodeExe,
          ffmpegExe: paths.ffmpegExe,
          configFile: paths.configFile,
          youtubeCookiesFile: paths.youtubeCookiesFile,
          url,
          outputBase,
        });

        const response = await stageVideoFile(paths, {
          processId,
          sourceUrl: normalizedUrl,
          videoPath,
          title,
          thumbnailUrl: `/api/staging/${processId}/thumbnail`,
        });
        res.json(response);
      } catch (err) {
        if (err instanceof HttpError) {
          next(err);
          return;
        }
        if (err instanceof YoutubeDownloadError) {
          logger.error('prefetch video failed', err);
          next(new HttpError(502, err.message, err.code));
          return;
        }
        logger.error('prefetch video failed', err);
        next(
          new HttpError(
            502,
            'Could not download the video (YouTube / yt-dlp).',
            'prefetch_video_failed',
          ),
        );
      }
    })();
  });

  router.post('/mp3-url', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        assertBinaries(paths);
        const body = (req.body ?? {}) as { audio_url?: unknown };
        const url = typeof body.audio_url === 'string' ? body.audio_url.trim() : '';
        if (!isValidHttpUrl(url)) {
          throw new HttpError(400, 'Invalid MP3 URL.', 'invalid_mp3_url');
        }

        const processId = newStagingProcessId();
        const audioPath = join(paths.mediaTemp, `${processId}.mp3`);
        logger.info('prefetch: downloading mp3 url', { processId, url });
        await downloadMp3Url(url, audioPath);
        const response = await stageAudioFile(paths, {
          processId,
          sourceUrl: url,
          audioPath,
          title: filenameTitleFromUrl(url),
          thumbnailUrl: '',
        });
        res.json(response);
      } catch (err) {
        next(err);
      }
    })();
  });

  router.post(
    '/mp3-file',
    mp3Upload.single('audio'),
    (req: Request, res: Response, next: NextFunction) => {
      void (async () => {
        try {
          assertBinaries(paths);
          const file = req.file;
          if (!file?.buffer?.length) {
            throw new HttpError(400, 'MP3 file is required.', 'missing_mp3_file');
          }
          if (!isMp3Upload(file.originalname, file.mimetype)) {
            throw new HttpError(400, 'Only MP3 files are supported.', 'invalid_mp3_file');
          }

          const processId = newStagingProcessId();
          const audioPath = join(paths.mediaTemp, `${processId}.mp3`);
          writeFileSync(audioPath, file.buffer);
          const response = await stageAudioFile(paths, {
            processId,
            sourceUrl: `local-file://${file.originalname || 'audio.mp3'}`,
            audioPath,
            title: stripMp3Extension(file.originalname || ''),
            thumbnailUrl: '',
          });
          res.json(response);
        } catch (err) {
          next(err);
        }
      })();
    },
  );

  return router;
}

interface StageAudioOptions {
  processId: string;
  sourceUrl: string;
  audioPath: string;
  title: string;
  thumbnailUrl: string;
}

async function stageAudioFile(paths: AppPaths, options: StageAudioOptions) {
  const durationSeconds = await probeDurationSeconds(paths.ffprobeExe, options.audioPath);
  if (durationSeconds > MAX_SOURCE_SECONDS + 0.01) {
    try {
      unlinkSync(options.audioPath);
    } catch {
      /* noop */
    }
    throw new HttpError(
      400,
      'The source audio cannot be longer than 10 minutes.',
      'source_too_long',
    );
  }

  const meta: StagingMeta = {
    processId: options.processId,
    youtubeUrl: options.sourceUrl,
    audioPath: options.audioPath,
    durationSeconds,
    createdAt: new Date().toISOString(),
    mediaKind: 'audio',
  };
  writeStagingMeta(paths.mediaTemp, meta);

  const ext = extname(options.audioPath).replace(/^\./, '') || 'unknown';
  return {
    process_id: options.processId,
    duration_seconds: durationSeconds,
    audio_url: `/api/staging/${options.processId}/audio`,
    thumbnail_url: options.thumbnailUrl,
    source_format: ext || 'unknown',
    title: options.title,
    media_kind: 'audio' as const,
  };
}

interface StageVideoOptions {
  processId: string;
  sourceUrl: string;
  videoPath: string;
  title: string;
  thumbnailUrl: string;
}

async function stageVideoFile(paths: AppPaths, options: StageVideoOptions) {
  const durationSeconds = await probeDurationSeconds(paths.ffprobeExe, options.videoPath);
  if (durationSeconds > MAX_SOURCE_SECONDS + 0.01) {
    try {
      unlinkSync(options.videoPath);
    } catch {
      /* noop */
    }
    throw new HttpError(
      400,
      'The source video cannot be longer than 10 minutes.',
      'source_too_long',
    );
  }

  const meta: StagingMeta = {
    processId: options.processId,
    youtubeUrl: options.sourceUrl,
    audioPath: options.videoPath,
    videoPath: options.videoPath,
    durationSeconds,
    createdAt: new Date().toISOString(),
    mediaKind: 'video',
  };
  writeStagingMeta(paths.mediaTemp, meta);

  const ext = extname(options.videoPath).replace(/^\./, '') || 'mp4';
  return {
    process_id: options.processId,
    duration_seconds: durationSeconds,
    audio_url: '',
    video_url: `/api/staging/${options.processId}/video`,
    thumbnail_url: options.thumbnailUrl,
    source_format: ext || 'mp4',
    title: options.title,
    media_kind: 'video' as const,
  };
}

export async function stageExistingVideo(
  paths: AppPaths,
  videoPath: string,
  title: string,
) {
  if (!existsSync(videoPath)) {
    throw new HttpError(404, 'Video file not found.', 'video_missing');
  }
  const processId = newStagingProcessId();
  const stagingPath = join(paths.mediaTemp, `${processId}.mp4`);
  copyFileSync(videoPath, stagingPath);
  return stageVideoFile(paths, {
    processId,
    sourceUrl: `existing-clip://${title || 'clip'}`,
    videoPath: stagingPath,
    title,
    thumbnailUrl: '',
  });
}

async function downloadMp3Url(url: string, outputFile: string): Promise<void> {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    throw new HttpError(502, `Could not download MP3 (${response.status}).`, 'mp3_download_failed');
  }
  if (contentType && !contentType.toLowerCase().includes('audio')) {
    throw new HttpError(400, 'URL did not return an audio file.', 'invalid_mp3_response');
  }
  const size = Number(response.headers.get('content-length') ?? '0');
  if (size > MAX_MP3_BYTES) {
    throw new HttpError(400, 'MP3 file is too large (max 50 MB).', 'mp3_too_large');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_MP3_BYTES) {
    throw new HttpError(400, 'MP3 file is too large (max 50 MB).', 'mp3_too_large');
  }
  writeFileSync(outputFile, buffer);
}

export async function stageExistingAudio(paths: AppPaths, audioPath: string, title: string) {
  if (!existsSync(audioPath)) {
    throw new HttpError(404, 'Audio file not found.', 'audio_missing');
  }
  const processId = newStagingProcessId();
  const stagingPath = join(paths.mediaTemp, `${processId}.mp3`);
  copyFileSync(audioPath, stagingPath);
  return stageAudioFile(paths, {
    processId,
    sourceUrl: `existing-clip://${title || 'clip'}`,
    audioPath: stagingPath,
    title,
    thumbnailUrl: '',
  });
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isMp3Upload(filename: string | undefined, mimeType: string | undefined): boolean {
  const name = filename?.toLowerCase() ?? '';
  const mime = mimeType?.toLowerCase() ?? '';
  return name.endsWith('.mp3') || mime === 'audio/mpeg' || mime === 'audio/mp3';
}

function filenameTitleFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
    return stripMp3Extension(decodeURIComponent(last));
  } catch {
    return '';
  }
}

function stripMp3Extension(value: string): string {
  return value.replace(/\.mp3$/i, '').trim();
}
