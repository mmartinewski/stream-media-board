import type { Database as BetterDatabase } from 'better-sqlite3';
import { HttpError } from '../../middleware/errorHandler.js';
import type { AlertKind } from '../../services/alertTemplates.js';
import type { MediaSearchProviderId } from '../../services/mediaSearchTypes.js';

export type AlertMediaSource = 'clip' | 'gif';

export interface AlertMediaTriggerRow {
  alert_kind: string;
  media_source: AlertMediaSource;
  clip_id: number | null;
  gif_provider: MediaSearchProviderId | null;
  gif_external_id: string | null;
  updated_at: string;
}

export interface AlertMediaTriggerInput {
  media_source: AlertMediaSource;
  clip_id?: number | null;
  gif_provider?: MediaSearchProviderId | null;
  gif_external_id?: string | null;
}

export const CONFIGURABLE_ALERT_KINDS = [
  'follow',
  'sub',
  'sub_prime',
  'resub',
  'gift_sub',
  'gift_bomb',
  'pay_it_forward',
  'gift_paid_upgrade',
  'prime_paid_upgrade',
  'cheer',
  'raid',
  'channel_points',
  'hype_train_start',
  'hype_train_level',
  'hype_train_end',
] as const satisfies readonly AlertKind[];

export type ConfigurableAlertKind = (typeof CONFIGURABLE_ALERT_KINDS)[number];

export function ensureAlertMediaTriggersSchema(db: BetterDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_media_triggers (
      alert_kind TEXT PRIMARY KEY,
      media_source TEXT NOT NULL CHECK (media_source IN ('clip', 'gif')),
      clip_id INTEGER REFERENCES clips(id) ON DELETE SET NULL,
      gif_provider TEXT,
      gif_external_id TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function isConfigurableAlertKind(kind: string): kind is ConfigurableAlertKind {
  return (CONFIGURABLE_ALERT_KINDS as readonly string[]).includes(kind);
}

export function parseConfigurableAlertKind(raw: string | undefined): ConfigurableAlertKind {
  const kind = typeof raw === 'string' ? raw.trim() : '';
  if (!isConfigurableAlertKind(kind)) {
    throw new HttpError(400, 'Invalid alert kind.', 'invalid_alert_kind');
  }
  return kind;
}

export function listAlertMediaTriggers(db: BetterDatabase): AlertMediaTriggerRow[] {
  const rows = db
    .prepare(
      `SELECT alert_kind, media_source, clip_id, gif_provider, gif_external_id, updated_at
       FROM alert_media_triggers
       ORDER BY alert_kind`,
    )
    .all() as Array<
    Omit<AlertMediaTriggerRow, 'media_source'> & {
      media_source: string;
      gif_provider: string | null;
    }
  >;
  return rows.map((row) => ({
    ...row,
    media_source: row.media_source as AlertMediaSource,
    gif_provider: row.gif_provider as MediaSearchProviderId | null,
  }));
}

export function getAlertMediaTrigger(
  db: BetterDatabase,
  alertKind: ConfigurableAlertKind,
): AlertMediaTriggerRow | null {
  const row = db
    .prepare(
      `SELECT alert_kind, media_source, clip_id, gif_provider, gif_external_id, updated_at
       FROM alert_media_triggers
       WHERE alert_kind = ?`,
    )
    .get(alertKind) as Omit<AlertMediaTriggerRow, 'media_source'> & {
    media_source: string;
    gif_provider: string | null;
  } | undefined;
  if (!row) return null;
  return {
    ...row,
    media_source: row.media_source as AlertMediaSource,
    gif_provider: row.gif_provider as MediaSearchProviderId | null,
  };
}

export function parseAlertMediaTriggerInput(body: unknown): AlertMediaTriggerInput {
  const record = body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

  const mediaSource = record.media_source;
  if (mediaSource !== 'clip' && mediaSource !== 'gif') {
    throw new HttpError(400, 'media_source must be clip or gif.', 'invalid_media_source');
  }

  if (mediaSource === 'clip') {
    const clipId = Number(record.clip_id);
    if (!Number.isInteger(clipId) || clipId < 1) {
      throw new HttpError(400, 'clip_id is required for clip triggers.', 'invalid_clip_id');
    }
    return { media_source: 'clip', clip_id: clipId };
  }

  const gifProvider = typeof record.gif_provider === 'string' ? record.gif_provider.trim() : '';
  const gifExternalId =
    typeof record.gif_external_id === 'string' ? record.gif_external_id.trim() : '';
  if (!gifProvider || !gifExternalId) {
    throw new HttpError(
      400,
      'gif_provider and gif_external_id are required for gif triggers.',
      'invalid_gif_ref',
    );
  }
  if (gifProvider !== 'giphy' && gifProvider !== 'imported') {
    throw new HttpError(400, 'Invalid gif_provider.', 'invalid_gif_provider');
  }

  return {
    media_source: 'gif',
    gif_provider: gifProvider as MediaSearchProviderId,
    gif_external_id: gifExternalId,
  };
}

export function upsertAlertMediaTrigger(
  db: BetterDatabase,
  alertKind: ConfigurableAlertKind,
  input: AlertMediaTriggerInput,
): AlertMediaTriggerRow {
  if (input.media_source === 'clip') {
    db.prepare(
      `INSERT INTO alert_media_triggers (alert_kind, media_source, clip_id, gif_provider, gif_external_id, updated_at)
       VALUES (?, 'clip', ?, NULL, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(alert_kind) DO UPDATE SET
         media_source = 'clip',
         clip_id = excluded.clip_id,
         gif_provider = NULL,
         gif_external_id = NULL,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(alertKind, input.clip_id);
  } else {
    db.prepare(
      `INSERT INTO alert_media_triggers (alert_kind, media_source, clip_id, gif_provider, gif_external_id, updated_at)
       VALUES (?, 'gif', NULL, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(alert_kind) DO UPDATE SET
         media_source = 'gif',
         clip_id = NULL,
         gif_provider = excluded.gif_provider,
         gif_external_id = excluded.gif_external_id,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(alertKind, input.gif_provider, input.gif_external_id);
  }

  const row = getAlertMediaTrigger(db, alertKind);
  if (!row) {
    throw new HttpError(500, 'Failed to save alert trigger.', 'alert_trigger_save_failed');
  }
  return row;
}

export function deleteAlertMediaTrigger(
  db: BetterDatabase,
  alertKind: ConfigurableAlertKind,
): boolean {
  const result = db
    .prepare(`DELETE FROM alert_media_triggers WHERE alert_kind = ?`)
    .run(alertKind);
  return result.changes > 0;
}
