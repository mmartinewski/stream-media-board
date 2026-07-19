import { Router, type Request, type Response, type NextFunction } from 'express';
import { getDb } from '../db/connection.js';
import {
  countControlDashboards,
  createControlDashboard,
  deleteControlDashboard,
  getControlDashboardById,
  listControlDashboards,
  listControlDashboardWidgets,
  replaceControlDashboardWidgets,
  updateControlDashboard,
  type ControlWidgetInput,
  type ControlWidgetType,
} from '../db/repositories/controlDashboard.js';
import { getClipById } from '../db/repositories/clips.js';
import { getMacroById } from '../db/repositories/macros.js';
import { getMediaSearchCacheEntry } from '../db/repositories/mediaSearchCache.js';
import { resolvePaths, type AppPaths } from '../config/paths.js';
import { HttpError } from '../middleware/errorHandler.js';
import { macroThumbnailUrls } from '../services/macroThumbnail.js';
import {
  cacheEntryHasValidFiles,
  mediaSearchResultFromCacheRow,
} from '../services/mediaSearchCacheStore.js';
import type { MediaSearchProviderId } from '../services/mediaSearchTypes.js';
import type { Database as BetterDatabase } from 'better-sqlite3';

const WIDGET_TYPES = new Set<ControlWidgetType>(['macro', 'clip', 'markdown', 'gif']);
const GIF_PROVIDERS = new Set<MediaSearchProviderId>(['giphy', 'imported']);

