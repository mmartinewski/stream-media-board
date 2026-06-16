export type TwitchWebhookDebugEntry = {
  id: string;
  receivedAt: string;
  messageType: string | null;
  subscriptionType: string | null;
  headers: Record<string, string>;
  body: unknown;
};

let lastEntry: TwitchWebhookDebugEntry | null = null;
let nextId = 1;

const TWITCH_HEADER_PREFIX = 'twitch-eventsub-';

export function recordTwitchWebhookEvent(
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
): TwitchWebhookDebugEntry {
  const twitchHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!key.toLowerCase().startsWith(TWITCH_HEADER_PREFIX) || value === undefined) {
      continue;
    }
    twitchHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }

  const entry: TwitchWebhookDebugEntry = {
    id: String(nextId++),
    receivedAt: new Date().toISOString(),
    messageType: twitchHeaders['twitch-eventsub-message-type'] ?? null,
    subscriptionType: twitchHeaders['twitch-eventsub-subscription-type'] ?? null,
    headers: twitchHeaders,
    body,
  };

  lastEntry = entry;
  return entry;
}

export function getLastTwitchWebhookDebugEntry(): TwitchWebhookDebugEntry | null {
  return lastEntry;
}

export function clearTwitchWebhookDebugEntry(): void {
  lastEntry = null;
}
