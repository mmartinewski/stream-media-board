# Preparação do próximo release

Guia para validar o **Browser Source** (OBS Studio / Streamlabs Desktop) e publicar uma nova versão do Personal Clip Player.

## Browser Source (overlay de vídeo)

O overlay é uma página web minimalista, com fundo transparente, pensada para ser adicionada como **Browser Source** no OBS ou Streamlabs. O dashboard dispara a reprodução via Server-Sent Events (SSE); o vídeo aparece durante o clipe e some ao terminar (com fade in/out).

### Clipes de vídeo (YouTube)

No editor (**YouTube video**), é possível:

1. Informar a URL do YouTube e clicar em **Load video**.
2. Ajustar início/fim com os sliders da timeline (máx. 30 s).
3. Preencher título, categoria, tags e thumbnail (como nos clipes de áudio).
4. Salvar — o trecho é exportado em MP4 em `%APPDATA%/LocalSoundboardServer/media/video/`.

No dashboard, clipes marcados como **Video** disparam o overlay no OBS ao clicar no card (em vez de `ffplay` local). Áudio continua usando reprodução local.

### URLs

Cada fonte browser usa `?mode=universal`, `?mode=landscape` ou `?mode=portrait`. Vídeos quadrados (1:1) são tratados como **landscape**.

| Ambiente | Exemplo (universal) |
| --- | --- |
| Desenvolvimento (`npm run dev`) | `http://localhost:5173/overlay/browser?mode=universal` |
| Produção local (`npm start`) | `http://localhost:3847/overlay/browser?mode=universal` |
| LAN (celular / outro PC) | `http://<IP-do-PC-streaming>:3847/overlay/browser?mode=landscape` (etc.) |

Use a mesma origem do backend em produção (porta **3847**). No dev, o Vite (**5173**) faz proxy de `/api` para o backend.

No formulário de clipe (**Video clip**), o card lista as três URLs (universal / landscape / portrait) com **Copy**. O campo **Video orientation** define como o clipe é classificado; dimensões são gravadas no banco e clipes antigos são preenchidos via ffprobe na subida do servidor.

### Configuração no OBS / Streamlabs

Guia completo (OBS Studio e Streamlabs Desktop): **[browser-source-setup.md](./browser-source-setup.md)**.

Resumo:

1. Adicione uma fonte **Browser** (Browser Source).
2. Cole a URL do overlay com o `?mode=` desejado (tabela acima).
3. Defina largura e altura do canvas (ex.: 1920×1080).
4. Ative **Shutdown source when not visible** apenas se quiser economizar recursos; para testes, deixe desligado.
5. Marque **Refresh browser when scene becomes active** se o SSE desconectar após muito tempo ocioso.

A página usa fundo transparente. Se o OBS mostrar fundo preto, confira se a fonte não está com cor de fundo forçada nas propriedades da fonte.

No formulário de clipe (**Video clip**), um card mostra as três URLs do overlay e instruções resumidas.

### Teste rápido (overlay)

1. Suba o app (`npm run dev` ou `npm start`).
2. Abra o overlay no OBS (URL acima) e aguarde alguns segundos (status `connected` em dev, canto inferior).
3. Crie um clipe **YouTube video**, salve e clique no card no dashboard.
4. O vídeo deve tocar no browser source e **desaparecer** ao fim do clipe.

Se nada aparecer no OBS, recarregue a fonte browser e confira se o overlay está na mesma origem do backend.

### API (browser source)

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/browser-source/events?mode=universal\|landscape\|portrait` | SSE: eventos `play` filtrados por orientação do clipe |
| `GET` | `/api/browser-source/status` | Clientes conectados, modos e caminhos do overlay |

Clipes de vídeo disparam o overlay via `POST /api/clips/:id/play` (evento SSE com `mediaUrl`, `width`, `height`, `orientation`).

Exemplo de evento SSE:

```json
{
  "type": "play",
  "mediaUrl": "/api/clips/42/video",
  "width": 1920,
  "height": 1080,
  "orientation": "landscape"
}
```

## Checklist de release

### Pré-build

- [ ] `npm install`
- [ ] `npm run fetch:bin` (FFmpeg, ffplay, yt-dlp em `bin/`)
- [ ] Teste manual: dashboard, criar/editar clipe, play local (`ffplay`)
- [ ] Criar clipe **YouTube video**, salvar, clicar no dashboard e validar overlay no OBS/Streamlabs
- [ ] Revisar `docs/upcoming-improvements.md` e fechar itens incluídos nesta versão
- [ ] Atualizar versão em `package.json` (e tags Git, se aplicável)

### Build e instalador Windows

```bash
npm run installer:win
```

Artefato esperado em `release/`, por exemplo:

```text
release/Personal Soundboard Player Setup 0.1.0.exe
```

Smoke test rápido sem instalador:

```bash
npm run pack:win
```

### Pós-build

- [ ] Instalar o `.exe` em máquina limpa ou VM
- [ ] Tray: **Open in Browser** abre o dashboard
- [ ] Browser source em `http://localhost:3847/overlay/browser` (ajustar porta se customizada)
### Publicar no GitHub

Com `gh` autenticado (`gh auth login`):

```bash
npm run publish:win
```

Gera o instalador em `release/` e cria ou atualiza o GitHub Release (tag `v` + versão do `package.json`).

### Empacotamento do vídeo de teste

O instalador **não** inclui `media-files/` por padrão. Para testar o browser source na máquina instalada, copie `15.0-23.0.mp4` para a pasta `media-files` ao lado do executável/recursos do app, ou use apenas em desenvolvimento no clone do repositório.

## Referências

- [README.md](../README.md) — setup, dev, instalador
- [technical-specification.md](./technical-specification.md) — comportamento v1 da API e mídia
- [upcoming-improvements.md](./upcoming-improvements.md) — roadmap
