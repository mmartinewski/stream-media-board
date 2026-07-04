## Stream Media Board v0.32.0

### Twitch alert overlay — restore enter/exit only

- Removed the continuous **Y-axis 3D sway** from the alerts overlay (`/overlay/alerts`).
- Alerts again use only the original **fade + slide** enter/exit animation (no `rotateY`, no `perspective`).

### Upgrade from v0.31.0

Install over v0.31.0. No database migrations. Refresh the OBS Browser Source for `http://localhost:3847/overlay/alerts` after updating.
