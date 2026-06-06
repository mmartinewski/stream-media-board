## Stream Media Board v0.13.0

### Checklists overlay (new)

- **Checklists** area at `/checklists`: list, create, edit, show/hide on the live overlay, and delete.
- **Separate name and panel title**: internal **Name** for the list screen; **Panel title** is what viewers see on the overlay.
- **Columns, groups, and items** with drag-and-drop reorder, move between columns/groups, completion toggles, and optional thumbnails.
- **Visibility toggles** for columns and groups (hidden sections stay editable but do not appear on overlay).
- **Show on overlay** / **Hide** from the list or editor; SSE sync keeps OBS browser source up to date (`?mode=stage`).
- Lists **stay visible** until explicitly hidden; clip play/stop on the Media Board does not dismiss them.

### Display editor

- **Display** tab (formerly Theme) with sections: General, Background, Typography, Panel.
- **Bundled fonts** (modern, RPG/fantasy, bold display) via `@fontsource` — works offline in OBS without Google Fonts.
- **Font size** slider: Tiny, Small, Medium, Large (title, groups, items, and thumbnails scale together).
- **Background**: image upload or solid color, opacity control, panel anchoring, dimensions, enter/exit animations with readable labels (Fade, Slide from top, etc.).
- **Live preview** panel always visible below the editor, with **Show/Hide checklist** over looping gameplay.
- **Auto-save** for display settings (optional toggle, default on).
- Group titles **truncate with ellipsis** when they overflow; full text on hover.

### Media Board and navigation

- Main screen labeled **Media Board** (menu and help text).
- App title **Stream Media Board** in header and browser tab.
- **Hamburger menu** on the left; drawer opens from the left (Media Board, Checklists, Layout areas).
- **New clip** button on the Media Board toolbar (removed from the nav drawer).
- **Search** on the Checklists list page.

### Backend

- REST API `/api/todo-lists` with SQLite schema, background/thumbnail uploads, and overlay SSE events (`todo_show`, `todo_hide`, `todo_sync`).
- Fix: **font family** values with spaces/quotes (e.g. `"Press Start 2P"`) now save correctly instead of reverting to system UI.

### Upgrade from v0.12.0

Install over v0.12.0. Database migrations run automatically on startup (todo lists tables, `font_size`, `name`, column/group visibility). Refresh the app and OBS browser source after updating. No change to existing clip or layout-area URLs.
