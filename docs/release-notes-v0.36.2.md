## Stream Media Board v0.36.2

### Fix

- Thumbnails das macros passam a ser servidas em `/api/thumbnails/m/:id/...` (mesmo prefixo dos clipes), em vez de `/api/macro-thumbnails/...`. No iPad/Safari as imagens dos cards de macro não carregavam enquanto clipes e categorias funcionavam.
- Cards de macro deixam de envolver a imagem em `<button>` (quirk do Safari).
- Envio de arquivos de thumbnail mais robusto no Windows (`sendFile` com `root`).

### Upgrade from v0.36.1

Instale o setup desta versão (ou use **Check for Updates**). Não há migração de banco. Recarregue a página de macros no iPad após atualizar.
