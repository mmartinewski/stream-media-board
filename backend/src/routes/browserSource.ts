import { existsSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  browserSourceClientCount,
  browserSourceClientCountByMode,
  publishBrowserSourceEvent,
  subscribeBrowserSource,
} from '../services/browserSourceHub.js';

const TEST_MEDIA_FILENAME = '15.0-23.0.mp4';

export function browserSourceRouter(paths: AppPaths): Router {
  const router = Router();

  router.get('/events', (req: Request, res: Response) => {
    subscribeBrowserSource(res, req.query.mode);
    req.socket.setTimeout(0);
  });

  router.get('/status', (_req, res) => {
    res.json({
      connected_clients: browserSourceClientCount(),
      clients_by_mode: browserSourceClientCountByMode(),
      test_media_filename: TEST_MEDIA_FILENAME,
      overlay_path: '/overlay/browser',
      overlay_paths: {
        universal: '/overlay/browser?mode=universal',
        landscape: '/overlay/browser?mode=landscape',
        portrait: '/overlay/browser?mode=portrait',
      },
    });
  });

  router.post('/test', (_req, res, next: NextFunction) => {
    try {
      const mediaUrl = buildMediaUrl(TEST_MEDIA_FILENAME);
      assertMediaFile(paths, TEST_MEDIA_FILENAME);
      publishBrowserSourceEvent({ type: 'play', mediaUrl });
      res.json({
        status: 'triggered',
        media_url: mediaUrl,
        connected_clients: browserSourceClientCount(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/media/:filename', (req: Request, res: Response, next: NextFunction) => {
    try {
      const filename = parseMediaFilename(req.params.filename);
      const filePath = assertMediaFile(paths, filename);
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function buildMediaUrl(filename: string): string {
  return `/api/browser-source/media/${encodeURIComponent(filename)}`;
}

function parseMediaFilename(raw: string | undefined): string {
  const filename = typeof raw === 'string' ? basename(raw.trim()) : '';
  if (!filename || filename !== raw?.trim() || !/^[\w.\-()]+$/.test(filename)) {
    throw new HttpError(400, 'Invalid media filename.', 'invalid_filename');
  }
  return filename;
}

function assertMediaFile(paths: AppPaths, filename: string): string {
  const mediaRoot = resolve(paths.mediaFiles);
  const filePath = resolve(join(mediaRoot, filename));
  if (
    filePath !== mediaRoot &&
    !filePath.startsWith(mediaRoot + sep)
  ) {
    throw new HttpError(400, 'Invalid media path.', 'invalid_path');
  }
  if (!existsSync(filePath)) {
    throw new HttpError(404, `Media file not found: ${filename}`, 'media_not_found');
  }
  return filePath;
}
