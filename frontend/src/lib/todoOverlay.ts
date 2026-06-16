import type { CSSProperties } from 'react';
import type { AnchorHorizontal, AnchorVertical } from './layoutSlot';
import { todoFontSizeCssVars, normalizeTodoFontSize } from './todoFontSize';
import { withTodoFontFallback } from './todoFontOptions';

export const TODO_ANIMATIONS = [
  'fade',
  'slide_top',
  'slide_bottom',
  'slide_left',
  'slide_right',
] as const;

export type TodoAnimationId = (typeof TODO_ANIMATIONS)[number];

export const TODO_ANIMATION_LABELS: Record<TodoAnimationId, string> = {
  fade: 'Fade',
  slide_top: 'Slide from top',
  slide_bottom: 'Slide from bottom',
  slide_left: 'Slide from left',
  slide_right: 'Slide from right',
};

export function todoAnimationLabel(id: TodoAnimationId): string {
  return TODO_ANIMATION_LABELS[id];
}

export interface TodoListSummaryDto {
  id: number;
  name: string;
  sort_order: number;
}

export interface TodoItemDto {
  id: number;
  title: string;
  sort_order: number;
  completed: boolean;
  thumbnail_url: string | null;
}

export interface TodoGroupDto {
  id: number;
  title: string;
  sort_order: number;
  visible: boolean;
  thumbnail_url: string | null;
  items: TodoItemDto[];
}

export interface TodoColumnDto {
  id: number;
  sort_order: number;
  visible: boolean;
  groups: TodoGroupDto[];
}

export const TODO_BACKGROUND_MODES = ['image', 'color'] as const;

export type TodoBackgroundMode = (typeof TODO_BACKGROUND_MODES)[number];

export type { TodoFontSizeId } from './todoFontSize';
export { TODO_FONT_SIZES, TODO_FONT_SIZE_DEFAULT } from './todoFontSize';

export type TodoPanelAnchorVertical = AnchorVertical;
export type TodoPanelAnchorHorizontal = AnchorHorizontal;
export type TodoTitleAlign = AnchorHorizontal;

export interface TodoListThemeDto {
  background_url: string | null;
  background_mode: TodoBackgroundMode;
  background_color: string;
  font_family: string;
  font_size: import('./todoFontSize').TodoFontSizeId;
  title_font_size: import('./todoFontSize').TodoFontSizeId;
  title_align: TodoTitleAlign;
  color_title: string;
  color_group: string;
  color_item: string;
}

export interface TodoListDetailDto {
  id: number;
  name: string;
  title: string;
  sort_order: number;
  theme: TodoListThemeDto;
  enter_animation: TodoAnimationId;
  exit_animation: TodoAnimationId;
  animation_duration_ms: number;
  panel_width_percent: number;
  panel_max_height_percent: number;
  panel_anchor_vertical: TodoPanelAnchorVertical;
  panel_anchor_horizontal: TodoPanelAnchorHorizontal;
  panel_padding_x_percent: number;
  panel_padding_y_percent: number;
  panel_inset_x_percent: number;
  panel_inset_y_percent: number;
  item_zebra_opacity_percent: number;
  background_opacity_percent: number;
  background_blur_px?: number;
  max_display_seconds: number | null;
  auto_show_on_item_update: boolean;
  columns: TodoColumnDto[];
}

export type TodoListOverlayDto = TodoListDetailDto;

export interface TodoListsIndexResponse {
  lists: TodoListSummaryDto[];
  active_todo_list_id: number | null;
}

