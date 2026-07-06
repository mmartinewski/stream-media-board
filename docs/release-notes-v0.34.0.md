## Stream Media Board v0.34.0

### In-app auto-updater

- Tray menu: **Check for Updates** and **Update to vX.Y.Z** (download + silent install via Inno Setup).
- Background check against GitHub Releases (`/releases/latest`), throttled to once every 6 hours; never blocks app startup.
- Downloaded installers are verified with a published SHA256 asset; state and cache live under `%APPDATA%\LocalSoundboardServer\updates`.
- Release pipeline now uploads `StreamMediaBoard-Setup-X.Y.Z.exe.sha256` alongside the installer.

### Upgrade from v0.33.0

Install over v0.33.0. No database migration. After upgrading, use **Check for Updates** in the tray to fetch newer builds from GitHub.
