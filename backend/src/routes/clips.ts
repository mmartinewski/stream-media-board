import { existsSync } from 'node:fs';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { clipMultipart } from '../middleware/multipart.js';
import { resolvePaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  deleteClipById,
  getClipById,
  getClipWithCategoryById,
  listClipsWithCategory,
} from '../db/repositories/clips.js';
import { listCategories } from '../db/repositories/categories.js';
import { getPlaybackVolume } from '../db/repositories/settings.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  assertClipPathsBelongToApp,
  createClipFromUpload,
  deleteClipFiles,
  updateClipFromUpload,
  updateClipMetadata,
} from '../services/clipMutations.js';
import { isValidProcessId } from '../services/stagingRegistry.js';
import { isValidYoutubeUrl } from '../services/youtube.js';
import { parseVideoOrientation } from '../services/videoOrientation.js';
import { stageExistingAudio, stageExistingVideo } from './prefetch.js';

interface SectionFavorites {
  type: 'favorites';
  title: 'Favorites';
  clips: ClipDto[];
}
interface SectionCategory {
  type: 'category';
  category: { id: number | null; name: string };
  clips: ClipDto[];
}

interface ClipDto {
  id: number;
  title: string;
  clip_type: 'audio' | 'video';
  category: { id: number | null; name: string | null };
  tags: string;
  thumbnail_cropped_url: string;
  volume: number;
  audio_normalize: number;
  audio_fade: number;
  is_favorite: number;
  created_at: string;
  video_orientation?: 'landscape' | 'portrait' | null;
}

