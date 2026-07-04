## Stream Media Board v0.31.0

### Twitch alert overlay — subtle 3D sway

- The alerts browser overlay (`/overlay/alerts`) now has a continuous **Y-axis sway** on the notification card — same style as the social panel overlay.
- **±18°** rotation with **8s** loop and `ease-in-out`; sway runs on a wrapper so enter/exit animations are unchanged.
- **Perspective** (`600px`) on the overlay stage for a natural 3D look.

### Upgrade from v0.30.0

Install over v0.30.0. No database migrations. Refresh the OBS Browser Source for `http://localhost:3847/overlay/alerts` after updating.
