import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import { getCategoryById } from '../db/repositories/categories.js';
import { HttpError } from '../middleware/errorHandler.js';

export function categoryThumbnailsRouter(paths: AppPaths): Router {
  const router = Router();

  const sendThumb =
    (kind: 'original' | 'cropped') =>
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
          throw new HttpError(400, 'Invalid ID.', 'invalid_id');
        }
        const db = getDb(paths.databaseFile);
        const row = getCategoryById(db, id);
        if (!row) {
          throw new HttpError(404, 'Category not found.', 'category_not_found');
        }
        const filePath =
          kind === 'original' ? row.thumbnail_original_path : row.thumbnail_cropped_path;
        if (!filePath) {
          throw new HttpError(404, 'Thumbnail not found.', 'thumb_missing');
        }
        const resolved = resolve(filePath);
        const base = resolve(paths.mediaCategoryThumbnails);
        const rel = relative(base, resolved);
        if (rel.startsWith('..') || rel.includes('..')) {
          throw new HttpError(500, 'Invalid thumbnail path.', 'path_safety');
        }
        if (!existsSync(resolved)) {
          throw new HttpError(404, 'Thumbnail not found.', 'thumb_missing');
        }
        const mime =
          resolved.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        res.setHeader('Content-Type', mime);
        res.sendFile(resolved);
      } catch (err) {
        next(err);
      }
    };

  router.get('/:id/original', sendThumb('original'));
  router.get('/:id/cropped', sendThumb('cropped'));

  return router;
}
