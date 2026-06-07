# Otimização de Empacotamento — Guia de Implementação

> Documento de execução **passo a passo**, autocontido, pensado para ser executado por um
> agente/modelo mais barato. Cada passo é independente, traz os arquivos exatos, o que mudar,
> como verificar, o trade-off e como reverter. **Faça um passo por vez** e valide antes de seguir.

---

## 0. Contexto (leia antes de tudo)

**Projeto:** Stream Media Board — app Windows com casca nativa Go (bandeja) que sobe um backend
Express local (sob `node.exe` embutido) e abre o dashboard no navegador do usuário. Reprodução de
clips acontece no _browser source_ (OBS etc.).

**Objetivo deste guia:** reduzir o **espaço em disco** do app empacotado e o **consumo de recursos**
em runtime, com o menor risco possível, antes de implementar o auto-updater.

### Arquitetura atual (resumo — pós Passo 5)

- `shell/` — casca nativa **Go** (`StreamMediaBoard.exe`): bandeja (`systray`), spawn do backend,
  health poll, login YouTube via **WebView2** + export de cookies (Netscape), protocolo
  `soundboard://`, single-instance (mutex + canal loopback).
- `backend/` — Express + `better-sqlite3` + `sharp`. Compilado para `backend/dist/`.
- `frontend/` — React/Vite. Compilado para `frontend/dist/`.
- `bin/` — executáveis: `ffmpeg.exe`, `ffprobe.exe`, `yt-dlp.exe` + DLLs compartilhadas. Baixados
  por `scripts/fetch-binaries.mjs` (`npm run fetch:bin`). **Não versionados** (`.gitignore`).
- `runtime/node.exe` — Node 22 win-x64 embutido (`scripts/fetch-node-runtime.mjs`). ABI 127 = dev;
  **sem orquestração de ABI** (Electron removido).
- Empacotamento: **Inno Setup** (`installer/soundboard.iss`, `npm run installer:inno`). Layout em
  `dist-shell/` montado por `scripts/stage-windows-dist.mjs`. Assinatura opt-in via `SIGN_CERT_*`
  (`scripts/sign.mjs`, `npm run dist:signed`).

> **Histórico (Passos 1–4):** Electron + `electron-builder` + `asar` + ABI juggling — removidos na
> branch `step5-lightweight-tray` após validação funcional.

### Pegada atual medida (app instalado ≈ 1,1 GB)

| Componente | Tamanho |
|---|---|
| `bin/ffplay.exe` | 206 MB |
| `bin/ffmpeg.exe` | 204 MB |
| `bin/ffprobe.exe` | 204 MB |
| `bin/yt-dlp.exe` | 18 MB |
| Runtime Electron | ~366 MB |
| `desktop-runtime/node.exe` | 86 MB |
| `node_modules` nativos (better-sqlite3, sharp/@img) | ~45 MB |
| Instalador `.exe` final | ~318 MB |

**Conclusão:** os três binários do FFmpeg são ~54% do app. Esse é o alvo nº 1.

### Regras para quem for executar este guia

1. **Um passo por vez.** Não combine passos. Cada passo tem critério de aceite próprio.
2. **Não altere comportamento funcional** salvo quando o passo disser explicitamente (só o Passo 3 muda comportamento).
3. **Sempre rode a verificação** ao final de cada passo antes de prosseguir.
4. Comandos de terminal são **PowerShell no Windows**.
5. Para medir tamanho de pasta de forma rápida no Windows, use:
   ```powershell
   cmd /c 'dir /s /-c /a CAMINHO' | Select-String 'File\(s\)' | Select-Object -Last 1
   ```
6. Não commite a pasta `bin/`, `release/`, `desktop-runtime/` nem `node_modules/` (já ignorados).
7. Se um passo falhar na verificação, **reverta** (seção "Rollback" do passo) e pare.

### Ordem recomendada (por custo-benefício)

