import { Router, type NextFunction, type Request, type Response } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import {
  alertsClientCount,
  getAlertsStatus,
  subscribeAlerts,
} from '../services/alertsHub.js';
import { buildAlertFromTestRequest } from '../services/streamerBotAlerts.js';

export function alertsRouter(): Router {
  const router = Router();

  router.get('/events', (req: Request, res: Response) => {
    subscribeAlerts(res);
    req.socket.setTimeout(0);
  });

  router.get('/status', (_req: Request, res: Response) => {
    res.json(getAlertsStatus());
  });

  router.post('/test', (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = buildAlertFromTestRequest(req.body ?? {});
      if (!alert) {
        throw new HttpError(400, 'Invalid test alert payload.', 'alert_test_invalid');
      }
      res.json({
        status: 'triggered',
        alert,
        connected_clients: alertsClientCount(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
