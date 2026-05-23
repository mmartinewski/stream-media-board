# Personal Soundboard Player

Local soundboard for creating and playing audio clips extracted from YouTube. The server runs on the streaming machine and plays audio through `ffplay`; the web UI can be used on the same PC or from a phone/tablet on the same network.

## Main Features

- YouTube audio prefetch with `yt-dlp`.
- Clip trimming with waveform handles for start/end selection.
- Automatic audio normalization in previews and saved MP3 files.
- Per-clip volume with playback boost up to 300%.
- Suggested YouTube thumbnail with 1:1 crop and zoom.
- Live-control dashboard: sticky search, large cards, remote play, favorites, edit, and delete.
- Local persistence in SQLite (`better-sqlite3`).

## Requirements

- Windows.
- Node.js `>=20` (Node LTS recommended).
- Local binaries in `bin/`: `ffmpeg.exe`, `ffprobe.exe`, `ffplay.exe`, and `yt-dlp.exe`.

User data is stored outside the repository in `%APPDATA%/LocalSoundboardServer/`.

## Setup

```bash
npm install
npm run fetch:bin
```

`npm run fetch:bin` downloads the required executables into `bin/`. They are ignored by Git; see [`bin/README.md`](bin/README.md) for manual installation if the automatic download fails.

## Browser source (OBS Studio / Streamlabs)

**Video clips** play on a transparent **browser overlay** in your streaming software—not through local `ffplay`. **Audio clips** still use local playback on the streaming PC.

Create **video** clips in the editor (YouTube link or a file from your PC). When you click a video clip on the dashboard, it appears in the browser source, plays, and fades out.

### Overlay URLs

Use separate browser sources when you want different on-canvas layouts (e.g. full-width landscape + a portrait column). Add `?mode=` to the path:

| Mode | URL suffix | Clips shown |
| --- | --- | --- |
| Universal | `?mode=universal` | All video clips |
| Landscape | `?mode=landscape` | Landscape only |
| Portrait | `?mode=portrait` | Portrait only |

| Environment | Example (universal) |
| --- | --- |
| Development (`npm run dev`) | `http://localhost:5173/overlay/browser?mode=universal` |
| Production / installed app | `http://localhost:3847/overlay/browser?mode=universal` |
| LAN (phone or another PC) | `http://<streaming-PC-IP>:3847/overlay/browser?mode=universal` |

The clip form lists all three URLs with **Copy** when **Video clip** is selected. Set **Video orientation** in the editor so clips route to the right source.

### OBS Studio (quick setup)

1. Open the scene where the overlay should appear.
2. **Sources** → **+** → **Browser**.
3. Paste an overlay URL with the desired `?mode=` (see table above).
4. Set **Width** / **Height** to your canvas (e.g. 1920×1080).
5. Optional: enable **Refresh browser when scene becomes active**.
6. Save, then play a video clip from the dashboard to test.

### Streamlabs Desktop (quick setup)

1. Open your scene.
2. **Sources** → **+** → **Browser Source**.
3. Paste an overlay URL with the desired `?mode=`.
4. Match **Width** / **Height** to your output resolution.
5. Confirm and test with a video clip from the dashboard.

### More detail

Step-by-step notes, troubleshooting (black background), and audio vs video behavior: **[docs/browser-source-setup.md](docs/browser-source-setup.md)**.

Release checklist and API notes: [docs/next-release.md](docs/next-release.md).

## Development

```bash
npm run dev
```

- Frontend Vite: `http://localhost:5173`
- Backend Express: `http://localhost:3847`
- To use a phone, open the network URL shown by Vite and keep the backend running on the streaming PC.

## Local Production

```bash
npm run build
npm start
```

After the build, Express serves the static frontend from `frontend/dist/`.

## Windows Installer

To install dependencies, fetch the binaries, and generate a fresh installer in one command:

```bash
npm run installer:win
```

Or run the steps manually:

```bash
npm install
npm run fetch:bin
npm run dist:win
```

The installer is generated under `release/`, for example:

```text
release/Personal Soundboard Player Setup 0.1.0.exe
```

The installed Personal Soundboard Player app runs in the Windows tray and exposes:

- `Open in Browser` to open the local web UI.
- `Exit` to stop playback, shut down the backend, and close the tray app.

Use `npm run pack:win` to generate an unpacked build for quick smoke tests.

`release/` is ignored by Git, so installer artifacts are published via **GitHub Releases**, not committed to the repo.

### Publish installer to GitHub Releases

Requires [GitHub CLI](https://cli.github.com/) (`gh`) logged in (`gh auth login`).

Build the NSIS installer and create/update the release for the current `package.json` version:

```bash
npm run publish:win
```

Upload only (installer already in `release/`):

```bash
npm run publish:release
```

Optional:

- `npm run publish:win -- --draft` — draft release
- `RELEASE_NOTES_FILE=./notes.md npm run publish:win` — custom release notes

If the tag already exists (e.g. `v0.2.0`), the script uploads the `.exe` again with `--clobber`.

## Publishing Changes to GitHub

Before committing, run a build:

```bash
npm run build
```

Then commit and push the source changes:

```bash
git status
git add -A
git commit -m "Describe the change"
git push origin main
```

## Configuration

Optionally copy `config/config.example.json` to `config/config.json` to adjust the port:

```json
{
  "port": 3847,
  "youtube_cookies_from_browser": "chrome"
}
```

Supported values for `youtube_cookies_from_browser`: `chrome`, `edge`, `firefox`, and other browsers supported by yt-dlp.

### YouTube sign-in (recommended)

YouTube often blocks anonymous downloads. The desktop app can save a signed-in session for `yt-dlp`:

1. Right-click the tray icon.
2. Click **Sign in to YouTube**.
3. Sign in with your Google account in the window that opens.
4. Click **Save session**.
5. Try loading the YouTube audio again in the clip form.

The saved session is stored in `%APPDATA%\\LocalSoundboardServer\\youtube.cookies.txt`.

From the web UI you can also open `soundboard://youtube-login` if the desktop app is running.

### Manual cookie fallback

If needed, copy `config/config.example.json` to `config/config.json` and set `youtube_cookies_from_browser` to a browser where you are signed in to YouTube, or point `youtube_cookies_file` to an exported Netscape cookies file.

`config/config.json` is ignored by Git.

## Structure

```text
backend/    API Express, SQLite, FFmpeg/ffplay, yt-dlp
frontend/   React + Vite + Tailwind
bin/        unversioned local executables
config/     configuration example
docs/       technical specification, browser source setup
scripts/    project utilities
```

## GitHub Notes

- Do not commit `node_modules/`, `dist/`, `bin/*.exe`, `config/config.json`, or `.env` files.
- The SQLite database, media, and logs are created in `%APPDATA%/LocalSoundboardServer/`, outside the repository.
