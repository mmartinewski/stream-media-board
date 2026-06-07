#!/usr/bin/env node
// Downloads ffmpeg + ffprobe and yt-dlp.exe into /bin (Windows).
//
// By default, this uses the **BtbN "shared" build on GitHub** (stable mirror).
// The shared build keeps the codecs in shared DLLs that the three executables
// load at runtime, instead of statically linking ~200 MB into each .exe. This
// cuts the bin/ footprint from ~630 MB to ~150 MB. The DLLs MUST live next to
// the executables (i.e. inside bin/), otherwise the .exe files fail to start.
//
// Download priority:
//   1) curl (curl.exe on Windows) - timeouts, retries, follows redirects (GitHub)
//   2) Node fetch() - fallback
//
// Optional variables:
//   FFMPEG_ZIP_URL   - override the FFmpeg ZIP URL (64-bit Windows shared build)
//
// Usage:
//   npm run fetch:bin

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BIN = join(ROOT, 'bin');

/** GitHub builds are more reliable than gyan.dev for many users. */
const FFMPEG_ZIP_URLS = [
  process.env.FFMPEG_ZIP_URL?.trim() ||
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip',
];

const YTDLP_EXE_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

const MIN_ZIP_BYTES = 512 * 1024;

mkdirSync(BIN, { recursive: true });

function curlBinary() {
  return process.platform === 'win32' ? 'curl.exe' : 'curl';
}

/** @returns {boolean} true when the file was written successfully through curl */
function tryDownloadWithCurl(url, destPath) {
  const curl = curlBinary();
  console.log(`[fetch-binaries] curl ${url}`);
  const result = spawnSync(
    curl,
    [
      '-fSL',
      '--retry',
      '3',
      '--retry-delay',
      '5',
      '--connect-timeout',
      '45',
      '--max-time',
      '1800',
      '-o',
      destPath,
      url,
    ],
    { stdio: 'inherit' },
  );

  if (result.error) {
    console.warn('[fetch-binaries] curl unavailable:', result.error.message);
    return false;
  }
  if (result.status !== 0) {
    console.warn(`[fetch-binaries] curl exited with code ${result.status}`);
    return false;
  }
  return true;
}

async function downloadWithFetch(url, destPath) {
  console.log(`[fetch-binaries] fetch() ${url}`);
  const controller = new AbortController();
  const timeoutMs = 30 * 60 * 1000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }
    await pipeline(res.body, createWriteStream(destPath));
  } finally {
    clearTimeout(timer);
  }
}

async function download(url, destPath) {
  rmSync(destPath, { force: true });
  const ok = tryDownloadWithCurl(url, destPath);
  if (!ok) await downloadWithFetch(url, destPath);

  const size = statSync(destPath).size;
  console.log(`[fetch-binaries] wrote ${destPath} (${size} bytes)`);
  return size;
}

function validateZip(path) {
  const size = statSync(path).size;
  if (size < MIN_ZIP_BYTES) {
    throw new Error(
      `File is too small (${size} bytes) - incomplete download or wrong URL.`,
    );
  }
}

