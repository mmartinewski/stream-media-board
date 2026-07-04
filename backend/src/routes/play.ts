import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import { parseOptionalLayoutAreaId } from '../db/repositories/layoutAreas.js';
import { HttpError } from '../middleware/errorHandler.js';
import { publishBrowserSourceStopAll } from '../services/browserSourceHub.js';
import { playClipById } from '../services/clipPlayback.js';

export function playRouter(paths: AppPaths): Router {
  const router = Router();

  router.post('/stop', (_req, res) => {
    publishBrowserSourceStopAll();
    res.json({ status: 'stopped', playback: 'browser_source' });
  });

  router.post('/:id/play', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseClipIdParam(req.params.id);
      const db = getDb(paths.databaseFile);
      const body = (req.body ?? {}) as { layout_area_id?: unknown };
      const requestedLayoutAreaId = parseOptionalLayoutAreaId(body.layout_area_id);
      const result = playClipById(paths, db, id, requestedLayoutAreaId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function parseClipIdParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid clip ID.', 'invalid_id');
  }
  return id;
}
