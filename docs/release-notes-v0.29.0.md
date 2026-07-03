## Stream Media Board v0.29.0

### Twitch live alerts overlay

- New **alerts browser overlay** at `/overlay/alerts` — transparent toast cards for Twitch events (follow, sub, cheer, raid, gifts, channel points, Hype Train, and more).
- **Streamer.bot integration:** `POST /api/webhooks/streamerbot/events` ingests trigger payloads; native `__source` names (e.g. `TwitchFollow`) are normalized automatically.
- **FIFO queue** with enter/exit animations; alerts never swap text mid-display when several events arrive in a row.
- Default **Portuguese** messages with per-kind icons, labels, and highlighted usernames.
- **Notification sound** on each alert (`/sounds/alert-notification.mp3`); replace the file in `frontend/public/sounds/` and rebuild to customize.
- **Debug endpoints:** `GET/DELETE /api/webhooks/streamerbot/debug`, `GET /api/alerts/status`, `POST /api/alerts/test`.
- Bundled Streamer.bot action import: [`docs/streamerbot/Live Alert Event Ingestion.cfg`](./streamerbot/Live%20Alert%20Event%20Ingestion.cfg).
- Setup guide: [docs/twitch-live-alerts.md](./twitch-live-alerts.md).

### Upgrade from v0.28.0

Install over v0.28.0. No database migrations. Add a Browser Source for `http://localhost:3847/overlay/alerts`, import the Streamer.bot action from the docs folder, and enable **Control audio via OBS** on that source if you want alert sounds on stream.
