import { Router, type Request, type Response, type NextFunction } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import {
  ADVSS_WS_PATH,
  broadcastAdvssMessage,
  getAdvssClientCount,
} from '../services/advssHub.js';

export function advssRouter(): Router {
  const router = Router();

  router.get('/status', (_req: Request, res: Response) => {
    res.json({
      path: ADVSS_WS_PATH,
      connected_clients: getAdvssClientCount(),
    });
  });

  router.post('/send', (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.body?.message;
      if (typeof raw !== 'string' || raw.trim() === '') {
        throw new HttpError(400, 'Body must include a non-empty "message" string.', 'invalid_body');
      }
      const message = raw;
      const result = broadcastAdvssMessage(message);
      res.json({
        status: 'ok',
        message,
        sent: result.sent,
        connected_clients: result.clients,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
