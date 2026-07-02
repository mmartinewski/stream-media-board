import type { Database as BetterDatabase } from 'better-sqlite3';
import {
  getCachedLockedLabelsForGame,
  saveGameLockedLabels,
} from '../db/repositories/twitchGameLockedLabels.js';
import {
  getTwitchChannelInfo,
  isBroadcasterLive,
  updateTwitchChannel,
} from './twitchHelix.js';

export async function getLockedContentLabelsForGame(
  db: BetterDatabase,
  gameId: string,
): Promise<string[]> {
  const trimmed = gameId.trim();
  if (!trimmed) return [];

  const cached = getCachedLockedLabelsForGame(db, trimmed);
  if (cached !== undefined) return cached;

  const channel = await getTwitchChannelInfo(db);

  if (channel.game_id === trimmed) {
    const heuristic = channel.content_classification_labels.filter((id) => id === 'MatureGame');
    return heuristic;
  }

  if (await isBroadcasterLive(db)) {
    return [];
  }

  const beforeLabels = new Set(channel.content_classification_labels);
  try {
    await updateTwitchChannel(db, { game_id: trimmed });
    const after = await getTwitchChannelInfo(db);
    const locked = after.content_classification_labels.filter((id) => !beforeLabels.has(id));
    saveGameLockedLabels(db, trimmed, locked);
    return locked;
  } finally {
    if (channel.game_id !== trimmed) {
      await updateTwitchChannel(db, { game_id: channel.game_id });
    }
  }
}
