import { Router, type Request, type Response, type NextFunction } from 'express';
import { resolvePaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  getCategoryById,
  renameCategory,
} from '../db/repositories/categories.js';
import {
  getCategoriesForClips,
  listCategoriesWithClipCount,
} from '../db/repositories/clipCategories.js';
import { listClipsInCategory } from '../db/repositories/clips.js';
import { getPlaybackVolume } from '../db/repositories/settings.js';
import { HttpError } from '../middleware/errorHandler.js';

export function categoriesRouter(): Router {
  const router = Router();
  const paths = resolvePaths();

  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const categories = listCategoriesWithClipCount(db);
      res.json({ categories });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/clips', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseCategoryId(req.params.id);
      const db = getDb(paths.databaseFile);
      const category = getCategoryById(db, id);
      if (!category) {
        throw new HttpError(404, 'Category not found.', 'category_not_found');
      }

      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;
      const rows = listClipsInCategory(db, id, search);
      const clipIds = [...new Set(rows.map((row) => row.id))];
      const categoriesByClip = getCategoriesForClips(db, clipIds);

      const clips = rows.map((row) => ({
        id: row.id,
        title: row.title,
        clip_type: row.clip_type === 'video' ? 'video' : 'audio',
        category: { id: row.section_category_id, name: row.category_name },
        categories: categoriesByClip.get(row.id) ?? [],
        tags: row.tags ?? '',
        thumbnail_cropped_url: `/api/thumbnails/${row.id}/cropped`,
        volume: row.volume,
        audio_normalize: row.audio_normalize,
        audio_fade: row.audio_fade,
        is_favorite: row.is_favorite,
        created_at: row.created_at,
        video_orientation:
          row.clip_type === 'video'
            ? row.video_orientation === 'portrait'
              ? 'portrait'
              : 'landscape'
            : undefined,
        default_layout_area_id:
          row.clip_type === 'video' ? row.default_layout_area_id : undefined,
      }));

      res.json({
        category: { id: category.id, name: category.name },
        clips,
        playback_volume: getPlaybackVolume(db),
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseCategoryId(req.params.id);
      const body = (req.body ?? {}) as { name?: unknown };
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        throw new HttpError(400, 'Category name is required.', 'missing_category_name');
      }

      const db = getDb(paths.databaseFile);
      try {
        const updated = renameCategory(db, id, name);
        res.json({
          id: updated.id,
          name: updated.name,
          message: 'Category renamed.',
        });
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === 'Category not found.') {
            throw new HttpError(404, err.message, 'category_not_found');
          }
          if (err.message === 'Category name already exists.') {
            throw new HttpError(409, err.message, 'category_name_taken');
          }
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseCategoryId(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getCategoryById(db, id);
      if (!row) {
        throw new HttpError(404, 'Category not found.', 'category_not_found');
      }
      res.json({ id: row.id, name: row.name });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function parseCategoryId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid category ID.', 'invalid_category_id');
  }
  return id;
}
