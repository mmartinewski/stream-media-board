## Stream Media Board v0.15.0

### Checklist panel (overlay + preview)

- **Solid-color background**: radial gradient anchored top-left (with negative origin) so shading scales with panel height; subtle vignette toward bottom-right.
- **Translucent white border** (1.5px, 25% opacity) on the panel edge — works on any background color without tinting from the theme color.
- **Column layout**: columns always share panel width equally (removed the 28rem cap that left empty space on wide overlays).
- **Preview parity**: same `todo-layer` structure as the live overlay; panel height follows content instead of stretching in the 16:9 preview box.

### Upgrade from v0.14.0

Install over v0.14.0. No database migrations. Close the app before installing, then refresh the dashboard and OBS browser source after updating.
