# Browser source setup (streaming apps)

Video and audio clips from **Stream Media Board** play on a **transparent web overlay**. Add one or more **Browser Source** (or web overlay) entries in OBS Studio, Streamlabs Desktop, or any compatible streaming app, then trigger clips from the dashboard.

> **Not affiliated with OBS Project or Streamlabs.** Any software that can load a local URL as a browser/web source should work.

> **Layout Stage (v0.8+):** Use a single **`?mode=stage`** browser source at canvas resolution for all video clips; positions come from **Layout areas** in the app. The multi-source setup below remains supported as **legacy**.

## Overlay URLs

Append `?mode=` to choose which clips that source receives. Use the same host and port as the Stream Media Board backend.

| Mode | Query | Receives |
| --- | --- | --- |
| **Stage** (recommended) | `?mode=stage` | All video clips; position via layout areas in the app |
| **Audio** | `?mode=audio` | Audio clips only (soundboard) |
| **Universal** | `?mode=universal` (default if omitted) | Audio + all video clips |
| **Landscape** | `?mode=landscape` | Landscape video only *(legacy)* |
| **Portrait** | `?mode=portrait` | Portrait video only *(legacy)* |

**Recommended setup (v0.8+):** **`?mode=audio`** for the soundboard + **`?mode=stage`** for video at stream resolution (e.g. 1920×1080). Configure areas under **Layout areas** in the app.

**Legacy setup:** separate **`?mode=landscape`** and **`?mode=portrait`** sources with manual OBS positioning. Do **not** add `universal` if you already use orientation-specific video sources (duplicate playback).

| Environment | Audio | Universal | Landscape | Portrait |
| --- | --- | --- | --- | --- |
| Development (`npm run dev`) | `http://localhost:5173/overlay/browser?mode=audio` | `...?mode=universal` | `...?mode=landscape` | `...?mode=portrait` |
| Production / installed app | `http://localhost:3847/overlay/browser?mode=audio` | `...?mode=universal` | `...?mode=landscape` | `...?mode=portrait` |
| Another device on your LAN | `http://<streaming-PC-IP>:3847/overlay/browser?mode=...` | same | same | same |

In development, the Vite dev server (port **5173**) proxies API calls to the backend.

**Square** (1:1) videos are treated as **landscape** for routing to browser sources.

The clip form (**Video clip**) lists all overlay URLs with **Copy** buttons when you edit or create a video clip.

Each overlay listens for play events over SSE (`/api/browser-source/events?mode=...`). When you click a matching clip on the dashboard, that source plays it (video fades in/out; audio is invisible but audible).

> **Todo lists (planned):** Registerable to-do lists with themed UI and show/hide animations will use the same overlay page on **`?mode=stage`** or **`?mode=universal`**. The list **stays visible until you hide it** from the dashboard; clip play/stop does not remove it (list and clips can appear together). Setup and API are specified in [todo-lists-overlay.md](./todo-lists-overlay.md) (draft).

---

## OBS Studio

1. Open **OBS Studio** and select the scene where the overlay should appear.
2. In **Sources**, click **+** (Add).
3. Choose **Browser**.
4. Name the source (e.g. `Soundboard landscape`) and click **OK**.
5. In **URL**, paste one overlay URL from the table above (e.g. `http://localhost:3847/overlay/browser?mode=landscape`).
6. Set **Width** and **Height** to the area you want that clip type to use (e.g. 1920×1080 for landscape, or a smaller box for portrait).
7. Repeat steps 2–6 for other modes if you use multiple layouts.
8. Recommended:
   - **Refresh browser when scene becomes active** — helps if the SSE connection idled.
   - Leave **Shutdown source when not visible** off while testing so the connection stays warm.
9. Click **OK** on each source.

### If the overlay stays black

- Confirm the URL opens in a normal browser and shows a blank/transparent page (in dev, a small `connected (mode)` label may appear in the corner).
- Avoid setting a custom **CSS** background color on the Browser source unless you want a solid backdrop.
- Reload the source: right-click the source → **Interact** is optional; **Refresh** from the source properties works too.

### Test

1. Start Stream Media Board (`npm run dev`, `npm start`, or the installed tray app → **Open in Browser**).
2. Add browser sources with the correct URLs and modes.
3. Create a **video** clip, set **Video orientation** if needed, save, and click its card on the dashboard.
4. The clip should appear on the matching source(s) and fade out near the end.

---

## Streamlabs Desktop

1. Open **Streamlabs Desktop** and select your scene.
2. In **Sources**, click **+** (Add Source).
3. Select **Browser Source**.
4. Paste an overlay URL with the desired `?mode=`.
5. Set **Width** and **Height** for that layout (e.g. full canvas for landscape, narrower/taller box for portrait).
6. Add additional browser sources for other modes if needed.
7. Enable **Refresh browser when scene becomes active** if available.
8. Click **Done** / **Confirm** and place each source on the canvas.

### Test

Same as OBS: run the app, add the sources, play video clips from the dashboard.

---

## Video orientation (editor)

When you load a YouTube or local video, the app probes width/height and suggests **landscape** or **portrait** (near-square videos default to landscape). You can change **Video orientation** before save. Saved clips store dimensions and orientation in the database; existing clips are backfilled from the saved MP4 on the next server start.

---

## Audio vs video clips

| Clip type | Playback |
| --- | --- |
| **Audio** | Browser overlay with `?mode=audio` or `?mode=universal` |
| **Video** | Browser overlay with `?mode=landscape`, `?mode=portrait`, or `?mode=universal` |

Audio uses the clip volume from the editor (100 = normal). Route soundboard audio to a dedicated **`audio`** browser source (small 1×1 or hidden source is fine — only sound matters).

---

## Legacy multi-mode setup

The workflow above (separate Browser Sources per `?mode=`, with position and size set in OBS) remains the supported approach until **Layout Stage** ships. After implementation, the target setup is one source at canvas resolution with `?mode=stage`; see [overlay-layout-stage.md](./overlay-layout-stage.md) §11.

## Related docs

- [overlay-layout-stage.md](./overlay-layout-stage.md) — technical spec for layout areas and single-stage overlay (proposed)
- [README.md](../README.md) — project overview
- [next-release.md](./next-release.md) — release checklist and API notes
