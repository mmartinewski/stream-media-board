import { writeFileSync, unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { resolvePaths, type AppPaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  createTodoColumn,
  createTodoGroup,
  createTodoItem,
  createTodoList,
  deleteTodoColumn,
  deleteTodoGroup,
  deleteTodoItem,
  deleteTodoList,
  getTodoBackgroundFile,
  getTodoGroupRow,
  getTodoItemRow,
  getTodoListById,
  getTodoListOverlayDto,
  getTodoThumbnailFile,
  listTodoListsSummary,
  setTodoGroupThumbnailPath,
  setTodoItemThumbnailPath,
  setTodoListBackgroundPath,
  updateTodoColumn,
  updateTodoGroup,
  updateTodoItem,
  updateTodoList,
} from '../db/repositories/todoLists.js';
import { HttpError } from '../middleware/errorHandler.js';
import { todoBackgroundMultipart, todoThumbMultipart } from '../middleware/multipart.js';
import {
  getActiveTodoListId,
  publishBrowserSourceTodoHide,
  publishBrowserSourceTodoShow,
  publishBrowserSourceTodoSync,
} from '../services/browserSourceHub.js';
import {
  parseCssColor,
  parseDurationMs,
  parseListName,
  parseFontFamily,
  parseOpacityPercent,
  parseBackgroundMode,
  parsePanelAnchorVertical,
  parsePanelAnchorHorizontal,
  parseVisibleFlag,
  parsePercent,
  parseTodoAnimation,
  parseTodoFontSize,
  type TodoColumnInput,
  type TodoGroupInput,
  type TodoItemInput,
  type TodoListInput,
} from '../services/todoListTypes.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export function todoListsRouter(): Router {
  const router = Router();
  const paths = resolvePaths();

  router.get('/', (_req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    res.json({
      lists: listTodoListsSummary(db),
      active_todo_list_id: getActiveTodoListId(),
    });
  });

  router.post('/hide', (_req: Request, res: Response) => {
    if (getActiveTodoListId() == null) {
      res.json({ status: 'idle', active_todo_list_id: null });
      return;
    }
    publishBrowserSourceTodoHide();
    res.json({ status: 'hidden', active_todo_list_id: null });
  });

  router.get('/thumbnails/:entityId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const entityId = parseId(req.params.entityId);
      const kind = parseThumbnailKind(req.query.kind);
      const filePath = getTodoThumbnailFile(db, paths, entityId, kind);
      if (!filePath) {
        throw new HttpError(404, 'Thumbnail not found.', 'thumbnail_not_found');
      }
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const list = createTodoList(db, parseListInput(req.body));
      res.status(201).json(list);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/background', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseId(req.params.id);
      const filePath = getTodoBackgroundFile(db, paths, id);
      if (!filePath) {
        throw new HttpError(404, 'Background not found.', 'background_not_found');
      }
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/:id/background',
    todoBackgroundMultipart.single('background'),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const id = parseId(req.params.id);
        const file = req.file;
        if (!file) {
          throw new HttpError(400, 'Background image required (<= 2 MB).', 'missing_background');
        }
        const listRow = getTodoListById(db, id);
        if (!listRow) {
          throw new HttpError(404, 'Checklist not found.', 'todo_list_not_found');
        }
        const existing = getTodoBackgroundFile(db, paths, id);
        if (existing) {
          try {
            unlinkSync(existing);
          } catch {
            /* ignore */
          }
        }
        const filename = saveTodoBackgroundFile(paths, id, file.buffer, file.originalname);
        setTodoListBackgroundPath(db, id, filename);
        const list = getTodoListById(db, id);
        syncIfActive(db, id);
        res.json(list);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/:id/background', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseId(req.params.id);
      const existing = getTodoBackgroundFile(db, paths, id);
      if (existing) {
        try {
          unlinkSync(existing);
        } catch {
          /* ignore */
        }
      }
      setTodoListBackgroundPath(db, id, null);
      const list = getTodoListById(db, id);
      syncIfActive(db, id);
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/:listId/groups/:groupId/thumbnail',
    todoThumbMultipart.single('thumbnail'),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const listId = parseId(req.params.listId);
        const groupId = parseId(req.params.groupId);
        const file = req.file;
        if (!file) {
          throw new HttpError(400, 'Thumbnail required (<= 1 MB).', 'missing_thumbnail');
        }
        const row = getTodoGroupRow(db, listId, groupId);
        removeStoredFile(paths.mediaTodoThumbnails, row.thumbnail_path);
        const filename = saveTodoThumbnailFile(paths, 'group', groupId, file.buffer, file.originalname);
        const group = setTodoGroupThumbnailPath(db, listId, groupId, filename);
        syncIfActive(db, listId);
        res.json(group);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/:listId/groups/:groupId/thumbnail',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const listId = parseId(req.params.listId);
        const groupId = parseId(req.params.groupId);
        const row = getTodoGroupRow(db, listId, groupId);
        removeStoredFile(paths.mediaTodoThumbnails, row.thumbnail_path);
        const group = setTodoGroupThumbnailPath(db, listId, groupId, null);
        syncIfActive(db, listId);
        res.json(group);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/:listId/items/:itemId/thumbnail',
    todoThumbMultipart.single('thumbnail'),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const listId = parseId(req.params.listId);
        const itemId = parseId(req.params.itemId);
        const file = req.file;
        if (!file) {
          throw new HttpError(400, 'Thumbnail required (<= 1 MB).', 'missing_thumbnail');
        }
        const row = getTodoItemRow(db, listId, itemId);
        removeStoredFile(paths.mediaTodoThumbnails, row.thumbnail_path);
        const filename = saveTodoThumbnailFile(paths, 'item', itemId, file.buffer, file.originalname);
        const item = setTodoItemThumbnailPath(db, listId, itemId, filename);
        syncIfActive(db, listId);
        res.json(item);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/:listId/items/:itemId/thumbnail',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const listId = parseId(req.params.listId);
        const itemId = parseId(req.params.itemId);
        const row = getTodoItemRow(db, listId, itemId);
        removeStoredFile(paths.mediaTodoThumbnails, row.thumbnail_path);
        const item = setTodoItemThumbnailPath(db, listId, itemId, null);
        syncIfActive(db, listId);
        res.json(item);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/:id/show', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseId(req.params.id);
      const list = getTodoListOverlayDto(db, id);
      if (!list) {
        throw new HttpError(404, 'Checklist not found.', 'todo_list_not_found');
      }
      if (getActiveTodoListId() === id) {
        res.json({ status: 'already_shown', active_todo_list_id: id, list });
        return;
      }
      publishBrowserSourceTodoShow(list);
      res.json({ status: 'shown', active_todo_list_id: id, list });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseId(req.params.id);
      const list = getTodoListById(db, id);
      if (!list) {
        throw new HttpError(404, 'Checklist not found.', 'todo_list_not_found');
      }
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseId(req.params.id);
      const list = updateTodoList(db, id, parseListInput(req.body));
      syncIfActive(db, id);
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parseId(req.params.id);
      if (getActiveTodoListId() === id) {
        publishBrowserSourceTodoHide();
      }
      deleteTodoList(db, paths, id);
      res.json({ status: 'deleted', id });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/groups', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const listId = parseId(req.params.id);
      const group = createTodoGroup(db, listId, parseGroupInput(req.body));
      syncIfActive(db, listId);
      res.status(201).json(group);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/columns', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const listId = parseId(req.params.id);
      const column = createTodoColumn(db, listId, parseColumnInput(req.body));
      syncIfActive(db, listId);
      res.status(201).json(column);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:listId/columns/:columnId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const listId = parseId(req.params.listId);
      const columnId = parseId(req.params.columnId);
      const column = updateTodoColumn(db, listId, columnId, parseColumnInput(req.body));
      syncIfActive(db, listId);
      res.json(column);
    } catch (err) {
      next(err);
    }
  });

  router.delete(
    '/:listId/columns/:columnId',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const listId = parseId(req.params.listId);
        const columnId = parseId(req.params.columnId);
        deleteTodoColumn(db, paths, listId, columnId);
        syncIfActive(db, listId);
        res.json({ status: 'deleted', id: columnId });
      } catch (err) {
        next(err);
      }
    },
  );

  router.put('/:listId/groups/:groupId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const listId = parseId(req.params.listId);
      const groupId = parseId(req.params.groupId);
      const group = updateTodoGroup(db, listId, groupId, parseGroupInput(req.body));
      syncIfActive(db, listId);
      res.json(group);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:listId/groups/:groupId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const listId = parseId(req.params.listId);
      const groupId = parseId(req.params.groupId);
      deleteTodoGroup(db, paths, listId, groupId);
      syncIfActive(db, listId);
      res.json({ status: 'deleted', id: groupId });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/:listId/groups/:groupId/items',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDb(paths.databaseFile);
        const listId = parseId(req.params.listId);
        const groupId = parseId(req.params.groupId);
        const item = createTodoItem(db, listId, groupId, parseItemInput(req.body));
        syncIfActive(db, listId);
        res.status(201).json(item);
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch('/:listId/items/:itemId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const listId = parseId(req.params.listId);
      const itemId = parseId(req.params.itemId);
      const { item } = updateTodoItem(db, listId, itemId, parseItemInput(req.body));
      syncIfActive(db, listId);
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:listId/items/:itemId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const listId = parseId(req.params.listId);
      const itemId = parseId(req.params.itemId);
      deleteTodoItem(db, paths, listId, itemId);
      syncIfActive(db, listId);
      res.json({ status: 'deleted', id: itemId });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function syncIfActive(db: ReturnType<typeof getDb>, listId: number): void {
  if (getActiveTodoListId() !== listId) return;
  const list = getTodoListOverlayDto(db, listId);
  if (list) {
    publishBrowserSourceTodoSync(list);
  }
}

function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid id.', 'invalid_id');
  }
  return id;
}

