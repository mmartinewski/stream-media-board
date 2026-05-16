import { closeLogger, logger } from './lib/logger.js';
import { startBackendServer } from './server.js';

async function main(): Promise<void> {
  const backend = await startBackendServer();

  const shutdown = (signal: string) => {
    backend.stop(signal).finally(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('startup failed', err);
  closeLogger();
  process.exit(1);
});
