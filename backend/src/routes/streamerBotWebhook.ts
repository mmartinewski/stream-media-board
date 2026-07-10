import { Router, type NextFunction, type Request, type Response } from 'express';
import { resolvePaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  getStreamerBotWebhookEvent,
  insertStreamerBotWebhookEvent,
  listStreamerBotWebhookEventTypes,
  listStreamerBotWebhookEvents,
} from '../db/repositories/streamerBotWebhookEvents.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../middleware/errorHandler.js';
import { getAlertsStatus } from '../services/alertsHub.js';
import { processStreamerBotWebhook } from '../services/streamerBotAlerts.js';
import { resolveStreamerBotEventType } from '../services/streamerBotNormalize.js';
import {
  clearStreamerBotWebhookDebugEntries,
  getStreamerBotWebhookDebugEntries,
  recordStreamerBotWebhookEvent,
} from '../services/streamerBotWebhookDebug.js';

function asRecord(body: unknown): Record<string, unknown> | null {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return null;
}

function parseOptionalInt(raw: unknown, fallback: number): number {
  if (typeof raw !== 'string' && typeof raw !== 'number') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function persistWebhookEvent(params: {
  body: unknown;
  eventType: string | null;
  alert: ReturnType<typeof processStreamerBotWebhook>;
  error: string | null;
  receivedAt: string;
}): void {
  try {
    const paths = resolvePaths();
    const db = getDb(paths.databaseFile);
    insertStreamerBotWebhookEvent(db, {
      received_at: params.receivedAt,
      event_type: params.eventType,
      alert_kind: params.alert?.kind ?? null,
      alert_id: params.alert?.id ?? null,
      error: params.error,
      payload_json: JSON.stringify(params.body ?? null),
      alert_json: params.alert ? JSON.stringify(params.alert) : null,
    });
  } catch (err) {
    logger.error('failed to persist streamerbot webhook event', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function streamerBotWebhookRouter(): Router {
  const router = Router();

  router.post('/events', (req: Request, res: Response, next: NextFunction) => {
    try {
      let alert = null;
      let error: string | null = null;
      const receivedAt = new Date().toISOString();
      const record = asRecord(req.body);
      const eventType = record ? resolveStreamerBotEventType(record) : null;

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

      persistWebhookEvent({
        body: req.body,
        eventType: alert?.eventType ?? eventType,
        alert,
        error,
        receivedAt,
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

  router.get('/events', (req: Request, res: Response, next: NextFunction) => {
    try {
      const paths = resolvePaths();
      const db = getDb(paths.databaseFile);
      const eventType =
        typeof req.query.eventType === 'string' ? req.query.eventType : null;
      const fromDate = typeof req.query.from === 'string' ? req.query.from : null;
      const toDate = typeof req.query.to === 'string' ? req.query.to : null;
      const limit = parseOptionalInt(req.query.limit, 50);
      const offset = parseOptionalInt(req.query.offset, 0);

      const result = listStreamerBotWebhookEvents(db, {
        eventType,
        fromDate,
        toDate,
        limit,
        offset,
      });

      res.json({
        items: result.items,
        total: result.total,
        limit,
        offset,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/events/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        throw new HttpError(400, 'Invalid event id.', 'invalid_event_id');
      }

      const paths = resolvePaths();
      const db = getDb(paths.databaseFile);
      const row = getStreamerBotWebhookEvent(db, id);
      if (!row) {
        throw new HttpError(404, 'Event not found.', 'event_not_found');
      }

      let payload: unknown = null;
      let alert: unknown = null;
      try {
        payload = JSON.parse(row.payload_json) as unknown;
      } catch {
        payload = row.payload_json;
      }
      if (row.alert_json) {
        try {
          alert = JSON.parse(row.alert_json) as unknown;
        } catch {
          alert = row.alert_json;
        }
      }

      res.json({
        id: row.id,
        received_at: row.received_at,
        event_type: row.event_type,
        alert_kind: row.alert_kind,
        alert_id: row.alert_id,
        error: row.error,
        payload,
        alert,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/event-types', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const paths = resolvePaths();
      const db = getDb(paths.databaseFile);
      res.json({ eventTypes: listStreamerBotWebhookEventTypes(db) });
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
