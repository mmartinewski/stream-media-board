import type { Database as BetterDatabase } from 'better-sqlite3';
import { findOrCreateCategory, type CategoryRow } from './categories.js';

export interface ClipCategoryRef {
  id: number;
  name: string;
}

export function normalizeCategoryNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('en');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function resolveCategoriesFromNames(
  db: BetterDatabase,
  names: string[],
): CategoryRow[] {
  const normalized = normalizeCategoryNames(names);
  if (normalized.length === 0) {
    throw new Error('At least one category is required.');
  }
  return normalized.map((name) => findOrCreateCategory(db, name));
}

export function setClipCategories(
  db: BetterDatabase,
  clipId: number,
  categoryIds: number[],
): void {
  const uniqueIds = [...new Set(categoryIds)];
  db.prepare('DELETE FROM clip_categories WHERE clip_id = ?').run(clipId);
  const insert = db.prepare(
    'INSERT INTO clip_categories (clip_id, category_id) VALUES (?, ?)',
  );
  for (const categoryId of uniqueIds) {
    insert.run(clipId, categoryId);
  }
  db.prepare('UPDATE clips SET category_id = ? WHERE id = ?').run(
    uniqueIds[0] ?? null,
    clipId,
  );
}

export function getCategoriesForClip(
  db: BetterDatabase,
  clipId: number,
): ClipCategoryRef[] {
  return db
    .prepare(
      `SELECT cat.id, cat.name
       FROM clip_categories cc
       JOIN categories cat ON cat.id = cc.category_id
       WHERE cc.clip_id = ?
       ORDER BY cat.name COLLATE NOCASE ASC`,
    )
    .all(clipId) as ClipCategoryRef[];
}

export function getCategoriesForClips(
  db: BetterDatabase,
  clipIds: number[],
): Map<number, ClipCategoryRef[]> {
  const map = new Map<number, ClipCategoryRef[]>();
  if (clipIds.length === 0) return map;

  const placeholders = clipIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT cc.clip_id, cat.id, cat.name
       FROM clip_categories cc
       JOIN categories cat ON cat.id = cc.category_id
       WHERE cc.clip_id IN (${placeholders})
       ORDER BY cat.name COLLATE NOCASE ASC`,
    )
    .all(...clipIds) as Array<{ clip_id: number; id: number; name: string }>;

  for (const row of rows) {
    const existing = map.get(row.clip_id);
    const ref = { id: row.id, name: row.name };
    if (existing) {
      existing.push(ref);
    } else {
      map.set(row.clip_id, [ref]);
    }
  }
  return map;
}

export interface CategoryWithClipCount {
  id: number;
  name: string;
  clip_count: number;
}

export function listCategoriesWithClipCount(
  db: BetterDatabase,
): CategoryWithClipCount[] {
  return db
    .prepare(
      `SELECT cat.id, cat.name, COUNT(DISTINCT cc.clip_id) AS clip_count
       FROM categories cat
       LEFT JOIN clip_categories cc ON cc.category_id = cat.id
       GROUP BY cat.id
       ORDER BY cat.name COLLATE NOCASE ASC`,
    )
    .all() as CategoryWithClipCount[];
}
