import type { ClipDto, LayoutAreaDto } from './api';

export function formatClipCategories(clip: ClipDto): string {
  const names = clip.categories?.length
    ? clip.categories.map((category) => category.name)
    : clip.category.name
      ? [clip.category.name]
      : [];
  return names.length > 0 ? names.join(', ') : '(uncategorized)';
}

export function layoutAreaName(
  areaId: number | undefined,
  areas: LayoutAreaDto[],
): string | null {
  if (areaId == null) return null;
  return areas.find((a) => a.id === areaId)?.name ?? null;
}

export function toDownloadFilename(title: string): string {
  const safe = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return safe || 'clip';
}

export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of raw.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean)) {
    const key = tag.toLocaleLowerCase('en');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}
