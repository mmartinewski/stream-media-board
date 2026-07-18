import { existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import { getClipById } from '../db/repositories/clips.js';
import { getMacroById } from '../db/repositories/macros.js';
import { HttpError } from '../middleware/errorHandler.js';
import { assertStoredPathUnderDir } from '../services/storedMediaPaths.js';

const MAX_THUMBNAIL_BYTES = 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function sendImageFile(res: Response, resolved: string): void {
  const lower = resolved.toLowerCase();
  const mime = lower.endsWith('.png')
    ? 'image/png'
    : lower.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  // root + relative name avoids Windows absolute-path/space quirks with sendFile.
  res.sendFile(basename(resolved), { root: dirname(resolved) });
}

export function thumbnailsRouter(paths: AppPaths): Router {
  const router = Router();

  const sendClipThumb =
    (kind: 'original' | 'cropped') =>
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
          throw new HttpError(400, 'Invalid ID.', 'invalid_id');
        }
        const db = getDb(paths.databaseFile);
        const row = getClipById(db, id);
        if (!row) {
          throw new HttpError(404, 'Clip not found.', 'clip_not_found');
        }
        const stored =
          kind === 'original'
            ? row.thumbnail_original_path
            : row.thumbnail_cropped_path;
        const resolved = assertStoredPathUnderDir(paths, paths.mediaThumbnails, stored);
        if (!existsSync(resolved)) {
          throw new HttpError(404, 'Thumbnail not found.', 'thumb_missing');
        }
        sendImageFile(res, resolved);
      } catch (err) {
        next(err);
      }
    };

  // Registered before /:id/* so "m" is not parsed as a clip id.
  const sendMacroThumb =
    (kind: 'original' | 'cropped') =>
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
          throw new HttpError(400, 'Invalid ID.', 'invalid_id');
        }
        const db = getDb(paths.databaseFile);
        const row = getMacroById(db, id);
        if (!row) {
          throw new HttpError(404, 'Macro not found.', 'macro_not_found');
        }
        const stored =
          kind === 'original' ? row.thumbnail_original_path : row.thumbnail_cropped_path;
        if (!stored) {
          throw new HttpError(404, 'Thumbnail not found.', 'thumb_missing');
        }
        const resolved = assertStoredPathUnderDir(
          paths,
          paths.mediaMacroThumbnails,
          stored,
        );
        if (!existsSync(resolved)) {
          throw new HttpError(404, 'Thumbnail not found.', 'thumb_missing');
        }
        sendImageFile(res, resolved);
      } catch (err) {
        next(err);
      }
    };

  router.post('/fetch', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const body = (req.body ?? {}) as { image_url?: unknown };
        const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : '';
        if (!isValidHttpUrl(imageUrl)) {
          throw new HttpError(400, 'Invalid image URL.', 'invalid_image_url');
        }

        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new HttpError(
            502,
            `Could not load the image (${response.status}).`,
            'image_fetch_failed',
          );
        }

        const contentType = normalizeImageType(response.headers.get('content-type') ?? '');
        if (!contentType) {
          throw new HttpError(
            400,
            'Only JPEG, PNG, and WebP images are supported.',
            'invalid_image_type',
          );
        }

        const contentLength = Number(response.headers.get('content-length') ?? '0');
        if (contentLength > MAX_THUMBNAIL_BYTES) {
          throw new HttpError(400, 'Image is too large (max 1 MB).', 'image_too_large');
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_THUMBNAIL_BYTES) {
          throw new HttpError(400, 'Image is too large (max 1 MB).', 'image_too_large');
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', String(buffer.length));
        res.setHeader('Cache-Control', 'no-store');
        res.send(buffer);
      } catch (err) {
        next(err);
      }
    })();
  });

  router.get('/m/:id/original', sendMacroThumb('original'));
  router.get('/m/:id/cropped', sendMacroThumb('cropped'));
  router.get('/:id/original', sendClipThumb('original'));
  router.get('/:id/cropped', sendClipThumb('cropped'));

  return router;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeImageType(value: string): string {
  const contentType = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return ALLOWED_IMAGE_TYPES.has(contentType) ? contentType : '';
}
