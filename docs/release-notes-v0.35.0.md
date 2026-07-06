## Stream Media Board v0.35.0

### Gatilhos de alerta — mídia sincronizada com a fila

- Clip/GIF vinculado só toca quando o alerta **chega na vez** da fila (não mais no instante do webhook).
- O toast permanece visível pelo menos 5 segundos; se a mídia for mais longa, a próxima notificação só entra após o fim do clip ou do tempo de exibição do GIF.

### Tela de gatilhos — UX

- Diálogo de clip/GIF: foco automático na busca, lista limpa ao abrir, **Enter** aplica o primeiro resultado.
- Removidos toasts de sucesso ao salvar; erros continuam visíveis.

### Upgrade from v0.34.9

Use **Check for Updates** in the tray menu, or install this build manually. No database migrations.
