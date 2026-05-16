import { closeSync, openSync, writeSync } from 'node:fs';

type Level = 'debug' | 'info' | 'warn' | 'error';

let logFd: number | null = null;

export function initLogger(logFilePath: string): void {
  if (logFd !== null) return;
  logFd = openSync(logFilePath, 'w');
  log('info', `logger active at ${logFilePath}`);
}

export function closeLogger(): void {
  if (logFd === null) return;
  try {
    closeSync(logFd);
  } catch {
    /* noop */
  }
  logFd = null;
}

export function log(level: Level, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaPart =
    meta === undefined
      ? ''
      : ' ' + safeStringify(meta);
  const line = `${ts} ${level.toUpperCase()} ${message}${metaPart}\n`;

  switch (level) {
    case 'error':
      process.stderr.write(line);
      break;
    default:
      process.stdout.write(line);
  }

  if (logFd !== null) {
    try {
      writeSync(logFd, line);
    } catch {
      /* noop */
    }
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
};

function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) {
      return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
    }
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
