import type { Database as BetterDatabase } from 'better-sqlite3';
import {
  getLayoutAreaById,
  getLayoutAreaIdSetting,
  listLayoutAreas,
  parseOptionalLayoutAreaId,
} from '../db/repositories/layoutAreas.js';
import type { LayoutAreaDto } from './layoutAreaTypes.js';
import { SYSTEM_LAYOUT_AREA } from './systemLayoutArea.js';
import { deriveVideoOrientation } from './videoOrientation.js';

export function resolveLayoutAreaForMediaSearch(
  db: BetterDatabase,
  requestedId: number | null | undefined,
  width: number,
  height: number,
): LayoutAreaDto {
  const id = resolveMediaSearchLayoutAreaId(db, requestedId, width, height);
  if (id === 0) return SYSTEM_LAYOUT_AREA;
  const area = getLayoutAreaById(db, id);
  if (area) return area;
  return SYSTEM_LAYOUT_AREA;
}

function resolveMediaSearchLayoutAreaId(
  db: BetterDatabase,
  requestedId: number | null | undefined,
  width: number,
  height: number,
): number {
  const parsedRequest = parseOptionalLayoutAreaId(requestedId);
  if (parsedRequest !== null) {
    const area = getLayoutAreaById(db, parsedRequest);
    if (area) return area.id;
  }

  const orientation = deriveVideoOrientation(width, height);
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
