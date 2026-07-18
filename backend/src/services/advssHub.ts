import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from '../lib/logger.js';

export const ADVSS_WS_PATH = '/ws/advss';

const clients = new Set<WebSocket>();

let wss: WebSocketServer | null = null;

export function getAdvssClientCount(): number {
  return clients.size;
}

export function broadcastAdvssMessage(message: string): { sent: number; clients: number } {
  let sent = 0;
  for (const client of clients) {
    if (client.readyState !== client.OPEN) continue;
    client.send(message);
    sent += 1;
  }
  return { sent, clients: clients.size };
}

export function attachAdvssWebSocket(server: HttpServer): void {
  if (wss) return;

  wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (socket) => {
    clients.add(socket);
    logger.info(`advss websocket client connected (${clients.size} total)`);

    socket.on('close', () => {
      clients.delete(socket);
      logger.info(`advss websocket client disconnected (${clients.size} total)`);
    });

    socket.on('error', (err) => {
      logger.error('advss websocket client error', err);
      clients.delete(socket);
    });
  });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : '';
    if (pathname !== ADVSS_WS_PATH) {
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(req, socket, head, (ws) => {
      wss!.emit('connection', ws, req);
    });
  });

  logger.info(`advss websocket listening for upgrades on ${ADVSS_WS_PATH}`);
}

export function closeAdvssWebSocket(): void {
  for (const client of clients) {
    try {
      client.close();
    } catch {
      /* noop */
    }
  }
  clients.clear();

  if (wss) {
    wss.close();
    wss = null;
  }
}
