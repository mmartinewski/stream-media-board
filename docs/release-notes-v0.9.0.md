## Stream Media Board v0.9.0

### Rebrand

- Product renamed from **Personal Soundboard Player** to **Stream Media Board**.
- GitHub repository: **`stream-media-board`** (formerly `personal-remote-soundboard`; GitHub redirects old URLs).
- Positioning: LAN clip dashboard + **browser overlay** for any streaming app that supports a browser / web source (OBS Studio, Streamlabs Desktop, and similar).

### Upgrade from v0.8.x

Install over the previous version. **No data migration required:**

- Same Windows `appId` and install folder behavior.
- User data remains in `%APPDATA%/LocalSoundboardServer/`.
- Deep link `soundboard://youtube-login` unchanged.

Refresh browser sources in your streaming app after updating if the overlay was already open.

### After v0.9.0

If you clone or fork the project, update your remote:

```bash
git remote set-url origin https://github.com/mmartinewski/stream-media-board.git
```
