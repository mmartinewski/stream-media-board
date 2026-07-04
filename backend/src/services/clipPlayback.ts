import { existsSync } from 'node:fs';
import type { Database as BetterDatabase } from 'better-sqlite3';
import type { AppPaths } from '../config/paths.js';
import { getClipById } from '../db/repositories/clips.js';
import { getPlaybackVolume } from '../db/repositories/settings.js';
import { assertBinaries } from '../lib/binaries.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  browserSourceClientsForEvent,
  publishBrowserSourceEvent,
  publishBrowserSourceStopAll,
  type BrowserSourcePlayEvent,
} from './browserSourceHub.js';
import { resolveLayoutAreaForClip } from './layoutAreaResolve.js';
import { resolveStoredMediaPath } from './storedMediaPaths.js';
import { resolveClipVideoOrientation } from './videoOrientation.js';

export interface ClipPlaybackResult {
  status: 'playing';
  playback: 'browser_source';
  connected_clients: number;
  clip_id: number;
  clip_type: 'audio' | 'video';
}

export function playClipById(
  paths: AppPaths,
  db: BetterDatabase,
  clipId: number,
  requestedLayoutAreaId?: number | null,
): ClipPlaybackResult {
  assertBinaries(paths);
  const row = getClipById(db, clipId);
  if (!row) {
    throw new HttpError(404, 'Clip not found.', 'clip_not_found');
  }

  const playbackVolume = getPlaybackVolume(db);
  let playEvent: BrowserSourcePlayEvent;

  if (row.clip_type === 'video') {
    const videoPath = row.video_path ? resolveStoredMediaPath(paths, row.video_path) : '';
    if (!videoPath || !existsSync(videoPath)) {
      throw new HttpError(404, 'Video file not found.', 'video_missing');
    }
    const layoutArea = resolveLayoutAreaForClip(db, row, requestedLayoutAreaId ?? null);
    playEvent = {
      type: 'play',
      mediaKind: 'video',
      mediaUrl: `/api/clips/${clipId}/video`,
      volume: row.volume,
      playbackVolume,
      width: row.video_width ?? undefined,
      height: row.video_height ?? undefined,
      orientation: resolveClipVideoOrientation(
        row.video_orientation,
        row.video_width,
        row.video_height,
      ),
      layoutArea,
    };
  } else {
    const audioPath = resolveStoredMediaPath(paths, row.audio_path);
    if (!existsSync(audioPath)) {
      throw new HttpError(404, 'Audio file not found.', 'audio_missing');
    }
    playEvent = {
      type: 'play',
      mediaKind: 'audio',
      mediaUrl: `/api/clips/${clipId}/audio`,
      volume: row.volume,
      playbackVolume,
    };
  }

  publishBrowserSourceStopAll();
  publishBrowserSourceEvent(playEvent);

  return {
    status: 'playing',
    playback: 'browser_source',
    connected_clients: browserSourceClientsForEvent(playEvent),
    clip_id: clipId,
    clip_type: row.clip_type === 'video' ? 'video' : 'audio',
  };
}
