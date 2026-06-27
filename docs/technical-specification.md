# Technical Requirements Specification: Stream Media Board

This document describes the v1 behavior for a local Node.js app that creates audio and video clips from YouTube (or local files), stores metadata and media locally, and plays clips on a **browser overlay** in streaming software. The web dashboard can be controlled from another device on the same LAN.

## 1. Technology Stack

| Area | Choice |
| --- | --- |
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite with `better-sqlite3` |
| Media | FFmpeg, ffprobe, ffplay, and yt-dlp invoked as child processes |
| Local playback | `ffplay.exe` with `-nodisp` and `-autoexit` |

The first version targets Windows. Runtime binaries are expected in the repository-level `bin/` folder and are not committed to Git.

## 2. Local Data Layout

The application stores user data outside the repository:

```text
%APPDATA%/LocalSoundboardServer/
  soundboard.sqlite
  media/
    audio/
    thumbnails/
    temp/
  logs/
```

Temporary staging files live in `media/temp/` and use a 7-day TTL. Startup cleanup removes expired staging files.

## 3. Media Pipeline

The app uses an audio-first workflow:

1. The user enters a YouTube URL and clicks **Load audio**.
2. The backend runs `yt-dlp` and downloads the best available audio stream into staging.
3. `ffprobe` reads the source duration. Sources longer than 10 minutes are rejected.
4. The frontend renders a waveform from the staged audio and lets the user drag start/end handles.
5. When saving, the backend uses FFmpeg to trim and encode the selected segment to MP3.
6. Saved clips are played on the host machine through `ffplay`.

Saved clips are limited to 5 minutes. Time values use the single contract format `HH:MM:SS.mmm`.

## 4. Thumbnail Pipeline

The app can suggest the video's YouTube thumbnail through the backend. Users can also upload a local image.

Thumbnails are processed non-destructively:

1. The original image is stored as `*_original`.
2. A cropped 1:1 image is generated for dashboard cards.
3. Crop metadata is stored as JSON in `thumbnail_crop_meta`.

The upload limit is 1 MB.

## 5. Database Model

The SQLite schema contains:

- `categories`: reusable category names.
- `clips`: YouTube URL, trim times, category, tags, thumbnail paths, audio path, volume, normalization flag, favorite flag, and timestamps.
- `app_settings`: small key/value settings such as `playback_volume`.

Category names are created on save when they do not already exist. Tags are stored as a comma-separated string and exposed through suggestion endpoints.

## 6. API Summary

- `GET /api/health`: basic server status.
- `GET /api/clips?search=...`: dashboard sections grouped by favorites and categories.
- `POST /api/clips/prefetch`: downloads YouTube audio into staging.
- `GET /api/staging/:processId/audio`: serves staged audio with range support.
- `GET /api/staging/:processId/thumbnail`: proxies a YouTube thumbnail candidate.
- `POST /api/clips/test-play`: creates and plays a temporary MP3 preview on the host.
- `POST /api/clips`: creates a clip from staged audio and thumbnail data.
- `GET /api/clips/:id`: returns full clip details.
- `PUT /api/clips/:id`: updates clip metadata, audio trim, volume, favorite state, and thumbnail crop/upload.
- `PATCH /api/clips/:id/favorite`: toggles or sets favorite state.
- `DELETE /api/clips/:id`: removes the clip and its media files.
- `GET /api/clips/suggestions/categories`: category autocomplete.
- `GET /api/clips/suggestions/tags`: tag autocomplete.

## 7. User Interface

The dashboard is optimized for live control:

- Sticky search filters by title, category, and tags.
- Favorites appear first.
- Category sections are sorted alphabetically.
- Each card has a large overlay play button, favorite toggle, and floating edit/delete menu.
- Delete uses a styled confirmation modal instead of the native browser confirm dialog.

The clip form supports:

- YouTube URL validation and audio prefetch.
- Waveform trimming with draggable handles.
- Server-side preview playback.
- Per-clip volume from 0 to 300.
- Always-on audio normalization.
- YouTube thumbnail suggestion, crop, and zoom.
- Reusable category and tag inputs with autocomplete.

## 8. Validation and Safety

- Source videos must be 10 minutes or shorter.
- Saved clip segments must be 5 minutes or shorter.
- Thumbnail uploads are limited to 1 MB.
- Media paths are checked to ensure they stay under the app media directories.
- The v1 app has no authentication and assumes a trusted local network.

## 9. Configuration

`config/config.json` can override the server port:

```json
{
  "port": 3847
}
```

`config/config.json` is ignored by Git.

## 10. Browser overlay (current and planned)

Today, video and audio clips play through a transparent **browser overlay** in OBS or Streamlabs (SSE from `/api/browser-source/events`), not through local `ffplay` on dashboard play. Setup is documented in [browser-source-setup.md](./browser-source-setup.md).

A planned **Layout Stage** feature will move on-canvas positioning from OBS into the app: registerable layout areas (anchor, percent margins, percent max dimensions), intrinsic video sizing per clip aspect ratio, global **landscape / portrait → layout area** mapping in display settings, and a dashboard dropdown to override the play area. One fullscreen browser source at stream resolution (`?mode=stage`) would replace multiple orientation-specific sources. Full design: [overlay-layout-stage.md](./overlay-layout-stage.md) (proposed, not yet implemented).

A planned **Checklists** feature (API: `/api/todo-lists`) will add registerable to-do lists (title, groups, items, per-list theme and enter/exit animations) shown on the same browser overlay via SSE (`todo_show` / `todo_hide`). A list **remains visible until explicitly hidden**; clip play/stop on the **Media Board** does not dismiss it. Checklists have a **separate listing** at `/checklists` (not mixed with the clip grid); the main clip screen will be labeled **Media Board** instead of Dashboard. Full design: [todo-lists-overlay.md](./todo-lists-overlay.md) (draft, not yet implemented).