> **Atenção à dependência:** o Passo 2 (`asar`) **só é seguro depois do Passo 4**. Hoje o backend
> roda num `node.exe` separado, e Node puro **não consegue ler arquivos de dentro de um `.asar`**
> (só o Electron tem fs/`child_process` cientes de asar). Enquanto o backend não rodar dentro do
> Electron, ligar o asar quebra a inicialização do backend, o serviço estático do frontend e o
> spawn dos binários. Por isso a ordem de execução recomendada é **1 → 3 → 4 → 2 → 5**.

| Ordem | Passo | Mudança | Ganho aprox. | Esforço | Risco | Depende de |
|---|---|---|---|---|---|---|
| 1º | 1 | FFmpeg "shared build" | **−360 MB** (medido) | Baixo | Baixo | — |
| 2º | 3 | Preview no browser → remover `ffplay` | −18 MB (c/ shared) | Médio | Médio (muda comportamento) | — |
| 3º | 4 | Backend no Electron, remover `node.exe` | −86 MB, −1 processo | Médio | Médio (ABI nativo) | — |
| 4º | 2 | Ligar `asar` | Startup/limpeza | Baixo | Baixo | **Passo 4** |
| 5º | 5 | Substituir Electron por bandeja leve | ~−366 MB + RAM | Alto | Alto (login YouTube) | — |

---

## Passo 1 — FFmpeg "shared build" (maior ganho, baixo risco)

### Objetivo
Trocar o build **estático** `win64-gpl` (cada `.exe` carrega ~200 MB de codecs) pelo build
**shared** `win64-gpl-shared`, onde os codecs ficam em DLLs compartilhadas pelos três executáveis.

> **Resultado medido (já aplicado neste repo):** a parte do FFmpeg em `bin/` caiu de ~614 MB para
> **~255 MB** (`bin/` total, incluindo `yt-dlp.exe`, ficou em **273 MB**). Os executáveis ficaram
> minúsculos (`ffmpeg.exe` 0,5 MB, `ffprobe.exe` 0,2 MB, `ffplay.exe` 17,8 MB) e o peso migrou para
> as DLLs (`avcodec-62.dll` ~98 MB e `avfilter-11.dll` ~96 MB são as maiores). Economia ≈ **−360 MB**.

### Arquivos envolvidos
- `scripts/fetch-binaries.mjs` — baixa e extrai o FFmpeg.
- `package.json` — chave `build.files` (precisa incluir as DLLs do `bin/`).
- `bin/README.md` — atualizar instruções manuais.

### Contexto técnico
- ZIP estático atual (URL usada hoje):
  `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`
- ZIP shared a usar:
  `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip`
- Estrutura do ZIP shared: `ffmpeg-master-latest-win64-gpl-shared/bin/` contém
  `ffmpeg.exe`, `ffplay.exe`, `ffprobe.exe` **e** as DLLs (`avcodec-*.dll`, `avformat-*.dll`,
  `avutil-*.dll`, `swscale-*.dll`, `swresample-*.dll`, `avfilter-*.dll`, `avdevice-*.dll`,
  `postproc-*.dll`). **As DLLs precisam ficar na mesma pasta dos `.exe`** (ou seja, em `bin/`),
  senão os executáveis não abrem.

### Mudanças

1. Em `scripts/fetch-binaries.mjs`, trocar a URL padrão do FFmpeg para o ZIP shared:
   ```js
   const FFMPEG_ZIP_URLS = [
     process.env.FFMPEG_ZIP_URL?.trim() ||
       'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip',
   ];
   ```

2. Ainda em `fetch-binaries.mjs`, na função `fetchFFmpeg()`, **além de copiar os 3 `.exe`**,
   copiar também todas as DLLs encontradas na mesma pasta (`binDir`) para `BIN`. Hoje o loop só
   copia `['ffmpeg.exe','ffprobe.exe','ffplay.exe']`. Adicionar, logo após esse loop:
   ```js
   // Shared build: copiar as DLLs (avcodec, avformat, etc.) que os .exe precisam.
   for (const entry of readdirSync(binDir)) {
     if (entry.toLowerCase().endsWith('.dll')) {
       const src = join(binDir, entry);
       const dst = join(BIN, entry);
       rmSync(dst, { force: true });
       renameSync(src, dst);
       console.log(`[fetch-binaries] OK ${dst}`);
     }
   }
   ```
   (`readdirSync` já está importado no topo do arquivo.)

