import type { Database as BetterDatabase } from 'better-sqlite3';
import type { ClipRow } from '../db/repositories/clips.js';
import {
  getLayoutAreaById,
  getLayoutAreaIdSetting,
  listLayoutAreas,
} from '../db/repositories/layoutAreas.js';
import { resolveClipVideoOrientation } from './videoOrientation.js';
import type { LayoutAreaDto } from './layoutAreaTypes.js';
import { SYSTEM_LAYOUT_AREA } from './systemLayoutArea.js';

export function resolveLayoutAreaForClip(
  db: BetterDatabase,
  clip: ClipRow,
  requestedId: number | null | undefined,
): LayoutAreaDto {
  const id = resolveLayoutAreaId(db, clip, requestedId);
  if (id === 0) return SYSTEM_LAYOUT_AREA;
  const area = getLayoutAreaById(db, id);
  if (area) return area;
  return SYSTEM_LAYOUT_AREA;
}

function resolveLayoutAreaId(
  db: BetterDatabase,
  clip: ClipRow,
  requestedId: number | null | undefined,
): number {
  if (Number.isInteger(requestedId) && requestedId! > 0) {
    const area = getLayoutAreaById(db, requestedId!);
    if (area) return area.id;
  }

  const clipDefault = (clip as ClipRow & { default_layout_area_id?: number | null })
    .default_layout_area_id;
  if (Number.isInteger(clipDefault) && clipDefault! > 0) {
    const area = getLayoutAreaById(db, clipDefault!);
    if (area) return area.id;
  }

  const orientation = resolveClipVideoOrientation(
    clip.video_orientation,
    clip.video_width,
    clip.video_height,
  );
  const mappedId =
    orientation === 'portrait'
      ? getLayoutAreaIdSetting(db, 'layout_area_id_portrait')
      : getLayoutAreaIdSetting(db, 'layout_area_id_landscape');
  if (mappedId) return mappedId;

  const areas = listLayoutAreas(db);
  const fullscreen = areas.find((a) => a.is_fullscreen === 1);
  if (fullscreen) return fullscreen.id;
  if (areas[0]) return areas[0].id;

  return 0;
}
