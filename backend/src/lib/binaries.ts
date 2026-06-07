import { existsSync } from 'node:fs';
import type { AppPaths } from '../config/paths.js';
import { HttpError } from '../middleware/errorHandler.js';

export function assertBinaries(paths: AppPaths): void {
  const missing: string[] = [];
  for (const [label, p] of [
    ['ffmpeg.exe', paths.ffmpegExe],
    ['ffprobe.exe', paths.ffprobeExe],
    ['yt-dlp.exe', paths.ytDlpExe],
  ] as const) {
    if (!existsSync(p)) missing.push(label);
  }
  if (missing.length > 0) {
    throw new HttpError(
      503,
      `Missing binaries in /bin: ${missing.join(', ')}. Run npm run fetch:bin.`,
      'binaries_missing',
    );
  }
}
