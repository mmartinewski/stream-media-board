import type { CSSProperties } from 'react';

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
}

export interface VideoSlotLayout {
  slotStyle: CSSProperties;
  videoObjectFit: 'fill' | 'cover';
}

/** Sample aspects used in the layout areas editor preview. */
export const LAYOUT_PREVIEW_ASPECTS = {
  landscape: { videoW: 16, videoH: 9, label: '16:9' },
  portrait: { videoW: 9, videoH: 16, label: '9:16' },
} as const;

export type LayoutPreviewSlotVariant = 'edit-landscape' | 'edit-portrait' | 'map-landscape' | 'map-portrait';

export function toPreviewLayoutArea(
  form: Omit<LayoutAreaDto, 'id' | 'created_at' | 'sort_order'> & { id?: number },
): LayoutAreaDto {
  return {
    id: form.id ?? 0,
    name: form.name,
    sort_order: 0,
    anchor_vertical: form.anchor_vertical,
    anchor_horizontal: form.anchor_horizontal,
    margin_top: form.margin_top,
    margin_right: form.margin_right,
    margin_bottom: form.margin_bottom,
    margin_left: form.margin_left,
    max_width_percent: form.max_width_percent,
    max_height_percent: form.max_height_percent,
    is_fullscreen: form.is_fullscreen,
  };
}

export function computeVideoSlotLayout(
  stageW: number,
  stageH: number,
  area: LayoutAreaDto,
  videoW: number,
  videoH: number,
): VideoSlotLayout {
  if (stageW <= 0 || stageH <= 0) {
    return {
      slotStyle: { position: 'absolute', inset: 0 },
      videoObjectFit: 'cover',
    };
  }

  if (area.is_fullscreen === 1) {
    return {
      slotStyle: { position: 'absolute', inset: 0 },
      videoObjectFit: 'cover',
    };
  }

  const safeVideoW = videoW > 0 ? videoW : 16;
  const safeVideoH = videoH > 0 ? videoH : 9;
  const aspect = safeVideoW / safeVideoH;

  const maxW = (stageW * area.max_width_percent) / 100;
  const maxH = (stageH * area.max_height_percent) / 100;

  let slotH = maxH;
  let slotW = slotH * aspect;
  if (slotW > maxW) {
    slotW = maxW;
    slotH = slotW / aspect;
  }

  const mt = (stageH * area.margin_top) / 100;
  const mr = (stageW * area.margin_right) / 100;
  const mb = (stageH * area.margin_bottom) / 100;
  const ml = (stageW * area.margin_left) / 100;

  const base: CSSProperties = {
    position: 'absolute',
    width: `${slotW}px`,
    height: `${slotH}px`,
  };

  const { anchor_vertical: v, anchor_horizontal: h } = area;

  if (v === 'top' && h === 'left') {
    return { slotStyle: { ...base, top: mt, left: ml }, videoObjectFit: 'fill' };
  }
  if (v === 'top' && h === 'right') {
    return { slotStyle: { ...base, top: mt, right: mr }, videoObjectFit: 'fill' };
  }
  if (v === 'top' && h === 'center') {
    return {
      slotStyle: { ...base, top: mt, left: '50%', transform: 'translateX(-50%)' },
      videoObjectFit: 'fill',
    };
  }
  if (v === 'bottom' && h === 'left') {
    return { slotStyle: { ...base, bottom: mb, left: ml }, videoObjectFit: 'fill' };
  }
  if (v === 'bottom' && h === 'right') {
    return { slotStyle: { ...base, bottom: mb, right: mr }, videoObjectFit: 'fill' };
  }
  if (v === 'bottom' && h === 'center') {
    return {
      slotStyle: { ...base, bottom: mb, left: '50%', transform: 'translateX(-50%)' },
      videoObjectFit: 'fill',
    };
  }
  if (v === 'middle' && h === 'left') {
    return {
      slotStyle: { ...base, top: '50%', left: ml, transform: 'translateY(-50%)' },
      videoObjectFit: 'fill',
    };
  }
  if (v === 'middle' && h === 'right') {
    return {
      slotStyle: { ...base, top: '50%', right: mr, transform: 'translateY(-50%)' },
      videoObjectFit: 'fill',
    };
  }

  return {
    slotStyle: {
      ...base,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    },
    videoObjectFit: 'fill',
  };
}