function parseThumbnailKind(raw: unknown): 'group' | 'item' {
  if (raw === 'group' || raw === 'item') return raw;
  throw new HttpError(400, 'Invalid thumbnail kind.', 'invalid_kind');
}

function parseListInput(body: unknown): TodoListInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const input: TodoListInput = {
    title: typeof b.title === 'string' ? b.title : '',
  };
  if (b.name !== undefined) {
    input.name = parseListName(b.name, '');
  }
  if (typeof b.sort_order === 'number') input.sort_order = b.sort_order;
  if (b.font_family !== undefined) {
    input.font_family = parseFontFamily(b.font_family, 'system-ui, sans-serif');
  }
  if (b.font_size !== undefined) {
    input.font_size = parseTodoFontSize(b.font_size, 'medium');
  }
  if (b.color_title !== undefined) input.color_title = parseCssColor(b.color_title, '#ffffff');
  if (b.color_group !== undefined) input.color_group = parseCssColor(b.color_group, '#e2e8f0');
  if (b.color_item !== undefined) input.color_item = parseCssColor(b.color_item, '#f8fafc');
  if (b.enter_animation !== undefined) {
    input.enter_animation = parseTodoAnimation(b.enter_animation, 'fade');
  }
  if (b.exit_animation !== undefined) {
    input.exit_animation = parseTodoAnimation(b.exit_animation, 'fade');
  }
  if (b.animation_duration_ms !== undefined) {
    input.animation_duration_ms = parseDurationMs(b.animation_duration_ms, 400);
  }
  if (b.panel_width_percent !== undefined) {
    input.panel_width_percent = parsePercent(b.panel_width_percent, 80);
  }
  if (b.panel_max_height_percent !== undefined) {
    input.panel_max_height_percent = parsePercent(b.panel_max_height_percent, 90);
  }
  if (b.background_opacity_percent !== undefined) {
    input.background_opacity_percent = parseOpacityPercent(b.background_opacity_percent, 45);
  }
  if (b.background_mode !== undefined) {
    input.background_mode = parseBackgroundMode(b.background_mode, 'image');
  }
  if (b.background_color !== undefined) {
    input.background_color = parseCssColor(b.background_color, '#000000');
  }
  if (b.panel_anchor_vertical !== undefined) {
    input.panel_anchor_vertical = parsePanelAnchorVertical(b.panel_anchor_vertical, 'top');
  }
  if (b.panel_anchor_horizontal !== undefined) {
    input.panel_anchor_horizontal = parsePanelAnchorHorizontal(b.panel_anchor_horizontal, 'left');
  }
  return input;
}

