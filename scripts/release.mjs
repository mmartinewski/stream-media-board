#!/usr/bin/env node
/**
 * End-to-end release workflow for Stream Media Board.
 *
 * Usage:
 *   npm run release -- --publish-only          # build + GitHub release for current version
 *   npm run release -- --bump patch --message "Release v0.34.0: …"
 *   npm run release -- --version 0.34.0 --notes-file docs/release-notes-v0.34.0.md
 *
 * Options:
 *   --publish-only       Skip version bump and commit; publish current package.json version
 *   --bump patch|minor|major
 *   --version X.Y.Z      Set explicit version (with bump, overrides --bump result)
 *   --message TEXT       Git commit message (default: Release vX.Y.Z)
 *   --notes-file PATH    Markdown for GitHub release body
 *   --notes TEXT         Write release notes file from inline markdown
 *   --skip-build         Pass through to publish-release.mjs
 *   --skip-commit        Do not commit (implies publish-only when combined with no bump)
 *   --no-push            Do not git push after publish
 *   --draft              Create a draft GitHub release
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');

const VERSION_FILES = [
  join(root, 'package.json'),
  join(root, 'frontend', 'package.json'),
  join(root, 'backend', 'package.json'),
];

function parseArgs(argv) {
  const opts = {
    publishOnly: false,
    bump: null,
    version: null,
    message: null,
    notesFile: null,
    notes: null,
    skipBuild: false,
    skipCommit: false,
    push: true,
    draft: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--publish-only':
        opts.publishOnly = true;
        opts.skipCommit = true;
        break;
      case '--bump':
        opts.bump = argv[++i];
        break;
      case '--version':
        opts.version = argv[++i];
        break;
      case '--message':
        opts.message = argv[++i];
        break;
      case '--notes-file':
        opts.notesFile = argv[++i];
        break;
      case '--notes':
        opts.notes = argv[++i];
        break;
      case '--skip-build':
        opts.skipBuild = true;
        break;
      case '--skip-commit':
        opts.skipCommit = true;
        break;
      case '--no-push':
        opts.push = false;
        break;
      case '--push':
        opts.push = true;
        break;
      case '--draft':
        opts.draft = true;
        break;
      default:
        console.error(`[release] Unknown argument: ${arg}`);
        process.exit(1);
    }
  }

  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readRootVersion() {
  return readJson(join(root, 'package.json')).version;
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpSemver(current, kind) {
  const parts = parseSemver(current);
  if (kind === 'major') {
    return `${parts.major + 1}.0.0`;
  }
  if (kind === 'minor') {
    return `${parts.major}.${parts.minor + 1}.0`;
  }
  if (kind === 'patch') {
    return `${parts.major}.${parts.minor}.${parts.patch + 1}`;
  }
  throw new Error(`--bump must be patch, minor, or major (got ${kind})`);
}

function setVersionInLockfile(oldVersion, newVersion) {
  const lockPath = join(root, 'package-lock.json');
  const text = readFileSync(lockPath, 'utf8');
  const needle = `"version": "${oldVersion}"`;
  const replacement = `"version": "${newVersion}"`;
  if (!text.includes(needle)) {
    throw new Error(`Could not find ${needle} in package-lock.json`);
  }
  let count = 0;
  const updated = text.replaceAll(needle, () => {
    count += 1;
    return replacement;
  });
  if (count !== 4) {
    throw new Error(`Expected 4 version replacements in package-lock.json, got ${count}`);
  }
  writeFileSync(lockPath, updated, 'utf8');
}

function setVersion(newVersion) {
  const oldVersion = readRootVersion();
  if (oldVersion === newVersion) {
    console.log(`[release] Version already ${newVersion}`);
    return oldVersion;
  }

  for (const path of VERSION_FILES) {
    const pkg = readJson(path);
    pkg.version = newVersion;
    writeJson(path, pkg);
  }
  setVersionInLockfile(oldVersion, newVersion);
  console.log(`[release] Bumped ${oldVersion} → ${newVersion}`);
  return oldVersion;
}

function defaultNotesPath(version) {
  return join(root, 'docs', `release-notes-v${version}.md`);
}

function resolveNotesFile(opts, version) {
  if (opts.notesFile) {
    const path = join(root, opts.notesFile);
    if (!existsSync(path)) {
      throw new Error(`Release notes file not found: ${path}`);
    }
    return path;
  }

  const autoPath = defaultNotesPath(version);
  if (opts.notes) {
    writeFileSync(autoPath, `${opts.notes.trim()}\n`, 'utf8');
    console.log(`[release] Wrote ${autoPath}`);
    return autoPath;
  }

  if (existsSync(autoPath)) {
    return autoPath;
  }

  throw new Error(
    `Release notes missing: ${autoPath}. Pass --notes-file or --notes, or create the file first.`,
  );
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(command),
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(`[release] Failed: ${command} ${args.join(' ')}`);
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function assertCleanEnoughForCommit() {
  const status = runCapture('git', ['status', '--porcelain']);
  const lines = status
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const blocking = lines.filter((line) => !line.startsWith('??'));
  if (blocking.length > 0) {
    console.error('[release] Working tree has uncommitted changes. Commit or stash first.');
    console.error(status);
    process.exit(1);
  }
}

function gitCommitRelease(version, notesPath, message) {
  const relNotes = notesPath.startsWith(root)
    ? notesPath.slice(root.length + 1).replace(/\\/g, '/')
    : notesPath;

  run('git', [
    'add',
    'package.json',
    'package-lock.json',
    'frontend/package.json',
    'backend/package.json',
    relNotes,
  ]);

  const commitMessage = message ?? `Release v${version}.`;
  run('git', ['commit', '-m', commitMessage]);
  console.log(`[release] Committed: ${commitMessage}`);
}

function gitPush() {
  const branch = runCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  run('git', ['push', 'origin', branch]);
  console.log(`[release] Pushed ${branch} to origin`);
}

function publish(version, notesPath, opts) {
  const publishArgs = [join(root, 'scripts', 'publish-release.mjs')];
  if (opts.skipBuild) publishArgs.push('--skip-build');
  if (opts.draft) publishArgs.push('--draft');

  run(process.execPath, publishArgs, {
    RELEASE_NOTES_FILE: notesPath,
  });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let version = readRootVersion();

  if (!opts.publishOnly) {
    if (opts.bump) {
      version = bumpSemver(version, opts.bump);
    }
    if (opts.version) {
      version = opts.version;
      parseSemver(version);
    }

    if (opts.bump || opts.version) {
      assertCleanEnoughForCommit();
      setVersion(version);
    }

    const notesPath = resolveNotesFile(opts, version);

    if (!opts.skipCommit) {
      gitCommitRelease(version, notesPath, opts.message);
    }

    publish(version, notesPath, opts);
    if (opts.push) gitPush();
    return;
  }

  // Publish-only: current package.json version, notes must exist.
  version = readRootVersion();
  const notesPath = resolveNotesFile(opts, version);
  console.log(`[release] Publish-only for v${version}`);
  publish(version, notesPath, opts);
  if (opts.push) gitPush();
}

main();
