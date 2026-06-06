import type { TodoListInput } from './todoOverlay';
import { TODO_FONT_SIZE_DEFAULT } from './todoFontSize';
import { TODO_FONT_SYSTEM_FALLBACK } from './todoFontOptions';

const AUTO_SAVE_STORAGE_KEY = 'checklist-editor-auto-save';

export function readChecklistEditorAutoSave(): boolean {
  try {
    const stored = localStorage.getItem(AUTO_SAVE_STORAGE_KEY);
    if (stored === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export function writeChecklistEditorAutoSave(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SAVE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

/** Stable snapshot for comparing unsaved list settings in the editor. */
export function serializeTodoListForm(form: TodoListInput): string {
  return JSON.stringify({
    name: form.name ?? '',
    title: form.title,
    sort_order: form.sort_order ?? 0,
    font_family: form.font_family ?? TODO_FONT_SYSTEM_FALLBACK,
    font_size: form.font_size ?? TODO_FONT_SIZE_DEFAULT,
    title_font_size: form.title_font_size ?? form.font_size ?? TODO_FONT_SIZE_DEFAULT,
    title_align: form.title_align ?? 'center',
    color_title: form.color_title ?? '',
    color_group: form.color_group ?? '',
    color_item: form.color_item ?? '',
    enter_animation: form.enter_animation ?? 'fade',
    exit_animation: form.exit_animation ?? 'fade',
    animation_duration_ms: form.animation_duration_ms ?? 400,
    panel_width_percent: form.panel_width_percent ?? 80,
    panel_max_height_percent: form.panel_max_height_percent ?? 90,
    panel_anchor_vertical: form.panel_anchor_vertical ?? 'top',
    panel_anchor_horizontal: form.panel_anchor_horizontal ?? 'left',
    panel_padding_x_percent: form.panel_padding_x_percent ?? 8,
    panel_padding_y_percent: form.panel_padding_y_percent ?? 6,
    panel_inset_x_percent: form.panel_inset_x_percent ?? 2,
    panel_inset_y_percent: form.panel_inset_y_percent ?? 2,
    item_zebra_opacity_percent: form.item_zebra_opacity_percent ?? 24,
    background_opacity_percent: form.background_opacity_percent ?? 45,
    background_mode: form.background_mode ?? 'image',
    background_color: form.background_color ?? '#000000',
  });
}
