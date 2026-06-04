## Stream Media Board v0.10.0

### Dashboard — grid view and compact toolbar

- **Grid view**: full-width compact square cards with title/category overlays, favorite toggle, and clip actions on the thumbnail.
- **Standard view** unchanged for category sections; grid mode shows a flat list of all clips.
- **Toolbar**: search and Stop all always visible; volume, grid toggle, and OBS hint live in a collapsible controls panel (toggle button beside Stop all).
- **Menus**: clip dropdowns render in a viewport-aware portal so they are not clipped by cards or the title area.
- **Volume**: per-clip volume moved into the clip menu (Volume submenu).
- **Preference**: last grid/standard view choice is saved in `localStorage` and restored on return.

### Upgrade from v0.9.1

Install over v0.9.1. No database or overlay URL changes. Refresh the dashboard after updating if it was already open.
