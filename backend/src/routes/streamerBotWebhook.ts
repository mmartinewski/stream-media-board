import { Router, type NextFunction, type Request, type Response } from 'express';
import { logger } from '../lib/logger.js';
import { getAlertsStatus } from '../services/alertsHub.js';
import { buildAlertFromTestRequest } from '../services/streamerBotAlerts.js';
import {
  clearStreamerBotWebhookDebugEntries,
  getStreamerBotWebhookDebugEntries,
  recordStreamerBotWebhookEvent,
} from '../services/streamerBotWebhookDebug.js';
import { processStreamerBotWebhook } from '../services/streamerBotAlerts.js';

export function streamerBotWebhookRouter(): Router {
  const router = Router();

  router.post('/events', (req: Request, res: Response, next: NextFunction) => {
    try {
      let alert = null;
      let error: string | null = null;

      try {
        alert = processStreamerBotWebhook(req.body);
        if (!alert) {
          error = 'Missing or invalid eventType.';
        }
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to process event.';
      }

      const entry = recordStreamerBotWebhookEvent(req.body, alert, error, {
        headers: req.headers,
        bodyRaw: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? null),
      });
      logger.info('streamerbot webhook received', {
        id: entry.id,
        eventType: entry.eventType,
        alertId: alert?.id ?? null,
        error,
      });

      if (error && !alert) {
        res.status(400).json({ error });
        return;
      }

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  });

  router.get('/debug', (_req: Request, res: Response) => {
    res.json({
      endpoint: '/api/webhooks/streamerbot/events',
      entries: getStreamerBotWebhookDebugEntries(),
      alerts: getAlertsStatus(),
    });
  });

  router.delete('/debug', (_req: Request, res: Response) => {
    clearStreamerBotWebhookDebugEntries();
    res.json({ status: 'cleared' });
  });

  return router;
}
