import type { Response } from 'express';
import {
  browserSourceModeAcceptsClip,
  parseBrowserSourceMode,
  type BrowserSourceMode,
  type VideoOrientation,
} from './videoOrientation.js';

export interface BrowserSourcePlayEvent {
  type: 'play';
  mediaUrl: string;
  width?: number;
  height?: number;
  orientation?: VideoOrientation;
}

type BrowserSourceEvent = BrowserSourcePlayEvent;

interface SseClient {
  id: number;
  mode: BrowserSourceMode;
  res: Response;
}

let nextClientId = 1;
const clients = new Map<number, SseClient>();

export function subscribeBrowserSource(res: Response, modeRaw: unknown): void {
  const mode = parseBrowserSourceMode(modeRaw);
  const id = nextClientId++;
  clients.set(id, { id, mode, res });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(id);
  });
}

export function publishBrowserSourceEvent(event: BrowserSourcePlayEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients.values()) {
    if (!browserSourceModeAcceptsClip(client.mode, event.orientation)) {
      continue;
    }
    client.res.write(`data: ${payload}\n\n`);
  }
}

export function browserSourceClientCount(): number {
  return clients.size;
}

export function browserSourceClientCountByMode(): Record<BrowserSourceMode, number> {
  const counts: Record<BrowserSourceMode, number> = {
    universal: 0,
    landscape: 0,
    portrait: 0,
  };
  for (const client of clients.values()) {
    counts[client.mode] += 1;
  }
  return counts;
}