3. Em `package.json`, na chave `build.files`, trocar `"bin/*.exe"` por dois padrões para incluir
   as DLLs:
   ```json
   "bin/*.exe",
   "bin/*.dll",
   ```

4. Atualizar `bin/README.md`: na seção de download manual, instruir a baixar o ZIP
   **win64 gpl-shared** e copiar `ffmpeg.exe`, `ffprobe.exe`, `ffplay.exe` **e todas as `.dll`** da
   pasta `bin/` do ZIP para a pasta `bin/` do projeto.

### Verificação
```powershell
# 1. Limpar bin e baixar de novo
Remove-Item bin\*.exe, bin\*.dll -ErrorAction SilentlyContinue
npm run fetch:bin

# 2. Conferir que os 3 exe + DLLs existem e que o tamanho total caiu (~120-150 MB)
cmd /c 'dir /s /-c /a bin' | Select-String 'File\(s\)' | Select-Object -Last 1

# 3. Testar que os executáveis abrem (precisam achar as DLLs ao lado)
.\bin\ffmpeg.exe -version
.\bin\ffprobe.exe -version
.\bin\ffplay.exe -version   # deve imprimir versão e sair (ou abrir/fechar rápido)
```

### Critério de aceite
- `bin/` total **≤ 300 MB** (era ~632 MB; medido: 273 MB incluindo `yt-dlp.exe`).
- `ffmpeg -version`, `ffprobe -version` e `ffplay -version` rodam sem erro de DLL ausente.
- O app empacotado (`npm run dist:win`) inicia e consegue processar/prever um clip de áudio.

### Trade-offs
- Mais arquivos soltos em `bin/` (as DLLs). Funcionalidade idêntica.
- Se faltar copiar alguma DLL, os `.exe` falham ao iniciar — por isso o passo 2 da verificação.

### Rollback
- Reverter a URL para `...win64-gpl.zip`, remover o loop de DLLs e o `"bin/*.dll"` do `files`.
- `Remove-Item bin\*.dll` e rodar `npm run fetch:bin` de novo.

---

## Passo 2 — Ligar `asar` no empacotamento

> **STATUS: aplicado e empacotado neste repo.** `asar: true` com `asarUnpack` para `bin/**` e
> `**/*.node`. Verificado na build: `app.asar` criado (~32 MB); `app.asar.unpacked/bin/` com
> `ffmpeg.exe`/`ffprobe.exe`/`yt-dlp.exe` + 7 DLLs do FFmpeg; módulos nativos desempacotados inteiros
> (`better-sqlite3` com `better_sqlite3.node` ABI 145; `@img/sharp-win32-x64` com `sharp-win32-x64.node`
> + `libvips-42.dll`/`libvips-cpp.dll`). `backend/dist` e `frontend/dist` ficam **dentro** do asar e são
> lidos pelo Electron (asar-aware mesmo sob `ELECTRON_RUN_AS_NODE`). Falta a validação funcional do
> usuário (instalar e rodar).

> ⚠️ **PRÉ-REQUISITO: só execute este passo DEPOIS do Passo 4.**
> Hoje o backend roda num `node.exe` separado (lançado por `desktop/main.cjs`). **Node puro não lê
> arquivos de dentro de um `.asar`** — apenas o Electron tem fs e `child_process` cientes de asar.
> Enquanto o backend não rodar dentro do Electron (Passo 4), ligar o asar causa, em cadeia:
> 1. o backend **não inicia** (`node.exe …/app.asar/backend/dist/index.js` não é legível);
> 2. o frontend estático (`express.static(paths.frontendDist)` → `…/app.asar/frontend/dist`) fica ilegível;
> 3. o `spawn` de `ffmpeg`/`ffplay` falha (não se executa `.exe` de dentro de um asar).
>
> Desempacotar `bin/**` e `node/**` **não basta**: `backend/**` e `frontend/dist/**` também são lidos
> pelo node externo. Só faça este passo quando o Passo 4 estiver concluído (backend dentro do Electron),
> e então ajuste, se necessário, os caminhos `app.asar` → `app.asar.unpacked`.

