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

export interface TodoListThemeDto {
  background_url: string | null;
  background_mode: TodoBackgroundMode;
  background_color: string;
  font_family: string;
  font_size: import('./todoFontSize').TodoFontSizeId;
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
  background_opacity_percent: number;
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
  background_opacity_percent?: number;
  background_mode?: TodoBackgroundMode;
  background_color?: string;
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
  return {
    ...todoFontSizeCssVars(fontSize, options?.preview ? 'preview' : 'overlay'),
    ['--todo-bg-image' as string]: bg ? `url("${bg}")` : 'none',
    ['--todo-bg-opacity' as string]: String(opacity),
    ['--todo-bg-solid' as string]: list.theme.background_color ?? '#000000',
    ['--todo-font-family' as string]: withTodoFontFallback(list.theme.font_family),
    ['--todo-color-title' as string]: list.theme.color_title,
    ['--todo-color-group' as string]: list.theme.color_group,
    ['--todo-color-item' as string]: list.theme.color_item,
    ['--todo-panel-width' as string]: `${list.panel_width_percent}%`,
    ['--todo-panel-max-height' as string]: `${list.panel_max_height_percent}%`,
    ['--todo-animation-duration' as string]: `${list.animation_duration_ms}ms`,
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

/** Widen columns when there are few, so item text can use horizontal space before wrapping. */
export function todoColumnsStyle(columnCount: number): CSSProperties {
  const count = Math.max(1, columnCount);
  if (count === 1) {
    return { ['--todo-column-max' as string]: '100%' };
  }
  return {
    ['--todo-column-max' as string]: `min(28rem, calc(100% / ${count}))`,
  };
}

export function isTodoItemCompleted(completed: boolean | number | undefined | null): boolean {
  return completed === true || completed === 1;
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
