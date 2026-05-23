import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { resolveYoutubeConfig } from '../config/youtube.js';

const execFileAsync = promisify(execFile);

export const YOUTUBE_URL_REGEX =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{6,}([&?][^\s]*)?$/i;

export class YoutubeDownloadError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'YoutubeDownloadError';
    this.code = code;
  }
}

export function isValidYoutubeUrl(url: string): boolean {
  return YOUTUBE_URL_REGEX.test(url.trim());
}

export function getYoutubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./i, '').replace(/^m\./i, '');
  if (host === 'youtu.be') {
    return normalizeVideoId(parsed.pathname.split('/').filter(Boolean)[0]);
  }

  if (host !== 'youtube.com') return null;
  const watchId = normalizeVideoId(parsed.searchParams.get('v'));
  if (watchId) return watchId;

  const [kind, id] = parsed.pathname.split('/').filter(Boolean);
  if (kind === 'shorts' || kind === 'embed' || kind === 'live') {
    return normalizeVideoId(id);
  }
  return null;
}

/** Canonical watch URL helps yt-dlp handle Shorts and other variants consistently. */
export function normalizeYoutubeUrl(url: string): string {
  const trimmed = url.trim();
  const videoId = getYoutubeVideoId(trimmed);
  if (!videoId) return trimmed;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYoutubeThumbnailCandidates(url: string): string[] {
  const videoId = getYoutubeVideoId(url);
  if (!videoId) return [];
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];
}

function normalizeVideoId(value: string | null | undefined): string | null {
  if (!value || !/^[\w-]{6,}$/.test(value)) return null;
  return value;
}

export interface DownloadAudioOptions {
  ytDlpExe: string;
  ytDlpNodeExe?: string | null;
  ffmpegExe: string;
  configFile: string;
  youtubeCookiesFile: string;
  url: string;
  /** Final path without extension; yt-dlp adds the downloaded format extension. */
  outputBase: string;
}

export async function getYoutubeTitle(
  ytDlpExe: string,
  configFile: string,
  youtubeCookiesFile: string,
  url: string,
  ytDlpNodeExe?: string | null,
): Promise<string> {
  const normalizedUrl = normalizeYoutubeUrl(url);
  const { stdout } = await runYtDlp(ytDlpExe, configFile, youtubeCookiesFile, ytDlpNodeExe, [
    '--no-playlist',
    '--no-warnings',
    '--skip-download',
    '--print',
    'title',
    normalizedUrl,
  ]);
  return stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
}

/**
 * Downloads only the best available audio stream.
 * Returns the generated file path, with the extension chosen by yt-dlp.
 */
export async function downloadBestAudio(options: DownloadAudioOptions): Promise<string> {
  const normalizedUrl = normalizeYoutubeUrl(options.url);
  const { stdout } = await runYtDlp(
    options.ytDlpExe,
    options.configFile,
    options.youtubeCookiesFile,
    options.ytDlpNodeExe,
    [
      '-f',
      'bestaudio/best',
      '--no-playlist',
      '--no-warnings',
      '--ffmpeg-location',
      options.ffmpegExe,
      '--print',
      'after_move:filepath',
      '-o',
      `${options.outputBase}.%(ext)s`,
      normalizedUrl,
    ],
  );
  const filePath = stdout.trim().split(/\r?\n/).pop() ?? '';
  if (!filePath) {
    throw new YoutubeDownloadError(
      'yt-dlp did not return the downloaded file path.',
      'yt_dlp_no_output',
    );
  }
  return filePath;
}

/**
 * Downloads a merged MP4 suitable for browser overlay playback (max 720p).
 */
export async function downloadBestVideo(options: DownloadAudioOptions): Promise<string> {
  const normalizedUrl = normalizeYoutubeUrl(options.url);
  const { stdout } = await runYtDlp(
    options.ytDlpExe,
    options.configFile,
    options.youtubeCookiesFile,
    options.ytDlpNodeExe,
    [
      '-f',
      'bv*[height<=720]+ba/b[ext=mp4]/b[ext=mp4]/bv*+ba/b',
      '--merge-output-format',
      'mp4',
      '--no-playlist',
      '--no-warnings',
      '--ffmpeg-location',
      options.ffmpegExe,
      '--print',
      'after_move:filepath',
      '-o',
      `${options.outputBase}.%(ext)s`,
      normalizedUrl,
    ],
  );
  const filePath = stdout.trim().split(/\r?\n/).pop() ?? '';
  if (!filePath) {
    throw new YoutubeDownloadError(
      'yt-dlp did not return the downloaded file path.',
      'yt_dlp_no_output',
    );
  }
  return filePath;
}

