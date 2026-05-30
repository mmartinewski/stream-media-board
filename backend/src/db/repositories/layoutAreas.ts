import type { Database as BetterDatabase } from 'better-sqlite3';
import { HttpError } from '../../middleware/errorHandler.js';
import type { LayoutAreaDto, LayoutAreaInput } from '../../services/layoutAreaTypes.js';

interface LayoutAreaRow {
  id: number;
  name: string;
  sort_order: number;
  anchor_vertical: string;
  anchor_horizontal: string;
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  max_width_percent: number;
  max_height_percent: number;
  is_fullscreen: number;
  created_at: string;
}

const SEED_AREAS: LayoutAreaInput[] = [
  {
    name: 'Top right',
    sort_order: 10,
    anchor_vertical: 'top',
    anchor_horizontal: 'right',
    margin_top: 5,
    margin_right: 5,
    max_width_percent: 35,
    max_height_percent: 45,
  },
  {
    name: 'Center',
    sort_order: 20,
    anchor_vertical: 'middle',
    anchor_horizontal: 'center',
    max_width_percent: 80,
    max_height_percent: 80,
  },
  {
    name: 'Fullscreen',
    sort_order: 30,
    anchor_vertical: 'middle',
    anchor_horizontal: 'center',
    max_width_percent: 100,
    max_height_percent: 100,
    is_fullscreen: 1,
  },
];

export function ensureLayoutAreasSchema(db: BetterDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS layout_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      anchor_vertical TEXT NOT NULL CHECK (anchor_vertical IN ('top', 'middle', 'bottom')),
      anchor_horizontal TEXT NOT NULL CHECK (anchor_horizontal IN ('left', 'center', 'right')),
      margin_top REAL NOT NULL DEFAULT 0,
      margin_right REAL NOT NULL DEFAULT 0,
      margin_bottom REAL NOT NULL DEFAULT 0,
      margin_left REAL NOT NULL DEFAULT 0,
      max_width_percent REAL NOT NULL DEFAULT 100,
      max_height_percent REAL NOT NULL DEFAULT 100,
      is_fullscreen INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function seedLayoutAreasIfEmpty(db: BetterDatabase): void {
  const count = (
    db.prepare('SELECT COUNT(*) AS n FROM layout_areas').get() as { n: number }
  ).n;
  if (count > 0) return;

  for (const seed of SEED_AREAS) {
    insertLayoutArea(db, seed);
  }

  const topRight = db
    .prepare(`SELECT id FROM layout_areas WHERE name = 'Top right'`)
    .get() as { id: number } | undefined;

  if (topRight) {
    setAppSetting(db, 'layout_area_id_landscape', String(topRight.id));
    setAppSetting(db, 'layout_area_id_portrait', String(topRight.id));
  }
}

export function restoreDefaultLayoutAreas(db: BetterDatabase): void {
  for (const seed of SEED_AREAS) {
    const existing = db
      .prepare('SELECT id FROM layout_areas WHERE name = ?')
      .get(seed.name) as { id: number } | undefined;
    if (!existing) {
      insertLayoutArea(db, seed);
    }
  }
  seedLayoutAreasIfEmpty(db);
}

function setAppSetting(db: BetterDatabase, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function listLayoutAreas(db: BetterDatabase): LayoutAreaDto[] {
  const rows = db
    .prepare(
      `SELECT * FROM layout_areas ORDER BY sort_order ASC, name COLLATE NOCASE ASC`,
    )
    .all() as LayoutAreaRow[];
  return rows.map(rowToDto);
}

export function getLayoutAreaById(
  db: BetterDatabase,
  id: number,
): LayoutAreaDto | undefined {
  const row = db.prepare('SELECT * FROM layout_areas WHERE id = ?').get(id) as
    | LayoutAreaRow
    | undefined;
  return row ? rowToDto(row) : undefined;
}

export function countLayoutAreas(db: BetterDatabase): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM layout_areas').get() as { n: number })
    .n;
}

export function createLayoutArea(
  db: BetterDatabase,
  input: LayoutAreaInput,
): LayoutAreaDto {
  const normalized = normalizeInput(input);
  const result = db
    .prepare(
      `INSERT INTO layout_areas (
        name, sort_order, anchor_vertical, anchor_horizontal,
        margin_top, margin_right, margin_bottom, margin_left,
        max_width_percent, max_height_percent, is_fullscreen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      normalized.name,
      normalized.sort_order,
      normalized.anchor_vertical,
      normalized.anchor_horizontal,
      normalized.margin_top,
      normalized.margin_right,
      normalized.margin_bottom,
      normalized.margin_left,
      normalized.max_width_percent,
      normalized.max_height_percent,
      normalized.is_fullscreen,
    );
  const created = getLayoutAreaById(db, Number(result.lastInsertRowid));
  if (!created) {
    throw new HttpError(500, 'Failed to create layout area.', 'layout_area_create_failed');
  }
  return created;
}

export function updateLayoutArea(
  db: BetterDatabase,
  id: number,
  input: LayoutAreaInput,
): LayoutAreaDto {
  if (!getLayoutAreaById(db, id)) {
    throw new HttpError(404, 'Layout area not found.', 'layout_area_not_found');
  }
  const normalized = normalizeInput(input);
  db.prepare(
    `UPDATE layout_areas SET
      name = ?, sort_order = ?, anchor_vertical = ?, anchor_horizontal = ?,
      margin_top = ?, margin_right = ?, margin_bottom = ?, margin_left = ?,
      max_width_percent = ?, max_height_percent = ?, is_fullscreen = ?
     WHERE id = ?`,
  ).run(
    normalized.name,
    normalized.sort_order,
    normalized.anchor_vertical,
    normalized.anchor_horizontal,
    normalized.margin_top,
    normalized.margin_right,
    normalized.margin_bottom,
    normalized.margin_left,
    normalized.max_width_percent,
    normalized.max_height_percent,
    normalized.is_fullscreen,
    id,
  );
  const updated = getLayoutAreaById(db, id);
  if (!updated) {
    throw new HttpError(500, 'Failed to update layout area.', 'layout_area_update_failed');
  }
  return updated;
}

export function deleteLayoutArea(db: BetterDatabase, id: number): void {
  if (!getLayoutAreaById(db, id)) {
    throw new HttpError(404, 'Layout area not found.', 'layout_area_not_found');
  }
  if (countLayoutAreas(db) <= 1) {
    throw new HttpError(
      409,
      'At least one layout area is required.',
      'layout_area_last',
    );
  }
  for (const key of ['layout_area_id_landscape', 'layout_area_id_portrait'] as const) {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (row && Number(row.value) === id) {
      db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
    }
  }
  db.prepare('DELETE FROM layout_areas WHERE id = ?').run(id);
}

function insertLayoutArea(db: BetterDatabase, input: LayoutAreaInput): void {
  const normalized = normalizeInput(input);
  db.prepare(
    `INSERT INTO layout_areas (
      name, sort_order, anchor_vertical, anchor_horizontal,
      margin_top, margin_right, margin_bottom, margin_left,
      max_width_percent, max_height_percent, is_fullscreen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    normalized.name,
    normalized.sort_order,
    normalized.anchor_vertical,
    normalized.anchor_horizontal,
    normalized.margin_top,
    normalized.margin_right,
    normalized.margin_bottom,
    normalized.margin_left,
    normalized.max_width_percent,
    normalized.max_height_percent,
    normalized.is_fullscreen,
  );
}

function normalizeInput(input: LayoutAreaInput): Required<LayoutAreaInput> {
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, 'Area name is required.', 'layout_area_name_required');
  }
  const isFullscreen = input.is_fullscreen === 1 ? 1 : 0;
  return {
    name,
    sort_order: Number.isFinite(input.sort_order) ? Math.round(input.sort_order!) : 0,
    anchor_vertical: parseAnchorVertical(input.anchor_vertical),
    anchor_horizontal: parseAnchorHorizontal(input.anchor_horizontal),
    margin_top: clampPercent(input.margin_top ?? 0),
    margin_right: clampPercent(input.margin_right ?? 0),
    margin_bottom: clampPercent(input.margin_bottom ?? 0),
    margin_left: clampPercent(input.margin_left ?? 0),
    max_width_percent: isFullscreen ? 100 : clampPercent(input.max_width_percent ?? 100),
    max_height_percent: isFullscreen ? 100 : clampPercent(input.max_height_percent ?? 100),
    is_fullscreen: isFullscreen,
  };
}

