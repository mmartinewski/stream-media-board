## Stream Media Board v0.23.0

### Browse search on category grid

- **Limit search to categories** checkbox on the category grid (`/browse`), matching category and favorites clip views.
- Uncheck to search **all clips** from the categories screen; check to filter category cards by name.
- Global clip results on the grid support the same card actions (play, menu, grid view).

### Persisted search scope

- The limit-search checkbox preference is saved in **localStorage** and shared across browse pages (category grid, category clips, favorites).
- Survives reloads and navigation between browse screens; URL `inCategory` still overrides when present.

### Upgrade from v0.22.0

Install over v0.22.0. No database migration required.
