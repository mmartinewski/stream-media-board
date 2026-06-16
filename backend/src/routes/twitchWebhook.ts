import { Router, type NextFunction, type Request, type Response } from 'express';
import { logger } from '../lib/logger.js';
import {
  clearTwitchWebhookDebugEntry,
  getLastTwitchWebhookDebugEntry,
  recordTwitchWebhookEvent,
} from '../services/twitchWebhookDebug.js';

export function twitchWebhookRouter(): Router {
  const router = Router();

  router.post('/events', (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = recordTwitchWebhookEvent(req.headers, req.body);
      logger.info('twitch webhook received', {
        id: entry.id,
        messageType: entry.messageType,
        subscriptionType: entry.subscriptionType,
      });

      if (entry.messageType === 'webhook_callback_verification') {
        const challenge = (req.body as { challenge?: unknown })?.challenge;
        if (typeof challenge !== 'string' || challenge.length === 0) {
          res.status(400).json({ error: 'Missing Twitch challenge.' });
          return;
        }
        res.status(200).type('text/plain').send(challenge);
        return;
      }

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  });

  router.get('/debug', (_req: Request, res: Response) => {
    res.json({
      endpoint: '/api/webhooks/twitch/events',
      last: getLastTwitchWebhookDebugEntry(),
    });
  });

  router.delete('/debug', (_req: Request, res: Response) => {
    clearTwitchWebhookDebugEntry();
    res.json({ status: 'cleared' });
  });

  return router;
}
