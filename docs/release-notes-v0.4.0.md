## Personal Soundboard Player v0.4.0

### Browser overlay — landscape / portrait / universal

Video clips can now route to **separate OBS / Streamlabs browser sources** by orientation. Use one source per layout on your canvas (e.g. full-width landscape + a portrait column for Shorts).

| Mode | URL (production) | Receives |
| --- | --- | --- |
| **Universal** | `http://localhost:3847/overlay/browser?mode=universal` | All video clips |
| **Landscape** | `http://localhost:3847/overlay/browser?mode=landscape` | Landscape clips only |
| **Portrait** | `http://localhost:3847/overlay/browser?mode=portrait` | Portrait clips only |

**Development** (`npm run dev`): same paths on port **5173** instead of 3847.

**LAN** (phone or another PC): replace `localhost` with your streaming PC IP, e.g. `http://192.168.1.10:3847/overlay/browser?mode=landscape`.

Each overlay connects to SSE at `/api/browser-source/events?mode=...` and only plays clips that match that mode. Near-square (1:1) videos are treated as **landscape**.

### OBS / Streamlabs setup (quick)

1. Add a **Browser Source** for each mode you need.
2. Paste the URL from the table above (including `?mode=`).
3. Set **Width** and **Height** to the on-canvas area you want (e.g. 1920×1080 for landscape, 1080×1920 for portrait).
4. Play a video clip from the dashboard — it appears on matching sources, fills the box with no letterboxing, and fades out near the end.

The **Video clip** form lists all three URLs with **Copy** buttons.

Full guide: [docs/browser-source-setup.md](https://github.com/mmartinewski/personal-remote-soundboard/blob/main/docs/browser-source-setup.md)

### Video orientation & dimensions

- Clips store **width**, **height**, and **orientation** (landscape / portrait).
- The editor suggests orientation when you load a YouTube or local video; you can change it before save.
- Existing clips are **backfilled** from saved MP4s on server startup (no re-save required).

### Overlay playback

- Videos use `object-fit: cover` to fill the browser source (no black bars from layout mismatch).
- Layout uses stored dimensions when available.

### Editor fixes

- Edit mode clamps trim end to the exported MP4 duration (fixes disabled Preview / Save when trim exceeded file length).
- Saved clips show a clear “saved clip” state instead of asking for a local file again.
- Saving from **YouTube** requires a loaded YouTube URL (prevents wrong `local-file://` references).

### Upgrade

Install over v0.3.0 — your clips and database are preserved. Restart the app after install so migrations and metadata backfill run.
