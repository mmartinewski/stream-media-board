import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { clipsRouter } from './routes/clips.js';
import { prefetchRouter } from './routes/prefetch.js';
import { stagingRouter } from './routes/staging.js';
import { playRouter } from './routes/play.js';
import { thumbnailsRouter } from './routes/thumbnails.js';
import { settingsRouter } from './routes/settings.js';
import { youtubeRouter } from './routes/youtube.js';
import { categoriesRouter } from './routes/categories.js';
import { categoryThumbnailsRouter } from './routes/categoryThumbnails.js';
import { layoutAreasRouter } from './routes/layoutAreas.js';
import { todoListsRouter } from './routes/todoLists.js';
import { browserSourceRouter } from './routes/browserSource.js';
import { integrationsRouter } from './routes/integrations.js';
import { mediaSearchRouter } from './routes/mediaSearch.js';
import { twitchIntegrationRouter } from './routes/twitchIntegration.js';
import { twitchWebhookRouter } from './routes/twitchWebhook.js';
import { streamerBotWebhookRouter } from './routes/streamerBotWebhook.js';
import { alertsRouter } from './routes/alerts.js';
import { alertTriggersRouter } from './routes/alertTriggers.js';
import { advssRouter } from './routes/advss.js';
import { macrosRouter } from './routes/macros.js';
import { logger } from './lib/logger.js';
import type { AppPaths } from './config/paths.js';

export function createApp(paths: AppPaths): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.use('/api/health', healthRouter(paths));
  app.use('/api/clips/prefetch', prefetchRouter(paths));
  app.use('/api/clips', playRouter(paths));
  app.use('/api/clips', clipsRouter());
  app.use('/api/staging', stagingRouter(paths));
  app.use('/api/thumbnails', thumbnailsRouter(paths));
  app.use('/api/settings', settingsRouter());
  app.use('/api/youtube', youtubeRouter());
  app.use('/api/categories', categoriesRouter(paths));
  app.use('/api/category-thumbnails', categoryThumbnailsRouter(paths));
  app.use('/api/browser-source', browserSourceRouter(paths));
  app.use('/api/layout-areas', layoutAreasRouter());
  app.use('/api/todo-lists', todoListsRouter());
  app.use('/api/integrations', integrationsRouter());
  app.use('/api/media-search', mediaSearchRouter());
  app.use('/api/integrations/twitch', twitchIntegrationRouter());
  app.use('/api/webhooks/twitch', twitchWebhookRouter());
  app.use('/api/webhooks/streamerbot', streamerBotWebhookRouter());
  app.use('/api/alerts', alertsRouter());
  app.use('/api/alerts/triggers', alertTriggersRouter());
  app.use('/api/advss', advssRouter());
  app.use('/api/macros', macrosRouter(paths));
  // Legacy alias — same handlers now live under /api/thumbnails/m/:id/...
  app.use('/api/macro-thumbnails', (req, res) => {
    const suffix = req.url === '/' ? '' : req.url;
    res.redirect(301, `/api/thumbnails/m${suffix}`);
  });

  if (existsSync(paths.frontendDist)) {
    app.use(express.static(paths.frontendDist));
    const indexHtml = join(paths.frontendDist, 'index.html');
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        next();
        return;
      }
      if (existsSync(indexHtml)) {
        res.sendFile(indexHtml);
        return;
      }
      next();
    });
    logger.info(`serving static frontend from ${paths.frontendDist}`);
  } else {
    logger.info(
      'frontend/dist missing; in development Vite serves the UI at http://localhost:5173',
    );
  }

  app.use(errorHandler);

  return app;
}
