import type { ClipDto, LayoutAreaDto, LayoutSettingsResponse } from './api';

export function resolvePlayLayoutAreaId(
  clip: ClipDto,
  settings: LayoutSettingsResponse | null,
  areas: LayoutAreaDto[],
): number | undefined {
  if (areas.length === 0) return undefined;
  if (
    clip.default_layout_area_id != null &&
    areas.some((a) => a.id === clip.default_layout_area_id)
  ) {
    return clip.default_layout_area_id;
  }
  if (!settings) return areas[0]?.id;
  const orient = clip.video_orientation ?? 'landscape';
  const fromSettings =
    orient === 'portrait'
      ? settings.layout_area_id_portrait
      : settings.layout_area_id_landscape;
  if (fromSettings != null && areas.some((a) => a.id === fromSettings)) {
    return fromSettings;
  }
  return areas[0]?.id;
}