export function clipsRouter(): Router {
  const router = Router();
  const paths = resolvePaths();

  const listHandler = (req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const rows = listClipsWithCategory(db, search);

    const favorites: ClipDto[] = [];
    const byCategory = new Map<string, SectionCategory>();

    for (const row of rows) {
      const dto: ClipDto = {
        id: row.id,
        title: row.title,
        clip_type: row.clip_type === 'video' ? 'video' : 'audio',
        category: { id: row.category_id, name: row.category_name },
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
      };

      if (row.is_favorite === 1) favorites.push(dto);

      const key = row.category_name ?? '';
      const existing = byCategory.get(key);
      if (existing) {
        existing.clips.push(dto);
      } else {
        byCategory.set(key, {
          type: 'category',
          category: { id: row.category_id, name: row.category_name ?? '(uncategorized)' },
          clips: [dto],
        });
      }
    }

    const favoritesSection: SectionFavorites = {
      type: 'favorites',
      title: 'Favorites',
      clips: favorites,
    };

    const categorySections = Array.from(byCategory.values()).sort((a, b) =>
      compareCategoryName(a.category.name, b.category.name),
    );

    res.json({
      sections: [favoritesSection, ...categorySections],
      playback_volume: getPlaybackVolume(db),
    });
  };

  router.get('/', listHandler);
  router.get('', listHandler);

  router.get('/suggestions/categories', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const q = query.toLocaleLowerCase('en');
      const categories = listCategories(db)
        .filter((category) => !q || category.name.toLocaleLowerCase('en').includes(q))
        .slice(0, 10)
        .map((category) => ({ id: category.id, name: category.name }));
      res.json({ categories });
    } catch (err) {
      next(err);
    }
  });

  router.get('/suggestions/tags', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const q = query.toLocaleLowerCase('en');
      const rows = db.prepare('SELECT tags FROM clips WHERE tags IS NOT NULL AND tags <> ?').all('') as Array<{
        tags: string | null;
      }>;
      const seen = new Map<string, string>();
      for (const row of rows) {
        for (const tag of parseTags(row.tags ?? '')) {
          const key = tag.toLocaleLowerCase('en');
          if (!seen.has(key)) seen.set(key, tag);
        }
      }
      const tags = Array.from(seen.values())
        .filter((tag) => !q || tag.toLocaleLowerCase('en').includes(q))
        .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
        .slice(0, 10);
      res.json({ tags });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/',
    clipMultipart.single('thumbnail'),
    (req: Request, res: Response, next: NextFunction) => {
      void (async () => {
        try {
          const db = getDb(paths.databaseFile);
          const file = req.file;
          if (!file?.buffer?.length) {
            throw new HttpError(400, 'Thumbnail is required (<= 1 MB).', 'missing_thumbnail');
          }
          const body = req.body as Record<string, unknown>;
          const youtubeUrl = field(body, 'youtube_url');
          const startTime = field(body, 'start_time');
          const endTime = field(body, 'end_time');
          const title = field(body, 'title');
          const category = field(body, 'category');
          const tags = field(body, 'tags');
          const processId = field(body, 'process_id');
          const cropJson = field(body, 'thumbnail_crop_meta') || undefined;
          const volume = parseVolume(field(body, 'volume'));
          const audioNormalize = parseBooleanFlag(field(body, 'audio_normalize'));
          const favRaw = field(body, 'is_favorite');
          const isFavorite = favRaw === '1' || favRaw === 'true' ? 1 : 0;
          const clipType = parseClipTypeField(field(body, 'clip_type'));
          const videoOrientation = parseVideoOrientationField(body, clipType);

          if (!title) {
            throw new HttpError(400, 'Title is required.', 'missing_title');
          }
          if (!category) {
            throw new HttpError(400, 'Category is required.', 'missing_category');
          }
          if (!isValidProcessId(processId)) {
            throw new HttpError(400, 'Invalid process_id.', 'invalid_process_id');
          }
          if (!isValidSourceUrl(youtubeUrl)) {
            throw new HttpError(400, 'Invalid source URL.', 'invalid_source_url');
          }

          const id = await createClipFromUpload(db, paths, {
            title,
            youtubeUrl,
            startTime,
            endTime,
            categoryName: category,
            tags,
            processId,
            cropJson,
            isFavorite,
            volume,
            audioNormalize,
            thumbnailBuffer: file.buffer,
            originalFilename: file.originalname ?? 'thumb.jpg',
            mimeType: file.mimetype,
            clipType,
            videoOrientation,
          });
          res.status(201).json({ id, message: 'Clip created.' });
        } catch (err) {
          next(err);
        }
      })();
    },
  );

  router.get('/:id/audio', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseClipId(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getClipById(db, id);
      if (!row) {
        throw new HttpError(404, 'Clip not found.', 'clip_not_found');
      }
      if (row.clip_type === 'video') {
        throw new HttpError(400, 'This clip is a video overlay, not audio.', 'clip_is_video');
      }
      assertClipPathsBelongToApp(paths, row);
      if (!existsSync(row.audio_path)) {
        throw new HttpError(404, 'Audio file not found.', 'audio_missing');
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      const asDownload =
        req.query.download === '1' ||
        req.query.download === 'true' ||
        String(req.query.download ?? '').toLowerCase() === 'yes';
      if (asDownload) {
        res.download(row.audio_path, `${toDownloadFilename(row.title)}.mp3`);
        return;
      }
      res.sendFile(row.audio_path);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/video', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseClipId(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getClipById(db, id);
      if (!row) {
        throw new HttpError(404, 'Clip not found.', 'clip_not_found');
      }
      if (row.clip_type !== 'video') {
        throw new HttpError(400, 'This clip is not a video overlay.', 'clip_is_audio');
      }
      assertClipPathsBelongToApp(paths, row);
      if (!row.video_path || !existsSync(row.video_path)) {
        throw new HttpError(404, 'Video file not found.', 'video_missing');
      }
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      const asDownload =
        req.query.download === '1' ||
        req.query.download === 'true' ||
        String(req.query.download ?? '').toLowerCase() === 'yes';
      if (asDownload) {
        res.download(row.video_path, `${toDownloadFilename(row.title)}.mp4`);
        return;
      }
      res.sendFile(row.video_path);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseClipId(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getClipWithCategoryById(db, id);
      if (!row) {
        throw new HttpError(404, 'Clip not found.', 'clip_not_found');
      }
      res.json({
        id: row.id,
        title: row.title,
        clip_type: row.clip_type === 'video' ? 'video' : 'audio',
        youtube_url: row.youtube_url,
        start_time: row.start_time,
        end_time: row.end_time,
        category: { id: row.category_id, name: row.category_name },
        tags: row.tags ?? '',
        thumbnail_crop_meta: row.thumbnail_crop_meta,
        thumbnail_original_url: `/api/thumbnails/${row.id}/original`,
        thumbnail_cropped_url: `/api/thumbnails/${row.id}/cropped`,
        volume: row.volume,
        audio_normalize: row.audio_normalize,
        audio_fade: row.audio_fade,
        is_favorite: row.is_favorite,
        created_at: row.created_at,
        video_width: row.video_width,
        video_height: row.video_height,
        video_orientation: row.video_orientation,
      });
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
          const id = parseClipId(req.params.id);
          const db = getDb(paths.databaseFile);
          const body = req.body as Record<string, unknown>;
          const youtubeUrl = field(body, 'youtube_url');
          const startTime = field(body, 'start_time');
          const endTime = field(body, 'end_time');
          const title = field(body, 'title');
          const category = field(body, 'category');
          const tags = field(body, 'tags');
          const processId = field(body, 'process_id');
          const cropJson = field(body, 'thumbnail_crop_meta') || undefined;
          const volume = parseVolume(field(body, 'volume'));
          const audioNormalize = parseBooleanFlag(field(body, 'audio_normalize'));
          const favRaw = field(body, 'is_favorite');
          const isFavorite = favRaw === '1' || favRaw === 'true' ? 1 : 0;
          const clipType = parseClipTypeField(field(body, 'clip_type'));
          const videoOrientation = parseVideoOrientationField(body, clipType);
          const file = req.file;

          if (!title) {
            throw new HttpError(400, 'Title is required.', 'missing_title');
          }
          if (!category) {
            throw new HttpError(400, 'Category is required.', 'missing_category');
          }
          if (!isValidProcessId(processId)) {
            throw new HttpError(400, 'Invalid process_id.', 'invalid_process_id');
          }
          if (!isValidSourceUrl(youtubeUrl)) {
            throw new HttpError(400, 'Invalid source URL.', 'invalid_source_url');
          }

          await updateClipFromUpload(db, paths, id, {
            title,
            youtubeUrl,
            startTime,
            endTime,
            categoryName: category,
            tags,
            processId,
            cropJson,
            isFavorite,
            volume,
            audioNormalize,
            thumbnailBuffer: file?.buffer,
            originalFilename: file?.originalname,
            mimeType: file?.mimetype,
            clipType,
            videoOrientation,
          });
          res.json({ id, message: 'Clip updated.' });
        } catch (err) {
          next(err);
        }
      })();
    },
  );

  router.patch('/:id/metadata', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseClipId(req.params.id);
      const db = getDb(paths.databaseFile);
      const body = (req.body ?? {}) as {
        title?: unknown;
        category?: unknown;
        tags?: unknown;
      };
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const category = typeof body.category === 'string' ? body.category.trim() : '';
      const tags = typeof body.tags === 'string' ? body.tags : '';
      updateClipMetadata(db, id, { title, categoryName: category, tags });
      res.json({ id, message: 'Metadata updated.' });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/volume', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseClipId(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getClipById(db, id);
      if (!row) {
        throw new HttpError(404, 'Clip not found.', 'clip_not_found');
      }
      const body = (req.body ?? {}) as { volume?: unknown };
      if (typeof body.volume !== 'number' && typeof body.volume !== 'string') {
        throw new HttpError(400, 'Invalid volume (0 to 300).', 'invalid_volume');
      }
      const volume = parseVolume(String(body.volume));
      db.prepare('UPDATE clips SET volume = ? WHERE id = ?').run(volume, id);
      res.json({ id, volume });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/favorite', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseClipId(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getClipById(db, id);
      if (!row) {
        throw new HttpError(404, 'Clip not found.', 'clip_not_found');
      }
      const body = (req.body ?? {}) as { is_favorite?: unknown };
      const requested =
        body.is_favorite === undefined
          ? row.is_favorite === 1 ? 0 : 1
          : parseBooleanish(body.is_favorite) ? 1 : 0;
      db.prepare('UPDATE clips SET is_favorite = ? WHERE id = ?').run(requested, id);
      res.json({ id, is_favorite: requested });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/stage-audio', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const id = parseClipId(req.params.id);
        const db = getDb(paths.databaseFile);
        const row = getClipById(db, id);
        if (!row) {
          throw new HttpError(404, 'Clip not found.', 'clip_not_found');
        }
        if (row.clip_type === 'video') {
          throw new HttpError(400, 'Use stage-video for video clips.', 'clip_is_video');
        }
        assertClipPathsBelongToApp(paths, row);
        const response = await stageExistingAudio(paths, row.audio_path, row.title);
        res.json(response);
      } catch (err) {
        next(err);
      }
    })();
  });

  router.post('/:id/stage-video', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const id = parseClipId(req.params.id);
        const db = getDb(paths.databaseFile);
        const row = getClipById(db, id);
        if (!row) {
          throw new HttpError(404, 'Clip not found.', 'clip_not_found');
        }
        if (row.clip_type !== 'video' || !row.video_path) {
          throw new HttpError(400, 'Clip is not a video overlay.', 'clip_is_audio');
        }
        assertClipPathsBelongToApp(paths, row);
        const response = await stageExistingVideo(paths, row.video_path, row.title);
        res.json(response);
      } catch (err) {
        next(err);
      }
    })();
  });

  router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseClipId(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getClipById(db, id);
      if (!row) {
        throw new HttpError(404, 'Clip not found.', 'clip_not_found');
      }
      assertClipPathsBelongToApp(paths, row);
      deleteClipFiles(row);
      deleteClipById(db, id);
      res.json({ status: 'deleted', id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function field(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function parseClipId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid clip ID.', 'invalid_id');
  }
  return id;
}

function compareCategoryName(a: string, b: string): number {
  try {
    return a.localeCompare(b, 'en', { sensitivity: 'base' });
  } catch {
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  }
}

function parseVolume(raw: string): number {
  if (!raw) return 75;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new HttpError(400, 'Invalid volume (0 to 300).', 'invalid_volume');
  }
  return Math.max(0, Math.min(300, Math.round(value)));
}

function parseBooleanFlag(raw: string): boolean {
  return raw === '1' || raw.toLowerCase() === 'true';
}

function parseBooleanish(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return parseBooleanFlag(value);
  return false;
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[,\n;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseClipTypeField(raw: string): 'audio' | 'video' {
  return raw === 'video' ? 'video' : 'audio';
}

function parseVideoOrientationField(
  body: Record<string, unknown>,
  clipType: 'audio' | 'video',
): string | undefined {
  if (clipType !== 'video') return undefined;
  const raw = field(body, 'video_orientation');
  if (!raw) return undefined;
  const parsed = parseVideoOrientation(raw);
  if (!parsed) {
    throw new HttpError(400, 'Invalid video orientation.', 'invalid_video_orientation');
  }
  return parsed;
}

function isValidSourceUrl(value: string): boolean {
  if (!value) return false;
  if (isValidYoutubeUrl(value)) return true;
  if (value.startsWith('local-file://')) return true;
  if (value.startsWith('existing-clip://')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function toDownloadFilename(title: string): string {
  const safe = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return safe || 'clip';
}
