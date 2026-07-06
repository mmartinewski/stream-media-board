import type { Response } from 'express';
import type { AlertKind } from './alertTemplates.js';
import { DEFAULT_ALERT_DURATION_SEC } from './alertTemplates.js';
import { resolveAlertDisplayDurationSec, playAlertMediaForShow } from './alertShowMedia.js';

export interface AlertDto {
  id: string;
  kind: AlertKind;
  title: string;
  subtitle?: string;
  durationSec: number;
  eventType: string;
  variables: Record<string, string | number | boolean>;
}

export interface AlertShowEvent {
  type: 'alert_show';
  id: string;
  kind: AlertKind;
  title: string;
  subtitle?: string;
  durationSec: number;
  eventType: string;
  variables: Record<string, string | number | boolean>;
}

export interface AlertHideEvent {
  type: 'alert_hide';
  id: string;
}

export type AlertsSseEvent = AlertShowEvent | AlertHideEvent;

interface SseClient {
  id: number;
  res: Response;
}

let nextClientId = 1;
let nextAlertId = 1;
const clients = new Map<number, SseClient>();
const queue: AlertDto[] = [];
let currentAlert: AlertDto | null = null;
let displayTimer: ReturnType<typeof setTimeout> | null = null;

/** Gap after hide before the next show, matching overlay exit animation (~500ms). */
const ALERT_EXIT_GAP_MS = 550;

function clearDisplayTimer(): void {
  if (displayTimer) {
    clearTimeout(displayTimer);
    displayTimer = null;
  }
}

function writeToAllClients(payload: string): void {
  for (const client of clients.values()) {
    client.res.write(`data: ${payload}\n\n`);
  }
}

function toShowEvent(alert: AlertDto): AlertShowEvent {
  return {
    type: 'alert_show',
    id: alert.id,
    kind: alert.kind,
    title: alert.title,
    ...(alert.subtitle ? { subtitle: alert.subtitle } : {}),
    durationSec: alert.durationSec,
    eventType: alert.eventType,
    variables: alert.variables,
  };
}

function toHideEvent(alert: AlertDto): AlertHideEvent {
  return {
    type: 'alert_hide',
    id: alert.id,
  };
}

function publishShow(alert: AlertDto): void {
  writeToAllClients(JSON.stringify(toShowEvent(alert)));
}

function publishHide(alert: AlertDto): void {
  writeToAllClients(JSON.stringify(toHideEvent(alert)));
}

function scheduleHide(alert: AlertDto): void {
  clearDisplayTimer();
  displayTimer = setTimeout(() => {
    displayTimer = null;
    if (currentAlert?.id !== alert.id) return;
    publishHide(alert);
    currentAlert = null;
    setTimeout(processQueue, ALERT_EXIT_GAP_MS);
  }, alert.durationSec * 1000);
}

function processQueue(): void {
  void processQueueAsync();
}

async function processQueueAsync(): Promise<void> {
  if (currentAlert !== null) return;
  const next = queue.shift();
  if (!next) return;

  currentAlert = next;

  let displayDurationSec = next.durationSec;
  try {
    displayDurationSec = await resolveAlertDisplayDurationSec(next);
  } catch {
    displayDurationSec = next.durationSec;
  }

  const showAlert: AlertDto = { ...next, durationSec: displayDurationSec };
  currentAlert = showAlert;
  playAlertMediaForShow(showAlert);
  publishShow(showAlert);
  scheduleHide(showAlert);
}

export function enqueueAlert(alert: Omit<AlertDto, 'id'> & { id?: string }): AlertDto {
  const full: AlertDto = {
    ...alert,
    id: alert.id ?? String(nextAlertId++),
    durationSec: alert.durationSec > 0 ? alert.durationSec : DEFAULT_ALERT_DURATION_SEC,
  };
  queue.push(full);
  processQueue();
  return full;
}

export function subscribeAlerts(res: Response): void {
  const id = nextClientId++;
  clients.set(id, { id, res });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  if (currentAlert) {
    res.write(`data: ${JSON.stringify(toShowEvent(currentAlert))}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(id);
  });
}

export function alertsClientCount(): number {
  return clients.size;
}

export function getAlertsStatus(): {
  connected_clients: number;
  current_alert: AlertDto | null;
  queue_length: number;
  queue: AlertDto[];
  overlay_path: string;
} {
  return {
    connected_clients: clients.size,
    current_alert: currentAlert,
    queue_length: queue.length,
    queue: [...queue],
    overlay_path: '/overlay/alerts',
  };
}

export function getQueueSnapshot(): AlertDto[] {
  const snapshot: AlertDto[] = [];
  if (currentAlert) snapshot.push(currentAlert);
  snapshot.push(...queue);
  return snapshot;
}

export function createTestAlert(
  partial: Partial<AlertDto> & { eventType?: string; kind?: AlertKind },
): AlertDto {
  return enqueueAlert({
    kind: partial.kind ?? 'sub',
    title: partial.title ?? 'Teste de alerta',
    subtitle: partial.subtitle,
    durationSec: partial.durationSec ?? DEFAULT_ALERT_DURATION_SEC,
    eventType: partial.eventType ?? 'Twitch.Sub',
    variables: partial.variables ?? {},
  });
}
