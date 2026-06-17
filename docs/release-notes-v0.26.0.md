## Stream Media Board v0.26.0

### Import GIFs (Tenor / local)

- **New GIF** on the GIFs page opens a dialog to import GIFs via **Win + .** (Tenor), **Ctrl+V**, drag-and-drop, or file picker.
- Set **title** and **tags** on import; imported GIFs are stored locally and appear in saved GIF search.
- Supports GIF, WebP, PNG, JPEG, and MP4 (up to **50 MB**).

### Saved GIF management

- Card menu **Edit metadata** updates title and user tags (replaces “Edit tags”).
- **Delete** removes a saved or imported GIF from disk and the local cache.
- **Search saved GIFs only** is **on by default** when opening the GIFs page.
- Local saved GIF search works even without a GIPHY API key configured.

### Overlay playback

- Imported animated GIFs/WebPs are converted to **MP4** for reliable playback on the stage browser source (same path as GIPHY).
- Conversion handles odd dimensions and falls back to image playback if transcoding fails.

### Upgrade from v0.25.0

Install over v0.25.0. No new SQLite migrations. Refresh the OBS browser source (`?mode=stage`) after updating. Re-import any GIFs that failed to save in earlier builds.
