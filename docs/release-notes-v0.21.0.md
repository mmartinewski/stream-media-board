## Stream Media Board v0.21.0

### Category images & editor

- **Edit category** modal: rename and set a square background image for category cards.
- **Upload & drag-and-drop** for JPEG, PNG, and WebP (up to 1 MB), including images dragged from the browser.
- **Crop & zoom** controls match the clip thumbnail editor (100–500% zoom, draggable 1:1 area).
- **Category cards** in Browse show the cropped image as the card background.
- Edit from the Media Board category menu (⋮) or the ✎ button on browse category cards.
- Edit modal renders in a portal so it is not clipped on short category grids.

### Database

Migrations run automatically on startup (`categories.thumbnail_original_path`, `thumbnail_cropped_path`, `thumbnail_crop_meta`).

### Upgrade from v0.20.0

Install over v0.20.0. Close the app before installing. Existing categories keep their names; add images anytime from **Edit category**.
