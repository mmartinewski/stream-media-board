-- Canonical v1 schema. See section 5 of the technical specification.
-- Kept idempotent so it can run on successive startups.

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    youtube_url TEXT NOT NULL,
    start_time TEXT NOT NULL,            -- HH:MM:SS.mmm format (see section 6.2)
    end_time TEXT NOT NULL,              -- HH:MM:SS.mmm format (see section 6.2)
    category_id INTEGER,
    tags TEXT,
    thumbnail_original_path TEXT NOT NULL,
    thumbnail_cropped_path TEXT NOT NULL,
    thumbnail_crop_meta TEXT,
    audio_path TEXT NOT NULL,
    clip_type TEXT NOT NULL DEFAULT 'audio',
    video_path TEXT,
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
