# Troubleshooting — Windows install

## Backend failed to start

The tray app runs without a console window, so errors are written to log files.

### Log locations

```
%APPDATA%\LocalSoundboardServer\logs\
  latest.log          — backend (Node) after logger starts
  shell-backend.log   — raw stdout/stderr from node (shell capture)
  shell.log           — shell startup notes (paths, ready/fail)
```

From the tray menu (v0.18.2+): **Open logs folder**.

### Common causes

#### 1. Antivirus (Kaspersky, Defender, etc.)

The shell spawns `runtime\node.exe` as a child process. Some products block or quarantine it even when the install folder is excluded.

**Do all of the following:**

1. Exclude the **install directory** (entire tree):
   ```
   %LOCALAPPDATA%\Programs\StreamMediaBoard
   ```
2. Exclude **app data** (database, logs, media):
   ```
   %APPDATA%\LocalSoundboardServer
   ```
3. Open **Quarantine** and restore `node.exe` or `better_sqlite3.node` if present.
4. In Kaspersky: disable *Exploit Prevention* / *Behavioral detection* for `node.exe` temporarily to confirm, then add a permanent trusted rule.

#### 2. Log stops after `serving static frontend` (no `Express listening`)

The backend died or was blocked while opening the HTTP port (right after the frontend log line).

**Most common:** Kaspersky (or similar) kills `node.exe` when it tries to **listen on a network port**, even if the install folder is excluded. Fix:

1. Kaspersky → **More** → **Reports** — look for a block on `node.exe` at startup time.
2. Add **Trusted application** (not just folder exclusion):  
   `%LOCALAPPDATA%\Programs\StreamMediaBoard\runtime\node.exe`
3. Allow **local server / network activity** for that executable.
4. Pause protection briefly to confirm; if the app then starts, adjust rules permanently.

**Also check:** Windows reserved port ranges (Hyper-V, Docker):

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

If **3847** falls inside a reserved range, set another port in  
`%LOCALAPPDATA%\Programs\StreamMediaBoard\app\config\config.json`:

```json
{ "port": 4850 }
```

Restart the app from the tray.

#### 3. Port already in use (EADDRINUSE)

Default port is **3847**. Another app (or a stuck previous instance) may hold it.

- Check `latest.log` for `EADDRINUSE`.
- Close other Stream Media Board instances from Task Manager.
- Or set another port in `%LOCALAPPDATA%\Programs\StreamMediaBoard\app\config\config.json`.

#### 4. Missing or corrupted install files

Reinstall from the latest GitHub release. User data in `%APPDATA%\LocalSoundboardServer` is preserved.

### Diagnostic script

On the failing machine (from a dev clone or copy `scripts/diagnose-installed.ps1`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\diagnose-installed.ps1
```

This checks paths, port 3847, starts the backend briefly, and prints log tails.
