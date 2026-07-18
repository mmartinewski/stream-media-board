import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppPaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  createMacro,
  deleteMacro,
  getMacroById,
  listMacros,
  updateMacro,
  updateMacroThumbnails,
  type MacroRow,
} from '../db/repositories/macros.js';
import { HttpError } from '../middleware/errorHandler.js';
import { clipMultipart } from '../middleware/multipart.js';
import {
  applyMacroThumbnailUpdate,
  deleteMacroThumbnailFiles,
  macroThumbnailUrls,
} from '../services/macroThumbnail.js';

export function macrosRouter(paths: AppPaths): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const macros = listMacros(db).map(mapMacro);
      res.json({ macros });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseMacroId(req.params.id);
      const db = getDb(paths.databaseFile);
      const row = getMacroById(db, id);
      if (!row) {
        throw new HttpError(404, 'Macro not found.', 'macro_not_found');
      }
      res.json(mapMacro(row));
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
          const body = req.body as Record<string, unknown>;
          const name = field(body, 'name');
          const eventMessage = field(body, 'event_message');
          if (!name) {
            throw new HttpError(400, 'Macro name is required.', 'missing_macro_name');
          }
          if (!eventMessage) {
            throw new HttpError(
              400,
              'Macro event message is required.',
              'missing_macro_event',
            );
          }

          const db = getDb(paths.databaseFile);
          let row: MacroRow;
          try {
            row = createMacro(db, { name, event_message: eventMessage });
          } catch (err) {
            mapMacroMutationError(err);
          }

          const file = req.file;
          const cropJson = field(body, 'thumbnail_crop_meta') || undefined;
          if (file?.buffer?.length) {
            const thumbPaths = await applyMacroThumbnailUpdate(paths, row.id, row, {
              thumbnailBuffer: file.buffer,
              originalFilename: file.originalname,
              mimeType: file.mimetype,
              cropJson,
            });
            row = updateMacroThumbnails(db, row.id, thumbPaths);
          }

          res.status(201).json(mapMacro(row));
        } catch (err) {
          next(err);
        }
      })();
    },
  );

  router.put(
    '/:id',
    clipMultipart.single('thumbnail'),
    (req: Request, res: Response, next: NextFunction) => {
      void (async () => {
        try {
          const id = parseMacroId(req.params.id);
          const db = getDb(paths.databaseFile);
          const current = getMacroById(db, id);
          if (!current) {
            throw new HttpError(404, 'Macro not found.', 'macro_not_found');
          }

          const body = req.body as Record<string, unknown>;
          const name = field(body, 'name');
          const eventMessage = field(body, 'event_message');
          if (!name) {
            throw new HttpError(400, 'Macro name is required.', 'missing_macro_name');
          }
          if (!eventMessage) {
            throw new HttpError(
              400,
              'Macro event message is required.',
              'missing_macro_event',
            );
          }

          const cropJson = field(body, 'thumbnail_crop_meta') || undefined;
          const removeThumbnail =
            field(body, 'remove_thumbnail') === '1' ||
            field(body, 'remove_thumbnail') === 'true';
          const file = req.file;

          let row: MacroRow;
          try {
            row = updateMacro(db, id, { name, event_message: eventMessage });
          } catch (err) {
            mapMacroMutationError(err);
          }

          const hasThumbnailChange =
            removeThumbnail ||
            Boolean(file?.buffer?.length) ||
            Boolean(cropJson && current.thumbnail_original_path);

          if (hasThumbnailChange) {
            const thumbPaths = await applyMacroThumbnailUpdate(paths, id, current, {
              thumbnailBuffer: file?.buffer,
              originalFilename: file?.originalname,
              mimeType: file?.mimetype,
              cropJson,
              removeThumbnail,
            });
            row = updateMacroThumbnails(db, id, thumbPaths);
          }

          res.json(mapMacro(row));
        } catch (err) {
          next(err);
        }
      })();
    },
  );

  router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseMacroId(req.params.id);
      const db = getDb(paths.databaseFile);
      const current = getMacroById(db, id);
      if (!current) {
        throw new HttpError(404, 'Macro not found.', 'macro_not_found');
      }
      deleteMacroThumbnailFiles(paths, current);
      try {
        deleteMacro(db, id);
      } catch (err) {
        mapMacroMutationError(err);
      }
      res.json({ status: 'ok', id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function mapMacro(row: MacroRow) {
  const urls = macroThumbnailUrls(row.id, row);
  return {
    id: row.id,
    name: row.name,
    event_message: row.event_message,
    sort_order: row.sort_order,
    thumbnail_crop_meta: row.thumbnail_crop_meta,
    created_at: row.created_at,
    ...urls,
  };
}

function field(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

function parseMacroId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid macro ID.', 'invalid_macro_id');
  }
  return id;
}

function mapMacroMutationError(err: unknown): never {
  if (err instanceof Error) {
    if (err.message === 'Macro not found.') {
      throw new HttpError(404, err.message, 'macro_not_found');
    }
    if (err.message === 'Macro name cannot be empty.') {
      throw new HttpError(400, err.message, 'missing_macro_name');
    }
    if (err.message === 'Macro event message cannot be empty.') {
      throw new HttpError(400, err.message, 'missing_macro_event');
    }
  }
  throw err;
}
