import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as BetterDatabase } from 'better-sqlite3';
import type { AppPaths } from '../../config/paths.js';
import { HttpError } from '../../middleware/errorHandler.js';
import type {
  TodoColumnDto,
  TodoColumnInput,
  TodoGroupDto,
  TodoGroupInput,
  TodoItemDto,
  TodoItemInput,
  TodoListDetailDto,
  TodoListInput,
  TodoListOverlayDto,
  TodoListSummaryDto,
} from '../../services/todoListTypes.js';

interface TodoColumnRow {
  id: number;
  list_id: number;
  sort_order: number;
  visible: number;
}

interface TodoListRow {
  id: number;
  name: string;
  title: string;
  sort_order: number;
  background_image_path: string | null;
  font_family: string;
  font_size: string;
  color_title: string;
  color_group: string;
  color_item: string;
  enter_animation: string;
  exit_animation: string;
  animation_duration_ms: number;
  panel_width_percent: number;
  panel_max_height_percent: number;
  background_opacity_percent: number;
  background_blur_px: number;
  background_mode: string;
  background_color: string;
  panel_anchor_vertical: string;
  panel_anchor_horizontal: string;
}

interface TodoGroupRow {
  id: number;
  list_id: number;
  column_id: number;
  title: string;
  thumbnail_path: string | null;
  sort_order: number;
  visible: number;
}

interface TodoItemRow {
  id: number;
  group_id: number;
  title: string;
  thumbnail_path: string | null;
  completed: number;
  sort_order: number;
}

export function ensureTodoListsSchema(db: BetterDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      background_image_path TEXT,
      font_family TEXT NOT NULL DEFAULT 'system-ui, sans-serif',
      color_title TEXT NOT NULL DEFAULT '#ffffff',
      color_group TEXT NOT NULL DEFAULT '#e2e8f0',
      color_item TEXT NOT NULL DEFAULT '#f8fafc',
      enter_animation TEXT NOT NULL DEFAULT 'fade'
        CHECK (enter_animation IN ('fade', 'slide_top', 'slide_bottom', 'slide_left', 'slide_right')),
      exit_animation TEXT NOT NULL DEFAULT 'fade'
        CHECK (exit_animation IN ('fade', 'slide_top', 'slide_bottom', 'slide_left', 'slide_right')),
      animation_duration_ms INTEGER NOT NULL DEFAULT 400,
      panel_width_percent REAL NOT NULL DEFAULT 80
        CHECK (panel_width_percent > 0 AND panel_width_percent <= 100),
      panel_max_height_percent REAL NOT NULL DEFAULT 90
        CHECK (panel_max_height_percent > 0 AND panel_max_height_percent <= 100),
      background_opacity_percent REAL NOT NULL DEFAULT 45
        CHECK (background_opacity_percent >= 0 AND background_opacity_percent <= 100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS todo_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS todo_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
      column_id INTEGER REFERENCES todo_columns(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      thumbnail_path TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS todo_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES todo_groups(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      thumbnail_path TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);
  ensureTodoColumnIdColumn(db);
  ensureBackgroundOpacityColumn(db);
  ensureBackgroundBlurColumn(db);
  ensureBackgroundModeColumns(db);
  ensurePanelAnchorColumns(db);
  ensureColumnGroupVisibleColumns(db);
  ensureFontSizeColumn(db);
  ensureListNameColumn(db);
  migrateTodoColumns(db);
}

function ensureListNameColumn(db: BetterDatabase): void {
  const rows = db.prepare(`PRAGMA table_info(todo_lists)`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === 'name')) return;
  db.exec(`ALTER TABLE todo_lists ADD COLUMN name TEXT NOT NULL DEFAULT ''`);
  db.prepare(`UPDATE todo_lists SET name = title WHERE trim(name) = ''`).run();
}

function ensureFontSizeColumn(db: BetterDatabase): void {
  const rows = db.prepare(`PRAGMA table_info(todo_lists)`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === 'font_size')) {
    db.exec(
      `ALTER TABLE todo_lists ADD COLUMN font_size TEXT NOT NULL DEFAULT 'medium'
        CHECK (font_size IN ('tiny', 'small', 'medium', 'large'))`,
    );
    db.prepare(
      `INSERT OR IGNORE INTO app_settings(key, value) VALUES ('schema_todo_font_size_v2', '1')`,
    ).run();
    return;
  }
  migrateFontSizeColumnForTiny(db);
}

