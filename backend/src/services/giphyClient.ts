import { HttpError } from '../middleware/errorHandler.js';
import type {
  GiphyContentRating,
  MediaSearchPagination,
  MediaSearchProviderId,
  MediaSearchResponse,
  MediaSearchResult,
} from './mediaSearchTypes.js';

const GIPHY_SEARCH_URL = 'https://api.giphy.com/v1/gifs/search';
const GIPHY_GIF_URL = 'https://api.giphy.com/v1/gifs';
const SEARCH_LIMIT_DEFAULT = 25;
const SEARCH_LIMIT_MAX = 50;

const GIPHY_ANALYTICS_HOSTS = new Set(['giphy-analytics.giphy.com', 'pingback.giphy.com']);

interface GiphyImageRendition {
  url?: string;
  mp4?: string;
  width?: string;
  height?: string;
}

interface GiphyGifObject {
  id: string;
  title?: string;
  tags?: string[];
  images?: {
    fixed_width_small?: GiphyImageRendition;
    fixed_width?: GiphyImageRendition;
    preview_gif?: GiphyImageRendition;
    original?: GiphyImageRendition;
    original_still?: GiphyImageRendition;
  };
  analytics?: {
    onload?: { url?: string };
    onclick?: { url?: string };
    onsent?: { url?: string };
  };
}

interface GiphySearchResponse {
  data?: GiphyGifObject[];
  pagination?: {
    offset?: number;
    count?: number;
    total_count?: number;
  };
  meta?: {
    status?: number;
    msg?: string;
  };
}

interface GiphySingleGifResponse {
  data?: GiphyGifObject;
  meta?: {
    status?: number;
    msg?: string;
  };
}

export interface GiphyLookupParams {
  apiKey: string;
  gifId: string;
  rating: GiphyContentRating;
  customerId: string;
}

export async function fetchGiphyGifById(params: GiphyLookupParams): Promise<MediaSearchResult> {
  const url = new URL(`${GIPHY_GIF_URL}/${encodeURIComponent(params.gifId)}`);
  url.searchParams.set('api_key', params.apiKey);
  url.searchParams.set('rating', params.rating);
  url.searchParams.set('customer_id', params.customerId);

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new HttpError(502, 'Could not reach the GIPHY API.', 'giphy_unreachable');
  }

  let payload: GiphySingleGifResponse;
  try {
    payload = (await response.json()) as GiphySingleGifResponse;
  } catch {
    throw new HttpError(502, 'Invalid response from the GIPHY API.', 'giphy_invalid_response');
  }

  const metaStatus = payload.meta?.status ?? response.status;
  if (metaStatus === 401 || response.status === 401) {
    throw new HttpError(401, 'GIPHY API key is invalid.', 'giphy_invalid_api_key');
  }
  if (metaStatus === 404 || response.status === 404) {
    throw new HttpError(404, 'GIF not found.', 'giphy_gif_not_found');
  }
  if (metaStatus === 429 || response.status === 429) {
    throw new HttpError(
      429,
      'GIPHY rate limit exceeded. Try again later or upgrade your API key.',
      'giphy_rate_limited',
    );
  }
  if (!response.ok || metaStatus !== 200 || !payload.data) {
    throw new HttpError(
      502,
      payload.meta?.msg ?? `GIPHY lookup failed (${response.status}).`,
      'giphy_lookup_failed',
    );
  }

  const normalized = normalizeGiphyResult(payload.data);
  if (!normalized) {
    throw new HttpError(502, 'GIPHY returned an unsupported GIF format.', 'giphy_unsupported_format');
  }
  return normalized;
}

export function parseGiphyExternalId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id) {
    throw new HttpError(400, 'external_id is required.', 'missing_external_id');
  }
  if (id.length > 64) {
    throw new HttpError(400, 'external_id is too long.', 'invalid_external_id');
  }
  return id;
}

const IMPORTED_EXTERNAL_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseImportedExternalId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id) {
    throw new HttpError(400, 'external_id is required.', 'missing_external_id');
  }
  if (!IMPORTED_EXTERNAL_ID_RE.test(id)) {
    throw new HttpError(400, 'external_id is invalid.', 'invalid_external_id');
  }
  return id;
}

