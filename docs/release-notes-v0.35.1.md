## Stream Media Board v0.35.1

### Eventos Streamer.bot

- Todos os webhooks recebidos passam a ser gravados no banco, com o JSON completo do payload.
- Nova tela **Eventos SB** (menu lateral) para consultar o histórico por data e por tipo de evento.
- Clique em um registro abre o detalhe com o payload e o alerta gerado (quando houver).

### Auto-updater

- Stage downloaded installer under `{installDir}\update-cache\` before launch (helps Kaspersky).
- Fallback launch via CreateProcess when ShellExecute is blocked.

### OBS / VDO.Ninja

- CSS de referência para esconder o rótulo de vídeo do VDO.Ninja em Browser Sources do OBS (`docs/obs/vdo-ninja-video-label.css`).

### Upgrade from v0.35.0

Instale o setup desta versão (ou use **Check for Updates**). A tabela de eventos é criada automaticamente na subida do app.
