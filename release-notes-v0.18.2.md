## Stream Media Board v0.18.2

Tray and startup fixes from field testing on Windows.

### Changes
- **Left-click** the tray icon opens the dashboard in your browser (right-click still shows the menu)
- Backend starts **without a visible console window** (`node.exe` hidden)
- Richer startup diagnostics: `shell.log`, `shell-backend.log`, tray menu **Open logs folder**
- Clearer error popup and log line before the HTTP server binds (helps diagnose antivirus/port issues)

### Install
Download `StreamMediaBoard-Setup-0.18.2.exe` and run. User data in `%APPDATA%\LocalSoundboardServer` is preserved on upgrade.
