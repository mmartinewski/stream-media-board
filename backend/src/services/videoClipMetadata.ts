import { existsSync } from 'node:fs';
import type { Database as BetterDatabase } from 'better-sqlite3';
import type { AppPaths } from '../config/paths.js';
import { logger } from '../lib/logger.js';
import { probeVideoDimensions } from './ffprobe.js';
import { resolveStoredMediaPath } from './storedMediaPaths.js';
import {
  deriveVideoOrientation,
  parseVideoOrientation,
  type VideoOrientation,
} from './videoOrientation.js';

export interface VideoClipMetadata {
  video_width: number;
  video_height: number;
  video_orientation: VideoOrientation;
}

export async function probeVideoClipMetadata(
  paths: AppPaths,
  videoFilePath: string,
  userOrientation?: string | null,
): Promise<VideoClipMetadata> {
  const { width, height } = await probeVideoDimensions(paths.ffprobeExe, videoFilePath);
  const parsed = userOrientation ? parseVideoOrientation(userOrientation) : null;
  const video_orientation = parsed ?? deriveVideoOrientation(width, height);
  return {
    video_width: width,
    video_height: height,
    video_orientation,
  };
}

export function updateClipVideoMetadata(
  db: BetterDatabase,
  clipId: number,
  metadata: VideoClipMetadata,
): void {
  db.prepare(
    `UPDATE clips SET video_width = ?, video_height = ?, video_orientation = ? WHERE id = ?`,
  ).run(metadata.video_width, metadata.video_height, metadata.video_orientation, clipId);
}

export async function backfillVideoClipMetadata(
  db: BetterDatabase,
  paths: AppPaths,
): Promise<number> {
  const rows = db
    .prepare(
      `SELECT id, video_path, video_width, video_orientation
       FROM clips
       WHERE clip_type = 'video' AND video_path IS NOT NULL AND video_path != ''`,
    )
    .all() as Array<{
    id: number;
    video_path: string;
    video_width: number | null;
    video_orientation: string | null;
  }>;

  let updated = 0;
  for (const row of rows) {
    if (row.video_orientation) continue;
    const videoPath = resolveStoredMediaPath(paths, row.video_path);
    if (!existsSync(videoPath)) continue;
    try {
      const { width, height } = await probeVideoDimensions(paths.ffprobeExe, videoPath);
      updateClipVideoMetadata(db, row.id, {
        video_width: width,
        video_height: height,
        video_orientation: deriveVideoOrientation(width, height),
      });
      updated += 1;
    } catch (err) {
      logger.warn('video metadata backfill skipped clip', { clipId: row.id, err });
    }
  }
  return updated;
}
