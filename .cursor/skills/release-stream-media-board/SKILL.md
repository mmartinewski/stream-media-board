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
