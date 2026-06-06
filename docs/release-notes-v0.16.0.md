## Stream Media Board v0.16.0

### Checklist editor & overlay

- **Panel spacing**: configurable inner padding and screen-edge inset for side panels and tight layouts.
- **Typography tab**: reorganized into General, Panel title, and Groups & items.
- **Title controls**: separate size slider, left/center/right alignment, no underline on the panel title.
- **Group titles**: slightly smaller font scale at every size preset.
- **Zebra rows**: alternating row shade on checklist items (0–50%, off at 0%).
- **Color fields**: square swatch + hex text input; paste `#hex`, `rgb()`, or `rgba()` (alpha ignored); stored as hex.
- **Form controls**: fixed native select chevron alignment (`form-select`); color picker no longer opens when clicking empty label area.

### Database

Migrations run automatically on startup (`panel_padding_*`, `panel_inset_*`, `title_font_size`, `title_align`, `item_zebra_opacity_percent`).

### Upgrade from v0.15.0

Install over v0.15.0. Close the app before installing, then refresh the dashboard and OBS browser source after updating.
