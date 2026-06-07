#!/usr/bin/env node
// Assembles the Windows distribution layout for the native (Go) shell into
// dist-shell/. Layout:
//
//   dist-shell/
//     StreamMediaBoard.exe          (Go shell, windowsgui)
//     runtime/node.exe              (bundled Node 22, ABI 127)
//     MicrosoftEdgeWebview2Setup.exe(Evergreen bootstrapper, best-effort)
//     app/
//       package.json                (production deps only)
//       node_modules/**             (better-sqlite3 ABI 127, express, multer, sharp)
//       backend/dist/**
//       frontend/dist/**
//       bin/**                       (ffmpeg/ffprobe/yt-dlp + dlls)
//       config/config.example.json
//       shell-assets/play.ico
//
// The backend resolves PERSONAL_CLIP_PLAYER_ROOT=<install>/app, so module
// resolution finds app/node_modules from app/backend/dist.
//
// Flags:
//   --skip-build   do not run `npm run build` (reuse existing dist output)
//   --skip-fetch   do not fetch bin/ or runtime/node.exe (must already exist)

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isSigningEnabled, signFile } from './sign.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist-shell');
const APP = join(DIST, 'app');

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const skipFetch = args.includes('--skip-fetch');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cmd, cmdArgs, cwd = ROOT) {
  console.log(`[stage] ${cmd} ${cmdArgs.join(' ')}`);
  // Node >=18.20 refuses to spawn .cmd/.bat shims (npm.cmd) without a shell.
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
  execFileSync(cmd, cmdArgs, { stdio: 'inherit', cwd, shell: needsShell });
}

function step(msg) {
  console.log(`\n[stage] === ${msg} ===`);
}

function ensureBinaries() {
  if (skipFetch) return;
  const bin = join(ROOT, 'bin');
  const haveFfmpeg = existsSync(join(bin, 'ffmpeg.exe'));
  const haveYtDlp = existsSync(join(bin, 'yt-dlp.exe'));
  if (!haveFfmpeg || !haveYtDlp) {
    step('Fetching ffmpeg/ffprobe/yt-dlp');
    run('node', ['scripts/fetch-binaries.mjs']);
  }
  if (!existsSync(join(ROOT, 'runtime', 'node.exe'))) {
    step('Fetching bundled node.exe');
    run('node', ['scripts/fetch-node-runtime.mjs']);
  }
}

function buildApp() {
  if (skipBuild) return;
  step('Building frontend + backend');
  run(npmCmd, ['run', 'build']);
}

function buildShell() {
  step('Building Go shell (windowsgui)');
  mkdirSync(DIST, { recursive: true });
  const shellDir = join(ROOT, 'shell');
  const exeOut = join(DIST, 'StreamMediaBoard.exe');

  // Embed play.ico into the PE so Explorer/taskbar show the app icon (not Go default).
  run(
    'go',
    [
      'run',
      'github.com/tc-hib/go-winres@latest',
      'simply',
      '--icon',
      'assets/play.ico',
      '--manifest',
      'gui',
    ],
    shellDir,
  );

  run(
    'go',
    [
      'build',
      '-ldflags',
      '-s -w -H=windowsgui',
      '-o',
      exeOut,
      '.',
    ],
    shellDir,
  );

  if (isSigningEnabled()) {
    step('Signing the shell executable');
    signFile(exeOut);
  } else {
    console.log('[stage] signing disabled (no SIGN_CERT_* set) - shell exe is unsigned');
  }
}

function copyDir(src, dst) {
  if (!existsSync(src)) throw new Error(`Missing source: ${src}`);
  cpSync(src, dst, { recursive: true });
}

function copyBin() {
  const src = join(ROOT, 'bin');
  const dst = join(APP, 'bin');
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const lower = entry.toLowerCase();
    if (lower.endsWith('.exe') || lower.endsWith('.dll')) {
      cpSync(join(src, entry), join(dst, entry));
    }
  }
}

function stageLayout() {
  step('Staging distribution layout');
  rmSync(APP, { recursive: true, force: true });
  mkdirSync(APP, { recursive: true });

  // runtime/node.exe
  const runtimeDst = join(DIST, 'runtime');
  mkdirSync(runtimeDst, { recursive: true });
  cpSync(join(ROOT, 'runtime', 'node.exe'), join(runtimeDst, 'node.exe'));

  // backend + frontend build output
  copyDir(join(ROOT, 'backend', 'dist'), join(APP, 'backend', 'dist'));
  cpSync(join(ROOT, 'backend', 'package.json'), join(APP, 'backend', 'package.json'));
  copyDir(join(ROOT, 'frontend', 'dist'), join(APP, 'frontend', 'dist'));

  // bin + config + shell icon
  copyBin();
  mkdirSync(join(APP, 'config'), { recursive: true });
  const cfgExample = join(ROOT, 'config', 'config.example.json');
  if (existsSync(cfgExample)) {
    cpSync(cfgExample, join(APP, 'config', 'config.example.json'));
  }
  mkdirSync(join(APP, 'shell-assets'), { recursive: true });
  cpSync(join(ROOT, 'shell', 'assets', 'play.ico'), join(APP, 'shell-assets', 'play.ico'));
}

function stageProductionNodeModules() {
  step('Installing production node_modules (better-sqlite3 ABI 127, sharp, ...)');
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const appPkg = {
    name: 'stream-media-board-app',
    private: true,
    version: rootPkg.version,
    type: 'module',
    dependencies: rootPkg.dependencies,
  };
  writeFileSync(join(APP, 'package.json'), JSON.stringify(appPkg, null, 2) + '\n');
  run(npmCmd, ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'], APP);
}

function fetchWebView2Bootstrapper() {
  step('Fetching WebView2 Evergreen bootstrapper (best-effort)');
  const dst = join(DIST, 'MicrosoftEdgeWebview2Setup.exe');
  const url = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703';
  try {
    execFileSync(
      process.platform === 'win32' ? 'curl.exe' : 'curl',
      ['-fSL', '--retry', '2', '--connect-timeout', '30', '--max-time', '300', '-o', dst, url],
      { stdio: 'inherit' },
    );
    console.log(`[stage] OK ${dst}`);
  } catch (err) {
    console.warn(`[stage] could not fetch WebView2 bootstrapper: ${err.message}`);
    console.warn('[stage] the installer will skip the offline runtime fallback.');
  }
}

function main() {
  ensureBinaries();
  buildApp();
  buildShell();
  stageLayout();
  stageProductionNodeModules();
  fetchWebView2Bootstrapper();
  console.log('\n[stage] distribution staged in dist-shell/.');
}

main();
