#!/usr/bin/env node
// Downloads a standalone node.exe (v22, win-x64) into /runtime for the packaged
// app. The native shell launches the backend under this node.exe.
//
// Node 22 is ABI 127 - the SAME ABI used by `npm run dev` - so the bundled
// better-sqlite3 prebuild works without any Electron-style ABI juggling.
//
// Optional variables:
//   NODE_RUNTIME_VERSION - override the Node version (default: pinned v22 LTS)
//
// Usage:
//   npm run fetch:node

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
const RUNTIME = join(ROOT, 'runtime');

// Pin to a Node 22.x release (ABI 127). Any 22.x shares the ABI; pinning keeps
// the build deterministic across machines.
const NODE_VERSION = process.env.NODE_RUNTIME_VERSION?.trim() || 'v22.22.0';
const NODE_ZIP_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`;
const MIN_ZIP_BYTES = 1024 * 1024;

mkdirSync(RUNTIME, { recursive: true });

function curlBinary() {
  return process.platform === 'win32' ? 'curl.exe' : 'curl';
}

function tryDownloadWithCurl(url, destPath) {
  console.log(`[fetch-node] curl ${url}`);
  const result = spawnSync(
    curlBinary(),
    [
      '-fSL',
      '--retry', '3',
      '--retry-delay', '5',
      '--connect-timeout', '45',
      '--max-time', '1800',
      '-o', destPath,
      url,
    ],
    { stdio: 'inherit' },
  );
  if (result.error) {
    console.warn('[fetch-node] curl unavailable:', result.error.message);
    return false;
  }
  if (result.status !== 0) {
    console.warn(`[fetch-node] curl exited with code ${result.status}`);
    return false;
  }
  return true;
}

async function downloadWithFetch(url, destPath) {
  console.log(`[fetch-node] fetch() ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30 * 60 * 1000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
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
  console.log(`[fetch-node] wrote ${destPath} (${size} bytes)`);
}

function extractZipWithPowerShell(zipPath, destDir) {
  console.log(`[fetch-node] extracting ${zipPath} -> ${destDir}`);
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

function findNodeExe(rootDir) {
  let found = null;
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.toLowerCase() === 'node.exe') found = full;
    }
  }
  walk(rootDir);
  return found;
}

function safeRemove(p) {
  try {
    rmSync(p, { force: true, recursive: true });
  } catch {
    console.warn(`[fetch-node] could not delete ${p}`);
  }
}

async function main() {
  if (process.platform !== 'win32') {
    console.warn('[fetch-node] WARNING: this project targets Windows. Downloading the win-x64 build anyway.');
  }

  const id = randomUUID().slice(0, 8);
  const tmpZip = join(RUNTIME, `_node_dl_${id}.zip`);
  const tmpDir = join(RUNTIME, `_node_extract_${id}`);

  try {
    await download(NODE_ZIP_URL, tmpZip);
    if (statSync(tmpZip).size < MIN_ZIP_BYTES) {
      throw new Error('Downloaded Node ZIP is too small - incomplete download or wrong version.');
    }
    extractZipWithPowerShell(tmpZip, tmpDir);

    const nodeExe = findNodeExe(tmpDir);
    if (!nodeExe) throw new Error('node.exe was not found inside the extracted ZIP.');

    const dst = join(RUNTIME, 'node.exe');
    safeRemove(dst);
    renameSync(nodeExe, dst);
    console.log(`[fetch-node] OK ${dst} (${NODE_VERSION})`);
  } finally {
    safeRemove(tmpZip);
    safeRemove(tmpDir);
  }

  console.log('[fetch-node] done.');
}

main().catch((err) => {
  console.error('[fetch-node] FAILED:', err);
  console.error(`
If it keeps failing, download the Windows x64 ZIP manually:
  ${NODE_ZIP_URL}
Extract node.exe into the runtime/ folder of this project.
`);
  process.exit(1);
});
