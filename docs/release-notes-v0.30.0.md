## Stream Media Board v0.30.0

### Portable user data (relative media paths)

- Clip audio, video, thumbnails, category images, and cached GIF paths are now stored **relative to `media/`** in SQLite instead of absolute Windows paths.
- **Automatic migration on startup** converts existing databases, including copies moved from another PC (legacy absolute paths under `\media\` are normalized).
- **Migrating to a new machine:** close the app, copy the entire `%APPDATA%\LocalSoundboardServer` folder to the new PC, open the app — no manual SQL or path scripts required.
- Optional legacy helper scripts remain in `scripts/fix-soundboard-paths.ps1` for databases that predate this release.

### Twitch presets UX

- Keyboard navigation (arrow keys, Enter, Escape) for the tag suggestion dropdown on the Twitch presets page.

### Upgrade from v0.29.0

Install over v0.29.0. On first launch the app rewrites stored media paths in the database; your clips and thumbnails are unchanged. If you already migrated manually with a path-fix script, the migration is a no-op.
