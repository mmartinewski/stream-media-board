import type { Database as BetterDatabase } from 'better-sqlite3';
import { HttpError } from '../middleware/errorHandler.js';
import {
  getTwitchAuthCredentials,
  updateAccessToken,
} from '../db/repositories/twitchSettings.js';
import type {
  TwitchCategoryResult,
  TwitchChannelInfo,
  TwitchChannelUpdatePayload,
  TwitchContentClassificationLabel,
} from './twitchTypes.js';

const HELIX_BASE = 'https://api.twitch.tv/helix';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

interface HelixRequestInit {
  method?: string;
  body?: unknown;
}

async function refreshTwitchToken(
  db: BetterDatabase,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HttpError(
      502,
      `Failed to refresh Twitch token: ${text || res.statusText}`,
      'twitch_token_refresh_failed',
    );
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  updateAccessToken(db, data.access_token, data.expires_in, data.refresh_token);
  return data.access_token;
}

async function getAccessToken(db: BetterDatabase): Promise<{
  clientId: string;
  accessToken: string;
  broadcasterId: string;
}> {
  const creds = getTwitchAuthCredentials(db);
  if (!creds.clientId) {
    throw new HttpError(400, 'Twitch Client ID is not configured.', 'twitch_not_configured');
  }
  if (!creds.accessToken || !creds.broadcasterId) {
    throw new HttpError(401, 'Twitch account is not connected.', 'twitch_not_connected');
  }

  let accessToken = creds.accessToken;
  const expiresSoon =
    creds.expiresAt !== null && creds.expiresAt - Date.now() < 5 * 60 * 1000;
  if (expiresSoon && creds.refreshToken) {
    if (!creds.clientSecret) {
      throw new HttpError(
        400,
        'Twitch Client Secret is required to refresh the token.',
        'twitch_client_secret_required',
      );
    }
    accessToken = await refreshTwitchToken(
      db,
      creds.clientId,
      creds.clientSecret,
      creds.refreshToken,
    );
  }

  return {
    clientId: creds.clientId,
    accessToken,
    broadcasterId: creds.broadcasterId,
  };
}

async function helixRequest<T>(
  db: BetterDatabase,
  path: string,
  init: HelixRequestInit = {},
): Promise<T> {
  const { clientId, accessToken } = await getAccessToken(db);
  const res = await fetch(`${HELIX_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const errBody = (await res.json()) as { message?: string };
      message = errBody.message ?? message;
    } catch {
      /* noop */
    }
    throw new HttpError(
      res.status >= 400 && res.status < 500 ? res.status : 502,
      `Twitch API error: ${message}`,
      'twitch_api_error',
    );
  }

  return (await res.json()) as T;
}

export async function searchTwitchCategories(
  db: BetterDatabase,
  query: string,
): Promise<TwitchCategoryResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const data = await helixRequest<{
    data: Array<{ id: string; name: string; box_art_url: string }>;
  }>(db, `/search/categories?query=${encodeURIComponent(trimmed)}&first=20`);
  return data.data.map((item) => ({
    id: item.id,
    name: item.name,
    box_art_url: item.box_art_url,
  }));
}

export async function getTwitchContentClassificationLabels(
  db: BetterDatabase,
): Promise<TwitchContentClassificationLabel[]> {
  const data = await helixRequest<{
    data: Array<{ id: string; name: string; description: string }>;
  }>(db, '/content_classification_labels');
  return data.data;
}

export async function getTwitchChannelInfo(db: BetterDatabase): Promise<TwitchChannelInfo> {
  const { broadcasterId } = await getAccessToken(db);
  const data = await helixRequest<{
    data: Array<{
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
    }>;
  }>(db, `/channels?broadcaster_id=${encodeURIComponent(broadcasterId)}`);

  const channel = data.data[0];
  if (!channel) {
    throw new HttpError(404, 'Twitch channel not found.', 'twitch_channel_not_found');
  }
  return {
    broadcaster_id: channel.broadcaster_id,
    broadcaster_login: channel.broadcaster_login,
    broadcaster_name: channel.broadcaster_name,
    broadcaster_language: channel.broadcaster_language,
    game_id: channel.game_id,
    game_name: channel.game_name,
    title: channel.title,
    tags: channel.tags ?? [],
    content_classification_labels: channel.content_classification_labels ?? [],
    is_branded_content: channel.is_branded_content ?? false,
  };
}

export async function updateTwitchChannel(
  db: BetterDatabase,
  payload: TwitchChannelUpdatePayload,
): Promise<void> {
  const { broadcasterId } = await getAccessToken(db);
  await helixRequest(
    db,
    `/channels?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
    { method: 'PATCH', body: payload },
  );
}

export async function isBroadcasterLive(db: BetterDatabase): Promise<boolean> {
  const { broadcasterId } = await getAccessToken(db);
  const data = await helixRequest<{ data: unknown[] }>(
    db,
    `/streams?user_id=${encodeURIComponent(broadcasterId)}`,
  );
  return data.data.length > 0;
}

export async function fetchTwitchUser(
  accessToken: string,
  clientId: string,
): Promise<{ id: string; login: string; display_name: string }> {
  const res = await fetch(`${HELIX_BASE}/users`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HttpError(502, `Failed to fetch Twitch user: ${text}`, 'twitch_user_fetch_failed');
  }
  const data = (await res.json()) as {
    data: Array<{ id: string; login: string; display_name: string }>;
  };
  const user = data.data[0];
  if (!user) {
    throw new HttpError(502, 'Twitch user not found in token response.', 'twitch_user_not_found');
  }
  return user;
}

export async function exchangeTwitchCode(
  clientId: string,
  clientSecret: string | null,
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret ?? '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HttpError(502, `Twitch OAuth failed: ${text}`, 'twitch_oauth_failed');
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

export async function searchTwitchTagSuggestions(
  db: BetterDatabase,
  query: string,
  gameId?: string,
): Promise<string[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches = new Map<string, string>();

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || /\s/.test(trimmed) || trimmed.length > 25) return;
    const lower = trimmed.toLowerCase();
    if (lower.includes(needle)) {
      matches.set(lower, trimmed);
    }
  };

  if (gameId) {
    const streams = await helixRequest<{ data: Array<{ tags?: string[] }> }>(
      db,
      `/streams?game_id=${encodeURIComponent(gameId)}&first=100`,
    );
    for (const stream of streams.data) {
      for (const tag of stream.tags ?? []) addTag(tag);
    }
  }

  const channels = await helixRequest<{ data: Array<{ tags?: string[] }> }>(
    db,
    `/search/channels?query=${encodeURIComponent(query)}&first=100`,
  );
  for (const channel of channels.data) {
    for (const tag of channel.tags ?? []) addTag(tag);
  }

  return [...matches.values()]
    .sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aStarts = aLower.startsWith(needle) ? 0 : 1;
      const bStarts = bLower.startsWith(needle) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return aLower.localeCompare(bLower);
    })
    .slice(0, 25);
}
