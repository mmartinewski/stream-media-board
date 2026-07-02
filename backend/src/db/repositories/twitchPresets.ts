import type { Database as BetterDatabase } from 'better-sqlite3';
import { HttpError } from '../../middleware/errorHandler.js';
import type {
  TwitchStreamPresetDto,
  TwitchStreamPresetInput,
} from '../../services/twitchTypes.js';
import { getTwitchChannelInfo, updateTwitchChannel } from '../../services/twitchHelix.js';
import {
  buildContentClassificationLabelUpdates,
  chunkContentClassificationLabelUpdates,
} from '../../services/twitchContentLabels.js';
import { saveGameLockedLabels } from './twitchGameLockedLabels.js';

interface TwitchStreamPresetRow {
  id: number;
  name: string;
  sort_order: number;
  title: string;
  game_id: string;
  game_name: string;
  game_box_art_url: string;
  tags: string;
  broadcaster_language: string;
  content_classification_labels: string;
  is_branded_content: number;
  created_at: string;
  updated_at: string;
}

export function ensureTwitchStreamPresetsSchema(db: BetterDatabase): void {
  db.exec(`
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
  `);
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function rowToDto(row: TwitchStreamPresetRow): TwitchStreamPresetDto {
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    title: row.title,
    game_id: row.game_id,
    game_name: row.game_name,
    game_box_art_url: row.game_box_art_url,
    tags: parseJsonArray(row.tags),
    broadcaster_language: row.broadcaster_language,
    content_classification_labels: parseJsonArray(row.content_classification_labels),
    is_branded_content: row.is_branded_content === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateTags(tags: string[]): string[] {
  if (tags.length > 10) {
    throw new HttpError(400, 'A preset can have at most 10 tags.', 'twitch_tags_limit');
  }
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) {
      throw new HttpError(400, 'Tags cannot be empty.', 'twitch_tag_empty');
    }
    if (trimmed.length > 25) {
      throw new HttpError(400, 'Each tag can be at most 25 characters.', 'twitch_tag_too_long');
    }
    if (/\s/.test(trimmed)) {
      throw new HttpError(400, 'Tags cannot contain spaces.', 'twitch_tag_spaces');
    }
  }
  return tags.map((t) => t.trim());
}

export function parseTwitchStreamPresetInput(body: unknown): TwitchStreamPresetInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new HttpError(400, 'Preset name is required.', 'twitch_preset_name_required');
  }
  if (typeof raw.title !== 'string') {
    throw new HttpError(400, 'Title is required.', 'twitch_preset_title_required');
  }
  if (raw.title.length > 140) {
    throw new HttpError(400, 'Title can be at most 140 characters.', 'twitch_title_too_long');
  }
  if (typeof raw.game_id !== 'string' || !raw.game_id.trim()) {
    throw new HttpError(400, 'Category is required.', 'twitch_preset_category_required');
  }
  if (typeof raw.game_name !== 'string' || !raw.game_name.trim()) {
    throw new HttpError(400, 'Category name is required.', 'twitch_preset_category_name_required');
  }
  const tags = validateTags(
    Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
  );
  const language =
    typeof raw.broadcaster_language === 'string' && raw.broadcaster_language.trim()
      ? raw.broadcaster_language.trim()
      : 'pt';
  const labels = Array.isArray(raw.content_classification_labels)
    ? raw.content_classification_labels.filter((l): l is string => typeof l === 'string')
    : [];
  if (labels.length > 6) {
    throw new HttpError(
      400,
      'A preset can have at most 6 content classification labels.',
      'twitch_content_labels_limit',
    );
  }

  return {
    name: raw.name.trim(),
    sort_order:
      typeof raw.sort_order === 'number'
        ? raw.sort_order
        : Number(raw.sort_order) || 0,
    title: raw.title,
    game_id: raw.game_id.trim(),
    game_name: raw.game_name.trim(),
    game_box_art_url:
      typeof raw.game_box_art_url === 'string' ? raw.game_box_art_url : '',
    tags,
    broadcaster_language: language,
    content_classification_labels: labels,
    is_branded_content: raw.is_branded_content === true || raw.is_branded_content === 1,
  };
}

export function listTwitchStreamPresets(db: BetterDatabase): TwitchStreamPresetDto[] {
  const rows = db
    .prepare(
      `SELECT * FROM twitch_stream_presets
       ORDER BY sort_order ASC, name COLLATE NOCASE ASC`,
    )
    .all() as TwitchStreamPresetRow[];
  return rows.map(rowToDto);
}

export function getTwitchStreamPresetById(
  db: BetterDatabase,
  id: number,
): TwitchStreamPresetDto | null {
  const row = db
    .prepare('SELECT * FROM twitch_stream_presets WHERE id = ?')
    .get(id) as TwitchStreamPresetRow | undefined;
  return row ? rowToDto(row) : null;
}