function parseAnchorVertical(value: unknown): 'top' | 'middle' | 'bottom' {
  if (value === 'top' || value === 'middle' || value === 'bottom') return value;
  throw new HttpError(400, 'Invalid anchor_vertical.', 'invalid_anchor_vertical');
}

function parseAnchorHorizontal(value: unknown): 'left' | 'center' | 'right' {
  if (value === 'left' || value === 'center' || value === 'right') return value;
  throw new HttpError(400, 'Invalid anchor_horizontal.', 'invalid_anchor_horizontal');
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function rowToDto(row: LayoutAreaRow): LayoutAreaDto {
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    anchor_vertical: row.anchor_vertical as LayoutAreaDto['anchor_vertical'],
    anchor_horizontal: row.anchor_horizontal as LayoutAreaDto['anchor_horizontal'],
    margin_top: row.margin_top,
    margin_right: row.margin_right,
    margin_bottom: row.margin_bottom,
    margin_left: row.margin_left,
    max_width_percent: row.max_width_percent,
    max_height_percent: row.max_height_percent,
    is_fullscreen: row.is_fullscreen,
    created_at: row.created_at,
  };
}

export function getLayoutAreaIdSetting(
  db: BetterDatabase,
  key: 'layout_area_id_landscape' | 'layout_area_id_portrait',
): number | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  if (!row) return null;
  const id = Number(row.value);
  if (!Number.isInteger(id) || id < 1) return null;
  return getLayoutAreaById(db, id) ? id : null;
}

export function setLayoutAreaIdSetting(
  db: BetterDatabase,
  key: 'layout_area_id_landscape' | 'layout_area_id_portrait',
  id: number | null,
): void {
  if (id === null) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
    return;
  }
  if (!getLayoutAreaById(db, id)) {
    throw new HttpError(400, 'Layout area not found.', 'layout_area_not_found');
  }
  setAppSetting(db, key, String(id));
}
