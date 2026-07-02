# Twitch Stream Presets

Apply Twitch stream metadata (title, category, tags, language, content classification, branded content) with one click — similar to OBS **Stream Information**, without Go Live Notification.

**UI:** **Twitch presets** in the side menu → `/settings/twitch-presets`

---

## Quick setup

### 1. Create a Twitch application

1. Open [dev.twitch.tv/console](https://dev.twitch.tv/console) and sign in.
2. **Register Your Application** (or use an existing app).
3. **Name:** e.g. `Stream Media Board`
4. **OAuth Redirect URLs:** Twitch may require at least one URL. Use `https://localhost` — the app uses **device code** flow (`twitch.tv/activate`), not browser redirect.
5. **Category:** choose any appropriate category.
6. **Client type:** **Confidential** (Client Secret required for token refresh).
7. Copy **Client ID** and create a **Client Secret**.

**Trap:** empty redirect URL fields block **Create**. Click **Add**, fill one URL, and remove any extra empty rows.

### 2. Configure in Stream Media Board

1. Open **Twitch presets** in the app.
2. **Configurar Twitch** → paste **Client ID** and **Client Secret** → **Salvar configuração**.
3. **Conectar conta Twitch** → open [twitch.tv/activate](https://www.twitch.tv/activate) → enter the code shown in the app → authorize.
4. Scope required: `channel:manage:broadcast`.

### 3. Create and apply presets

1. **+ Novo** → fill title, category, tags, language, content classification.
2. **Salvar preset**.
3. **Aplicar** on the preset list (or from the editor) to push settings to your Twitch channel.

---

## Content classification and locked labels

Some games (e.g. **Stellar Blade**) automatically impose labels such as **Mature-rated game** (`MatureGame`). Twitch does not allow removing these via API.

The app shows a **lock icon** on mandatory labels. They do not count toward the 6 optional labels per preset.

**How locked labels are detected:**

- After a successful **Apply**, the app caches mandatory labels for that category.
- When editing offline, the app may briefly switch your Twitch category to discover locks (only when you are **not live**).
- While **live**, locks may not appear until the first apply for a new category (no category probe during stream).

---

## Troubleshooting

| Problem | What to try |
| --- | --- |
| **Conectar** does nothing | Save Client ID first. Client Secret is required for token refresh. |
| Token expired / apply fails | Reconnect via **Conectar conta Twitch**. Ensure Client Secret is saved. |
| `content_classification_labels` errors | Update the app — apply sends only changed labels and respects locked ones. |
| Lock icon missing for a mature game | Apply the preset once (populates cache), or go offline and re-select the category in the editor. |
| Category changed briefly on Twitch | Expected when detecting locked labels offline; category is restored after the check. |

Logs: `%APPDATA%\LocalSoundboardServer\logs\` (tray menu **Open logs folder** on v0.18.2+).

---

## Related

- [troubleshooting-windows.md](./troubleshooting-windows.md) — install, port, antivirus
- [browser-source-setup.md](./browser-source-setup.md) — OBS overlay (separate from Twitch metadata)