export function controlDashboardRouter(): Router {
  const router = Router();
  const paths = resolvePaths();

  router.get('/', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const dashboards = listControlDashboards(db).map((d) => ({
        id: d.id,
        name: d.name,
        columns: d.columns,
        updated_at: d.updated_at,
        created_at: d.created_at,
      }));
      res.json({ dashboards });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const body = (req.body ?? {}) as { name?: unknown };
      const name =
        typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Novo painel';
      const created = createControlDashboard(db, name);
      res.status(201).json({
        id: created.id,
        name: created.name,
        columns: created.columns,
        updated_at: created.updated_at,
        created_at: created.created_at,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseIdParam(req.params.id);
      const dashboard = getControlDashboardById(db, id);
      if (!dashboard) {
        throw new HttpError(404, 'Dashboard not found.', 'dashboard_not_found');
      }
      res.json(serializeDashboard(db, paths, dashboard));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseIdParam(req.params.id);
      const body = (req.body ?? {}) as { name?: unknown; columns?: unknown };
      const patch: { name?: string; columns?: number } = {};
      if (typeof body.name === 'string') patch.name = body.name;
      if (body.columns != null) {
        const columns = typeof body.columns === 'number' ? body.columns : Number(body.columns);
        if (!Number.isInteger(columns) || columns < 1 || columns > 24) {
          throw new HttpError(400, 'columns must be an integer between 1 and 24.', 'invalid_columns');
        }
        patch.columns = columns;
      }
      if (patch.name == null && patch.columns == null) {
        throw new HttpError(400, 'Provide name and/or columns to update.', 'empty_patch');
      }
      const updated = updateControlDashboard(db, id, patch);
      if (!updated) {
        throw new HttpError(404, 'Dashboard not found.', 'dashboard_not_found');
      }
      res.json({
        id: updated.id,
        name: updated.name,
        columns: updated.columns,
        updated_at: updated.updated_at,
        created_at: updated.created_at,
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseIdParam(req.params.id);
      if (!getControlDashboardById(db, id)) {
        throw new HttpError(404, 'Dashboard not found.', 'dashboard_not_found');
      }
      if (countControlDashboards(db) <= 1) {
        throw new HttpError(
          400,
          'Cannot delete the last dashboard.',
          'last_dashboard',
        );
      }
      deleteControlDashboard(db, id);
      res.json({ status: 'ok', id });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id/widgets', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseIdParam(req.params.id);
      const dashboard = getControlDashboardById(db, id);
      if (!dashboard) {
        throw new HttpError(404, 'Dashboard not found.', 'dashboard_not_found');
      }

      const body = (req.body ?? {}) as { widgets?: unknown };
      if (!Array.isArray(body.widgets)) {
        throw new HttpError(400, 'Body must include a "widgets" array.', 'invalid_body');
      }

      const widgets: ControlWidgetInput[] = body.widgets.map((raw, index) =>
        parseWidgetInput(raw, index),
      );
      validateWidgets(db, paths, widgets);

      replaceControlDashboardWidgets(db, dashboard.id, widgets);
      const updated = getControlDashboardById(db, dashboard.id);
      if (!updated) {
        throw new HttpError(404, 'Dashboard not found.', 'dashboard_not_found');
      }
      res.json(serializeDashboard(db, paths, updated));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function serializeDashboard(
  db: BetterDatabase,
  paths: AppPaths,
  dashboard: { id: number; name: string; columns: number; updated_at: string },
) {
  const rows = listControlDashboardWidgets(db, dashboard.id);
  return {
    id: dashboard.id,
    name: dashboard.name,
    columns: dashboard.columns,
    updated_at: dashboard.updated_at,
    widgets: rows.map((row) => mapWidget(db, paths, row)),
  };
}

function parseIdParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid dashboard id.', 'invalid_id');
  }
  return id;
}

function validateWidgets(db: BetterDatabase, paths: AppPaths, widgets: ControlWidgetInput[]): void {
  for (const widget of widgets) {
    if (widget.widget_type === 'macro') {
      if (widget.macro_id == null) {
        throw new HttpError(400, 'Macro widgets require macro_id.', 'missing_macro_id');
      }
      if (!getMacroById(db, widget.macro_id)) {
        throw new HttpError(400, `Macro ${widget.macro_id} not found.`, 'macro_not_found');
      }
    }
    if (widget.widget_type === 'clip') {
      if (widget.clip_id == null) {
        throw new HttpError(400, 'Clip widgets require clip_id.', 'missing_clip_id');
      }
      if (!getClipById(db, widget.clip_id)) {
        throw new HttpError(400, `Clip ${widget.clip_id} not found.`, 'clip_not_found');
      }
    }
    if (widget.widget_type === 'gif') {
      if (!widget.gif_provider || !widget.gif_external_id) {
        throw new HttpError(
          400,
          'GIF widgets require gif_provider and gif_external_id.',
          'missing_gif_ref',
        );
      }
      const cacheRow = getMediaSearchCacheEntry(
        db,
        widget.gif_provider as MediaSearchProviderId,
        widget.gif_external_id,
      );
      if (!cacheRow || !cacheEntryHasValidFiles(paths, cacheRow)) {
        throw new HttpError(400, 'GIF not found in local cache.', 'gif_not_found');
      }
    }
  }
}

function parseWidgetInput(raw: unknown, index: number): ControlWidgetInput {
  if (!raw || typeof raw !== 'object') {
    throw new HttpError(400, `Widget at index ${index} is invalid.`, 'invalid_widget');
  }
  const item = raw as Record<string, unknown>;
  const widgetType = item.widget_type;
  if (typeof widgetType !== 'string' || !WIDGET_TYPES.has(widgetType as ControlWidgetType)) {
    throw new HttpError(
      400,
      `Widget at index ${index} has invalid widget_type.`,
      'invalid_widget_type',
    );
  }

  const grid_x = asInt(item.grid_x, `widgets[${index}].grid_x`);
  const grid_y = asInt(item.grid_y, `widgets[${index}].grid_y`);
  const grid_w = asInt(item.grid_w, `widgets[${index}].grid_w`);
  const grid_h = asInt(item.grid_h, `widgets[${index}].grid_h`);

  if (grid_x < 0 || grid_y < 0 || grid_w < 1 || grid_h < 1 || grid_w > 12) {
    throw new HttpError(400, `Widget at index ${index} has invalid grid bounds.`, 'invalid_grid');
  }

  const gif_provider =
    typeof item.gif_provider === 'string' && item.gif_provider.trim()
      ? item.gif_provider.trim()
      : null;
  const gif_external_id =
    typeof item.gif_external_id === 'string' && item.gif_external_id.trim()
      ? item.gif_external_id.trim()
      : null;

  if (gif_provider && !GIF_PROVIDERS.has(gif_provider as MediaSearchProviderId)) {
    throw new HttpError(
      400,
      `Widget at index ${index} has invalid gif_provider.`,
      'invalid_gif_provider',
    );
  }

  return {
    widget_type: widgetType as ControlWidgetType,
    grid_x,
    grid_y,
    grid_w,
    grid_h,
    macro_id: asOptionalId(item.macro_id),
    clip_id: asOptionalId(item.clip_id),
    gif_provider,
    gif_external_id,
    markdown_body:
      typeof item.markdown_body === 'string'
        ? item.markdown_body
        : item.markdown_body == null
          ? null
          : String(item.markdown_body),
  };
}

function asInt(value: unknown, label: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) {
    throw new HttpError(400, `${label} must be an integer.`, 'invalid_grid');
  }
  return n;
}

function asOptionalId(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new HttpError(400, 'Invalid id reference.', 'invalid_id');
  }
  return n;
}

function mapWidget(
  db: BetterDatabase,
  paths: AppPaths,
  row: ReturnType<typeof listControlDashboardWidgets>[number],
) {
  const base = {
    id: row.id,
    widget_type: row.widget_type,
    grid_x: row.grid_x,
    grid_y: row.grid_y,
    grid_w: row.grid_w,
    grid_h: row.grid_h,
    macro_id: row.macro_id,
    clip_id: row.clip_id,
    gif_provider: row.gif_provider,
    gif_external_id: row.gif_external_id,
    markdown_body: row.markdown_body,
  };

  if (row.widget_type === 'macro' && row.macro_id != null) {
    const macro = getMacroById(db, row.macro_id);
    if (!macro) {
      return { ...base, macro: null };
    }
    const urls = macroThumbnailUrls(macro.id, macro);
    return {
      ...base,
      macro: {
        id: macro.id,
        name: macro.name,
        event_message: macro.event_message,
        thumbnail_cropped_url: urls.thumbnail_cropped_url,
      },
    };
  }

  if (row.widget_type === 'clip' && row.clip_id != null) {
    const clip = getClipById(db, row.clip_id);
    if (!clip) {
      return { ...base, clip: null };
    }
    return {
      ...base,
      clip: {
        id: clip.id,
        title: clip.title,
        clip_type: clip.clip_type === 'video' ? 'video' : 'audio',
        thumbnail_cropped_url: `/api/thumbnails/${clip.id}/cropped`,
      },
    };
  }

  if (row.widget_type === 'gif' && row.gif_provider && row.gif_external_id) {
    const cacheRow = getMediaSearchCacheEntry(
      db,
      row.gif_provider as MediaSearchProviderId,
      row.gif_external_id,
    );
    if (!cacheRow || !cacheEntryHasValidFiles(paths, cacheRow)) {
      return { ...base, gif: null };
    }
    const gif = mediaSearchResultFromCacheRow(cacheRow);
    return {
      ...base,
      gif: {
        provider: gif.provider,
        external_id: gif.externalId,
        title: gif.title,
        preview_url: gif.previewUrl,
        is_animated: gif.isAnimated,
      },
    };
  }

  return base;
}
