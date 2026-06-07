# backend

Express + TypeScript server that persists data in SQLite (`better-sqlite3`), invokes `yt-dlp` and FFmpeg, and streams clip/segment previews to the browser.

## Scripts

```bash
npm run dev        # tsx watch (reloads on edit)
npm run build      # tsc -> dist/
npm start          # node dist/index.js
npm run typecheck  # type checking only
```

## Paths

- The root `bin/` directory is resolved in `src/config/paths.ts`.
- User data lives in `%APPDATA%/LocalSoundboardServer/`.
- Logs live in `%APPDATA%/LocalSoundboardServer/logs/latest.log` and are truncated on each startup.

See sections 11 and 12 of the specification for details.