export interface TodoListInput {
  name?: string;
  title: string;
  sort_order?: number;
  font_family?: string;
  font_size?: import('./todoFontSize').TodoFontSizeId;
  title_font_size?: import('./todoFontSize').TodoFontSizeId;
  title_align?: TodoTitleAlign;
  color_title?: string;
  color_group?: string;
  color_item?: string;
  enter_animation?: TodoAnimationId;
  exit_animation?: TodoAnimationId;
  animation_duration_ms?: number;
  panel_width_percent?: number;
  panel_max_height_percent?: number;
  panel_anchor_vertical?: TodoPanelAnchorVertical;
  panel_anchor_horizontal?: TodoPanelAnchorHorizontal;
  panel_padding_x_percent?: number;
  panel_padding_y_percent?: number;
  panel_inset_x_percent?: number;
  panel_inset_y_percent?: number;
  item_zebra_opacity_percent?: number;
  background_opacity_percent?: number;
  background_mode?: TodoBackgroundMode;
  background_color?: string;
  max_display_seconds?: number | null;
  auto_show_on_item_update?: boolean;
}

export interface TodoListOverlayState {
  list: TodoListOverlayDto | null;
  phase: 'hidden' | 'entering' | 'visible' | 'exiting';
}

export function resolveTodoMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${window.location.origin}${path}`;
}

export function resolveTodoThumbnailUrl(
  url: string | null | undefined,
  cacheBust?: number,
): string | null {
  if (!url) return null;
  const path =
    cacheBust != null && cacheBust > 0
      ? `${url}${url.includes('?') ? '&' : '?'}t=${cacheBust}`
      : url;
  return resolveTodoMediaUrl(path);
}

export function todoPanelStyle(
  list: TodoListOverlayDto,
  options?: { preview?: boolean },
): CSSProperties {
  const mode = list.theme.background_mode ?? 'image';
  const bg =
    mode === 'image' ? resolveTodoMediaUrl(list.theme.background_url) : null;
  const opacity = (list.background_opacity_percent ?? 45) / 100;
  const fontSize = normalizeTodoFontSize(list.theme.font_size);
  const titleFontSize = normalizeTodoFontSize(list.theme.title_font_size ?? list.theme.font_size);
  return {
    ...todoFontSizeCssVars(
      fontSize,
      options?.preview ? 'preview' : 'overlay',
      titleFontSize,
    ),
    ['--todo-bg-image' as string]: bg ? `url("${bg}")` : 'none',
    ['--todo-bg-opacity' as string]: String(opacity),
    ['--todo-bg-solid' as string]: list.theme.background_color ?? '#000000',
    ['--todo-font-family' as string]: withTodoFontFallback(list.theme.font_family),
    ['--todo-color-title' as string]: list.theme.color_title,
    ['--todo-title-align' as string]: list.theme.title_align ?? 'center',
    ['--todo-color-group' as string]: list.theme.color_group,
    ['--todo-color-item' as string]: list.theme.color_item,
    ['--todo-panel-width' as string]: `${list.panel_width_percent}%`,
    ['--todo-panel-max-height' as string]: `${list.panel_max_height_percent}%`,
    ['--todo-panel-padding-x' as string]: String(list.panel_padding_x_percent ?? 8),
    ['--todo-panel-padding-y' as string]: String(list.panel_padding_y_percent ?? 6),
    ['--todo-item-zebra-opacity' as string]: String(
      (list.item_zebra_opacity_percent ?? 24) / 100,
    ),
    ['--todo-animation-duration' as string]: `${list.animation_duration_ms}ms`,
  };
}

export function todoLayerStyle(
  list: Pick<TodoListOverlayDto, 'panel_inset_x_percent' | 'panel_inset_y_percent'>,
): CSSProperties {
  return {
    ['--todo-layer-inset-x' as string]: String(list.panel_inset_x_percent ?? 2),
    ['--todo-layer-inset-y' as string]: String(list.panel_inset_y_percent ?? 2),
  };
}

export function todoPanelBgMode(list: TodoListOverlayDto): TodoBackgroundMode {
  return list.theme.background_mode ?? 'image';
}

export function todoPanelAnchorAttrs(
  list: Pick<TodoListOverlayDto, 'panel_anchor_vertical' | 'panel_anchor_horizontal'>,
): Record<string, string> {
  return {
    'data-todo-anchor-v': list.panel_anchor_vertical ?? 'top',
    'data-todo-anchor-h': list.panel_anchor_horizontal ?? 'left',
  };
}

/** Columns share the panel width equally (no fixed rem cap — matches preview and wide overlays). */
export function todoColumnsStyle(columnCount: number): CSSProperties {
  const count = Math.max(1, columnCount);
  return {
    ['--todo-column-max' as string]: `calc(100% / ${count})`,
  };
}

export function isTodoItemCompleted(completed: boolean | number | undefined | null): boolean {
  return completed === true || completed === 1;
}

export type TodoItemHighlightMode = 'check' | 'uncheck';

/** Keep in sync with todo-item highlight animations in index.css */
export const TODO_ITEM_HIGHLIGHT_MS = 1250;

export interface TodoItemHighlight {
  itemId: number;
  mode: TodoItemHighlightMode;
}

export function findToggledItemHighlights(
  previous: TodoListOverlayDto | null,
  next: TodoListOverlayDto,
): TodoItemHighlight[] {
  if (!previous || previous.id !== next.id) return [];
  const priorCompleted = new Map<number, boolean>();
  for (const column of previous.columns) {
    for (const group of column.groups) {
      for (const item of group.items) {
        priorCompleted.set(item.id, isTodoItemCompleted(item.completed));
      }
    }
  }
  const highlights: TodoItemHighlight[] = [];
  for (const column of next.columns) {
    for (const group of column.groups) {
      for (const item of group.items) {
        const wasCompleted = priorCompleted.get(item.id);
        if (wasCompleted === undefined) continue;
        const isCompleted = isTodoItemCompleted(item.completed);
        if (wasCompleted === isCompleted) continue;
        highlights.push({ itemId: item.id, mode: isCompleted ? 'check' : 'uncheck' });
      }
    }
  }
  return highlights;
}

export function resolveItemHighlights(
  previous: TodoListOverlayDto | null,
  next: TodoListOverlayDto,
  explicit?: TodoItemHighlight,
): TodoItemHighlight[] {
  const byId = new Map<number, TodoItemHighlightMode>();
  for (const highlight of findToggledItemHighlights(previous, next)) {
    byId.set(highlight.itemId, highlight.mode);
  }
  if (explicit) byId.set(explicit.itemId, explicit.mode);
  return [...byId.entries()].map(([itemId, mode]) => ({ itemId, mode }));
}

export function mergeItemHighlights(
  existing: TodoItemHighlight[],
  incoming: TodoItemHighlight[],
): TodoItemHighlight[] {
  const byId = new Map<number, TodoItemHighlightMode>();
  for (const highlight of existing) byId.set(highlight.itemId, highlight.mode);
  for (const highlight of incoming) byId.set(highlight.itemId, highlight.mode);
  return [...byId.entries()].map(([itemId, mode]) => ({ itemId, mode }));
}

export function isTodoOverlayVisible(visible: boolean | number | undefined | null): boolean {
  return visible !== false && visible !== 0;
}

/** Columns and groups marked hidden are omitted from the live overlay. */
export function filterVisibleTodoColumns(columns: TodoColumnDto[]): TodoColumnDto[] {
  return columns
    .filter((column) => isTodoOverlayVisible(column.visible))
    .map((column) => ({
      ...column,
      groups: column.groups.filter((group) => isTodoOverlayVisible(group.visible)),
    }))
    .filter((column) => column.groups.length > 0);
}

export function todoAnimationDataAttrs(
  animation: TodoAnimationId,
): Record<string, string> {
  if (animation === 'fade') {
    return { 'data-todo-anim': 'fade' };
  }
  const dir = animation.replace('slide_', '');
  return { 'data-todo-anim': 'slide', 'data-todo-dir': dir };
}
