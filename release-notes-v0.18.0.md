## Stream Media Board v0.18.0

Native Windows tray shell (Go) replaces Electron — smaller install footprint and less RAM in idle.

### Highlights
- **Native tray app** (`StreamMediaBoard.exe`) — Open in Browser, YouTube sign-in, Exit
- **WebView2 login** — exports cookies for yt-dlp (same flow as before)
- **Inno Setup installer** — per-user install, `soundboard://` protocol, optional WebView2 bootstrapper
- **Bundled Node 22** — backend runs under `runtime/node.exe` (no Electron ABI juggling)
- **Packaging optimizations** from v0.17.0 retained (shared FFmpeg, no ffplay, smaller bin/)

### Install
Download `StreamMediaBoard-Setup-0.18.0.exe` and run. User data stays in `%APPDATA%\LocalSoundboardServer` (upgrades preserve your database).

### Build from source
Requires Go, Inno Setup 6, and Node 20+. See README.
