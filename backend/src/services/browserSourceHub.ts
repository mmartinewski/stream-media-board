import type { Response } from 'express';
import {
  browserSourceModeAcceptsClip,
  parseBrowserSourceMode,
  type BrowserSourceMode,
  type VideoOrientation,
} from './videoOrientation.js';

import type { LayoutAreaDto } from './layoutAreaTypes.js';
import type { TodoListOverlayDto } from './todoListTypes.js';

export interface BrowserSourcePlayEvent {
  type: 'play';
  mediaUrl: string;
  mediaKind?: 'audio' | 'video' | 'image';
  volume?: number;
  playbackVolume?: number;
  width?: number;
  height?: number;
  orientation?: VideoOrientation;
  layoutArea?: LayoutAreaDto;
  displayDurationSec?: number;
  minimumDisplaySec?: number;
}

export interface BrowserSourceStopEvent {
  type: 'stop';
}

export interface BrowserSourceTodoShowEvent {
  type: 'todo_show';
  list: TodoListOverlayDto;
  highlight_item_id?: number;
  highlight_item_mode?: 'check' | 'uncheck';
}

export interface BrowserSourceTodoHideEvent {
  type: 'todo_hide';
}

export interface BrowserSourceTodoSyncEvent {
  type: 'todo_sync';
  list: TodoListOverlayDto;
  highlight_item_id?: number;
  highlight_item_mode?: 'check' | 'uncheck';
}

export type BrowserSourceSseEvent =
  | BrowserSourcePlayEvent
  | BrowserSourceStopEvent
  | BrowserSourceTodoShowEvent
  | BrowserSourceTodoHideEvent
  | BrowserSourceTodoSyncEvent;

interface SseClient {
  id: number;
  mode: BrowserSourceMode;
  res: Response;
}

let nextClientId = 1;
const clients = new Map<number, SseClient>();
let activeTodoListId: number | null = null;
let activeTodoListSnapshot: TodoListOverlayDto | null = null;
let todoDisplayTimer: ReturnType<typeof setTimeout> | null = null;

function clearTodoDisplayTimer(): void {
  if (todoDisplayTimer) {
    clearTimeout(todoDisplayTimer);
    todoDisplayTimer = null;
  }
}

function scheduleTodoDisplayTimer(list: TodoListOverlayDto): void {
  clearTodoDisplayTimer();
  const sec = list.max_display_seconds;
  if (sec == null || sec <= 0) return;
  const listId = list.id;
  todoDisplayTimer = setTimeout(() => {
    todoDisplayTimer = null;
    if (activeTodoListId === listId) {
      publishBrowserSourceTodoHide();
    }
  }, sec * 1000);
}

export function browserSourceModeAcceptsTodo(mode: BrowserSourceMode): boolean {
  return mode === 'stage' || mode === 'universal';
}

export function getActiveTodoListId(): number | null {
  return activeTodoListId;
}

export function setActiveTodoListId(id: number | null): void {
  activeTodoListId = id;
}

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

  if (activeTodoListSnapshot && browserSourceModeAcceptsTodo(mode)) {
    const replay = JSON.stringify({
      type: 'todo_show',
      list: activeTodoListSnapshot,
    } satisfies BrowserSourceTodoShowEvent);
    res.write(`data: ${replay}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(id);
  });
}

function writeToTodoClients(payload: string): void {
  for (const client of clients.values()) {
    if (!browserSourceModeAcceptsTodo(client.mode)) continue;
    client.res.write(`data: ${payload}\n\n`);
  }
}

export function publishBrowserSourceStopAll(): void {
  const payload = JSON.stringify({ type: 'stop' } satisfies BrowserSourceStopEvent);
  for (const client of clients.values()) {
    client.res.write(`data: ${payload}\n\n`);
  }
}

export function publishBrowserSourceEvent(event: BrowserSourcePlayEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients.values()) {
    if (!browserSourceModeAcceptsClip(client.mode, event.orientation, event.mediaKind)) {
      continue;
    }
    client.res.write(`data: ${payload}\n\n`);
  }
}

export function publishBrowserSourceTodoShow(
  list: TodoListOverlayDto,
  highlightItemId?: number,
  highlightItemMode?: 'check' | 'uncheck',
): void {
  activeTodoListId = list.id;
  activeTodoListSnapshot = list;
  const payload = JSON.stringify({
    type: 'todo_show',
    list,
    ...(highlightItemId != null ? { highlight_item_id: highlightItemId } : {}),
    ...(highlightItemMode != null ? { highlight_item_mode: highlightItemMode } : {}),
  } satisfies BrowserSourceTodoShowEvent);
  writeToTodoClients(payload);
  scheduleTodoDisplayTimer(list);
}

export function publishBrowserSourceTodoHide(): void {
  clearTodoDisplayTimer();
  activeTodoListId = null;
  activeTodoListSnapshot = null;
  const payload = JSON.stringify({ type: 'todo_hide' } satisfies BrowserSourceTodoHideEvent);
  writeToTodoClients(payload);
}

export function publishBrowserSourceTodoSync(
  list: TodoListOverlayDto,
  highlightItemId?: number,
  highlightItemMode?: 'check' | 'uncheck',
): void {
  if (activeTodoListId !== list.id) return;
  activeTodoListSnapshot = list;
  const payload = JSON.stringify({
    type: 'todo_sync',
    list,
    ...(highlightItemId != null ? { highlight_item_id: highlightItemId } : {}),
    ...(highlightItemMode != null ? { highlight_item_mode: highlightItemMode } : {}),
  } satisfies BrowserSourceTodoSyncEvent);
  writeToTodoClients(payload);
  scheduleTodoDisplayTimer(list);
}

export function browserSourceClientsForEvent(event: BrowserSourcePlayEvent): number {
  let count = 0;
  for (const client of clients.values()) {
    if (browserSourceModeAcceptsClip(client.mode, event.orientation, event.mediaKind)) {
      count += 1;
    }
  }
  return count;
}

export function browserSourceClientCount(): number {
  return clients.size;
}

export function browserSourceClientCountByMode(): Record<BrowserSourceMode, number> {
  const counts: Record<BrowserSourceMode, number> = {
    universal: 0,
    audio: 0,
    landscape: 0,
    portrait: 0,
    stage: 0,
  };
  for (const client of clients.values()) {
    counts[client.mode] += 1;
  }
  return counts;
}