/** Drops the old CHECK so `tiny` can be stored on databases created before v2. */
function migrateFontSizeColumnForTiny(db: BetterDatabase): void {
  if (db.prepare(`SELECT 1 FROM app_settings WHERE key = 'schema_todo_font_size_v2'`).get()) {
    return;
  }
  db.exec('BEGIN');
  try {
    db.exec(`ALTER TABLE todo_lists ADD COLUMN font_size_next TEXT NOT NULL DEFAULT 'medium'`);
    db.exec(`UPDATE todo_lists SET font_size_next = font_size`);
    db.exec(`ALTER TABLE todo_lists DROP COLUMN font_size`);
    db.exec(`ALTER TABLE todo_lists RENAME COLUMN font_size_next TO font_size`);
    db.prepare(
      `INSERT INTO app_settings(key, value) VALUES ('schema_todo_font_size_v2', '1')`,
    ).run();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function ensureBackgroundOpacityColumn(db: BetterDatabase): void {
  const rows = db.prepare(`PRAGMA table_info(todo_lists)`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === 'background_opacity_percent')) return;
  db.exec(
    `ALTER TABLE todo_lists ADD COLUMN background_opacity_percent REAL NOT NULL DEFAULT 45
      CHECK (background_opacity_percent >= 0 AND background_opacity_percent <= 100)`,
  );
}

function ensureBackgroundBlurColumn(db: BetterDatabase): void {
  const rows = db.prepare(`PRAGMA table_info(todo_lists)`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === 'background_blur_px')) return;
  db.exec(
    `ALTER TABLE todo_lists ADD COLUMN background_blur_px INTEGER NOT NULL DEFAULT 0
      CHECK (background_blur_px >= 0 AND background_blur_px <= 32)`,
  );
}

function ensureBackgroundModeColumns(db: BetterDatabase): void {
  const rows = db.prepare(`PRAGMA table_info(todo_lists)`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === 'background_mode')) {
    db.exec(
      `ALTER TABLE todo_lists ADD COLUMN background_mode TEXT NOT NULL DEFAULT 'image'
        CHECK (background_mode IN ('image', 'color'))`,
    );
  }
  if (!rows.some((row) => row.name === 'background_color')) {
    db.exec(
      `ALTER TABLE todo_lists ADD COLUMN background_color TEXT NOT NULL DEFAULT '#000000'`,
    );
  }
}

function ensurePanelAnchorColumns(db: BetterDatabase): void {
  const rows = db.prepare(`PRAGMA table_info(todo_lists)`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === 'panel_anchor_vertical')) {
    db.exec(
      `ALTER TABLE todo_lists ADD COLUMN panel_anchor_vertical TEXT NOT NULL DEFAULT 'top'
        CHECK (panel_anchor_vertical IN ('top', 'middle', 'bottom'))`,
    );
  }
  if (!rows.some((row) => row.name === 'panel_anchor_horizontal')) {
    db.exec(
      `ALTER TABLE todo_lists ADD COLUMN panel_anchor_horizontal TEXT NOT NULL DEFAULT 'left'
        CHECK (panel_anchor_horizontal IN ('left', 'center', 'right'))`,
    );
  }
}

function ensureColumnGroupVisibleColumns(db: BetterDatabase): void {
  const columnRows = db.prepare(`PRAGMA table_info(todo_columns)`).all() as Array<{ name: string }>;
  if (!columnRows.some((row) => row.name === 'visible')) {
    db.exec(
      `ALTER TABLE todo_columns ADD COLUMN visible INTEGER NOT NULL DEFAULT 1
        CHECK (visible IN (0, 1))`,
    );
  }
  const groupRows = db.prepare(`PRAGMA table_info(todo_groups)`).all() as Array<{ name: string }>;
  if (!groupRows.some((row) => row.name === 'visible')) {
    db.exec(
      `ALTER TABLE todo_groups ADD COLUMN visible INTEGER NOT NULL DEFAULT 1
        CHECK (visible IN (0, 1))`,
    );
  }
}