export function parseMediaSearchExternalId(
  provider: MediaSearchProviderId,
  raw: unknown,
): string {
  return provider === 'imported' ? parseImportedExternalId(raw) : parseGiphyExternalId(raw);
}

export function parseMediaSearchProvider(raw: unknown): MediaSearchProviderId {
  const provider = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (provider === 'giphy') return 'giphy';
  if (provider === 'imported') return 'imported';
  throw new HttpError(400, 'Unsupported media search provider.', 'unsupported_provider');
}

export interface GiphySearchParams {
  apiKey: string;
  query: string;
  offset: number;
  limit: number;
  rating: GiphyContentRating;
  customerId: string;
}

export async function searchGiphy(params: GiphySearchParams): Promise<MediaSearchResponse> {
  const url = new URL(GIPHY_SEARCH_URL);
  url.searchParams.set('api_key', params.apiKey);
  url.searchParams.set('q', params.query);
  url.searchParams.set('offset', String(params.offset));
  url.searchParams.set('limit', String(params.limit));
  url.searchParams.set('rating', params.rating);
  url.searchParams.set('customer_id', params.customerId);
  url.searchParams.set('lang', 'en');

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new HttpError(502, 'Could not reach the GIPHY API.', 'giphy_unreachable');
  }

  let payload: GiphySearchResponse;
  try {
    payload = (await response.json()) as GiphySearchResponse;
  } catch {
    throw new HttpError(502, 'Invalid response from the GIPHY API.', 'giphy_invalid_response');
  }

  const metaStatus = payload.meta?.status ?? response.status;
  if (metaStatus === 401 || response.status === 401) {
    throw new HttpError(401, 'GIPHY API key is invalid.', 'giphy_invalid_api_key');
  }
  if (metaStatus === 403 || response.status === 403) {
    throw new HttpError(403, 'GIPHY API key is not authorized.', 'giphy_forbidden');
  }
  if (metaStatus === 429 || response.status === 429) {
    throw new HttpError(
      429,
      'GIPHY rate limit exceeded. Try again later or upgrade your API key.',
      'giphy_rate_limited',
    );
  }
  if (!response.ok || metaStatus !== 200) {
    throw new HttpError(
      502,
      payload.meta?.msg ?? `GIPHY search failed (${response.status}).`,
      'giphy_search_failed',
    );
  }

  const results = (payload.data ?? [])
    .map(normalizeGiphyResult)
    .filter((item): item is MediaSearchResult => item !== null);

  const pagination: MediaSearchPagination = {
    offset: payload.pagination?.offset ?? params.offset,
    count: payload.pagination?.count ?? results.length,
    totalCount: payload.pagination?.total_count ?? results.length,
  };

  return { results, pagination };
}

export function parseMediaSearchLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return SEARCH_LIMIT_DEFAULT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new HttpError(400, 'limit must be a positive integer.', 'invalid_limit');
  }
  return Math.min(limit, SEARCH_LIMIT_MAX);
}

export function parseMediaSearchOffset(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const offset = Number(raw);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new HttpError(400, 'offset must be a non-negative integer.', 'invalid_offset');
  }
  return Math.min(offset, 4999);
}

export function parseMediaSearchUserTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new HttpError(400, 'tags must be an array of strings.', 'invalid_media_search_tags');
  }
  const tags = raw
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
  if (tags.length > 50) {
    throw new HttpError(400, 'At most 50 tags are allowed.', 'too_many_media_search_tags');
  }
  for (const tag of tags) {
    if (tag.length > 50) {
      throw new HttpError(400, 'Each tag must be at most 50 characters.', 'media_search_tag_too_long');
    }
  }
  return tags;
}

export function parseMediaSearchOptionalQuery(raw: unknown): string {
  const query = typeof raw === 'string' ? raw.trim() : '';
  if (query.length > 50) {
    throw new HttpError(400, 'Search query must be at most 50 characters.', 'search_query_too_long');
  }
  return query;
}

