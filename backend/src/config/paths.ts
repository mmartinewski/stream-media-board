import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

const repoRootCandidate = resolve(moduleDir, '..', '..', '..');
const explicitRuntimeRoot = process.env.PERSONAL_CLIP_PLAYER_ROOT;

const APPDATA_ROOT =
  process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');

const APP_FOLDER_NAME = 'LocalSoundboardServer';

export interface AppPaths {
  readonly appData: string;
  readonly database: string;
  readonly databaseFile: string;
  readonly mediaAudio: string;
  readonly mediaVideo: string;
  readonly mediaThumbnails: string;
  readonly mediaTemp: string;
  readonly logs: string;
  readonly logFile: string;
  readonly bin: string;
  readonly ffmpegExe: string;
  readonly ffprobeExe: string;
  readonly ffplayExe: string;
  readonly ytDlpExe: string;
  /** Node.js executable used by yt-dlp for YouTube JS challenges (EJS). */
  readonly ytDlpNodeExe: string | null;
  readonly configFile: string;
  readonly youtubeCookiesFile: string;
  readonly frontendDist: string;
  /** Dev/test media bundled with the repo (e.g. browser source smoke tests). */
  readonly mediaFiles: string;
}

export function resolvePaths(): AppPaths {
  const runtimeRoot = resolveRuntimeRoot();
  const appData = join(APPDATA_ROOT, APP_FOLDER_NAME);
  const database = join(appData, 'database');
  const mediaAudio = join(appData, 'media', 'audio');
  const mediaVideo = join(appData, 'media', 'video');
  const mediaThumbnails = join(appData, 'media', 'thumbnails');
  const mediaTemp = join(appData, 'media', 'temp');
  const logs = join(appData, 'logs');

  const bin = join(runtimeRoot, 'bin');
  const configFile = join(runtimeRoot, 'config', 'config.json');
  const frontendDist = join(runtimeRoot, 'frontend', 'dist');
  const mediaFiles = join(runtimeRoot, 'media-files');

  return {
    appData,
    database,
    databaseFile: join(database, 'storage.db'),
    mediaAudio,
    mediaVideo,
    mediaThumbnails,
    mediaTemp,
    logs,
    logFile: join(logs, 'latest.log'),
    bin,
    ffmpegExe: join(bin, 'ffmpeg.exe'),
    ffprobeExe: join(bin, 'ffprobe.exe'),
    ffplayExe: join(bin, 'ffplay.exe'),
    ytDlpExe: join(bin, 'yt-dlp.exe'),
    ytDlpNodeExe: resolveYtDlpNodeExe(runtimeRoot, bin),
    configFile,
    youtubeCookiesFile: join(appData, 'youtube.cookies.txt'),
    frontendDist,
    mediaFiles,
  };
}

function resolveYtDlpNodeExe(runtimeRoot: string, bin: string): string | null {
  const fromEnv = process.env.YTDLP_JS_RUNTIME?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const nodeBinary = process.env.NODE_BINARY?.trim();
  if (nodeBinary && existsSync(nodeBinary)) return nodeBinary;

  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  const electronResourcesPath = electronProcess.resourcesPath;
  if (process.versions.electron && electronResourcesPath) {
    const bundled = join(electronResourcesPath, 'node', 'node.exe');
    if (existsSync(bundled)) return bundled;
  }

  const packagedNode = join(runtimeRoot, 'node', 'node.exe');
  if (existsSync(packagedNode)) return packagedNode;

  const binNode = join(bin, 'node.exe');
  if (existsSync(binNode)) return binNode;

  if (existsSync(process.execPath)) return process.execPath;

  return null;
}

function resolveRuntimeRoot(): string {
  if (explicitRuntimeRoot) return resolve(explicitRuntimeRoot);

  const electronProcess = process as NodeJS.Process & {
    defaultApp?: boolean;
    resourcesPath?: string;
  };
  const electronResourcesPath = electronProcess.resourcesPath;
  if (process.versions.electron && electronResourcesPath && !electronProcess.defaultApp) {
    return electronResourcesPath;
  }

  return repoRootCandidate;
}

export function ensureAppDataDirs(paths: AppPaths): void {
  for (const dir of [
    paths.appData,
    paths.database,
    paths.mediaAudio,
    paths.mediaVideo,
    paths.mediaThumbnails,
    paths.mediaTemp,
    paths.logs,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
}