export function createTwitchStreamPreset(
  db: BetterDatabase,
  input: TwitchStreamPresetInput,
): TwitchStreamPresetDto {
  const result = db
    .prepare(
      `INSERT INTO twitch_stream_presets (
        name, sort_order, title, game_id, game_name, game_box_art_url,
        tags, broadcaster_language, content_classification_labels, is_branded_content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.sort_order ?? 0,
      input.title,
      input.game_id,
      input.game_name,
      input.game_box_art_url ?? '',
      JSON.stringify(input.tags),
      input.broadcaster_language,
      JSON.stringify(input.content_classification_labels),
      input.is_branded_content ? 1 : 0,
    );
  const created = getTwitchStreamPresetById(db, Number(result.lastInsertRowid));
  if (!created) {
    throw new HttpError(500, 'Failed to create preset.', 'twitch_preset_create_failed');
  }
  return created;
}

export function updateTwitchStreamPreset(
  db: BetterDatabase,
  id: number,
  input: TwitchStreamPresetInput,
): TwitchStreamPresetDto {
  const existing = getTwitchStreamPresetById(db, id);
  if (!existing) {
    throw new HttpError(404, 'Preset not found.', 'twitch_preset_not_found');
  }
  db.prepare(
    `UPDATE twitch_stream_presets SET
      name = ?, sort_order = ?, title = ?, game_id = ?, game_name = ?, game_box_art_url = ?,
      tags = ?, broadcaster_language = ?, content_classification_labels = ?,
      is_branded_content = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(
    input.name,
    input.sort_order ?? 0,
    input.title,
    input.game_id,
    input.game_name,
    input.game_box_art_url ?? '',
    JSON.stringify(input.tags),
    input.broadcaster_language,
    JSON.stringify(input.content_classification_labels),
    input.is_branded_content ? 1 : 0,
    id,
  );
  const updated = getTwitchStreamPresetById(db, id);
  if (!updated) {
    throw new HttpError(500, 'Failed to update preset.', 'twitch_preset_update_failed');
  }
  return updated;
}

export function deleteTwitchStreamPreset(db: BetterDatabase, id: number): void {
  const result = db.prepare('DELETE FROM twitch_stream_presets WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw new HttpError(404, 'Preset not found.', 'twitch_preset_not_found');
  }
}

export function duplicateTwitchStreamPreset(
  db: BetterDatabase,
  id: number,
): TwitchStreamPresetDto {
  const existing = getTwitchStreamPresetById(db, id);
  if (!existing) {
    throw new HttpError(404, 'Preset not found.', 'twitch_preset_not_found');
  }
  let copyName = `${existing.name} (copy)`;
  let suffix = 2;
  while (getPresetByName(db, copyName)) {
    copyName = `${existing.name} (copy ${suffix})`;
    suffix += 1;
  }
  return createTwitchStreamPreset(db, {
    name: copyName,
    sort_order: existing.sort_order + 1,
    title: existing.title,
    game_id: existing.game_id,
    game_name: existing.game_name,
    game_box_art_url: existing.game_box_art_url,
    tags: existing.tags,
    broadcaster_language: existing.broadcaster_language,
    content_classification_labels: existing.content_classification_labels,
    is_branded_content: existing.is_branded_content,
  });
}

function getPresetByName(db: BetterDatabase, name: string): TwitchStreamPresetDto | null {
  const row = db
    .prepare('SELECT * FROM twitch_stream_presets WHERE name = ?')
    .get(name) as TwitchStreamPresetRow | undefined;
  return row ? rowToDto(row) : null;
}

export async function applyTwitchStreamPreset(
  db: BetterDatabase,
  id: number,
): Promise<TwitchStreamPresetDto> {
  const preset = getTwitchStreamPresetById(db, id);
  if (!preset) {
    throw new HttpError(404, 'Preset not found.', 'twitch_preset_not_found');
  }

  const basePayload = {
    title: preset.title,
    game_id: preset.game_id,
    tags: preset.tags,
    broadcaster_language: preset.broadcaster_language,
    is_branded_content: preset.is_branded_content,
  };

  // Apply stream fields first so Twitch can attach game-mandatory labels (e.g. MatureGame).
  await updateTwitchChannel(db, basePayload);
  const channel = await getTwitchChannelInfo(db);
  const lockedLabels = channel.content_classification_labels.filter(
    (id) => !preset.content_classification_labels.includes(id),
  );
  if (preset.game_id) {
    saveGameLockedLabels(db, preset.game_id, lockedLabels);
  }
  const labelUpdates = buildContentClassificationLabelUpdates(
    channel.content_classification_labels,
    preset.content_classification_labels,
    lockedLabels,
  );
  const labelChunks = chunkContentClassificationLabelUpdates(labelUpdates);

  for (const chunk of labelChunks) {
    await updateTwitchChannel(db, { content_classification_labels: chunk });
  }

  return preset;
}
