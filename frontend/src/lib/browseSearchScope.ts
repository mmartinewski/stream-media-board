import { api, type ClipDto } from './api';

/** When absent or not "0", category/favorites browse search stays scoped to the current view. */
export const IN_CATEGORY_SEARCH_PARAM = 'inCategory';

export function isInCategorySearch(params: URLSearchParams): boolean {
  return params.get(IN_CATEGORY_SEARCH_PARAM) !== '0';
}

export function uniqueClips(clips: ClipDto[]): ClipDto[] {
  const seen = new Set<number>();
  const result: ClipDto[] = [];
  for (const clip of clips) {
    if (seen.has(clip.id)) continue;
    seen.add(clip.id);
    result.push(clip);
  }
  return result;
}

export async function fetchGlobalSearchClips(search: string): Promise<ClipDto[]> {
  const res = await api.getClips(search.trim() || undefined);
  return uniqueClips(res.sections.flatMap((section) => section.clips));
}