function parseColumnInput(body: unknown): TodoColumnInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const input: TodoColumnInput = {};
  if (typeof b.sort_order === 'number') input.sort_order = b.sort_order;
  if (b.visible !== undefined) input.visible = parseVisibleFlag(b.visible, true);
  return input;
}

function parseGroupInput(body: unknown): TodoGroupInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const input: TodoGroupInput = {};
  if (typeof b.title === 'string') input.title = b.title;
  if (typeof b.sort_order === 'number') input.sort_order = b.sort_order;
  if (typeof b.column_id === 'number') input.column_id = b.column_id;
  if (b.visible !== undefined) input.visible = parseVisibleFlag(b.visible, true);
  return input;
}

function parseItemInput(body: unknown): TodoItemInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const input: TodoItemInput = {};
  if (typeof b.title === 'string') input.title = b.title;
  if (typeof b.sort_order === 'number') input.sort_order = b.sort_order;
  if (typeof b.group_id === 'number') input.group_id = b.group_id;
  if (b.completed === true || b.completed === 1 || b.completed === '1' || b.completed === 'true') {
    input.completed = true;
  } else if (
    b.completed === false ||
    b.completed === 0 ||
    b.completed === '0' ||
    b.completed === 'false'
  ) {
    input.completed = false;
  }
  return input;
}

export function saveTodoBackgroundFile(
  paths: AppPaths,
  listId: number,
  buffer: Buffer,
  originalName: string,
): string {
  const ext = parseImageExt(originalName);
  const filename = `list-${listId}${ext}`;
  writeFileSync(join(paths.mediaTodoBackgrounds, filename), buffer);
  return filename;
}

export function saveTodoThumbnailFile(
  paths: AppPaths,
  kind: 'group' | 'item',
  entityId: number,
  buffer: Buffer,
  originalName: string,
): string {
  const ext = parseImageExt(originalName);
  const filename = `${kind}-${entityId}${ext}`;
  writeFileSync(join(paths.mediaTodoThumbnails, filename), buffer);
  return filename;
}

function parseImageExt(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    throw new HttpError(400, 'Invalid image type.', 'invalid_image');
  }
  return ext;
}

function removeStoredFile(baseDir: string, relativePath: string | null): void {
  if (!relativePath) return;
  try {
    unlinkSync(join(baseDir, relativePath));
  } catch {
    /* ignore */
  }
}
