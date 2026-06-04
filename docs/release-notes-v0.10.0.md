## Stream Media Board v0.10.0

### Dashboard — grid view and compact toolbar

- **Grid view**: full-width compact square cards with title/category overlays, favorite toggle, and clip actions on the thumbnail.
- **Standard view** unchanged for category sections; grid mode shows a flat list of all clips.
- **Grid toggle** in the app header (grid/list icon beside Dashboard), with the last mode saved in `localStorage`.
- **Sticky toolbar**: search, Stop all, and controls toggle stay visible while scrolling; optional panel for global volume and OBS stage hint.
- **Menus**: clip dropdowns render in a viewport-aware portal so they are not clipped by cards or page layout.
- **Volume**: per-clip volume moved into the clip menu (Volume submenu).
- **Search** field with inline icon and `search` URL parameter (from v0.9.1, unchanged).

### Upgrade from v0.9.1

Install over v0.9.1. No database or overlay URL changes. Refresh the dashboard after updating if it was already open.
