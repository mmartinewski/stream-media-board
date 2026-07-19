## Stream Media Board v0.37.0

### Painéis de controle (multi-dashboard)

- Nova seção **Painéis** no menu: lista de dashboards e editor em `/panel/:id`.
- Widgets arrastáveis e redimensionáveis: **macro**, **clip**, **GIF** e **markdown**.
- Modo edição com arrastar (⠿), redimensionar, excluir e salvar/cancelar.
- Markdown com preview renderizado; clique abre o editor de fonte.
- Botão play circular com animação de pulso em macro/clip/GIF; subtítulo de macro fixo como `"macro"`.
- API: `GET/POST /api/control-dashboard`, `GET/PATCH/DELETE /api/control-dashboard/:id`, `PUT .../widgets`.
- Widgets GIF usam cache local (`gif_provider` + `gif_external_id`).

### Estabilidade

- Correção do arrastar no editor (`react-draggable` / `process is not defined` no browser), com patch no `postinstall` e shim no Vite.

### Upgrade from v0.36.2

Instale o setup desta versão (ou use **Check for Updates**). As tabelas de control dashboard são criadas automaticamente na subida do app.
