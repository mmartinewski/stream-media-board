import type { Database as BetterDatabase } from 'better-sqlite3';
import {
  ensureLayoutAreasSchema,
  seedLayoutAreasIfEmpty,
} from './repositories/layoutAreas.js';
import { ensureTodoListsSchema } from './repositories/todoLists.js';
import { ensureMediaSearchCacheSchema } from './repositories/mediaSearchCache.js';
import { ensureTwitchStreamPresetsSchema } from './repositories/twitchPresets.js';

// IMPORTANT: keep this in sync with `schema.sql` in the same folder.
// The `.sql` file is the human reference; this DDL is what actually runs.
const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clip_categories (
    clip_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (clip_id, category_id),
    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    youtube_url TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    category_id INTEGER,
    tags TEXT,
    thumbnail_original_path TEXT NOT NULL,
    thumbnail_cropped_path TEXT NOT NULL,
    thumbnail_crop_meta TEXT,
    audio_path TEXT NOT NULL,
    clip_type TEXT NOT NULL DEFAULT 'audio',
    video_path TEXT,
    video_width INTEGER,
    video_height INTEGER,
    video_orientation TEXT,
    volume INTEGER NOT NULL DEFAULT 75,
    audio_normalize INTEGER NOT NULL DEFAULT 0,
    audio_fade INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings(key, value) VALUES ('playback_volume', '75');
`;

export function migrate(db: BetterDatabase): void {
  db.exec(SCHEMA_DDL);
  ensureColumn(db, 'clips', 'volume', 'INTEGER NOT NULL DEFAULT 75');
  ensureColumn(db, 'clips', 'audio_normalize', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'clips', 'audio_fade', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'clips', 'clip_type', "TEXT NOT NULL DEFAULT 'audio'");
  ensureColumn(db, 'clips', 'video_path', 'TEXT');
  ensureColumn(db, 'clips', 'video_width', 'INTEGER');
  ensureColumn(db, 'clips', 'video_height', 'INTEGER');
  ensureColumn(db, 'clips', 'video_orientation', 'TEXT');
  ensureColumn(db, 'clips', 'default_layout_area_id', 'INTEGER');
  db.prepare(
    `UPDATE clips SET video_orientation = 'landscape' WHERE video_orientation = 'square'`,
  ).run();
  ensureLayoutAreasSchema(db);
  seedLayoutAreasIfEmpty(db);
  ensureTodoListsSchema(db);
  ensureMediaSearchCacheSchema(db);
  ensureTwitchStreamPresetsSchema(db);
  migrateClipCategories(db);
  ensureColumn(db, 'categories', 'thumbnail_original_path', 'TEXT');
  ensureColumn(db, 'categories', 'thumbnail_cropped_path', 'TEXT');
  ensureColumn(db, 'categories', 'thumbnail_crop_meta', 'TEXT');
}

function migrateClipCategories(db: BetterDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clip_categories (
      clip_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (clip_id, category_id),
      FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );
  `);
  db.prepare(
    `INSERT OR IGNORE INTO clip_categories (clip_id, category_id)
     SELECT id, category_id FROM clips WHERE category_id IS NOT NULL`,
  ).run();
}

function ensureColumn(
  db: BetterDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (rows.some((row) => row.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
