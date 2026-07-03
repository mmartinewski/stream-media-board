import type { AlertDto } from './alertsHub.js';

const MAX_ENTRIES = 20;

export interface StreamerBotWebhookDebugEntry {
  id: string;
  receivedAt: string;
  eventType: string | null;
  contentType: string | null;
  headers: Record<string, string>;
  body: unknown;
  bodyRaw: string | null;
  alert: AlertDto | null;
  error: string | null;
}

let nextId = 1;
const entries: StreamerBotWebhookDebugEntry[] = [];

export function recordStreamerBotWebhookEvent(
  body: unknown,
  alert: AlertDto | null,
  error: string | null = null,
  meta?: {
    headers?: Record<string, string | string[] | undefined>;
    bodyRaw?: string | null;
  },
): StreamerBotWebhookDebugEntry {
  const eventType =
    body !== null && typeof body === 'object'
      ? String(
          (body as { eventType?: unknown }).eventType ??
            (body as { __source?: unknown }).__source ??
            '',
        ) || null
      : null;

  const headers: Record<string, string> = {};
  if (meta?.headers) {
    for (const [key, value] of Object.entries(meta.headers)) {
      if (value === undefined) continue;
      headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  const entry: StreamerBotWebhookDebugEntry = {
    id: String(nextId++),
    receivedAt: new Date().toISOString(),
    eventType,
    contentType: headers['content-type'] ?? null,
    headers,
    body,
    bodyRaw: meta?.bodyRaw ?? null,
    alert,
    error,
  };

  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }

  return entry;
}

export function getStreamerBotWebhookDebugEntries(): StreamerBotWebhookDebugEntry[] {
  return [...entries];
}

export function clearStreamerBotWebhookDebugEntries(): void {
  entries.length = 0;
}