### Objetivo
Empacotar o código do app num arquivo `app.asar` (menos arquivos soltos, leitura/startup melhores,
varredura de antivírus mais rápida). Manter binários e Node **fora** do asar.

### Arquivos envolvidos
- `package.json` (chave `build`).

### Mudanças (aplicadas)
1. Em `package.json`, `"asar": false` → `"asar": true`.
2. `asarUnpack` para o que **não pode** ficar dentro do asar:
   ```json
   "asar": true,
   "asarUnpack": [
     "bin/**",
     "**/*.node"
   ],
   ```
   - `bin/**`: os `.exe`/`.dll` são **`spawn`ados** — não se executa binário de dentro de um asar.
     O Electron redireciona `app.asar/bin/...` → `app.asar.unpacked/bin/...` automaticamente (o
     `child_process` é asar-aware, inclusive sob `ELECTRON_RUN_AS_NODE`).
   - `**/*.node`: os módulos nativos (`better-sqlite3`, `sharp`) precisam ser carregados do disco.
     O `electron-builder` desempacota o **diretório inteiro** do módulo nativo (incluindo as DLLs do
     `libvips` do `sharp`), não só o `.node`.
   - `node/**` (do plano original) **não existe mais** — o `node.exe` foi removido no Passo 4.
3. `desktop/main.cjs`: **correção obrigatória do `cwd`**. Com o asar ligado, `app.getAppPath()` aponta
   para `resources/app.asar` (um **arquivo**, não pasta). Usar isso como `cwd` do `spawn` do backend
   faz o `spawn` falhar com `ENOENT` (a mensagem cita o `.exe`, mas o que não existe é o `cwd`).
   Solução: `PERSONAL_CLIP_PLAYER_ROOT` continua apontando para o asar (Electron resolve
   `frontend`/`bin` lá dentro), mas o `cwd` passa a ser `process.resourcesPath` (diretório real).

### Validação automatizada (sem reinstalar)
Simulando o `spawn` exato do `main.cjs` contra `release/win-unpacked` (Electron-as-node + env do
backend), confirmou-se: `SQLite migrations applied` (better-sqlite3 ABI 145 do `app.asar.unpacked`),
`serving static frontend from ...app.asar\frontend\dist` (lido de dentro do asar), `Express listening`
e `GET /api/health` + `GET /` → `200`.

### Contexto importante (não pular)
- O backend resolve caminhos de binários via `backend/src/config/paths.ts` usando
  `process.resourcesPath` (fora do asar), então `bin/` precisa continuar acessível como arquivo
  real no disco — é o que `asarUnpack` (e os `extraResources`) garantem.
- O `node.exe` é empacotado via `extraResources` em `node/node.exe` e é lido por
  `desktop/main.cjs` via `process.resourcesPath` — isso **não** é afetado pelo asar, mas o
  `asarUnpack` acima é uma salvaguarda.

### Verificação
```powershell
npm run dist:win
# App deve instalar e iniciar normalmente; backend sobe; clip toca no browser source.
# Conferir que existe release\win-unpacked\resources\app.asar
Test-Path "release\win-unpacked\resources\app.asar"
```

### Critério de aceite
- O app empacotado **inicia, sobe o backend e reproduz um clip** sem erros.
- O sign-in do YouTube ainda abre (depende de `desktop/youtube-auth.cjs`).

### Trade-offs
- Ganho de tamanho é marginal; o benefício real é startup e contagem de arquivos.
- Se algo no backend ler caminho próprio via `fs` cru de dentro do app, pode quebrar — mas os
  caminhos de dados ficam em `%APPDATA%` e os binários fora do asar, então o risco é baixo.

