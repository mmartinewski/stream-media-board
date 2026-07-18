import type { Database as BetterDatabase } from 'better-sqlite3';

export interface MacroRow {
  id: number;
  name: string;
  event_message: string;
  thumbnail_original_path: string | null;
  thumbnail_cropped_path: string | null;
  thumbnail_crop_meta: string | null;
  sort_order: number;
  created_at: string;
}

const MACRO_COLUMNS =
  'id, name, event_message, thumbnail_original_path, thumbnail_cropped_path, thumbnail_crop_meta, sort_order, created_at';

export function ensureMacrosSchema(db: BetterDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS macros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      event_message TEXT NOT NULL,
      thumbnail_original_path TEXT,
      thumbnail_cropped_path TEXT,
      thumbnail_crop_meta TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function listMacros(db: BetterDatabase): MacroRow[] {
  return db
    .prepare(
      `SELECT ${MACRO_COLUMNS} FROM macros ORDER BY sort_order ASC, id ASC`,
    )
    .all() as MacroRow[];
}

export function getMacroById(db: BetterDatabase, id: number): MacroRow | undefined {
  return db
    .prepare(`SELECT ${MACRO_COLUMNS} FROM macros WHERE id = ?`)
    .get(id) as MacroRow | undefined;
}

export function createMacro(
  db: BetterDatabase,
  input: { name: string; event_message: string },
): MacroRow {
  const name = input.name.trim();
  const eventMessage = input.event_message.trim();
  if (!name) throw new Error('Macro name cannot be empty.');
  if (!eventMessage) throw new Error('Macro event message cannot be empty.');

  const maxRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM macros')
    .get() as { max_order: number };
  const sortOrder = Number(maxRow.max_order) + 1;

  const result = db
    .prepare(
      `INSERT INTO macros(name, event_message, sort_order)
       VALUES (?, ?, ?)`,
    )
    .run(name, eventMessage, sortOrder);

  return getMacroById(db, Number(result.lastInsertRowid))!;
}

export function updateMacro(
  db: BetterDatabase,
  id: number,
  input: { name: string; event_message: string },
): MacroRow {
  const name = input.name.trim();
  const eventMessage = input.event_message.trim();
  if (!name) throw new Error('Macro name cannot be empty.');
  if (!eventMessage) throw new Error('Macro event message cannot be empty.');

  const current = getMacroById(db, id);
  if (!current) throw new Error('Macro not found.');

  db.prepare(
    `UPDATE macros SET name = ?, event_message = ? WHERE id = ?`,
  ).run(name, eventMessage, id);

  return getMacroById(db, id)!;
}

export function updateMacroThumbnails(
  db: BetterDatabase,
  id: number,
  thumbnails: {
    thumbnail_original_path: string | null;
    thumbnail_cropped_path: string | null;
    thumbnail_crop_meta: string | null;
  },
): MacroRow {
  const current = getMacroById(db, id);
  if (!current) throw new Error('Macro not found.');

  db.prepare(
    `UPDATE macros
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

  return getMacroById(db, id)!;
}

export function deleteMacro(db: BetterDatabase, id: number): void {
  const current = getMacroById(db, id);
  if (!current) throw new Error('Macro not found.');
  db.prepare('DELETE FROM macros WHERE id = ?').run(id);
}
