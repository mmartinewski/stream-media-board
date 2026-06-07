#!/usr/bin/env node
// Orchestrates a Windows package build with the correct better-sqlite3 ABI.
//
// Steps:
//   1. Swap better-sqlite3 to the Electron ABI (prebuilt binary).
//   2. Run electron-builder (npmRebuild is disabled, so it just copies the
//      node_modules we prepared).
//   3. ALWAYS swap better-sqlite3 back to the Node ABI so `npm run dev` keeps
//      working — even if electron-builder fails.
//
// Usage:
//   node scripts/package-win.mjs dir    # unpacked build (pack:win)
//   node scripts/package-win.mjs nsis   # installer (dist:win)

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const mode = (process.argv[2] || 'nsis').toLowerCase();
const builderArgs = mode === 'dir' ? ['--win', 'dir'] : ['--win', 'nsis'];

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    const err = new Error(`Command failed (exit ${result.status}): ${cmd} ${args.join(' ')}`);
    err.exitCode = result.status || 1;
    throw err;
  }
}

function switchAbi(targetRuntime) {
  run(process.execPath, [join(__dirname, 'switch-better-sqlite3-abi.mjs'), targetRuntime]);
}

let exitCode = 0;
try {
  switchAbi('electron');
  run('electron-builder', builderArgs);
} catch (err) {
  console.error(err.message);
  exitCode = err.exitCode || 1;
} finally {
  try {
    switchAbi('node');
  } catch (restoreErr) {
    console.error('[abi] WARNING: failed to restore Node ABI for dev. ' +
      'Run `npm run rebuild:dev` manually.');
    console.error(restoreErr.message);
    if (exitCode === 0) exitCode = restoreErr.exitCode || 1;
  }
}

process.exit(exitCode);
