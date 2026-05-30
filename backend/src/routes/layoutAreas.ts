import { Router, type Request, type Response, type NextFunction } from 'express';
import { resolvePaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  createLayoutArea,
  deleteLayoutArea,
  getLayoutAreaById,
  getLayoutAreaIdSetting,
  listLayoutAreas,
  restoreDefaultLayoutAreas,
  setLayoutAreaIdSetting,
  updateLayoutArea,
} from '../db/repositories/layoutAreas.js';
import type { LayoutAreaInput } from '../services/layoutAreaTypes.js';
import { HttpError } from '../middleware/errorHandler.js';

export function layoutAreasRouter(): Router {
  const router = Router();
  const paths = resolvePaths();

  router.get('/', (_req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    res.json({ areas: listLayoutAreas(db) });
  });

  router.get('/settings', (_req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    res.json({
      layout_area_id_landscape: getLayoutAreaIdSetting(db, 'layout_area_id_landscape'),
      layout_area_id_portrait: getLayoutAreaIdSetting(db, 'layout_area_id_portrait'),
      areas: listLayoutAreas(db).map((a) => ({ id: a.id, name: a.name })),
    });
  });

  router.put('/settings', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const body = (req.body ?? {}) as {
        layout_area_id_landscape?: unknown;
        layout_area_id_portrait?: unknown;
      };
      if ('layout_area_id_landscape' in body) {
        setLayoutAreaIdSetting(
          db,
          'layout_area_id_landscape',
          parseNullableAreaId(body.layout_area_id_landscape),
        );
      }
      if ('layout_area_id_portrait' in body) {
        setLayoutAreaIdSetting(
          db,
          'layout_area_id_portrait',
          parseNullableAreaId(body.layout_area_id_portrait),
        );
      }
      res.json({
        layout_area_id_landscape: getLayoutAreaIdSetting(db, 'layout_area_id_landscape'),
        layout_area_id_portrait: getLayoutAreaIdSetting(db, 'layout_area_id_portrait'),
        areas: listLayoutAreas(db).map((a) => ({ id: a.id, name: a.name })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/restore-defaults', (_req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    restoreDefaultLayoutAreas(db);
    res.json({ areas: listLayoutAreas(db) });
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseAreaId(req.params.id);
      const area = getLayoutAreaById(db, id);
      if (!area) {
        throw new HttpError(404, 'Layout area not found.', 'layout_area_not_found');
      }
      res.json(area);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const area = createLayoutArea(db, parseAreaInput(req.body));
      res.status(201).json(area);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseAreaId(req.params.id);
      const area = updateLayoutArea(db, id, parseAreaInput(req.body));
      res.json(area);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseAreaId(req.params.id);
      deleteLayoutArea(db, id);
      res.json({ status: 'deleted', id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function parseAreaId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid layout area ID.', 'invalid_layout_area_id');
  }
  return id;
}

function parseNullableAreaId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid layout area ID.', 'invalid_layout_area_id');
  }
  return id;
}

function parseAreaInput(body: unknown): LayoutAreaInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (typeof raw.name !== 'string') {
    throw new HttpError(400, 'Area name is required.', 'layout_area_name_required');
  }
  return {
    name: raw.name,
    sort_order: typeof raw.sort_order === 'number' ? raw.sort_order : Number(raw.sort_order),
    anchor_vertical: raw.anchor_vertical as LayoutAreaInput['anchor_vertical'],
    anchor_horizontal: raw.anchor_horizontal as LayoutAreaInput['anchor_horizontal'],
    margin_top: Number(raw.margin_top),
    margin_right: Number(raw.margin_right),
    margin_bottom: Number(raw.margin_bottom),
    margin_left: Number(raw.margin_left),
    max_width_percent: Number(raw.max_width_percent),
    max_height_percent: Number(raw.max_height_percent),
    is_fullscreen: raw.is_fullscreen === 1 || raw.is_fullscreen === true ? 1 : 0,
  };
}
