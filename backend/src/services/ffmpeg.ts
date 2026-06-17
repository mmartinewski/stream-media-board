import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CutToMp3Options {
  ffmpegExe: string;
  inputFile: string;
  outputFile: string;
  startSeconds: number;
  durationSeconds: number;
  sourceDurationSeconds?: number;
  normalizeAudio?: boolean;
  /** Bitrate constante (ex.: "192k"). */
  bitrate?: string;
}

export async function cutToMp3(options: CutToMp3Options): Promise<void> {
  const bitrate = options.bitrate ?? '192k';
  const args = [
    '-y',
    '-loglevel',
    'error',
    '-i',
    options.inputFile,
    '-ss',
    options.startSeconds.toFixed(3),
    '-t',
    options.durationSeconds.toFixed(3),
    '-vn',
  ];

  if (options.normalizeAudio) {
    args.push('-af', 'loudnorm=I=-14:TP=-1.0:LRA=11');
  }

  args.push(
    '-acodec',
    'libmp3lame',
    '-b:a',
    bitrate,
    options.outputFile,
  );

  await execFileAsync(options.ffmpegExe, args);
}

export interface CutToMp4Options {
  ffmpegExe: string;
  inputFile: string;
  outputFile: string;
  startSeconds: number;
  durationSeconds: number;
}

export async function cutToMp4(options: CutToMp4Options): Promise<void> {
  const args = [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    options.startSeconds.toFixed(3),
    '-i',
    options.inputFile,
    '-t',
    options.durationSeconds.toFixed(3),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    options.outputFile,
  ];

  await execFileAsync(options.ffmpegExe, args);
}

export interface TranscodeToStageMp4Options {
  ffmpegExe: string;
  inputFile: string;
  outputFile: string;
}

/** Looping GIF/WebP → H.264 MP4 for stage browser-source playback. */
export async function transcodeToStageMp4(options: TranscodeToStageMp4Options): Promise<void> {
  const args = [
    '-y',
    '-loglevel',
    'error',
    '-i',
    options.inputFile,
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-movflags',
    '+faststart',
    '-an',
    options.outputFile,
  ];

  await execFileAsync(options.ffmpegExe, args);
}

export async function tryTranscodeToStageMp4(options: TranscodeToStageMp4Options): Promise<boolean> {
  try {
    await transcodeToStageMp4(options);
    return true;
  } catch {
    return false;
  }
}
