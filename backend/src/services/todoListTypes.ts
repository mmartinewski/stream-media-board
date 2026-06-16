export const TODO_ANIMATIONS = [
  'fade',
  'slide_top',
  'slide_bottom',
  'slide_left',
  'slide_right',
] as const;

export type TodoAnimationId = (typeof TODO_ANIMATIONS)[number];

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

export const TODO_FONT_SIZES = ['tiny', 'small', 'medium', 'large'] as const;

export type TodoFontSizeId = (typeof TODO_FONT_SIZES)[number];

export const TODO_PANEL_ANCHOR_VERTICALS = ['top', 'middle', 'bottom'] as const;
export const TODO_PANEL_ANCHOR_HORIZONTALS = ['left', 'center', 'right'] as const;

export type TodoPanelAnchorVertical = (typeof TODO_PANEL_ANCHOR_VERTICALS)[number];
export type TodoPanelAnchorHorizontal = (typeof TODO_PANEL_ANCHOR_HORIZONTALS)[number];

export const TODO_TITLE_ALIGNS = ['left', 'center', 'right'] as const;

export type TodoTitleAlign = (typeof TODO_TITLE_ALIGNS)[number];

export interface TodoListThemeDto {
  background_url: string | null;
  background_mode: TodoBackgroundMode;
  background_color: string;
  font_family: string;
  font_size: TodoFontSizeId;
  title_font_size: TodoFontSizeId;
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
  background_blur_px: number;
  /** Seconds before auto-hide; null or 0 = stay until manual hide. */
  max_display_seconds: number | null;
  /** Show on overlay when an item completed flag changes. */
  auto_show_on_item_update: boolean;
  columns: TodoColumnDto[];
}

export type TodoListOverlayDto = TodoListDetailDto;

export interface TodoListInput {
  name?: string;
  title: string;
  sort_order?: number;
  font_family?: string;
  font_size?: TodoFontSizeId;
  title_font_size?: TodoFontSizeId;
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

export interface TodoColumnInput {
  sort_order?: number;
  visible?: boolean;
}

export interface TodoGroupInput {
  title?: string;
  sort_order?: number;
  column_id?: number;
  visible?: boolean;
}

export interface TodoItemInput {
  title?: string;
  sort_order?: number;
  completed?: boolean;
  group_id?: number;
}

export function parseTodoAnimation(raw: unknown, fallback: TodoAnimationId): TodoAnimationId {
  if (typeof raw === 'string' && (TODO_ANIMATIONS as readonly string[]).includes(raw)) {
    return raw as TodoAnimationId;
  }
  return fallback;
}

export function parseCssColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return fallback;
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  if (/^rgba?\([^)]+\)$/.test(trimmed)) return trimmed;
  if (/^hsla?\([^)]+\)$/.test(trimmed)) return trimmed;
  return fallback;
}

export function parseListName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return fallback;
  if (/[<>]/.test(trimmed)) return fallback;
  return trimmed;
}

export function parseFontFamily(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return fallback;
  // Allow quoted multi-word family names; block HTML/CSS injection vectors.
  if (/[<>;{}\\]|url\s*\(/i.test(trimmed)) return fallback;
  return trimmed;
}

export function parsePercent(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return fallback;
  return Math.round(n * 100) / 100;
}

export function parseOpacityPercent(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return Math.round(n * 100) / 100;
}

/** Inner panel content padding as % of panel width (matches former 2rem / 1.5rem at typical widths). */
export function parsePanelPaddingPercent(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 30) return fallback;
  return Math.round(n * 100) / 100;
}

/** Alternating checklist row shade; 0 = off, max 50. */
export function parseItemZebraOpacityPercent(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 50) return fallback;
  return Math.round(n * 100) / 100;
}

export function parseTodoFontSize(raw: unknown, fallback: TodoFontSizeId = 'medium'): TodoFontSizeId {
  if (typeof raw === 'string' && (TODO_FONT_SIZES as readonly string[]).includes(raw)) {
    return raw as TodoFontSizeId;
  }
  return fallback;
}

export function parseBackgroundMode(raw: unknown, fallback: TodoBackgroundMode): TodoBackgroundMode {
  if (typeof raw === 'string' && (TODO_BACKGROUND_MODES as readonly string[]).includes(raw)) {
    return raw as TodoBackgroundMode;
  }
  return fallback;
}

export function parsePanelAnchorVertical(
  raw: unknown,
  fallback: TodoPanelAnchorVertical,
): TodoPanelAnchorVertical {
  if (typeof raw === 'string' && (TODO_PANEL_ANCHOR_VERTICALS as readonly string[]).includes(raw)) {
    return raw as TodoPanelAnchorVertical;
  }
  return fallback;
}

export function parsePanelAnchorHorizontal(
  raw: unknown,
  fallback: TodoPanelAnchorHorizontal,
): TodoPanelAnchorHorizontal {
  if (
    typeof raw === 'string' &&
    (TODO_PANEL_ANCHOR_HORIZONTALS as readonly string[]).includes(raw)
  ) {
    return raw as TodoPanelAnchorHorizontal;
  }
  return fallback;
}

export function parseTitleAlign(raw: unknown, fallback: TodoTitleAlign = 'center'): TodoTitleAlign {
  if (typeof raw === 'string' && (TODO_TITLE_ALIGNS as readonly string[]).includes(raw)) {
    return raw as TodoTitleAlign;
  }
  return fallback;
}

export function parseDurationMs(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 100 || n > 10_000) return fallback;
  return Math.round(n);
}

/** Overlay auto-hide duration; null/0 = unlimited. */
export function parseMaxDisplaySeconds(
  raw: unknown,
  fallback: number | null = null,
): number | null {
  if (raw === null || raw === '' || raw === undefined) return fallback;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 3600) return 3600;
  return Math.round(n);
}

export function parseAutoShowOnItemUpdate(raw: unknown, fallback: boolean): boolean {
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false;
  return fallback;
}

export function parseVisibleFlag(raw: unknown, fallback: boolean): boolean {
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false;
  return fallback;
}
