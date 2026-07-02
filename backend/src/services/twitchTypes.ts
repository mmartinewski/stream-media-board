export interface TwitchIntegrationConfigPublic {
  client_id_configured: boolean;
  connected: boolean;
  broadcaster_login: string | null;
  broadcaster_display_name: string | null;
}

export interface TwitchIntegrationConfigUpdate {
  client_id?: string;
  client_secret?: string;
  remove_client_secret?: boolean;
}

export interface TwitchCategoryResult {
  id: string;
  name: string;
  box_art_url: string;
}

export interface TwitchContentClassificationLabel {
  id: string;
  name: string;
  description: string;
}

export interface TwitchChannelInfo {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  broadcaster_language: string;
  game_id: string;
  game_name: string;
  title: string;
  tags: string[];
  content_classification_labels: string[];
  is_branded_content: boolean;
}

export interface TwitchStreamPresetDto {
  id: number;
  name: string;
  sort_order: number;
  title: string;
  game_id: string;
  game_name: string;
  game_box_art_url: string;
  tags: string[];
  broadcaster_language: string;
  content_classification_labels: string[];
  is_branded_content: boolean;
  created_at: string;
  updated_at: string;
}

export interface TwitchStreamPresetInput {
  name: string;
  sort_order?: number;
  title: string;
  game_id: string;
  game_name: string;
  game_box_art_url?: string;
  tags: string[];
  broadcaster_language: string;
  content_classification_labels: string[];
  is_branded_content: boolean;
}

export interface TwitchChannelUpdatePayload {
  title?: string;
  game_id?: string;
  tags?: string[];
  broadcaster_language?: string;
  content_classification_labels?: Array<{ id: string; is_enabled: boolean }>;
  is_branded_content?: boolean;
}

export const TWITCH_BROADCAST_SCOPE = 'channel:manage:broadcast';

export const TWITCH_STREAM_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh', label: '中文' },
  { code: 'other', label: 'Other' },
];