### Rollback
- Voltar `"asar": false` e remover `asarUnpack`.

---

## Passo 3 — Mover o preview de áudio para o navegador e remover o `ffplay`

> **STATUS: já aplicado neste repo.** Ao executar, descobriu-se que o preview de áudio/vídeo **já
> rodava no navegador** (`startAudioSegmentPreview`/`handleClientPreview` em `ClipFormPage.tsx` →
> `<audio>`/`<video>` apontando para `GET /api/staging/:id/preview`, que corta com `ffmpeg` e faz
> streaming). A rota server-side com `ffplay` (`POST /api/clips/test-play` + `testPlayStaging` no
> `api.ts`) estava **morta** (nenhum call site no frontend). Portanto **não houve mudança de
> comportamento**: o Passo 3 virou apenas remoção do código morto e do binário `ffplay`.

### Objetivo
Eliminar a dependência do `ffplay.exe` (no build shared eram ~18 MB) e o código server-side de
playback que não era mais usado. **Não** há trabalho de frontend: o preview no navegador já existe.

### Onde o `ffplay` é usado hoje
- `backend/src/services/audioPlayer.ts` — função `playAudio` dá `spawn` no `ffplay`.
- `backend/src/routes/play.ts` — endpoint de preview (`/:id/preview`, por volta da linha 106-132):
  corta o trecho com `ffmpeg` (`cutToMp3`) gerando um `.mp3` temporário em `paths.mediaTemp`,
  e então chama `playAudio({ ffplayExe: paths.ffplayExe, ... })`.
- `backend/src/lib/binaries.ts` — `assertBinaries` exige `ffplay.exe` na lista.
- `backend/src/config/paths.ts` — define `ffplayExe`.

### Estratégia (o que foi feito neste repo)
O preview no navegador já existia (`GET /api/staging/:id/preview` em `backend/src/routes/staging.ts`
corta com `ffmpeg` via `cutToMp3`/`cutToMp4`, faz streaming e limpa o arquivo em `res.on('finish'|'close')`;
o frontend toca em `<audio>`/`<video>`). Então o trabalho foi **só remover o caminho morto do `ffplay`**:

1. `backend/src/routes/play.ts`: removida a rota `POST /test-play` (única que usava `ffplay`) e as
   chamadas a `stopActivePlayback()` (não havia mais playback server-side para parar).
2. `backend/src/services/audioPlayer.ts`: **arquivo removido** (todo o conteúdo era `ffplay`:
   `playAudio`/`stopActivePlayback`/`isPlaying`, todos sem uso após o item 1).
3. `backend/src/server.ts`: removido o import e a chamada de `stopActivePlayback()` no shutdown.
4. `backend/src/lib/binaries.ts`: removida a checagem de `ffplay.exe` em `assertBinaries`.
5. `backend/src/config/paths.ts`: removido `ffplayExe` da interface `AppPaths` e do objeto.
6. `frontend/src/lib/api.ts`: removido `testPlayStaging` (código morto, sem call site).
7. `scripts/fetch-binaries.mjs`: deixou de copiar `ffplay.exe` e remove um resíduo antigo; as DLLs
   do shared build continuam necessárias para `ffmpeg`/`ffprobe`.
8. `bin/README.md`, `README.md`, `backend/README.md`, `scripts/publish-release.mjs`: textos atualizados.

### Verificação
```powershell
npm run build
npm run dist:win
# No app: abrir o editor de um clip de áudio, ajustar o trecho e clicar em "preview".
# O áudio deve tocar NO NAVEGADOR (no dispositivo que abriu o dashboard), não no servidor.
# Garantir que não há mais ffplay.exe sendo exigido (assertBinaries não deve reclamar).
```

### Critério de aceite
- Preview de áudio funciona pelo navegador.
- App empacota e roda **sem** `ffplay.exe`.
- Nenhum código referencia `ffplayExe`/`playAudio` de forma quebrada (typecheck do backend passa:
  `npm --workspace backend run typecheck`).

