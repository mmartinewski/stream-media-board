## Stream Media Board v0.14.0

### Checklist editor

- **Enter** in the “New item” field adds the item (same as the Add item button).
- **Auto-scroll** while dragging groups or items — the page follows the cursor near viewport edges.
- **Panel title centered** on the overlay and in the editor preview.

### Preview and overlay parity

- Shared **`TodoChecklistPanel`** component for the live browser overlay and the editor preview — same markup, column widths, and layout rules.
- Removed preview-only CSS that stretched columns to full width; preview now matches OBS/stage output.

### App layout and navigation

- **All screens left-aligned** with the hamburger menu and app title (shared shell padding via `appShellLayout`).
- Media Board toolbar uses the same horizontal alignment as the header.
- Side drawer shows **Stream Media Board** instead of “Menu”.

### Upgrade from v0.13.0

Install over v0.13.0. No database migrations in this release. Close the app before installing, then refresh the dashboard and OBS browser source after updating.
