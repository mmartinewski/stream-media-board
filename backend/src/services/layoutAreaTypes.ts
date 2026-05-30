export type AnchorVertical = 'top' | 'middle' | 'bottom';
export type AnchorHorizontal = 'left' | 'center' | 'right';

export interface LayoutAreaDto {
  id: number;
  name: string;
  sort_order: number;
  anchor_vertical: AnchorVertical;
  anchor_horizontal: AnchorHorizontal;
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  max_width_percent: number;
  max_height_percent: number;
  is_fullscreen: number;
  created_at?: string;
}

export interface LayoutAreaInput {
  name: string;
  sort_order?: number;
  anchor_vertical: AnchorVertical;
  anchor_horizontal: AnchorHorizontal;
  margin_top?: number;
  margin_right?: number;
  margin_bottom?: number;
  margin_left?: number;
  max_width_percent?: number;
  max_height_percent?: number;
  is_fullscreen?: number;
}
