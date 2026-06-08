import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  getCategoryById,
  renameCategory,
  updateCategoryThumbnails,
  type CategoryRow,
} from '../db/repositories/categories.js';
import {
  getCategoriesForClips,
  listCategoriesWithClipCount,
  type CategoryWithClipCount,
} from '../db/repositories/clipCategories.js';
import { listClipsInCategory } from '../db/repositories/clips.js';
import { getPlaybackVolume } from '../db/repositories/settings.js';
import { HttpError } from '../middleware/errorHandler.js';
import { clipMultipart } from '../middleware/multipart.js';
import {
  applyCategoryThumbnailUpdate,
  categoryThumbnailUrls,
} from '../services/categoryThumbnail.js';

export function categoriesRouter(paths: AppPaths): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const categories = listCategoriesWithClipCount(db).map(mapCategorySummary);
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
        category: mapCategoryDetail(category),
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
          ...mapCategoryDetail(updated),
          message: 'Category renamed.',
        });
      } catch (err) {
        mapCategoryMutationError(err);
      }
    } catch (err) {
      next(err);
    }
  });

  router.put(
    '/:id',
    clipMultipart.single('thumbnail'),
    (req: Request, res: Response, next: NextFunction) => {
      void (async () => {
        try {
          const id = parseCategoryId(req.params.id);
          const db = getDb(paths.databaseFile);
          const current = getCategoryById(db, id);
          if (!current) {
            throw new HttpError(404, 'Category not found.', 'category_not_found');
          }

          const body = req.body as Record<string, unknown>;
          const nameRaw = field(body, 'name');
          const cropJson = field(body, 'thumbnail_crop_meta') || undefined;
          const removeThumbnail =
            field(body, 'remove_thumbnail') === '1' ||
            field(body, 'remove_thumbnail') === 'true';
          const file = req.file;

          let row = current;

          if (nameRaw) {
            try {
              row = renameCategory(db, id, nameRaw);
            } catch (err) {
              mapCategoryMutationError(err);
            }
          }

          const hasThumbnailChange =
            removeThumbnail ||
            Boolean(file?.buffer?.length) ||
            Boolean(cropJson && current.thumbnail_original_path);

          if (hasThumbnailChange) {
            const thumbPaths = await applyCategoryThumbnailUpdate(paths, id, current, {
              thumbnailBuffer: file?.buffer,
              originalFilename: file?.originalname,
              mimeType: file?.mimetype,
              cropJson,
              removeThumbnail,
            });
            row = updateCategoryThumbnails(db, id, thumbPaths);
          }

          res.json({
            ...mapCategoryDetail(row),
            message: 'Category updated.',
          });
        } catch (err) {
          next(err);
        }
      })();
    },
  );

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseCategoryId(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getCategoryById(db, id);
      if (!row) {
        throw new HttpError(404, 'Category not found.', 'category_not_found');
      }
      res.json(mapCategoryDetail(row));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function mapCategorySummary(row: CategoryWithClipCount) {
  const urls = categoryThumbnailUrls(row.id, row);
  return {
    id: row.id,
    name: row.name,
    clip_count: row.clip_count,
    thumbnail_crop_meta: row.thumbnail_crop_meta,
    ...urls,
  };
}

function mapCategoryDetail(row: CategoryRow) {
  const urls = categoryThumbnailUrls(row.id, row);
  return {
    id: row.id,
    name: row.name,
    thumbnail_crop_meta: row.thumbnail_crop_meta,
    ...urls,
  };
}

function field(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

function parseCategoryId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid category ID.', 'invalid_category_id');
  }
  return id;
}

function mapCategoryMutationError(err: unknown): never {
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
