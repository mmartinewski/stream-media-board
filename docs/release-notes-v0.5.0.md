## Personal Soundboard Player v0.5.0

### All playback through browser overlay

- **Audio clips** now play in OBS / Streamlabs via the browser source (no local `ffplay` on the dashboard).
- **Video clips** unchanged in spirit: still routed by orientation to the matching overlay.

### New overlay mode: `audio`

| Mode | URL suffix | Receives |
| --- | --- | --- |
| **Audio** | `?mode=audio` | Soundboard audio only |
| **Universal** | `?mode=universal` | Audio + all videos |
| **Landscape** | `?mode=landscape` | Landscape video only |
| **Portrait** | `?mode=portrait` | Portrait video only |

**Recommended setup:** one Browser Source with `?mode=audio` for the soundboard, plus `?mode=landscape` and `?mode=portrait` for video. Avoid `universal` if you already use orientation-specific video sources (otherwise videos play twice).

Example (production):

```
http://localhost:3847/overlay/browser?mode=audio
http://localhost:3847/overlay/browser?mode=landscape
http://localhost:3847/overlay/browser?mode=portrait
```

### Stop all overlays

- **Stop all** button on the dashboard stops every connected browser source immediately.
- Each new clip play also sends a global **stop** before **play**, so clips no longer stack on different overlays.

### Dashboard & editor UX

- Toast notification for **Stop all** (fixed overlay, does not shift the layout).
- Clip editor shows browser source instructions for **audio and video** clips (audio tab lists only `audio` + `universal` URLs).
- Video orientation routing fixes for clips missing stored orientation (landscape/portrait overlays work again).

### API

- `POST /api/clips/stop` — stops ffplay (if any) and broadcasts `stop` to all browser overlays.
- `GET /api/clips/:id/audio` — inline streaming for overlay; append `?download=1` to download.

### Upgrade

Install over v0.4.0. Restart the app, refresh browser sources in OBS/Streamlabs, and add an **`audio`** source for your soundboard if you have not already.
