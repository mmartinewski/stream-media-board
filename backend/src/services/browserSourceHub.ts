import type { Response } from 'express';

export interface BrowserSourcePlayEvent {
  type: 'play';
  mediaUrl: string;
}

type BrowserSourceEvent = BrowserSourcePlayEvent;

interface SseClient {
  id: number;
  res: Response;
}

let nextClientId = 1;
const clients = new Map<number, SseClient>();

export function subscribeBrowserSource(res: Response): void {
  const id = nextClientId++;
  clients.set(id, { id, res });

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

export function publishBrowserSourceEvent(event: BrowserSourceEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients.values()) {
    client.res.write(`data: ${payload}\n\n`);
  }
}

export function browserSourceClientCount(): number {
  return clients.size;
}
