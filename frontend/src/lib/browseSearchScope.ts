import { api, type ClipDto } from './api';
import { readBrowseSearchInCategoryOnly } from './browsePreferences';

/** URL override for browse search scope; falls back to localStorage when absent. */
export const IN_CATEGORY_SEARCH_PARAM = 'inCategory';

export function isInCategorySearch(params: URLSearchParams): boolean {
  const raw = params.get(IN_CATEGORY_SEARCH_PARAM);
  if (raw === '0') return false;
  if (raw === '1') return true;
  return readBrowseSearchInCategoryOnly();
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

export function buildBrowseQuerySuffix(
  search: string,
  searchInCategoryOnly: boolean,
): string {
  const params = new URLSearchParams();
  const query = search.trim();
  if (query) params.set('search', query);
  if (!searchInCategoryOnly) params.set(IN_CATEGORY_SEARCH_PARAM, '0');
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function filterCategoriesBySearch<T extends { name: string }>(
  categories: T[],
  search: string,
): T[] {
  const query = search.trim().toLocaleLowerCase('en');
  if (!query) return categories;
  return categories.filter((category) =>
    category.name.toLocaleLowerCase('en').includes(query),
  );
}

export function favoritesLabelMatchesSearch(search: string): boolean {
  const query = search.trim().toLocaleLowerCase('en');
  if (!query) return true;
  return 'favorites'.includes(query);
}
