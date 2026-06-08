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
  video_width: number | null;
  video_height: number | null;
  video_orientation: string | null;
  default_layout_area_id: number | null;
  volume: number;
  audio_normalize: number;
  audio_fade: number;
  is_favorite: number;
  created_at: string;
}

export interface ClipListRow extends ClipRow {
  section_category_id: number | null;
  category_name: string | null;
}

const LIST_ORDER =
  'c.is_favorite DESC, cat.name COLLATE NOCASE ASC, c.title COLLATE NOCASE ASC';

const LIST_FROM = `
  FROM clips c
  LEFT JOIN clip_categories cc ON cc.clip_id = c.id
  LEFT JOIN categories cat ON cat.id = cc.category_id`;

function buildListWhere(search?: string): { sql: string; params: string[] } {
  const filter = search?.trim();
  if (!filter) {
    return { sql: '', params: [] };
  }
  const like = `%${filter}%`;
  return {
    sql: ` WHERE c.title LIKE ? COLLATE NOCASE
          OR cat.name LIKE ? COLLATE NOCASE
          OR IFNULL(c.tags,'') LIKE ? COLLATE NOCASE`,
    params: [like, like, like],
  };
}

export function listClipsForDashboard(
  db: BetterDatabase,
  search?: string,
): ClipListRow[] {
  const { sql: whereSql, params } = buildListWhere(search);
  return db
    .prepare(
      `SELECT c.*, cat.id AS section_category_id, cat.name AS category_name
       ${LIST_FROM}
       ${whereSql}
       ORDER BY ${LIST_ORDER}`,
    )
    .all(...params) as ClipListRow[];
}

export function listClipsInCategory(
  db: BetterDatabase,
  categoryId: number,
  search?: string,
): ClipListRow[] {
  const filter = search?.trim();
  const params: Array<string | number> = [categoryId];
  let searchSql = '';
  if (filter) {
    const like = `%${filter}%`;
    searchSql = ` AND (c.title LIKE ? COLLATE NOCASE OR IFNULL(c.tags,'') LIKE ? COLLATE NOCASE)`;
    params.push(like, like);
  }

  return db
    .prepare(
      `SELECT c.*, cat.id AS section_category_id, cat.name AS category_name
       FROM clips c
       INNER JOIN clip_categories cc ON cc.clip_id = c.id
       INNER JOIN categories cat ON cat.id = cc.category_id
       WHERE cc.category_id = ?
       ${searchSql}
       ORDER BY c.is_favorite DESC, c.title COLLATE NOCASE ASC`,
    )
    .all(...params) as ClipListRow[];
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

export function updateClipDefaultLayoutAreaId(
  db: BetterDatabase,
  clipId: number,
  layoutAreaId: number | null,
): void {
  db.prepare('UPDATE clips SET default_layout_area_id = ? WHERE id = ?').run(
    layoutAreaId,
    clipId,
  );
}
