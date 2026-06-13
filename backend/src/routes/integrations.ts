import { Router, type NextFunction, type Request, type Response } from 'express';
import { resolvePaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  getGiphyIntegrationSettings,
  updateGiphyIntegrationSettings,
} from '../db/repositories/mediaSearchSettings.js';
import type { GiphyIntegrationSettingsUpdate } from '../services/mediaSearchTypes.js';

export function integrationsRouter(): Router {
  const router = Router();
  const paths = resolvePaths();

  router.get('/giphy', (_req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    res.json(getGiphyIntegrationSettings(db));
  });

  router.put('/giphy', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const body = (req.body ?? {}) as GiphyIntegrationSettingsUpdate;
      const saved = updateGiphyIntegrationSettings(db, body);
      res.json(saved);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