### Trade-offs
- **Mudança de comportamento:** preview deixa de sair no PC servidor.
- Precisa de limpeza dos `.mp3` temporários sem depender do `exit` do ffplay.
- Pequena mudança de UX no frontend.

### Rollback
- Reverter os arquivos do backend/frontend e voltar a copiar `ffplay.exe` no `fetch-binaries.mjs`.

---

## Passo 4 — Rodar o backend dentro do Electron e remover o `node.exe` separado

> **STATUS: aplicado e empacotado neste repo.** Falta apenas a validação funcional abrindo o app
> empacotado (ver "Verificação obrigatória pelo usuário").

### Objetivo
Eliminar `desktop-runtime/node.exe` (86 MB) e o runtime duplicado, rodando o backend a partir do
próprio Electron.

### Decisão de ABI (resultado do spike)
O backend usa dois módulos nativos:
- `sharp` 0.33.5 → **N-API** (`"napi_versions":[9]`): ABI estável, roda sob Electron sem rebuild.
- `better-sqlite3` 12.10.0 → **ABI-específico** (`prebuild-install`/`node-gyp`): precisa de build
  para o ABI do Electron.

O `better-sqlite3` **não** publica prebuild para o Electron 42 (ABI 146), e esta máquina **não tem
compilador C++** (MSVC ausente). Por isso o Electron foi **pinado na 41.x** (ABI **145**), que **tem**
prebuild oficial (`better-sqlite3-v12.10.0-electron-v145-win32-x64`). Assim o rebuild no empacotamento
é só um **download** — sem compilador.

### Abordagem usada: `ELECTRON_RUN_AS_NODE`
Em `desktop/main.cjs`, quando `app.isPackaged`, o backend é lançado com `spawn(process.execPath, …)`
e `ELECTRON_RUN_AS_NODE=1` — o próprio binário do Electron age como Node. **A env var é herdada pelos
processos-filhos**, então o yt-dlp (`--js-runtimes node:<exe>`) também roda o binário do Electron como
Node, sem precisar de `node.exe`. Em dev (`app.isPackaged === false`) nada muda: continua usando o
`node` puro do sistema.

### Mudanças aplicadas
1. `package.json`:
   - `devDependencies.electron`: `^42.1.0` → **`^41.0.0`** (instalou 41.7.1, ABI 145).
   - `build.npmRebuild`: **`false`** (ver causa raiz abaixo — o rebuild automático do electron-builder
     **não é confiável** neste monorepo; a troca de ABI é feita explicitamente por script).
   - Removida a entrada `extraResources` `desktop-runtime/node.exe` → `node/node.exe`.
   - Scripts `pack:win`/`dist:win` chamam `scripts/package-win.mjs` (orquestrador de ABI + build).
2. `desktop/main.cjs`: `nodeBinary = app.isPackaged ? process.execPath : (NODE_BINARY||'node')` e
   `ELECTRON_RUN_AS_NODE=1` no env do backend quando empacotado.
3. `backend/src/config/paths.ts`: `resolveYtDlpNodeExe()` simplificado — usa `YTDLP_JS_RUNTIME`/
   `NODE_BINARY` (setados pelo main) e cai para `process.execPath`.
4. `scripts/prepare-desktop-runtime.mjs`: **removido**.
5. `scripts/switch-better-sqlite3-abi.mjs` + `scripts/package-win.mjs`: **novos** (ver abaixo).

### ❌ Causa raiz do crash "Backend exited before startup (code=1)"
Com `npmRebuild: true`, o `@electron/rebuild` embutido no `electron-builder` **reportava `finished
better-sqlite3` mas não trocava o binário** no `node_modules` **hoisted** do monorepo (npm workspaces).
Resultado: o instalador era empacotado com o `better_sqlite3.node` do **Node (ABI 127)**, que crasha
sob o runtime do Electron (ABI 145):
`NODE_MODULE_VERSION 127 ... requires NODE_MODULE_VERSION 145`.

Confirmado por hash: o `better_sqlite3.node` empacotado era **byte-idêntico** ao binário ABI 127 do
`node_modules` local — ou seja, o rebuild para o ABI do Electron nunca aconteceu.

