import type { Database as BetterDatabase } from 'better-sqlite3';

export interface CategoryRow {
  id: number;
  name: string;
  created_at: string;
  thumbnail_original_path: string | null;
  thumbnail_cropped_path: string | null;
  thumbnail_crop_meta: string | null;
}

const CATEGORY_COLUMNS =
  'id, name, created_at, thumbnail_original_path, thumbnail_cropped_path, thumbnail_crop_meta';

export function listCategories(db: BetterDatabase): CategoryRow[] {
  return db
    .prepare(`SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY name COLLATE NOCASE ASC`)
    .all() as CategoryRow[];
}

export function getCategoryById(
  db: BetterDatabase,
  id: number,
): CategoryRow | undefined {
  return db
    .prepare(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = ?`)
    .get(id) as CategoryRow | undefined;
}

export function renameCategory(
  db: BetterDatabase,
  id: number,
  name: string,
): CategoryRow {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Category name cannot be empty.');
  }

  const current = getCategoryById(db, id);
  if (!current) {
    throw new Error('Category not found.');
  }

  if (current.name === trimmed) return current;

  const duplicate = db
    .prepare('SELECT id FROM categories WHERE name = ? AND id <> ?')
    .get(trimmed, id) as { id: number } | undefined;
  if (duplicate) {
    throw new Error('Category name already exists.');
  }

  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(trimmed, id);
  return getCategoryById(db, id)!;
}

export function updateCategoryThumbnails(
  db: BetterDatabase,
  id: number,
  thumbnails: {
    thumbnail_original_path: string | null;
    thumbnail_cropped_path: string | null;
    thumbnail_crop_meta: string | null;
  },
): CategoryRow {
  const current = getCategoryById(db, id);
  if (!current) {
    throw new Error('Category not found.');
  }

  db.prepare(
    `UPDATE categories
     SET thumbnail_original_path = ?,
         thumbnail_cropped_path = ?,
         thumbnail_crop_meta = ?
     WHERE id = ?`,
  ).run(
    thumbnails.thumbnail_original_path,
    thumbnails.thumbnail_cropped_path,
    thumbnails.thumbnail_crop_meta,
    id,
  );

  return getCategoryById(db, id)!;
}

export function findOrCreateCategory(
  db: BetterDatabase,
  name: string,
): CategoryRow {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Category name cannot be empty.');
  }

  const existing = db
    .prepare(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE name = ?`)
    .get(trimmed) as CategoryRow | undefined;

  if (existing) return existing;

  const result = db
    .prepare('INSERT INTO categories(name) VALUES (?)')
    .run(trimmed);

  return {
    id: Number(result.lastInsertRowid),
    name: trimmed,
    created_at: new Date().toISOString(),
    thumbnail_original_path: null,
    thumbnail_cropped_path: null,
    thumbnail_crop_meta: null,
  };
}
