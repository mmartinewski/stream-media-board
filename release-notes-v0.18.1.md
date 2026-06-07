## Stream Media Board v0.18.1

Fixes the generic Windows icon on the installed app and desktop shortcut.

### Changes
- Embed `play.ico` in `StreamMediaBoard.exe` at build time (go-winres)
- Inno Setup shortcuts and uninstall entry use the correct icon file

### Install
Download `StreamMediaBoard-Setup-0.18.1.exe` and run. User data in `%APPDATA%\LocalSoundboardServer` is preserved on upgrade.