function ensureTodoColumnIdColumn(db: BetterDatabase): void {
  const rows = db.prepare(`PRAGMA table_info(todo_groups)`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === 'column_id')) return;
  db.exec(`ALTER TABLE todo_groups ADD COLUMN column_id INTEGER REFERENCES todo_columns(id) ON DELETE CASCADE`);
}

function migrateTodoColumns(db: BetterDatabase): void {
  const lists = db.prepare(`SELECT id FROM todo_lists`).all() as Array<{ id: number }>;
  for (const { id: listId } of lists) {
    let columnId = (
      db
        .prepare(
          `SELECT id FROM todo_columns WHERE list_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1`,
        )
        .get(listId) as { id: number } | undefined
    )?.id;

    if (columnId == null) {
      const result = db
        .prepare(`INSERT INTO todo_columns (list_id, sort_order) VALUES (?, 10)`)
        .run(listId);
      columnId = Number(result.lastInsertRowid);
    }

    db.prepare(
      `UPDATE todo_groups SET column_id = ? WHERE list_id = ? AND column_id IS NULL`,
    ).run(columnId, listId);
  }
}

export function listTodoListsSummary(db: BetterDatabase): TodoListSummaryDto[] {
  return db
    .prepare(
      `SELECT id, name, sort_order FROM todo_lists ORDER BY sort_order ASC, id ASC`,
    )
    .all() as TodoListSummaryDto[];
}

function getListRow(db: BetterDatabase, id: number): TodoListRow | null {
  return (
    (db.prepare(`SELECT * FROM todo_lists WHERE id = ?`).get(id) as TodoListRow | undefined) ??
    null
  );
}

function mapItem(row: TodoItemRow): TodoItemDto {
  return {
    id: row.id,
    title: row.title,
    sort_order: row.sort_order,
    completed: row.completed === 1,
    thumbnail_url: row.thumbnail_path
      ? `/api/todo-lists/thumbnails/${row.id}?kind=item`
      : null,
  };
}

