# Twitch live alerts overlay

Custom **Twitch alert toasts** for OBS / Streamlabs, powered by **Streamer.bot** webhooks and a dedicated browser overlay in Stream Media Board.

Default messages are in **Portuguese**. Events are queued (FIFO): one alert shows at a time, with enter/exit animation and a short notification sound.

## Quick setup

### 1. Browser source (OBS / Streamlabs)

Add a **Browser Source** at full canvas size (e.g. 1920×1080):

| Environment | URL |
| --- | --- |
| Production / installed app | `http://localhost:3847/overlay/alerts` |
| Development (`npm run dev`) | `http://localhost:5173/overlay/alerts` |
| LAN | `http://<streaming-PC-IP>:3847/overlay/alerts` |

Recommended:

- Enable **Control audio via OBS** so alert sounds go to your stream mix.
- Leave the page transparent (no custom CSS background on the source).

### 2. Streamer.bot action (import)

Import the bundled action configuration:

**File:** [`docs/streamerbot/Live Alert Event Ingestion.cfg`](./streamerbot/Live%20Alert%20Event%20Ingestion.cfg)

In Streamer.bot:

1. **Actions** → **Import** (or right-click → Import).
2. Select `Live Alert Event Ingestion.cfg` from this repository.
3. Open the imported action **Live Alert Event Ingestion** and confirm the webhook URL matches your Stream Media Board host (default `http://localhost:3847/api/webhooks/streamerbot/events`).
4. Enable the action and assign its triggers (Follow, Cheer, Subscription, etc.) — the imported action includes the C# sub-action that forwards all trigger `args` as JSON to the webhook.

You only need **one** action; all Twitch triggers can point to it.

### 3. Test

**Without Streamer.bot** (dashboard backend running):

```bash
curl -X POST http://localhost:3847/api/alerts/test -H "Content-Type: application/json" -d "{}"
```

**Webhook debug** (last 20 events):

```bash
curl http://localhost:3847/api/webhooks/streamerbot/debug
```

**Overlay status** (connected clients, queue):

```bash
curl http://localhost:3847/api/alerts/status
```

## Supported events (v1)

| Twitch event | Kind | Example message |
| --- | --- | --- |
| Follow | `follow` | `{username} seguiu o canal!` |
| Subscription | `sub` | `{username} se inscreveu no canal!` |
| Prime subscription | `sub_prime` | `{username} se inscreveu com Prime!` |
| Resubscription | `resub` | `{username} renovou a inscrição!` |
| Gift sub | `gift_sub` | `{sender} presenteou {username}!` |
| Gift bomb | `gift_bomb` | `{sender} presenteou {amount} inscrições!` |
| Pay It Forward | `pay_it_forward` | … |
| Gift paid upgrade | `gift_paid_upgrade` | … |
| Prime paid upgrade | `prime_paid_upgrade` | … |
| Cheer / Bits | `cheer` | `{username} enviou {bits} bits!` |
| Raid | `raid` | `{username} raidou o canal com {viewers} viewers!` |
| Channel point reward | `channel_points` | `{username} resgatou {rewardTitle}!` |
| Hype Train start / level / end | `hype_train_*` | … |

Streamer.bot native payloads (`__source` like `TwitchFollow`) are normalized automatically.

## Architecture

```text
Streamer.bot trigger → C# Execute Code → POST /api/webhooks/streamerbot/events
  → alertTemplates (PT messages) → alertsHub (FIFO queue, SSE)
  → GET /api/alerts/events → /overlay/alerts (OBS browser source)
```

- **Display duration:** 5 seconds per alert (server timer); Hype Train ignores Streamer.bot `duration` (train length) and uses the same 5 s cap.
- **Queue:** Server holds the queue; the overlay only shows the next alert after the previous one fully exits (animation + sound).
- **Sound:** `frontend/public/sounds/alert-notification.mp3` (replace this file and rebuild to customize).

## API

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/webhooks/streamerbot/events` | Ingest event JSON from Streamer.bot |
| `GET` | `/api/webhooks/streamerbot/debug` | Last webhook payloads + alert status |
| `DELETE` | `/api/webhooks/streamerbot/debug` | Clear debug ring buffer |
| `GET` | `/api/alerts/events` | SSE: `alert_show`, `alert_hide` |
| `GET` | `/api/alerts/status` | Connected clients, current alert, queue |
| `POST` | `/api/alerts/test` | Trigger a test alert |

## Troubleshooting

| Issue | Check |
| --- | --- |
| Alert visible, no sound | Browser source: **Control audio via OBS**; click the overlay page once in Chrome (autoplay policy). |
| Sound plays twice | Multiple tabs/sources on `/overlay/alerts` — each client plays audio. See `connected_clients` in `/api/alerts/status`. |
| Webhook 400 | Open `/api/webhooks/streamerbot/debug` and inspect `error` on the last entry. |
| Old UI after update | Hard-refresh the browser source; production serves `frontend/dist` — rebuild with `npm run build:frontend`. |

## v2 (planned)

Per-event custom messages, sounds, and video presets in the dashboard; webhook authentication.