### ✅ Solução determinística (troca explícita de ABI)
`npmRebuild` desligado. Em vez de confiar no rebuild automático, baixamos o **prebuild oficial** do
`better-sqlite3` para o runtime exato via `prebuild-install` (sem compilador C++):

- `scripts/switch-better-sqlite3-abi.mjs <electron|node>`: roda
  `prebuild-install --runtime <electron|node> --target <versão> --arch x64` dentro de
  `node_modules/better-sqlite3`.
- `scripts/package-win.mjs <dir|nsis>`: (1) troca para o ABI do **Electron**, (2) roda
  `electron-builder` (que só copia o `node_modules` já preparado), (3) **sempre** (via `finally`)
  troca de volta para o ABI do **Node**, mesmo se o build falhar — assim `npm run dev` nunca quebra.

Scripts úteis: `npm run abi:electron`, `npm run abi:node`, `npm run rebuild:dev` (restaura ABI do Node).

### Verificação automatizada (já feita)
- `npm install` → Electron 41.7.1, ABI 145; Node local ABI 127.
- `tsc --noEmit` backend → OK. `npm run build` → OK.
- `npm run abi:electron` → prebuild Electron 145 baixado; carrega/roda sob `electron.exe`
  (`ELECTRON_RUN_AS_NODE=1`) → `OK ... under 145`.
- `npm run abi:node` → restaura ABI 127; `require('better-sqlite3')` sob node puro → `OK ... under 127`.
- `npm run dist:win` → OK, **sem** `@electron/rebuild` (npmRebuild desligado); ABI trocado electron→node.
- `release/win-unpacked/.../better_sqlite3.node` → hash do **build Electron 145** (confirmado).
- `node_modules/.../better_sqlite3.node` → restaurado ao **build Node 127** (dev intacto).
- `release/win-unpacked/resources/node/node.exe` → **não existe**.

### Resultado medido
| | Antes (Passos 1+3) | Depois (Passo 4) |
|---|---|---|
| `win-unpacked` | ~775 MB | **~648 MB** |
| Instalador | (não medido) | **~201 MB** |

(Em relação ao original: instalado ~1.148 MB → ~648 MB; instalador ~318 MB → ~201 MB.)

### Verificação obrigatória pelo usuário (não dá para automatizar aqui)
Instalar o `release/Stream Media Board Setup 0.16.0.exe` num ambiente de teste (com **backup** dos
dados) e confirmar:
- [ ] App inicia e o tray sobe; "Open in Browser" abre o dashboard.
- [ ] Banco abre e os clipes aparecem (`better-sqlite3` sob Electron 145).
- [ ] Toca clip de áudio e de vídeo no browser source.
- [ ] Gera thumbnail (`sharp`).
- [ ] **Processa um link do YouTube** (caminho `yt-dlp` + `--js-runtimes node:<electron>` herdando `ELECTRON_RUN_AS_NODE`). **Este é o ponto de maior risco do Passo 4** — testar com atenção.
- [ ] Login do YouTube continua funcionando.

### Trade-offs
- Electron fica **um major atrás** (41.x). Só suba o Electron quando houver prebuild do
  `better-sqlite3` para o ABI correspondente (ou instale o VS Build Tools C++ e use `buildFromSource`).
- Empacotar exige rede (download do prebuild + Electron). Sem compilador, **só** funciona com ABI
  que tenha prebuild.

### Rollback
- `package.json`: voltar `electron` para `^42.1.0`, readicionar `extraResources`
  `desktop-runtime/node.exe`→`node/node.exe` e o `prepare:desktop-runtime` nos scripts; restaurar
  `pack:win`/`dist:win` para chamar `electron-builder` diretamente.
- `desktop/main.cjs`: voltar `nodeBinary` para `path.join(process.resourcesPath,'node','node.exe')`
  (packaged) e remover `ELECTRON_RUN_AS_NODE`.
