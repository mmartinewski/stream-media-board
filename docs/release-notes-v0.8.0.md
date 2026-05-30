## Personal Soundboard Player v0.8.0

### Early access — Layout Stage

This release introduces **Layout Stage**: a single fullscreen OBS browser source where video clips are positioned using **layout areas** you configure in the app (margins, anchors, max size, fullscreen zones).

**This is an early version.** It is usable end-to-end, but several improvements from the design doc are still planned (visual preview on the canvas, per-clip default area, richer editor, and more). **Future releases will add increments** without requiring a separate OBS source per orientation.

### Layout Stage (new)

- **One browser source for all video** — use `?mode=stage` at your canvas size (e.g. 1920×1080) instead of juggling separate landscape/portrait URLs.
- **Layout areas** — named regions (e.g. Top right, Center, Fullscreen) with anchor, margin %, and max width/height %; clip aspect ratio fits inside the max box.
- **Dashboard** — per video clip, choose a **Layout area** before play; defaults follow **landscape** / **portrait** mapping from settings.
- **Layout areas page** — app menu → **Layout areas**: CRUD, restore defaults, and orientation → default area mapping.
- **Empty / fallback behavior** — seeded areas on first run; system fullscreen fallback if resolution fails; dashboard warns when no `?mode=stage` client is connected.

### OBS / Streamlabs

| Mode | URL suffix | Use |
| --- | --- | --- |
| **Stage** (new, recommended for video) | `?mode=stage` | All video clips; position via layout areas |
| **Audio** | `?mode=audio` | Audio clips only |
| **Landscape / Portrait / Universal** | unchanged | Still supported; legacy setups keep working |

Example (production): `http://localhost:3847/overlay/browser?mode=stage`

Full spec and roadmap: [docs/overlay-layout-stage.md](https://github.com/mmartinewski/personal-remote-soundboard/blob/main/docs/overlay-layout-stage.md)

### API

- `GET/POST/PUT/DELETE /api/layout-areas` — manage layout areas
- `GET/PUT /api/layout-areas/settings` — `layout_area_id_landscape`, `layout_area_id_portrait`
- `POST /api/layout-areas/restore-defaults` — re-seed default areas
- `POST /api/clips/:id/play` — optional body `{ "layout_area_id": number }` for video
- Play SSE (video, `?mode=stage`) includes `layoutArea` for client positioning
- `GET /api/browser-source/status` — `clients_by_mode.stage` and `overlay_paths.stage`

### Documentation

- New: [overlay-layout-stage.md](https://github.com/mmartinewski/personal-remote-soundboard/blob/main/docs/overlay-layout-stage.md)
- Updated: browser-source-setup, technical-specification, README

### Upgrade from v0.7.0

1. Install this build over v0.7.0.
2. **Add or replace** your video browser source with the **stage** URL (`?mode=stage`), width/height = stream canvas.
3. Open **Layout areas** in the app, review defaults, set landscape/portrait defaults if needed.
4. Play a video clip from the dashboard and confirm placement in OBS.

Audio overlay (`?mode=audio`) is unchanged. You can keep legacy landscape/portrait sources during testing; only **stage** receives the new layout positioning.

### Coming in later releases (not in v0.8.0)

- Visual drag-and-drop area editor with live preview
- Per-clip default layout area in the clip editor
- Further polish, validation, and edge-case handling
