import { createServer, type Server } from 'node:http';
import { createApp } from './app.js';
import { ensureAppDataDirs, resolvePaths, type AppPaths } from './config/paths.js';
import { resolvePort } from './config/port.js';
import { closeLogger, initLogger, logger } from './lib/logger.js';
import { migrate } from './db/migrate.js';
import { closeDb, getDb } from './db/connection.js';
import { cleanupExpiredStaging } from './services/stagingStore.js';
import { stopActivePlayback } from './services/audioPlayer.js';

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
  logger.info('starting Personal Clip Player', { appData: paths.appData });

  const port = resolvePort(paths.configFile);
  logger.info(`resolved port: ${port}`);

  const db = getDb(paths.databaseFile);
  migrate(db);
  logger.info('SQLite migrations applied');

  const removed = cleanupExpiredStaging(paths.mediaTemp);
  if (removed > 0) {
    logger.info(`initial cleanup: removed ${removed} staging file(s)`);
  }

  const app = createApp(paths);
  const server = await listen(createServer(app), port);

  logger.info(`Express listening at http://0.0.0.0:${port}`);

  let stopped = false;
  const stop = async (signal = 'shutdown') => {
    if (stopped) return;
    stopped = true;
    logger.info(`received ${signal}, shutting down...`);
    stopActivePlayback();
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
