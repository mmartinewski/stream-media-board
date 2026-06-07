const path = require('node:path');
const { spawn } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { app, dialog, Menu, nativeImage, shell, Tray } = require('electron');
const {
  getYoutubeCookiesPath,
  openYoutubeLoginWindow,
} = require('./youtube-auth.cjs');

const APP_NAME = 'Stream Media Board';
const DEFAULT_PORT = 3847;
const APP_FOLDER_NAME = 'LocalSoundboardServer';

let tray = null;
let backend = null;
let isQuitting = false;
let youtubeCookiesSavedAt = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setName(APP_NAME);

if (process.defaultApp || /electron/i.test(process.argv[0] ?? '')) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('soundboard', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('soundboard');
}

app.on('second-instance', (_event, argv) => {
  const protocolUrl = findProtocolUrl(argv);
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl);
    return;
  }
  if (backend?.ready && backend.url) {
    void shell.openExternal(backend.url);
  }
});

if (process.platform === 'darwin') {
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });
}

app.whenReady().then(async () => {
  const protocolUrl = findProtocolUrl(process.argv);
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl);
  }

  tray = new Tray(createTrayImage());
  tray.setToolTip(`${APP_NAME} starting...`);
  setTrayMenu({ starting: true });

  try {
    backend = await startBackend();
    tray.setToolTip(APP_NAME);
    setTrayMenu({ starting: false });
  } catch (err) {
    setTrayMenu({ starting: false, failed: true });
    dialog.showErrorBox(APP_NAME, formatError(err));
  }
});

app.on('before-quit', (event) => {
  if (!backend || isQuitting) return;
  event.preventDefault();
  void quitApp();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

async function startBackend() {
  const runtimeRoot = app.isPackaged
    ? app.getAppPath()
    : path.resolve(__dirname, '..');
  const port = resolvePort(runtimeRoot);
  const url = `http://127.0.0.1:${port}`;
  // Packaged: run the backend with Electron's own binary acting as Node
  // (ELECTRON_RUN_AS_NODE=1), so we don't ship a separate node.exe. The env var
  // is inherited by descendant processes (e.g. yt-dlp's `--js-runtimes node:<exe>`),
  // so they also run the Electron binary as Node.
  const nodeBinary = app.isPackaged
    ? process.execPath
    : process.env.NODE_BINARY || 'node';
  const backendEntry = path.join(app.getAppPath(), 'backend', 'dist', 'index.js');

  const backendEnv = {
    ...process.env,
    PERSONAL_CLIP_PLAYER_ROOT: runtimeRoot,
    NODE_BINARY: nodeBinary,
    YTDLP_JS_RUNTIME: nodeBinary,
  };
  if (app.isPackaged) {
    backendEnv.ELECTRON_RUN_AS_NODE = '1';
  }

  // With asar enabled, app.getAppPath() points at `resources/app.asar` — a FILE,
  // not a directory — so it can't be the spawn cwd (spawn fails with ENOENT).
  // PERSONAL_CLIP_PLAYER_ROOT still points inside the asar (Electron resolves
  // frontend/bin paths there), but cwd must be a real directory on disk.
  const spawnCwd = app.isPackaged
    ? process.resourcesPath
    : runtimeRoot;

  const child = spawn(nodeBinary, [backendEntry], {
    cwd: spawnCwd,
    env: backendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[backend] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[backend] ${chunk}`);
  });

  const started = {
    url,
    ready: false,
    stop: () => stopBackendChild(child),
  };

  await waitForBackend(url, child);
  started.ready = true;
  child.on('exit', (code, signal) => {
    if (isQuitting) return;
    started.ready = false;
    console.error(`[desktop] backend exited unexpectedly (code=${code}, signal=${signal})`);
    if (tray) setTrayMenu({ starting: false, failed: true });
  });
  return started;
}

function setTrayMenu({ starting, failed = false }) {
  const openEnabled = Boolean(backend?.ready && backend.url) && !starting && !failed;
  const cookiesFile = getAppDataYoutubeCookiesPath();
  const hasYoutubeSession = existsSync(cookiesFile);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: starting ? 'Starting...' : failed ? 'Startup failed' : 'Open in Browser',
      enabled: openEnabled,
      click: () => {
        if (backend?.ready && backend.url) void shell.openExternal(backend.url);
      },
    },
    {
      label: hasYoutubeSession ? 'Refresh YouTube sign-in' : 'Sign in to YouTube',
      enabled: !starting && !failed,
      click: () => {
        openYoutubeSignIn();
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        void quitApp();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.removeAllListeners('click');
  tray.on('click', () => {
    if (backend?.ready && backend.url) void shell.openExternal(backend.url);
  });
}

function openYoutubeSignIn() {
  const cookiesFile = getAppDataYoutubeCookiesPath();
  openYoutubeLoginWindow({
    cookiesFile,
    onSaved: (result) => {
      youtubeCookiesSavedAt = new Date().toISOString();
      void dialog
        .showMessageBox({
          type: 'info',
          title: 'YouTube sign-in',
          message: 'YouTube session saved.',
          detail: `Exported ${result.cookieCount} cookie(s). You can load YouTube audio again in the app.`,
        })
        .catch((err) => {
          console.error('[desktop] failed to show YouTube save confirmation', err);
        });
      if (tray) setTrayMenu({ starting: false });
    },
  });
}

function handleProtocolUrl(url) {
  if (!url || !url.startsWith('soundboard://')) return;
  const action = url.replace('soundboard://', '').replace(/\/+$/, '');
  if (action === 'youtube-login' || action === 'youtube-login/') {
    openYoutubeSignIn();
  }
}

function findProtocolUrl(argv) {
  return argv.find((arg) => typeof arg === 'string' && arg.startsWith('soundboard://')) ?? null;
}

function getAppDataDir() {
  const appDataRoot = process.env.APPDATA;
  if (!appDataRoot) {
    throw new Error('APPDATA is not set. This app currently targets Windows only.');
  }
  return path.join(appDataRoot, APP_FOLDER_NAME);
}

function getAppDataYoutubeCookiesPath() {
  return getYoutubeCookiesPath(getAppDataDir());
}

async function quitApp() {
  if (isQuitting) return;
  isQuitting = true;

  try {
    await backend?.stop('tray exit');
  } catch (err) {
    console.error('[desktop] failed to stop backend', err);
  } finally {
    backend = null;
    tray?.destroy();
    tray = null;
    app.quit();
  }
}

function resolvePort(runtimeRoot) {
  const configFile = path.join(runtimeRoot, 'config', 'config.json');
  if (!existsSync(configFile)) return DEFAULT_PORT;
  try {
    const parsed = JSON.parse(readFileSync(configFile, 'utf8'));
    const port = Number(parsed.port);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
  } catch (err) {
    console.warn('[desktop] failed to read config file, using default port', err);
  }
  return DEFAULT_PORT;
}

async function waitForBackend(url, child) {
  const deadline = Date.now() + 15000;
  let exitError = null;

  child.once('exit', (code, signal) => {
    exitError = new Error(`Backend exited before startup (code=${code}, signal=${signal}).`);
  });

  while (Date.now() < deadline) {
    if (exitError) throw exitError;
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the backend is ready or the deadline is reached.
    }
    await delay(300);
  }

  throw new Error(`Backend did not become ready at ${url}.`);
}

function stopBackendChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTrayImage() {
  const iconPath = path.join(__dirname, 'assets', 'play.ico');
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? nativeImage.createEmpty() : image;
}

function formatError(err) {
  if (err instanceof Error) return `${err.message}\n\n${err.stack ?? ''}`;
  return String(err);
}
