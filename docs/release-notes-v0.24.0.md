## Stream Media Board v0.24.0

### GIPHY GIF search and overlay playback

- New **GIFs** page (`/gifs`) with GIPHY search, powered-by branding, and in-app **Settings** for API key and integration toggle.
- GIFs play on the **stage** browser overlay (`?mode=stage`) in the configured layout area.
- **Minimum animated display (seconds)** setting ensures short loops stay visible long enough before fade-out; short clips loop until the minimum is met.

### Offline GIF cache

- GIFs are downloaded automatically on first play and stored under `%APPDATA%/LocalSoundboardServer/media/gifs/`.
- **Search saved GIFs only** filters the grid to locally cached items; an empty search lists **most played** saved GIFs.
- Card menu: **Save locally**, **Edit tags** (user tags merged into local search; GIPHY tags remain read-only).
- Local search orders results by **play count**, then recency.

### Overlay fade improvements

- Fade-in on stage media uses the **Web Animations API** for reliable behavior in OBS/CEF browser sources.
- Fade-out timing respects minimum display duration for animated GIFs.

### Upgrade from v0.23.0

Install over v0.23.0. On first run, SQLite migrates with a new `media_search_cache` table. Configure your GIPHY API key under **GIFs → Settings** before searching online.