- Recriar `scripts/prepare-desktop-runtime.mjs` (ver histórico do git) e `npm install`.
- Remover `scripts/switch-better-sqlite3-abi.mjs` e `scripts/package-win.mjs`.

---

## Passo 5 — Substituir o Electron por uma bandeja nativa leve

> **STATUS: aplicado e validado** na branch `step5-lightweight-tray`. Electron, `electron-builder`,
> scripts de ABI/asar e `desktop/*.cjs` **removidos**.

### O que foi feito
- **Casca Go** (`shell/`): `fyne.io/systray` + `wailsapp/go-webview2` (login YouTube com
  `ICoreWebView2CookieManager` → `youtube.cookies.txt` Netscape).
- **Backend** sob `runtime/node.exe` v22 (ABI 127); `PERSONAL_CLIP_PLAYER_ROOT` aponta para
  `<install>/app`.
- **Instalador Inno Setup** per-user; protocolo `soundboard://` no registro (HKCU) + no `.iss`.
- **Assinatura opt-in** (`scripts/sign.mjs`, cert autoassinado em `scripts/make-selfsigned-cert.ps1`).
- Scripts de build: `npm run installer:inno`, `npm run dist:signed`, `npm run installer:win`.

### Pegada medida (pós Passo 5)
| Componente | Tamanho aprox. |
|---|---|
| Casca Go (`StreamMediaBoard.exe`) | ~7 MB |
| `runtime/node.exe` | ~80 MB |
| `bin/` (FFmpeg shared + yt-dlp) | ~273 MB |
| `app/` (backend + frontend + node_modules produção) | ~120 MB |
| **Instalador comprimido** | **~137 MB** |

Economia vs Electron (~648 MB instalado): **~170 MB de disco** + ganho grande de RAM em idle.

### Critério de aceite
- [x] Bandeja sobe o backend, abre o dashboard, login YouTube, encerra limpo.
- [x] Clipes, thumbnails (sharp), prefetch YouTube (yt-dlp) validados em ambiente de teste.
- [x] `npm run dist:signed` / `installer:inno` gera instalador funcional.

### Rollback
- Tag/branch `main` com release v0.17.0 (Electron) permanece como referência até merge.

---

## Verificação final (após os passos aplicados)

```powershell
# Tamanho do layout empacotado (pré-Inno)
cmd /c 'dir /s /-c /a dist-shell' | Select-String 'File\(s\)' | Select-Object -Last 1

# Tamanho do instalador gerado
Get-ChildItem installer\Output\StreamMediaBoard-Setup-*.exe |
  Sort-Object LastWriteTime | Select-Object -Last 1 |
  Select-Object Name, @{N='MB';E={[math]::Round($_.Length/1MB,1)}}

# Self-test do layout empacotado (sem UI)
$env:SHELL_SELFTEST = '1'
.\dist-shell\StreamMediaBoard.exe
```

### Metas (referência; ordem de execução 1 → 3 → 4 → 2 → 5)
| Cenário | Instalado | Instalador |
|---|---|---|
| Original (Electron) | ~1.148 MB | ~318 MB |
| Após Passos 1+3+4+2 (Electron) | ~648 MB | ~201 MB |
| **Após Passo 5 (Go + Inno, medido)** | **~480 MB** | **~137 MB** |

## Checklist de aceite geral
- [x] App empacota (`npm run installer:inno` ou `dist:signed`) sem erros.
- [x] App instala e o backend sobe (tray "Open in Browser" abre o dashboard).
- [x] Reproduz clipes; thumbnails (sharp) e YouTube (yt-dlp) validados.
- [x] Login do YouTube via WebView2 funciona.
- [ ] `npm --workspace backend run typecheck` passa (rodar antes de merge).
- [x] Tamanho instalado ~480 MB (meta ~290 MB era estimativa otimista; `bin/` FFmpeg domina).

## Higiene local (não relacionado ao pacote)
Pastas `release/` (legado Electron), `dist-shell/`, `installer/Output/` e `runtime/` acumulam
artefatos de build. Podem ser limpas entre builds; não são versionadas.
