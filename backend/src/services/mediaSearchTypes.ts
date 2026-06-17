export type MediaSearchProviderId = 'giphy' | 'imported';

export type GiphyContentRating = 'g' | 'pg' | 'pg-13' | 'r';

export interface MediaSearchAnalyticsUrls {
  onload: string;
  onclick: string;
  onsent: string;
}

export interface MediaSearchResult {
  provider: MediaSearchProviderId;
  externalId: string;
  title: string;
  previewUrl: string;
  playUrl: string;
  width: number;
  height: number;
  isAnimated: boolean;
  tags?: string[];
  analytics?: MediaSearchAnalyticsUrls;
  cached?: boolean;
}

export interface MediaSearchPagination {
  offset: number;
  count: number;
  totalCount: number;
}

export interface MediaSearchResponse {
  results: MediaSearchResult[];
  pagination: MediaSearchPagination;
}

export interface GiphyIntegrationSettingsPublic {
  giphy_api_key_configured: boolean;
  enabled: boolean;
  static_display_seconds: number;
  minimum_display_seconds: number;
  rating: GiphyContentRating;
  customer_id: string | null;
}

export interface GiphyIntegrationSettingsUpdate {
  api_key?: string;
  enabled?: boolean;
  static_display_seconds?: number;
  minimum_display_seconds?: number;
  rating?: string;
  remove_api_key?: boolean;
}
