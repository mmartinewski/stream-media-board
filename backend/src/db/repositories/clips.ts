import type { Database as BetterDatabase } from 'better-sqlite3';

export interface ClipRow {
  id: number;
  title: string;
  youtube_url: string;
  start_time: string;
  end_time: string;
  category_id: number | null;
  tags: string | null;
  thumbnail_original_path: string;
  thumbnail_cropped_path: string;
  thumbnail_crop_meta: string | null;
  audio_path: string;
  clip_type: string;
  video_path: string | null;
  volume: number;
  audio_normalize: number;
  audio_fade: number;
  is_favorite: number;
  created_at: string;
}

export interface ClipWithCategory extends ClipRow {
  category_name: string | null;
}

export function listClipsWithCategory(
  db: BetterDatabase,
  search?: string,
): ClipWithCategory[] {
  const filter = search?.trim();
  if (!filter) {
    return db
      .prepare(
        `SELECT c.*, cat.name AS category_name
         FROM clips c
         LEFT JOIN categories cat ON cat.id = c.category_id
         ORDER BY c.is_favorite DESC, cat.name COLLATE NOCASE ASC, c.title COLLATE NOCASE ASC`,
      )
      .all() as ClipWithCategory[];
  }

  const like = `%${filter}%`;
  return db
    .prepare(
      `SELECT c.*, cat.name AS category_name
       FROM clips c
       LEFT JOIN categories cat ON cat.id = c.category_id
       WHERE c.title LIKE ? COLLATE NOCASE
          OR cat.name LIKE ? COLLATE NOCASE
          OR IFNULL(c.tags,'') LIKE ? COLLATE NOCASE
       ORDER BY c.is_favorite DESC, cat.name COLLATE NOCASE ASC, c.title COLLATE NOCASE ASC`,
    )
    .all(like, like, like) as ClipWithCategory[];
}

export function getClipWithCategoryById(
  db: BetterDatabase,
  id: number,
): ClipWithCategory | undefined {
  return db
    .prepare(
      `SELECT c.*, cat.name AS category_name
       FROM clips c
       LEFT JOIN categories cat ON cat.id = c.category_id
       WHERE c.id = ?`,
    )
    .get(id) as ClipWithCategory | undefined;
}

export function getClipById(
  db: BetterDatabase,
  id: number,
): ClipRow | undefined {
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as
    | ClipRow
    | undefined;
}

export function deleteClipById(db: BetterDatabase, id: number): boolean {
  const result = db.prepare('DELETE FROM clips WHERE id = ?').run(id);
  return result.changes > 0;
}
