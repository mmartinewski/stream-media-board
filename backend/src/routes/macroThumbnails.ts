import { existsSync } from 'node:fs';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import { getMacroById } from '../db/repositories/macros.js';
import { HttpError } from '../middleware/errorHandler.js';
import { assertStoredPathUnderDir } from '../services/storedMediaPaths.js';

export function macroThumbnailsRouter(paths: AppPaths): Router {
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