function mapGroup(db: BetterDatabase, row: TodoGroupRow): TodoGroupDto {
  const items = db
    .prepare(
      `SELECT * FROM todo_items WHERE group_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(row.id) as TodoItemRow[];
  return {
    id: row.id,
    title: row.title,
    sort_order: row.sort_order,
    visible: row.visible !== 0,
    thumbnail_url: row.thumbnail_path
      ? `/api/todo-lists/thumbnails/${row.id}?kind=group`
      : null,
    items: items.map(mapItem),
  };
}

function mapColumn(db: BetterDatabase, row: TodoColumnRow): TodoColumnDto {
  const groups = db
    .prepare(
      `SELECT * FROM todo_groups WHERE column_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(row.id) as TodoGroupRow[];
  return {
    id: row.id,
    sort_order: row.sort_order,
    visible: row.visible !== 0,
    groups: groups.map((group) => mapGroup(db, group)),
  };
}

export function buildTodoListDetailDto(
  db: BetterDatabase,
  row: TodoListRow,
): TodoListDetailDto {
  const columns = db
    .prepare(
      `SELECT * FROM todo_columns WHERE list_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(row.id) as TodoColumnRow[];

  return {
    id: row.id,
    name: row.name || row.title,
    title: row.title,
    sort_order: row.sort_order,
    theme: {
      background_url: row.background_image_path
        ? `/api/todo-lists/${row.id}/background`
        : null,
      background_mode: (row.background_mode ?? 'image') as TodoListDetailDto['theme']['background_mode'],
      background_color: row.background_color ?? '#000000',
      font_family: row.font_family,
      font_size: (row.font_size ?? 'medium') as TodoListDetailDto['theme']['font_size'],
      color_title: row.color_title,
      color_group: row.color_group,
      color_item: row.color_item,
    },
    enter_animation: row.enter_animation as TodoListDetailDto['enter_animation'],
    exit_animation: row.exit_animation as TodoListDetailDto['exit_animation'],
    animation_duration_ms: row.animation_duration_ms,
    panel_width_percent: row.panel_width_percent,
    panel_max_height_percent: row.panel_max_height_percent,
    panel_anchor_vertical: (row.panel_anchor_vertical ??
      'top') as TodoListDetailDto['panel_anchor_vertical'],
    panel_anchor_horizontal: (row.panel_anchor_horizontal ??
      'left') as TodoListDetailDto['panel_anchor_horizontal'],
    background_opacity_percent: row.background_opacity_percent,
    background_blur_px: row.background_blur_px ?? 0,
    columns: columns.map((column) => mapColumn(db, column)),
  };
}

export function getTodoListById(db: BetterDatabase, id: number): TodoListDetailDto | null {
  const row = getListRow(db, id);
  if (!row) return null;
  return buildTodoListDetailDto(db, row);
}

export function getTodoListOverlayDto(
  db: BetterDatabase,
  id: number,
): TodoListOverlayDto | null {
  return getTodoListById(db, id);
}

export function createTodoList(db: BetterDatabase, input: TodoListInput): TodoListDetailDto {
  const title = input.title.trim();
  if (!title) {
    throw new HttpError(400, 'Panel title is required.', 'invalid_title');
  }
  const name = (input.name ?? title).trim();
  if (!name) {
    throw new HttpError(400, 'Name is required.', 'invalid_name');
  }
  const sortOrder = input.sort_order ?? nextListSortOrder(db);
  const result = db
    .prepare(
      `INSERT INTO todo_lists (
        name, title, sort_order, font_family, font_size, color_title, color_group, color_item,
        enter_animation, exit_animation, animation_duration_ms,
        panel_width_percent, panel_max_height_percent, background_opacity_percent, background_blur_px,
        background_mode, background_color, panel_anchor_vertical, panel_anchor_horizontal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      title,
      sortOrder,
      input.font_family ?? 'system-ui, sans-serif',
      input.font_size ?? 'medium',
      input.color_title ?? '#ffffff',
      input.color_group ?? '#e2e8f0',
      input.color_item ?? '#f8fafc',
      input.enter_animation ?? 'fade',
      input.exit_animation ?? 'fade',
      input.animation_duration_ms ?? 400,
      input.panel_width_percent ?? 80,
      input.panel_max_height_percent ?? 90,
      input.background_opacity_percent ?? 45,
      0,
      input.background_mode ?? 'image',
      input.background_color ?? '#000000',
      input.panel_anchor_vertical ?? 'top',
      input.panel_anchor_horizontal ?? 'left',
    );
  const listId = Number(result.lastInsertRowid);
  db.prepare(`INSERT INTO todo_columns (list_id, sort_order) VALUES (?, 10)`).run(listId);
  const created = getTodoListById(db, listId);
  if (!created) {
    throw new HttpError(500, 'Failed to create checklist.', 'create_failed');
  }
  return created;
}

function nextListSortOrder(db: BetterDatabase): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM todo_lists`)
    .get() as { next: number };
  return row.next;
}

export function updateTodoList(
  db: BetterDatabase,
  id: number,
  input: TodoListInput,
): TodoListDetailDto {
  const existing = getListRow(db, id);
  if (!existing) {
    throw new HttpError(404, 'Checklist not found.', 'todo_list_not_found');
  }
  const title = input.title?.trim() ?? existing.title;
  if (!title) {
    throw new HttpError(400, 'Panel title is required.', 'invalid_title');
  }
  const name =
    input.name !== undefined ? input.name.trim() : (existing.name ?? existing.title).trim();
  if (!name) {
    throw new HttpError(400, 'Name is required.', 'invalid_name');
  }
  db.prepare(
    `UPDATE todo_lists SET
      name = ?,
      title = ?,
      sort_order = ?,
      font_family = ?,
      font_size = ?,
      color_title = ?,
      color_group = ?,
      color_item = ?,
      enter_animation = ?,
      exit_animation = ?,
      animation_duration_ms = ?,
      panel_width_percent = ?,
      panel_max_height_percent = ?,
      background_opacity_percent = ?,
      background_blur_px = ?,
      background_mode = ?,
      background_color = ?,
      panel_anchor_vertical = ?,
      panel_anchor_horizontal = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
  ).run(
    name,
    title,
    input.sort_order ?? existing.sort_order,
    input.font_family ?? existing.font_family,
    input.font_size ?? existing.font_size ?? 'medium',
    input.color_title ?? existing.color_title,
    input.color_group ?? existing.color_group,
    input.color_item ?? existing.color_item,
    input.enter_animation ?? existing.enter_animation,
    input.exit_animation ?? existing.exit_animation,
    input.animation_duration_ms ?? existing.animation_duration_ms,
    input.panel_width_percent ?? existing.panel_width_percent,
    input.panel_max_height_percent ?? existing.panel_max_height_percent,
      input.background_opacity_percent ?? existing.background_opacity_percent,
      existing.background_blur_px ?? 0,
      input.background_mode ?? existing.background_mode ?? 'image',
    input.background_color ?? existing.background_color ?? '#000000',
    input.panel_anchor_vertical ?? existing.panel_anchor_vertical ?? 'top',
    input.panel_anchor_horizontal ?? existing.panel_anchor_horizontal ?? 'left',
    id,
  );
  const updated = getTodoListById(db, id);
  if (!updated) {
    throw new HttpError(500, 'Failed to update checklist.', 'update_failed');
  }
  return updated;
}

