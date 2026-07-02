import type { Database as BetterDatabase } from 'better-sqlite3';

const KEY_GAME_LOCKED_LABELS = 'integration.twitch.game_locked_labels';

function readCache(db: BetterDatabase): Record<string, string[]> {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(KEY_GAME_LOCKED_LABELS) as
    | { value: string }
    | undefined;
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, string[]> = {};
    for (const [gameId, labels] of Object.entries(parsed)) {
      if (Array.isArray(labels) && labels.every((item) => typeof item === 'string')) {
        result[gameId] = labels;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeCache(db: BetterDatabase, cache: Record<string, string[]>): void {
  db.prepare(
    `INSERT INTO app_settings(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY_GAME_LOCKED_LABELS, JSON.stringify(cache));
}

export function getCachedLockedLabelsForGame(
  db: BetterDatabase,
  gameId: string,
): string[] | undefined {
  const cache = readCache(db);
  if (!(gameId in cache)) return undefined;
  return cache[gameId];
}

export function saveGameLockedLabels(
  db: BetterDatabase,
  gameId: string,
  labelIds: string[],
): void {
  const cache = readCache(db);
  cache[gameId] = [...new Set(labelIds)];
  writeCache(db, cache);
}
