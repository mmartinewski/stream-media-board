#!/usr/bin/env node
// Builds the Windows installer for the native (Go) shell:
//   1. stage dist-shell/ (scripts/stage-windows-dist.mjs)
//   2. compile installer/soundboard.iss with Inno Setup (ISCC.exe)
//
// Flags are forwarded to the staging step:
//   --skip-build   reuse existing backend/frontend dist
//   --skip-fetch   reuse existing bin/ and runtime/node.exe
//   --skip-stage   skip staging entirely (dist-shell/ must already exist)
//
// Output: installer/Output/StreamMediaBoard-Setup-<version>.exe

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { isSigningEnabled, innoSignCommand } from './sign.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const skipStage = args.includes('--skip-stage');
const stageFlags = args.filter((a) => a === '--skip-build' || a === '--skip-fetch');

function findISCC() {
  const candidates = [
    join(homedir(), 'AppData', 'Local', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function main() {
  const iscc = findISCC();
  if (!iscc) {
    console.error('[installer] ISCC.exe not found. Install Inno Setup 6:');
    console.error('  winget install -e --id JRSoftware.InnoSetup');
    process.exit(1);
  }

  if (!skipStage) {
    console.log('[installer] staging distribution...');
    execFileSync('node', [join('scripts', 'stage-windows-dist.mjs'), ...stageFlags], {
      stdio: 'inherit',
      cwd: ROOT,
    });
  }

  if (!existsSync(join(ROOT, 'dist-shell', 'StreamMediaBoard.exe'))) {
    console.error('[installer] dist-shell/StreamMediaBoard.exe is missing. Run staging first.');
    process.exit(1);
  }

  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  console.log(`[installer] compiling installer for v${version} with ${iscc}`);

  const isccArgs = [`/DMyAppVersion=${version}`];
  if (isSigningEnabled()) {
    console.log('[installer] code signing enabled (the installer + uninstaller will be signed)');
    // /Smysign defines the named sign tool; /DSIGN_TOOL turns on the SignTool
    // directive inside the .iss (ISPP #ifdef).
    isccArgs.push(`/Smysign=${innoSignCommand()}`, '/DSIGN_TOOL=mysign');
  } else {
    console.log('[installer] code signing disabled (no SIGN_CERT_* set) - installer is unsigned');
  }
  isccArgs.push(join('installer', 'soundboard.iss'));

  execFileSync(iscc, isccArgs, { stdio: 'inherit', cwd: ROOT });

  console.log(`\n[installer] done. See installer/Output/StreamMediaBoard-Setup-${version}.exe`);
}

main();
