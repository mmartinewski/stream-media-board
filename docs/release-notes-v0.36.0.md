## Stream Media Board v0.36.0

### Macros OBS (Advanced Scene Switcher)

- Nova tela **Macros OBS** no menu lateral para disparar macros do plugin Advanced Scene Switcher via WebSocket.
- Cadastro de macros com **nome**, **event** (mensagem enviada ao AdvSS) e **thumbnail** (mesmo editor de crop/drag-and-drop das categorias).
- Grade de cards full-width: clique dispara o event; ✎ edita; botão **Nova macro** cria.
- Endpoint WebSocket `ws://127.0.0.1:3847/ws/advss` (protocolo OBS = No) e API `POST /api/advss/send`.
- Painel de conexão AdvSS oculto por padrão; botão **Conexão AdvSS** mostra status e URL.
- Erros de disparo aparecem em toast no topo (fechável); sucesso sem mensagem piscando.
- Modal de edição compacto (duas colunas) e sem fechar ao clicar fora.

### Upgrade from v0.35.1

Instale o setup desta versão (ou use **Check for Updates**). A tabela `macros` é criada automaticamente na subida do app. Configure a conexão no AdvSS conforme `docs/advss-macros-websocket.md`.
