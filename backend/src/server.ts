import { createServer, type Server } from 'node:http';
import { createApp } from './app.js';
import { ensureAppDataDirs, resolvePaths, type AppPaths } from './config/paths.js';
import { resolvePort } from './config/port.js';
import { closeLogger, initLogger, logger } from './lib/logger.js';
import { migrate } from './db/migrate.js';
import { closeDb, getDb } from './db/connection.js';
import { cleanupExpiredStaging } from './services/stagingStore.js';
import { backfillVideoClipMetadata } from './services/videoClipMetadata.js';

export interface BackendServer {
  readonly paths: AppPaths;
  readonly port: number;
  readonly url: string;
  stop: (signal?: string) => Promise<void>;
}

export async function startBackendServer(): Promise<BackendServer> {
  const paths = resolvePaths();
  ensureAppDataDirs(paths);

  initLogger(paths.logFile);
  logger.info('starting Stream Media Board', {
    appData: paths.appData,
    ytDlpNode: paths.ytDlpNodeExe ?? '(not found)',
  });

  const port = resolvePort(paths.configFile);
  logger.info(`resolved port: ${port}`);

  const db = getDb(paths.databaseFile);
  migrate(db);
  logger.info('SQLite migrations applied');

  const backfilled = await backfillVideoClipMetadata(db, paths);
  if (backfilled > 0) {
    logger.info(`video metadata backfill: updated ${backfilled} clip(s)`);
  }

  const removed = cleanupExpiredStaging(paths.mediaTemp);
  if (removed > 0) {
    logger.info(`initial cleanup: removed ${removed} staging file(s)`);
  }

  const app = createApp(paths);
  logger.info(`binding HTTP server on 0.0.0.0:${port}...`);
  let server: Server;
  try {
    server = await listen(createServer(app), port);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as NodeJS.ErrnoException).code) : '';
    if (code === 'EADDRINUSE') {
      logger.error(`port ${port} is already in use — close the other app or change port in config.json`, err);
    } else {
      logger.error(`failed to bind HTTP server on port ${port}`, err);
    }
    throw err;
  }

  logger.info(`Express listening at http://0.0.0.0:${port}`);

  let stopped = false;
  const stop = async (signal = 'shutdown') => {
    if (stopped) return;
    stopped = true;
    logger.info(`received ${signal}, shutting down...`);
    await closeServer(server);
    closeDb();
    closeLogger();
  };

  return {
    paths,
    port,
    url: `http://localhost:${port}`,
    stop,
  };
}

function listen(server: Server, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
