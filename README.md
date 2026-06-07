# Stream Media Board

LAN clip dashboard and **browser overlay** for live streaming. Trim YouTube (or local) **audio and video** clips, control playback from a phone or second PC on your network, and display them in any streaming app that supports a **browser source** or web overlay — OBS Studio, Streamlabs Desktop, and similar.

Clips play on a transparent overlay in your stream; the dashboard triggers playback over the local network.

## Main Features

- YouTube prefetch with `yt-dlp` (audio and video).
- Clip trimming with waveform (audio) or timeline (video).
- **Browser overlay** with multiple modes: audio, stage (layout areas), legacy landscape/portrait.
- Per-clip volume, favorites, metadata edit, and layout-area defaults for video.
- Live-control dashboard: search, large cards, remote play, LAN-friendly UI.
- Local persistence in SQLite (`better-sqlite3`).
- Windows tray app with one-click **Open in Browser**.

## Requirements

- Windows.
- Node.js `>=20` (Node LTS recommended).
- Local binaries in `bin/`: `ffmpeg.exe`, `ffprobe.exe` (with their shared DLLs), and `yt-dlp.exe`.
- A streaming app with a **Browser Source** (or equivalent web overlay).

User data is stored outside the repository in `%APPDATA%/LocalSoundboardServer/` (legacy folder name; unchanged for upgrades).

## Setup

```bash
npm install
npm run fetch:bin
```

`npm run fetch:bin` downloads the required executables into `bin/`. They are ignored by Git; see [`bin/README.md`](bin/README.md) for manual installation if the automatic download fails.

## Browser overlay (OBS, Streamlabs, and similar)

Video and audio clips play on a **transparent browser overlay** in your streaming software. Add at least one **Browser Source** (or web overlay) pointing at the overlay URL (see below).

Works with **OBS Studio**, **Streamlabs Desktop**, and any platform that embeds a local web page as a source. This is not an official OBS Project product.

Create clips in the editor (YouTube link or a local file). When you click a clip on the dashboard, it plays on the overlay and fades out when finished.

### Overlay URLs

Use separate browser sources when you want different on-canvas layouts. Add `?mode=` to the path:

| Mode | URL suffix | Clips shown |
| --- | --- | --- |
| **Audio** | `?mode=audio` | Audio clips only |
| **Stage** (recommended) | `?mode=stage` | All video clips; position via **Layout areas** |
| **Universal** | `?mode=universal` | Audio + all video clips |
| **Landscape** | `?mode=landscape` | Landscape video only *(legacy)* |
| **Portrait** | `?mode=portrait` | Portrait video only *(legacy)* |

**Recommended setup (v0.8+):** **`audio`** for audio clips + **`stage`** for video at canvas resolution (e.g. 1920×1080). Configure areas under **Layout areas** in the app.

| Environment | Example (audio) |
| --- | --- |
| Development (`npm run dev`) | `http://localhost:5173/overlay/browser?mode=audio` |
| Production / installed app | `http://localhost:3847/overlay/browser?mode=audio` |
| LAN (phone or another PC) | `http://<streaming-PC-IP>:3847/overlay/browser?mode=audio` |

The clip form lists overlay URLs with **Copy** when editing clips. Set **Video orientation** so clips route correctly in legacy modes.

### OBS Studio (quick setup)

1. Open the scene where the overlay should appear.
2. **Sources** → **+** → **Browser**.
3. Paste an overlay URL with the desired `?mode=` (see table above).
4. Set **Width** / **Height** to your canvas (e.g. 1920×1080).
5. Optional: enable **Refresh browser when scene becomes active**.
6. Save, then play a clip from the dashboard to test.

### Streamlabs Desktop (quick setup)

1. Open your scene.
2. **Sources** → **+** → **Browser Source**.
3. Paste an overlay URL with the desired `?mode=`.
4. Match **Width** / **Height** to your output resolution.
5. Confirm and test with a clip from the dashboard.

### More detail

Step-by-step notes, troubleshooting (black background), and audio vs video behavior: **[docs/browser-source-setup.md](docs/browser-source-setup.md)**.

**Layout Stage:** single-source layout areas and in-app positioning — **[docs/overlay-layout-stage.md](docs/overlay-layout-stage.md)**.

Release checklist: [docs/next-release.md](docs/next-release.md).

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
release/Stream Media Board Setup 0.9.0.exe
```

The installed **Stream Media Board** app runs in the Windows tray and exposes:

- **Open in Browser** — local web UI (dashboard).
- **Exit** — stop playback and shut down the backend.

Use `npm run pack:win` for an unpacked smoke-test build.

`release/` is ignored by Git; installers are published via **GitHub Releases**.

### Publish installer to GitHub Releases

Requires [GitHub CLI](https://cli.github.com/) (`gh auth login`).

```bash
npm run publish:win
```

Upload only (installer already in `release/`):

```bash
npm run publish:release
```

Optional: `RELEASE_NOTES_FILE=./notes.md npm run publish:win` — custom release notes.

## Publishing Changes to GitHub

```bash
npm run build
git add -A
git commit -m "Describe the change"
git push origin main
```

Repository: [github.com/mmartinewski/stream-media-board](https://github.com/mmartinewski/stream-media-board)

## Configuration

Optionally copy `config/config.example.json` to `config/config.json` to adjust the port:

```json
{
  "port": 3847,
  "youtube_cookies_from_browser": "chrome"
}
```

### YouTube sign-in (recommended)

1. Right-click the tray icon → **Sign in to YouTube**.
2. Sign in and click **Save session**.
3. Retry loading YouTube media in the clip form.

Cookies: `%APPDATA%/LocalSoundboardServer/youtube.cookies.txt`

From the web UI: `soundboard://youtube-login` (desktop app must be running).

## Structure

```text
backend/    API Express, SQLite, FFmpeg, yt-dlp
frontend/   React + Vite + Tailwind
desktop/    Electron tray app
bin/        unversioned local executables
config/     configuration example
docs/       setup guides, layout stage spec
scripts/    build and publish utilities
```

## GitHub Notes

- Do not commit `node_modules/`, `dist/`, `bin/*.exe`, `config/config.json`, or `.env`.
- Database, media, and logs: `%APPDATA%/LocalSoundboardServer/`.
