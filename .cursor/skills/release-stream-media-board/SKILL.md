---
name: release-stream-media-board
description: >-
  Publishes Stream Media Board releases on Windows: semver bump, release notes,
  git commit, Inno Setup build, GitHub Release via gh, and push. Use when the user
  asks to publish, release, ship, bump version, subir versão, fazer release, or
  publicar no GitHub for this repository.
---

# Stream Media Board — release workflow

Prefer **`npm run release`** (`scripts/release.mjs`) over manual steps. Low-level publish only: `npm run publish:win` / `publish-release.mjs`.

## Prerequisites

- Windows (Inno Setup installer build)
- `gh auth login`
- Clean git tree before **version bump + commit** (untracked files like `build*.txt` are OK)

## Auto-update requirements (read before publishing)

The app has an in-app auto-updater (native Go tray shell, `shell/updater.go`) that polls
`GET /repos/mmartinewski/stream-media-board/releases/latest` and offers the result as an update.
For a release to actually reach installed apps via the updater:

- **Never pass `--draft`** (or otherwise leave the release as a draft/prerelease) for a version meant
  to reach users. GitHub's `/releases/latest` endpoint — which the updater calls — ignores drafts and
  prereleases entirely; such a release is invisible to the auto-updater even though it exists on GitHub.
- The tag must stay exactly `vMAJOR.MINOR.PATCH` (already enforced by `release.mjs`/`publish-release.mjs`) —
  the updater's semver parser requires this exact shape and skips anything else.
- The Windows installer asset must keep the exact name pattern `StreamMediaBoard-Setup-X.Y.Z.exe`
  (already the case) — the updater matches on this pattern to find the right asset.
- `publish-release.mjs` automatically computes a SHA256 checksum of the installer and uploads it as a
  sibling `StreamMediaBoard-Setup-X.Y.Z.exe.sha256` asset — no manual action needed. If you ever publish
  a release manually via `gh release create/upload` instead of the script, upload that checksum file too;
  otherwise the updater will still install the update (the checksum check is best-effort) but without
  integrity verification.
- The shell executable's embedded version (`main.appVersion`, used for the update comparison) is set
  automatically from `package.json` during `npm run installer:inno` / `dist:signed` — no manual step.

See [docs/auto-update.md](../../docs/auto-update.md) for the full design and failure-scenario matrix.

## Release notes

- Path: `docs/release-notes-vX.Y.Z.md`
- Title: `## Stream Media Board vX.Y.Z`
- Sections: feature bullets + `### Upgrade from v…`
- See recent files in `docs/release-notes-v*.md` for tone and structure

## Version bump targets (only when bumping)

Update together via the script (do not hand-edit one file):

- `package.json`
- `frontend/package.json`
- `backend/package.json`
- `package-lock.json` (four `"version"` entries)

## Commands

### Publish current version (already committed)

When `package.json` version and `docs/release-notes-v{version}.md` are committed:

```powershell
npm run release:publish
```

Same as:

```powershell
npm run release -- --publish-only
```

Optional: `--skip-build` if `installer/Output/StreamMediaBoard-Setup-{version}.exe` exists; `--no-push` to skip `git push`.

### Full release (bump + commit + build + GitHub + push)

1. Write `docs/release-notes-vX.Y.Z.md` from the diff (or use `--notes` / `--notes-file`).
2. Run:

```powershell
npm run release -- --bump patch --message "Release vX.Y.Z: short summary."
```

Flags: `--bump patch|minor|major`, `--version X.Y.Z`, `--draft`, `--skip-build`, `--no-push`.

## Agent checklist

1. Summarize changes for release notes (user-facing, Portuguese OK in notes).
2. If version not bumped yet → full release with `--bump` and `--message`.
3. If version + notes already committed → `npm run release:publish`.
4. Confirm build succeeded and report the GitHub release URL from script output.
5. Do **not** commit `build*.txt`, `stage*.txt`, or other local build logs.

## Reference

- Checklist: [docs/next-release.md](../../docs/next-release.md)
- Publish implementation: [scripts/publish-release.mjs](../../scripts/publish-release.mjs)
- Full workflow: [scripts/release.mjs](../../scripts/release.mjs)
