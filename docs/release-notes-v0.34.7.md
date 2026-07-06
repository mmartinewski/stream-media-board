## Stream Media Board v0.34.7

### Auto-updater

- Remove Mark-of-the-Web block on downloaded installers so Windows does not deny launch.
- Start the silent installer via ShellExecute (fixes "Access is denied" on some PCs/AV).

### Upgrade from v0.34.6

Use **Check for Updates** in the tray menu after trusting the signing `.cer` and excluding `%APPDATA%\LocalSoundboardServer` in antivirus.
