#!/usr/bin/env node
/**
 * Build (optional) and publish the Windows Inno Setup installer to GitHub Releases via `gh`.
 *
 * Usage:
 *   npm run publish:win          # installer:win + upload
 *   npm run publish:release      # upload only (installer must exist in release/)
 *
 * Environment:
 *   RELEASE_NOTES       - release body (markdown)
 *   RELEASE_NOTES_FILE - path to markdown file for --notes-file
 *   GITHUB_REPO         - override owner/repo (default: from `gh repo view`)
 *
 * Flags:
 *   --draft             - create a draft release
 *   --skip-build        - do not run installer:win (publish:release sets this implicitly)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');
const args = process.argv.slice(2);
const draft = args.includes('--draft');
const skipBuild = args.includes('--skip-build');

function readPackageJson() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
}

function resolveGhExecutable() {
  const candidates = ['gh'];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\GitHub CLI\\gh.exe',
      'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
      join(homedir(), 'scoop', 'shims', 'gh.exe'),
    );
  }
  for (const candidate of candidates) {
    if (candidate === 'gh') {
      try {
        runCapture(candidate, ['--version']);
        return candidate;
      } catch {
        continue;
      }
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

let ghExe = 'gh';

function needsShell(command) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function run(command, commandArgs, options = {}) {
  const exe = command === 'gh' ? ghExe : command;
  const result = spawnSync(exe, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    // npm.cmd/.bat shims need a shell on Node >=18.20; gh/git must stay shell:false
    // (paths with spaces in installer names break under cmd wrapping).
    shell: needsShell(exe),
    ...options,
  });
  if (result.error) {
    console.error(`[publish] command failed: ${exe} ${commandArgs.join(' ')}`);
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, commandArgs, captureOptions = {}) {
  const exe = command === 'gh' ? ghExe : command;
  return execFileSync(exe, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    ...captureOptions,
  }).trim();
}

function assertGhReady() {
  ghExe = resolveGhExecutable() ?? 'gh';
  try {
    runCapture('gh', ['--version']);
  } catch {
    console.error('GitHub CLI (gh) is required. Install: https://cli.github.com/');
    console.error('On Windows: winget install --id GitHub.cli');
    console.error('Then close and reopen the terminal (or Cursor) so PATH updates.');
    process.exit(1);
  }
  try {
    runCapture('gh', ['auth', 'status']);
  } catch {
    console.error('Run `gh auth login` before publishing.');
    process.exit(1);
  }
}

function findInstallerExe(version) {
  const outputDir = join(root, 'installer', 'Output');
  const expected = join(outputDir, `StreamMediaBoard-Setup-${version}.exe`);
  if (existsSync(expected)) {
    return expected;
  }

  if (existsSync(outputDir)) {
    const matches = readdirSync(outputDir).filter(
      (name) =>
        name.toLowerCase().endsWith('.exe') &&
        name.includes('StreamMediaBoard-Setup') &&
        name.includes(version),
    );
    if (matches.length === 1) {
      return join(outputDir, matches[0]);
    }
  }

  // Legacy electron-builder output (pre–Passo 5)
  const releaseDir = join(root, 'release');
  if (existsSync(releaseDir)) {
    const legacy = readdirSync(releaseDir).filter(
      (name) =>
        name.toLowerCase().endsWith('.exe') &&
        name.includes('Setup') &&
        name.includes(version),
    );
    if (legacy.length === 1) {
      return join(releaseDir, legacy[0]);
    }
  }

  return null;
}

function releaseExists(tag) {
  const result = spawnSync(ghExe, ['release', 'view', tag], {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  });
  return result.status === 0;
}

function defaultReleaseNotes(version) {
  return [
    `## Stream Media Board ${version}`,
    '',
    '- Native Go tray shell (replaces Electron — smaller install, less RAM in idle)',
    '- OBS / Streamlabs browser overlay (`/overlay/browser`)',
    '- YouTube video clips with trim and dashboard play to overlay',
    '- Audio clips with in-browser segment preview',
    '',
    'See the repository README for setup and browser source configuration.',
  ].join('\n');
}

function main() {
  assertGhReady();

  const pkg = readPackageJson();
  const version = pkg.version;
  const tag = `v${version}`;

  if (!skipBuild) {
    // Prefer signed build when SIGN_CERT_NAME is set (self-signed or CA cert in store).
    const buildScript = process.env.SIGN_CERT_NAME ? 'dist:signed' : 'installer:win';
    console.log(`[publish] Building Windows installer (npm run ${buildScript})...`);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    run(npm, ['run', buildScript]);
  }

  const installerPath = findInstallerExe(version);
  if (!installerPath) {
    console.error(
      `[publish] Installer not found. Expected installer/Output/StreamMediaBoard-Setup-${version}.exe`,
    );
    console.error('Run `npm run installer:win` first, or use `npm run publish:win`.');
    process.exit(1);
  }

  console.log(`[publish] Using installer: ${installerPath}`);

  const notes =
    process.env.RELEASE_NOTES?.trim() ||
    (process.env.RELEASE_NOTES_FILE && existsSync(process.env.RELEASE_NOTES_FILE)
      ? readFileSync(process.env.RELEASE_NOTES_FILE, 'utf8')
      : defaultReleaseNotes(version));

  const ghArgs = ['release'];

  if (releaseExists(tag)) {
    console.log(`[publish] Release ${tag} exists — uploading asset (--clobber).`);
    ghArgs.push('upload', tag, installerPath, '--clobber');
  } else {
    console.log(`[publish] Creating release ${tag}...`);
    ghArgs.push(
      'create',
      tag,
      installerPath,
      '--title',
      tag,
      '--notes',
      notes,
    );
    if (draft) {
      ghArgs.push('--draft');
    }
    const branch = runCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch === 'main' || branch === 'master') {
      ghArgs.push('--target', branch);
    }
  }

  run('gh', ghArgs);

  try {
    const url = runCapture('gh', ['release', 'view', tag, '--json', 'url', '-q', '.url']);
    console.log(`[publish] Done: ${url}`);
  } catch {
    console.log('[publish] Done.');
  }
}

main();
