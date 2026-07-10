import type { Database as BetterDatabase } from 'better-sqlite3';

export interface StreamerBotWebhookEventRow {
  id: number;
  received_at: string;
  event_type: string | null;
  alert_kind: string | null;
  alert_id: string | null;
  error: string | null;
  payload_json: string;
  alert_json: string | null;
}

export interface StreamerBotWebhookEventListItem {
  id: number;
  received_at: string;
  event_type: string | null;
  alert_kind: string | null;
  alert_id: string | null;
  error: string | null;
}

export interface InsertStreamerBotWebhookEventInput {
  received_at: string;
  event_type: string | null;
  alert_kind: string | null;
  alert_id: string | null;
  error: string | null;
  payload_json: string;
  alert_json: string | null;
}

export interface ListStreamerBotWebhookEventsFilter {
  eventType?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
  offset?: number;
}

export function ensureStreamerBotWebhookEventsSchema(db: BetterDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS streamerbot_webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT NOT NULL,
      event_type TEXT,
      alert_kind TEXT,
      alert_id TEXT,
      error TEXT,
      payload_json TEXT NOT NULL,
      alert_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_streamerbot_webhook_events_received_at
      ON streamerbot_webhook_events(received_at DESC);

    CREATE INDEX IF NOT EXISTS idx_streamerbot_webhook_events_event_type
      ON streamerbot_webhook_events(event_type);
  `);
}

export function insertStreamerBotWebhookEvent(
  db: BetterDatabase,
  input: InsertStreamerBotWebhookEventInput,
): StreamerBotWebhookEventRow {
  const result = db
    .prepare(
      `INSERT INTO streamerbot_webhook_events (
         received_at, event_type, alert_kind, alert_id, error, payload_json, alert_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.received_at,
      input.event_type,
      input.alert_kind,
      input.alert_id,
      input.error,
      input.payload_json,
      input.alert_json,
    );

  const row = getStreamerBotWebhookEvent(db, Number(result.lastInsertRowid));
  if (!row) {
    throw new Error('Failed to insert streamerbot webhook event.');
  }
  return row;
}

export function getStreamerBotWebhookEvent(
  db: BetterDatabase,
  id: number,
): StreamerBotWebhookEventRow | null {
  const row = db
    .prepare(
      `SELECT id, received_at, event_type, alert_kind, alert_id, error, payload_json, alert_json
       FROM streamerbot_webhook_events
       WHERE id = ?`,
    )
    .get(id) as StreamerBotWebhookEventRow | undefined;
  return row ?? null;
}

function buildListWhere(filter: ListStreamerBotWebhookEventsFilter): {
  whereSql: string;
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const eventType = filter.eventType?.trim();
  if (eventType) {
    clauses.push('event_type = ?');
    params.push(eventType);
  }

  const fromDate = normalizeDateBound(filter.fromDate, 'start');
  if (fromDate) {
    clauses.push('received_at >= ?');
    params.push(fromDate);
  }

  const toDate = normalizeDateBound(filter.toDate, 'end');
  if (toDate) {
    clauses.push('received_at <= ?');
    params.push(toDate);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

/** Accepts YYYY-MM-DD or ISO datetime; expands date-only to local day bounds. */
function normalizeDateBound(
  raw: string | null | undefined,
  bound: 'start' | 'end',
): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    const local =
      bound === 'start'
        ? new Date(year, month - 1, day, 0, 0, 0, 0)
        : new Date(year, month - 1, day, 23, 59, 59, 999);
    return local.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function listStreamerBotWebhookEvents(
  db: BetterDatabase,
  filter: ListStreamerBotWebhookEventsFilter = {},
): { items: StreamerBotWebhookEventListItem[]; total: number } {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const { whereSql, params } = buildListWhere(filter);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM streamerbot_webhook_events ${whereSql}`)
    .get(...params) as { count: number };

  const items = db
    .prepare(
      `SELECT id, received_at, event_type, alert_kind, alert_id, error
       FROM streamerbot_webhook_events
       ${whereSql}
       ORDER BY received_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as StreamerBotWebhookEventListItem[];

  return { items, total: totalRow.count };
}

export function listStreamerBotWebhookEventTypes(db: BetterDatabase): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT event_type
       FROM streamerbot_webhook_events
       WHERE event_type IS NOT NULL AND event_type != ''
       ORDER BY event_type`,
    )
    .all() as Array<{ event_type: string }>;
  return rows.map((row) => row.event_type);
}