export function parseMediaSearchLocal(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === '') return false;
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : String(raw).toLowerCase();
  return value === '1' || value === 'true' || value === 'local' || value === 'yes';
}

export function parseMediaSearchQuery(raw: unknown): string {
  const query = typeof raw === 'string' ? raw.trim() : '';
  if (!query) {
    throw new HttpError(400, 'Query parameter q is required.', 'missing_search_query');
  }
  if (query.length > 50) {
    throw new HttpError(400, 'Search query must be at most 50 characters.', 'search_query_too_long');
  }
  return query;
}

function normalizeGiphyResult(gif: GiphyGifObject): MediaSearchResult | null {
  const id = typeof gif.id === 'string' ? gif.id.trim() : '';
  if (!id) return null;

  const previewUrl = pickPreviewUrl(gif);
  const playSelection = pickPlayUrl(gif);
  if (!previewUrl || !playSelection) return null;

  const analytics = normalizeAnalytics(gif);
  if (!analytics) return null;

  return {
    provider: 'giphy',
    externalId: id,
    title: (gif.title ?? '').trim() || id,
    previewUrl,
    playUrl: playSelection.url,
    width: playSelection.width,
    height: playSelection.height,
    isAnimated: playSelection.isAnimated,
    tags: normalizeGiphyTags(gif),
    analytics,
  };
}

function normalizeGiphyTags(gif: GiphyGifObject): string[] {
  if (!Array.isArray(gif.tags)) return [];
  return gif.tags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
}

function pickPreviewUrl(gif: GiphyGifObject): string | null {
  const candidates = [
    gif.images?.fixed_width_small?.url,
    gif.images?.fixed_width?.url,
    gif.images?.preview_gif?.url,
    gif.images?.original_still?.url,
  ];
  for (const url of candidates) {
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  return null;
}

function pickPlayUrl(gif: GiphyGifObject): {
  url: string;
  width: number;
  height: number;
  isAnimated: boolean;
} | null {
  const mp4Candidates = [gif.images?.original, gif.images?.fixed_width];
  for (const rendition of mp4Candidates) {
    if (!rendition) continue;
    const mp4 = rendition.mp4?.trim();
    if (mp4) {
      return {
        url: mp4,
        width: parseDimension(rendition.width, 480),
        height: parseDimension(rendition.height, 270),
        isAnimated: true,
      };
    }
  }

  const still = gif.images?.original_still?.url?.trim();
  if (still) {
    return {
      url: still,
      width: parseDimension(gif.images?.original_still?.width, 480),
      height: parseDimension(gif.images?.original_still?.height, 270),
      isAnimated: false,
    };
  }

  return null;
}

function normalizeAnalytics(gif: GiphyGifObject): MediaSearchResult['analytics'] | null {
  const onload = gif.analytics?.onload?.url?.trim();
  const onclick = gif.analytics?.onclick?.url?.trim();
  const onsent = gif.analytics?.onsent?.url?.trim();
  if (!onload || !onclick || !onsent) return null;
  return { onload, onclick, onsent };
}

function parseDimension(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

export function parseGiphyAnalyticsUrl(raw: unknown): string {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) {
    throw new HttpError(400, 'Analytics url is required.', 'missing_analytics_url');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, 'Invalid analytics URL.', 'invalid_analytics_url');
  }
  if (parsed.protocol !== 'https:' || !GIPHY_ANALYTICS_HOSTS.has(parsed.hostname)) {
    throw new HttpError(400, 'Analytics URL is not from GIPHY.', 'invalid_analytics_url');
  }
  return url;
}

export async function sendGiphyAnalyticsPingback(url: string, customerId: string): Promise<void> {
  const parsed = new URL(url);
  parsed.searchParams.set('customer_id', customerId);
  parsed.searchParams.set('ts', String(Date.now()));

  let response: Response;
  try {
    response = await fetch(parsed.toString());
  } catch {
    throw new HttpError(502, 'Could not reach GIPHY analytics.', 'giphy_analytics_unreachable');
  }

  if (!response.ok) {
    throw new HttpError(
      502,
      `GIPHY analytics pingback failed (${response.status}).`,
      'giphy_analytics_failed',
    );
  }
}
