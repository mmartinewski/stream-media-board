import type { LayoutAreaDto } from './layoutAreaTypes.js';

/** Built-in fallback when no rows exist in layout_areas (id 0 is not stored in SQLite). */
export const SYSTEM_LAYOUT_AREA: LayoutAreaDto = {
  id: 0,
  name: 'Fullscreen (system default)',
  sort_order: 0,
  anchor_vertical: 'middle',
  anchor_horizontal: 'center',
  margin_top: 0,
  margin_right: 0,
  margin_bottom: 0,
  margin_left: 0,
  max_width_percent: 100,
  max_height_percent: 100,
  is_fullscreen: 1,
};
