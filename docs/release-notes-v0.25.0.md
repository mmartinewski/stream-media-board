## Stream Media Board v0.25.0

### Checklist overlay automation

- **Max display time (seconds)** per checklist — overlay auto-hides after the configured duration (0 = stay until manual hide).
- **Show on overlay when an item is checked or unchecked** — optional auto-show with timer restart on each toggle.
- **Show** / **Hide** overlay buttons stay enabled so you can re-show after auto-hide; **Show** republishes the checklist and resets the display timer.

### Checklist item feedback

- Shine highlight animation when an item is checked or unchecked (reverse sweep when unchecking).
- Strikethrough appears at the midpoint of the highlight; item opacity fades when marked complete.
- Item titles support **multi-line** text in the editor (textarea).

### Overlay & integrations

- Removed **connected (stage)** debug text from the browser source corner.
- Twitch EventSub webhook test endpoint (`/api/webhooks/twitch/events`) with debug capture routes.

### Upgrade from v0.24.0

Install over v0.24.0. SQLite migrates on startup (`max_display_seconds`, `auto_show_on_item_update` on `todo_lists`). Refresh the OBS browser source after updating.