export function setTodoListBackgroundPath(
  db: BetterDatabase,
  id: number,
  relativePath: string | null,
): void {
  const existing = getListRow(db, id);
  if (!existing) {
    throw new HttpError(404, 'Checklist not found.', 'todo_list_not_found');
  }
  db.prepare(
    `UPDATE todo_lists SET background_image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(relativePath, id);
}

export function setTodoGroupThumbnailPath(
  db: BetterDatabase,
  listId: number,
  groupId: number,
  relativePath: string | null,
): TodoGroupDto {
  const row = assertGroupInList(db, listId, groupId);
  db.prepare(`UPDATE todo_groups SET thumbnail_path = ? WHERE id = ?`).run(relativePath, groupId);
  const updated = db
    .prepare(`SELECT * FROM todo_groups WHERE id = ?`)
    .get(groupId) as TodoGroupRow;
  return mapGroup(db, updated);
}

export function setTodoItemThumbnailPath(
  db: BetterDatabase,
  listId: number,
  itemId: number,
  relativePath: string | null,
): TodoItemDto {
  assertItemInList(db, listId, itemId);
  db.prepare(`UPDATE todo_items SET thumbnail_path = ? WHERE id = ?`).run(relativePath, itemId);
  const updated = db
    .prepare(`SELECT * FROM todo_items WHERE id = ?`)
    .get(itemId) as TodoItemRow;
  return mapItem(updated);
}

export function getTodoGroupRow(
  db: BetterDatabase,
  listId: number,
  groupId: number,
): TodoGroupRow {
  return assertGroupInList(db, listId, groupId);
}

export function getTodoItemRow(
  db: BetterDatabase,
  listId: number,
  itemId: number,
): TodoItemRow {
  return assertItemInList(db, listId, itemId).item;
}

export function deleteTodoList(db: BetterDatabase, paths: AppPaths, id: number): void {
  const existing = getListRow(db, id);
  if (!existing) {
    throw new HttpError(404, 'Checklist not found.', 'todo_list_not_found');
  }
  deleteListMediaFiles(paths, existing, db, id);
  db.prepare(`DELETE FROM todo_lists WHERE id = ?`).run(id);
}

function deleteListMediaFiles(
  paths: AppPaths,
  listRow: TodoListRow,
  db: BetterDatabase,
  listId: number,
): void {
  safeUnlink(
    listRow.background_image_path
      ? join(paths.mediaTodoBackgrounds, listRow.background_image_path)
      : '',
  );
  const groups = db
    .prepare(`SELECT * FROM todo_groups WHERE list_id = ?`)
    .all(listId) as TodoGroupRow[];
  for (const group of groups) {
    safeUnlink(resolveThumbPath(paths, group.thumbnail_path));
    const items = db
      .prepare(`SELECT * FROM todo_items WHERE group_id = ?`)
      .all(group.id) as TodoItemRow[];
    for (const item of items) {
      safeUnlink(resolveThumbPath(paths, item.thumbnail_path));
    }
  }
}

function safeUnlink(filePath: string): void {
  if (!filePath || !existsSync(filePath)) return;
  try {
    unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

function resolveThumbPath(paths: AppPaths, stored: string | null): string {
  if (!stored) return '';
  return join(paths.mediaTodoThumbnails, stored);
}

export function createTodoColumn(
  db: BetterDatabase,
  listId: number,
  input: TodoColumnInput = {},
): TodoColumnDto {
  assertListExists(db, listId);
  const sortOrder =
    input.sort_order ??
    ((
      db
        .prepare(
          `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM todo_columns WHERE list_id = ?`,
        )
        .get(listId) as { next: number }
    ).next);
  const result = db
    .prepare(`INSERT INTO todo_columns (list_id, sort_order) VALUES (?, ?)`)
    .run(listId, sortOrder);
  const row = db
    .prepare(`SELECT * FROM todo_columns WHERE id = ?`)
    .get(result.lastInsertRowid) as TodoColumnRow;
  return mapColumn(db, row);
}

export function updateTodoColumn(
  db: BetterDatabase,
  listId: number,
  columnId: number,
  input: TodoColumnInput,
): TodoColumnDto {
  const row = assertColumnInList(db, listId, columnId);
  db.prepare(`UPDATE todo_columns SET sort_order = ?, visible = ? WHERE id = ?`).run(
    input.sort_order ?? row.sort_order,
    input.visible !== undefined ? (input.visible ? 1 : 0) : row.visible,
    columnId,
  );
  const updated = db
    .prepare(`SELECT * FROM todo_columns WHERE id = ?`)
    .get(columnId) as TodoColumnRow;
  return mapColumn(db, updated);
}

export function deleteTodoColumn(
  db: BetterDatabase,
  paths: AppPaths,
  listId: number,
  columnId: number,
): void {
  assertColumnInList(db, listId, columnId);
  const count = db
    .prepare(`SELECT COUNT(*) AS count FROM todo_columns WHERE list_id = ?`)
    .get(listId) as { count: number };
  if (count.count <= 1) {
    throw new HttpError(400, 'Cannot delete the last column.', 'last_column');
  }
  const groups = db
    .prepare(`SELECT * FROM todo_groups WHERE column_id = ?`)
    .all(columnId) as TodoGroupRow[];
  for (const group of groups) {
    safeUnlink(resolveThumbPath(paths, group.thumbnail_path));
    const items = db
      .prepare(`SELECT * FROM todo_items WHERE group_id = ?`)
      .all(group.id) as TodoItemRow[];
    for (const item of items) {
      safeUnlink(resolveThumbPath(paths, item.thumbnail_path));
    }
  }
  db.prepare(`DELETE FROM todo_columns WHERE id = ?`).run(columnId);
}

export function createTodoGroup(
  db: BetterDatabase,
  listId: number,
  input: TodoGroupInput,
): TodoGroupDto {
  assertListExists(db, listId);
  const columnId = resolveColumnId(db, listId, input.column_id);
  const title = input.title?.trim() ?? '';
  if (!title) {
    throw new HttpError(400, 'Group title is required.', 'invalid_title');
  }
  const sortOrder =
    input.sort_order ??
    ((
      db
        .prepare(
          `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM todo_groups WHERE column_id = ?`,
        )
        .get(columnId) as { next: number }
    ).next);
  const result = db
    .prepare(
      `INSERT INTO todo_groups (list_id, column_id, title, sort_order) VALUES (?, ?, ?, ?)`,
    )
    .run(listId, columnId, title, sortOrder);
  const row = db
    .prepare(`SELECT * FROM todo_groups WHERE id = ?`)
    .get(result.lastInsertRowid) as TodoGroupRow;
  return mapGroup(db, row);
}

export function updateTodoGroup(
  db: BetterDatabase,
  listId: number,
  groupId: number,
  input: TodoGroupInput,
): TodoGroupDto {
  const row = assertGroupInList(db, listId, groupId);
  const title = input.title !== undefined ? input.title.trim() : row.title;
  if (!title) {
    throw new HttpError(400, 'Group title is required.', 'invalid_title');
  }
  const columnId =
    input.column_id !== undefined ? resolveColumnId(db, listId, input.column_id) : row.column_id;
  let sortOrder = input.sort_order ?? row.sort_order;
  if (columnId !== row.column_id) {
    sortOrder =
      input.sort_order ??
      ((
        db
          .prepare(
            `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM todo_groups WHERE column_id = ?`,
          )
          .get(columnId) as { next: number }
      ).next);
  }
  db.prepare(
    `UPDATE todo_groups SET title = ?, sort_order = ?, column_id = ?, visible = ? WHERE id = ?`,
  ).run(
    title,
    sortOrder,
    columnId,
    input.visible !== undefined ? (input.visible ? 1 : 0) : row.visible,
    groupId,
  );
  const updated = db
    .prepare(`SELECT * FROM todo_groups WHERE id = ?`)
    .get(groupId) as TodoGroupRow;
  return mapGroup(db, updated);
}

export function deleteTodoGroup(
  db: BetterDatabase,
  paths: AppPaths,
  listId: number,
  groupId: number,
): void {
  const row = assertGroupInList(db, listId, groupId);
  safeUnlink(resolveThumbPath(paths, row.thumbnail_path));
  const items = db
    .prepare(`SELECT * FROM todo_items WHERE group_id = ?`)
    .all(groupId) as TodoItemRow[];
  for (const item of items) {
    safeUnlink(resolveThumbPath(paths, item.thumbnail_path));
  }
  db.prepare(`DELETE FROM todo_groups WHERE id = ?`).run(groupId);
}

export function createTodoItem(
  db: BetterDatabase,
  listId: number,
  groupId: number,
  input: TodoItemInput,
): TodoItemDto {
  assertGroupInList(db, listId, groupId);
  const title = input.title?.trim() ?? '';
  if (!title) {
    throw new HttpError(400, 'Item title is required.', 'invalid_title');
  }
  const sortOrder =
    input.sort_order ??
    ((
      db
        .prepare(
          `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM todo_items WHERE group_id = ?`,
        )
        .get(groupId) as { next: number }
    ).next);
  const completed = input.completed ? 1 : 0;
  const result = db
    .prepare(
      `INSERT INTO todo_items (group_id, title, sort_order, completed) VALUES (?, ?, ?, ?)`,
    )
    .run(groupId, title, sortOrder, completed);
  const row = db
    .prepare(`SELECT * FROM todo_items WHERE id = ?`)
    .get(result.lastInsertRowid) as TodoItemRow;
  return mapItem(row);
}

export function updateTodoItem(
  db: BetterDatabase,
  listId: number,
  itemId: number,
  input: TodoItemInput,
): { item: TodoItemDto; listId: number } {
  const ctx = assertItemInList(db, listId, itemId);
  const title = input.title !== undefined ? input.title.trim() : ctx.item.title;
  if (!title) {
    throw new HttpError(400, 'Item title is required.', 'invalid_title');
  }
  const completed =
    input.completed === undefined ? ctx.item.completed : input.completed ? 1 : 0;
  let groupId = ctx.item.group_id;
  if (input.group_id !== undefined) {
    assertGroupInList(db, listId, input.group_id);
    groupId = input.group_id;
  }
  let sortOrder = input.sort_order ?? ctx.item.sort_order;
  if (groupId !== ctx.item.group_id) {
    sortOrder =
      input.sort_order ??
      ((
        db
          .prepare(
            `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM todo_items WHERE group_id = ?`,
          )
          .get(groupId) as { next: number }
      ).next);
  }
  db.prepare(
    `UPDATE todo_items SET group_id = ?, title = ?, sort_order = ?, completed = ? WHERE id = ?`,
  ).run(groupId, title, sortOrder, completed, itemId);
  const updated = db
    .prepare(`SELECT * FROM todo_items WHERE id = ?`)
    .get(itemId) as TodoItemRow;
  return { item: mapItem(updated), listId: ctx.listId };
}

export function deleteTodoItem(
  db: BetterDatabase,
  paths: AppPaths,
  listId: number,
  itemId: number,
): void {
  const ctx = assertItemInList(db, listId, itemId);
  safeUnlink(resolveThumbPath(paths, ctx.item.thumbnail_path));
  db.prepare(`DELETE FROM todo_items WHERE id = ?`).run(itemId);
}

export function getTodoThumbnailFile(
  db: BetterDatabase,
  paths: AppPaths,
  entityId: number,
  kind: 'group' | 'item',
): string | null {
  if (kind === 'group') {
    const row = db
      .prepare(`SELECT thumbnail_path FROM todo_groups WHERE id = ?`)
      .get(entityId) as { thumbnail_path: string | null } | undefined;
    if (!row?.thumbnail_path) return null;
    const filePath = resolveThumbPath(paths, row.thumbnail_path);
    return existsSync(filePath) ? filePath : null;
  }
  const row = db
    .prepare(`SELECT thumbnail_path FROM todo_items WHERE id = ?`)
    .get(entityId) as { thumbnail_path: string | null } | undefined;
  if (!row?.thumbnail_path) return null;
  const filePath = resolveThumbPath(paths, row.thumbnail_path);
  return existsSync(filePath) ? filePath : null;
}

export function getTodoBackgroundFile(
  db: BetterDatabase,
  paths: AppPaths,
  listId: number,
): string | null {
  const row = getListRow(db, listId);
  if (!row?.background_image_path) return null;
  const filePath = join(paths.mediaTodoBackgrounds, row.background_image_path);
  return existsSync(filePath) ? filePath : null;
}

function assertListExists(db: BetterDatabase, listId: number): void {
  if (!getListRow(db, listId)) {
    throw new HttpError(404, 'Checklist not found.', 'todo_list_not_found');
  }
}

function assertColumnInList(
  db: BetterDatabase,
  listId: number,
  columnId: number,
): TodoColumnRow {
  assertListExists(db, listId);
  const row = db
    .prepare(`SELECT * FROM todo_columns WHERE id = ? AND list_id = ?`)
    .get(columnId, listId) as TodoColumnRow | undefined;
  if (!row) {
    throw new HttpError(404, 'Column not found.', 'todo_column_not_found');
  }
  return row;
}

function resolveColumnId(
  db: BetterDatabase,
  listId: number,
  columnId: number | undefined,
): number {
  if (columnId != null) {
    return assertColumnInList(db, listId, columnId).id;
  }
  const row = db
    .prepare(
      `SELECT id FROM todo_columns WHERE list_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1`,
    )
    .get(listId) as { id: number } | undefined;
  if (!row) {
    throw new HttpError(400, 'No column found for this checklist.', 'todo_column_missing');
  }
  return row.id;
}

function assertGroupInList(
  db: BetterDatabase,
  listId: number,
  groupId: number,
): TodoGroupRow {
  assertListExists(db, listId);
  const row = db
    .prepare(`SELECT * FROM todo_groups WHERE id = ? AND list_id = ?`)
    .get(groupId, listId) as TodoGroupRow | undefined;
  if (!row) {
    throw new HttpError(404, 'Group not found.', 'todo_group_not_found');
  }
  return row;
}

function assertItemInList(
  db: BetterDatabase,
  listId: number,
  itemId: number,
): { item: TodoItemRow; listId: number } {
  const row = db
    .prepare(
      `SELECT i.*, g.list_id AS list_id FROM todo_items i
       INNER JOIN todo_groups g ON g.id = i.group_id
       WHERE i.id = ? AND g.list_id = ?`,
    )
    .get(itemId, listId) as (TodoItemRow & { list_id: number }) | undefined;
  if (!row) {
    throw new HttpError(404, 'Item not found.', 'todo_item_not_found');
  }
  return { item: row, listId: row.list_id };
}