function extractZipWithPowerShell(zipPath, destDir) {
  console.log(`[fetch-binaries] extracting ${zipPath} -> ${destDir}`);
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`,
    ],
    { stdio: 'inherit' },
  );
}

/**
 * Locates the directory that contains ffmpeg.exe. ZIP structures vary by package.
 */
function findExeDirectory(rootDir, exeName) {
  /** @type {string | null} */
  let found = null;

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.toLowerCase() === exeName.toLowerCase()) found = dir;
    }
  }

  walk(rootDir);
  return found;
}

async function fetchFFmpeg() {
  /** @type {Error | null} */
  let lastErr = null;

  for (const url of FFMPEG_ZIP_URLS) {
    const id = randomUUID().slice(0, 8);
    const tmpZip = join(BIN, `_ffmpeg_dl_${id}.zip`);
    const tmpDir = join(BIN, `_ffmpeg_extract_${id}`);

    try {
      await download(url, tmpZip);
      validateZip(tmpZip);
      extractZipWithPowerShell(tmpZip, tmpDir);

      const binDir = findExeDirectory(tmpDir, 'ffmpeg.exe');
      if (!binDir) {
        throw new Error('ffmpeg.exe was not found inside the extracted ZIP.');
      }

      // ffplay is intentionally NOT shipped: audio/video preview happens in the
      // browser (GET /api/staging/:id/preview), not via server-side playback.
      for (const exe of ['ffmpeg.exe', 'ffprobe.exe']) {
        const src = join(binDir, exe);
        const dst = join(BIN, exe);
        if (!existsSync(src)) {
          throw new Error(`Could not find ${exe} in ${binDir}`);
        }
        rmSync(dst, { force: true });
        renameSync(src, dst);
        console.log(`[fetch-binaries] OK ${dst}`);
      }

      // Remove a stale ffplay.exe from older (static) installs.
      safeRemove(join(BIN, 'ffplay.exe'));

      // Shared build: copy the DLLs (avcodec, avformat, avutil, swscale, ...)
      // sitting next to the executables. Without them the .exe files won't run.
      let dllCount = 0;
      for (const entry of readdirSync(binDir)) {
        if (!entry.toLowerCase().endsWith('.dll')) continue;
        const src = join(binDir, entry);
        const dst = join(BIN, entry);
        rmSync(dst, { force: true });
        renameSync(src, dst);
        dllCount += 1;
        console.log(`[fetch-binaries] OK ${dst}`);
      }
      if (dllCount === 0) {
        throw new Error(
          'No .dll files found next to ffmpeg.exe. This URL looks like a static build; ' +
            'use a "*-shared.zip" build so the codecs ship as shared DLLs.',
        );
      }

      safeRemove(tmpZip);
      safeRemoveDir(tmpDir);
      return;
    } catch (err) {
      lastErr = /** @type {Error} */ (err);
      console.warn(`[fetch-binaries] this mirror failed: ${lastErr.message}`);
      safeRemoveDir(tmpDir);
      safeRemove(tmpZip);
    }
  }

  throw lastErr ?? new Error('No FFmpeg URL worked.');
}

/** Avoids EBUSY on Windows when another process (AV, IDE) keeps the file open. */
function safeRemove(filePath) {
  try {
    rmSync(filePath, { force: true });
  } catch {
    console.warn(`[fetch-binaries] could not delete ${filePath} (you can delete it manually).`);
  }
}

function safeRemoveDir(dirPath) {
  try {
    rmSync(dirPath, { recursive: true, force: true });
  } catch {
    console.warn(`[fetch-binaries] could not delete folder ${dirPath}`);
  }
}

async function fetchYtDlp() {
  const dst = join(BIN, 'yt-dlp.exe');
  const partial = join(BIN, `_yt-dlp_${randomUUID().slice(0, 8)}.part`);
  await download(YTDLP_EXE_URL, partial);
  const size = statSync(partial).size;
  if (size < 1024) {
    safeRemove(partial);
    throw new Error('yt-dlp.exe looks incomplete.');
  }
  safeRemove(dst);
  renameSync(partial, dst);
  console.log(`[fetch-binaries] OK ${dst}`);
}

async function main() {
  if (process.platform !== 'win32') {
    console.warn(
      '[fetch-binaries] WARNING: this project targets Windows. Downloading the .exe files anyway.',
    );
  }
  await fetchFFmpeg();
  await fetchYtDlp();
  console.log('[fetch-binaries] all set.');
}

main().catch((err) => {
  console.error('[fetch-binaries] FAILED:', err);
  console.error(`
If it keeps failing on a corporate network or firewall:

  1. Open https://github.com/BtbN/FFmpeg-Builds/releases/latest
     and download the **win64 gpl** ZIP (ex.: ffmpeg-master-latest-win64-gpl.zip).

  2. Extract it and copy these files into this project's bin/ folder:
       ffmpeg.exe  ffprobe.exe  and all the .dll files next to them

  3. yt-dlp: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe
     Copy yt-dlp.exe into the bin/ folder.

Or set a URL manually:

  set FFMPEG_ZIP_URL=https://...
  npm run fetch:bin
`);
  process.exit(1);
});
