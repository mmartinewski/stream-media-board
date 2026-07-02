-- Canonical v1 schema. See section 5 of the technical specification.
-- Kept idempotent so it can run on successive startups.

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    thumbnail_original_path TEXT,
    thumbnail_cropped_path TEXT,
    thumbnail_crop_meta TEXT,
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
    video_width INTEGER,
    video_height INTEGER,
    video_orientation TEXT,
    default_layout_area_id INTEGER,
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

CREATE TABLE IF NOT EXISTS twitch_stream_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    game_id TEXT NOT NULL DEFAULT '',
    game_name TEXT NOT NULL DEFAULT '',
    game_box_art_url TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    broadcaster_language TEXT NOT NULL DEFAULT 'pt',
    content_classification_labels TEXT NOT NULL DEFAULT '[]',
    is_branded_content INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
