#!/usr/bin/env node
// Deterministically swap the better-sqlite3 native binary between the plain
// Node.js ABI (for `npm run dev`) and the Electron ABI (for packaging).
//
// electron-builder's bundled @electron/rebuild does NOT reliably rebuild
// hoisted native modules in an npm workspaces monorepo — it reports "finished"
// but leaves the Node-ABI binary in place, which then ships in the installer
// and crashes under Electron with NODE_MODULE_VERSION mismatch.
//
// Instead we fetch the official prebuilt binary for the exact runtime/target
// using prebuild-install (no C++ compiler required).
//
// Usage:
//   node scripts/switch-better-sqlite3-abi.mjs electron
//   node scripts/switch-better-sqlite3-abi.mjs node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const target = (process.argv[2] || '').toLowerCase();
if (target !== 'electron' && target !== 'node') {
  console.error('Usage: switch-better-sqlite3-abi.mjs <electron|node>');
  process.exit(1);
}

const betterSqliteDir = join(repoRoot, 'node_modules', 'better-sqlite3');
const prebuildInstallBin = require.resolve('prebuild-install/bin.js', {
  paths: [repoRoot],
});

let runtime;
let targetVersion;
if (target === 'electron') {
  runtime = 'electron';
  targetVersion = require(join(repoRoot, 'node_modules', 'electron', 'package.json')).version;
} else {
  runtime = 'node';
  targetVersion = process.versions.node;
}

console.log(`[abi] switching better-sqlite3 -> runtime=${runtime} target=${targetVersion} arch=${process.arch}`);

const result = spawnSync(
  process.execPath,
  [
    prebuildInstallBin,
    '--runtime', runtime,
    '--target', targetVersion,
    '--arch', process.arch,
  ],
  { cwd: betterSqliteDir, stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error(`[abi] prebuild-install failed (exit ${result.status}). ` +
    `No prebuilt binary for runtime=${runtime} target=${targetVersion}?`);
  process.exit(result.status || 1);
}

console.log(`[abi] better-sqlite3 ready for ${runtime} ${targetVersion}`);
