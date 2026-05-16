const path = require('node:path');
const { spawn } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { app, dialog, Menu, nativeImage, shell, Tray } = require('electron');

const APP_NAME = 'Personal Soundboard Player';
const DEFAULT_PORT = 3847;

let tray = null;
let backend = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setName(APP_NAME);

app.on('second-instance', () => {
  if (backend?.ready && backend.url) {
    void shell.openExternal(backend.url);
  }
});

app.whenReady().then(async () => {
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
  const nodeBinary = app.isPackaged
    ? path.join(process.resourcesPath, 'node', 'node.exe')
    : process.env.NODE_BINARY || 'node';
  const backendEntry = path.join(app.getAppPath(), 'backend', 'dist', 'index.js');

  const child = spawn(nodeBinary, [backendEntry], {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      PERSONAL_CLIP_PLAYER_ROOT: runtimeRoot,
    },
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
  const contextMenu = Menu.buildFromTemplate([
    {
      label: starting ? 'Starting...' : failed ? 'Startup failed' : 'Open in Browser',
      enabled: openEnabled,
      click: () => {
        if (backend?.ready && backend.url) void shell.openExternal(backend.url);
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
