## Stream Media Board v0.33.0

### Alert media triggers (Streamer.bot)

- New **Alertas** settings screen (`/settings/alert-triggers`) to link each Twitch alert type (follow, sub, cheer, raid, etc.) to a clip or local GIF.
- When a Streamer.bot webhook arrives, the linked media plays on the browser overlay with the same settings as a manual play (volume, layout area, GIF timing).
- **Test** button per alert type plays only the linked media (not the alert toast).
- API: `GET/PUT/DELETE /api/alerts/triggers` and `POST /api/alerts/triggers/:kind/test`.

### Upgrade from v0.32.0

Install over v0.32.0. SQLite adds the `alert_media_triggers` table on first startup (automatic migration). For video/GIF triggers, keep a **`?mode=stage`** browser source open in OBS alongside **`?mode=audio`** for soundboard clips.
