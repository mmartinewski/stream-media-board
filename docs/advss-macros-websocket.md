# Advanced Scene Switcher (macros via WebSocket)

Stream Media Board exposes a plain WebSocket endpoint so OBS Advanced Scene Switcher can connect as a client and receive trigger messages from the Macros panel (or `curl`).

## Endpoint

| Item | Value |
| --- | --- |
| WebSocket URL | `ws://127.0.0.1:3847/ws/advss` |
| Status | `GET /api/advss/status` |
| Send message | `POST /api/advss/send` with JSON `{ "message": "..." }` |
| UI | `/macros` in the dashboard |

If the backend port in `config.json` is not `3847`, use that port instead.

## AdvSS connection

1. Open **Tools → Advanced Scene Switcher → Websocket Connections**.
2. Add a connection:
   - **Name:** `Stream Media Board`
   - **Address:** `ws://127.0.0.1:3847/ws/advss`
   - **Port:** `3847` (if asked separately)
   - **Is using OBS protocol?** **No** (plain text messages)
3. Use **Test connection** if available; you should see a client on `GET /api/advss/status` (`connected_clients` ≥ 1).

OBS on another PC on the LAN: use `ws://<IP-do-PC-do-SMB>:3847/ws/advss`.

## Macro trigger

1. Create/edit a macro.
2. Condition: **Websocket** → message received from **Stream Media Board**.
3. Message text: exact string the panel will send, e.g. `ja-vai-comecar`.
4. Actions: whatever you need (switch scene, etc.).

Use one AdvSS connection for all macros; differentiate by message text.

## Smoke test (without UI)

With Stream Media Board running and AdvSS connected:

```powershell
# Status
curl http://127.0.0.1:3847/api/advss/status

# Trigger (must match the macro message field)
curl -X POST http://127.0.0.1:3847/api/advss/send `
  -H "Content-Type: application/json" `
  -d "{\"message\":\"ja-vai-comecar\"}"
```

Expected JSON from send:

```json
{ "status": "ok", "message": "ja-vai-comecar", "sent": 1, "connected_clients": 1 }
```

If `sent` is `0`, AdvSS is not connected (check URL, port, and **OBS protocol = No**).