function buildYtDlpBaseArgs(
  configFile: string,
  youtubeCookiesFile: string,
  ytDlpNodeExe?: string | null,
): string[] {
  const config = resolveYoutubeConfig(configFile, youtubeCookiesFile);
  const args: string[] = [];

  if (ytDlpNodeExe) {
    args.push('--js-runtimes', `node:${ytDlpNodeExe}`);
  }

  if (config.cookiesFile && existsSync(config.cookiesFile)) {
    args.push('--cookies', config.cookiesFile);
  } else if (config.cookiesFromBrowser) {
    args.push('--cookies-from-browser', config.cookiesFromBrowser);
  }

  return args;
}

async function runYtDlp(
  ytDlpExe: string,
  configFile: string,
  youtubeCookiesFile: string,
  ytDlpNodeExe: string | null | undefined,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(
      ytDlpExe,
      [...buildYtDlpBaseArgs(configFile, youtubeCookiesFile, ytDlpNodeExe), ...args],
      {
      maxBuffer: 16 * 1024 * 1024,
    });
    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
    };
  } catch (err) {
    const execErr = err as NodeJS.ErrnoException & {
      stderr?: string | Buffer;
      stdout?: string | Buffer;
    };
    const stderr = String(execErr.stderr ?? '');
    const stdout = String(execErr.stdout ?? '');
    throw parseYtDlpFailure(stderr, stdout, configFile, youtubeCookiesFile);
  }
}

function parseYtDlpFailure(
  stderr: string,
  stdout: string,
  configFile: string,
  youtubeCookiesFile: string,
): YoutubeDownloadError {
  const combined = `${stderr}\n${stdout}`.toLowerCase();
  const youtubeConfig = resolveYoutubeConfig(configFile, youtubeCookiesFile);
  const hasCookies = Boolean(youtubeConfig.cookiesFromBrowser || youtubeConfig.cookiesFile);

  if (
    combined.includes('sign in to confirm') ||
    combined.includes('not a bot') ||
    combined.includes('cookies-from-browser')
  ) {
    const hint = hasCookies
      ? 'YouTube still blocked the download. Sign in again from the tray menu (Sign in to YouTube) or the clip form.'
      : 'YouTube blocked the download. Sign in with Google using the tray menu option "Sign in to YouTube", then try again.';
    return new YoutubeDownloadError(hint, 'youtube_bot_check');
  }

  if (combined.includes('429') || combined.includes('too many requests')) {
    const hint = hasCookies
      ? 'YouTube rate-limited this machine. Wait a few minutes and try again.'
      : 'YouTube rate-limited this machine. Sign in with Google from the tray menu, then try again.';
    return new YoutubeDownloadError(hint, 'youtube_rate_limited');
  }

  if (combined.includes('private video') || combined.includes('private')) {
    return new YoutubeDownloadError('This YouTube video is private.', 'youtube_private');
  }

  if (combined.includes('unavailable') || combined.includes('removed')) {
    return new YoutubeDownloadError('This YouTube video is unavailable.', 'youtube_unavailable');
  }

  if (
    combined.includes('signature solving failed') ||
    combined.includes('n challenge solving failed') ||
    combined.includes('only images are available')
  ) {
    return new YoutubeDownloadError(
      'YouTube blocked format extraction. Restart the app from the desktop tray (it bundles Node for yt-dlp), or install Node.js 20+ and set YTDLP_JS_RUNTIME to its full path.',
      'youtube_ejs_required',
    );
  }

  if (combined.includes('requested format is not available')) {
    return new YoutubeDownloadError(
      'No downloadable audio format was found for this video. Try again after restarting the desktop app, or update yt-dlp with npm run fetch:bin.',
      'youtube_format_unavailable',
    );
  }

  const detail = extractYtDlpErrorLine(stderr) || extractYtDlpErrorLine(stdout);
  return new YoutubeDownloadError(
    detail
      ? `Could not download the YouTube audio: ${detail}`
      : 'Could not download the YouTube audio.',
    'youtube_download_failed',
  );
}

function extractYtDlpErrorLine(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const errorLine = lines.find((line) => /^error:/i.test(line));
  if (!errorLine) return null;
  return errorLine.replace(/^error:\s*/i, '').slice(0, 240);
}
