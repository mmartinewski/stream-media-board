## Stream Media Board v0.28.0

### Twitch Stream Presets

- New **Twitch presets** page (`/settings/twitch-presets`) to save and apply stream metadata with one click — title, category, tags, language, content classification, and branded content (OBS-style stream info, without Go Live Notification).
- Connect your Twitch account via **device code** (`twitch.tv/activate`); configure **Client ID** and **Client Secret** from the Twitch Developer Console.
- Category search, tag autocomplete (from live Twitch data), and content classification dropdown.
- **Locked labels** (padlock icon) for game-mandatory classifications (e.g. Mature-rated game on Stellar Blade); apply logic respects Twitch-imposed labels.
- Setup guide: [docs/twitch-stream-presets.md](./twitch-stream-presets.md).

### Upgrade from v0.27.0

Install over v0.27.0. Adds SQLite table `twitch_stream_presets` on first run (automatic migration). Configure Twitch API credentials in the app before connecting.
