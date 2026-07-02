import { randomBytes } from 'node:crypto';
import type { Database as BetterDatabase } from 'better-sqlite3';
import { HttpError } from '../../middleware/errorHandler.js';
import { TWITCH_BROADCAST_SCOPE } from '../../services/twitchTypes.js';
import type { TwitchIntegrationConfigPublic } from '../../services/twitchTypes.js';

const KEY_CLIENT_ID = 'integration.twitch.client_id';
const KEY_CLIENT_SECRET = 'integration.twitch.client_secret';
const KEY_ACCESS_TOKEN = 'integration.twitch.access_token';
const KEY_REFRESH_TOKEN = 'integration.twitch.refresh_token';
const KEY_EXPIRES_AT = 'integration.twitch.expires_at';
const KEY_BROADCASTER_ID = 'integration.twitch.broadcaster_id';
const KEY_BROADCASTER_LOGIN = 'integration.twitch.broadcaster_login';
const KEY_BROADCASTER_DISPLAY_NAME = 'integration.twitch.broadcaster_display_name';
const KEY_OAUTH_STATE = 'integration.twitch.oauth_state';
const KEY_OAUTH_RETURN_TO = 'integration.twitch.oauth_return_to';
const KEY_DEVICE_CODE = 'integration.twitch.device_code';
const KEY_DEVICE_SCOPES = 'integration.twitch.device_scopes';

function getAppSetting(db: BetterDatabase, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setAppSetting(db: BetterDatabase, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function deleteAppSetting(db: BetterDatabase, key: string): void {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

export function getTwitchClientId(db: BetterDatabase): string | null {
  const value = getAppSetting(db, KEY_CLIENT_ID)?.trim();
  return value ? value : null;
}

export function getTwitchClientSecret(db: BetterDatabase): string | null {
  const value = getAppSetting(db, KEY_CLIENT_SECRET)?.trim();
  return value ? value : null;
}

export function getTwitchIntegrationPublic(db: BetterDatabase): TwitchIntegrationConfigPublic {
  const clientId = getTwitchClientId(db);
  const accessToken = getAppSetting(db, KEY_ACCESS_TOKEN)?.trim();
  return {
    client_id_configured: clientId !== null,
    connected: Boolean(accessToken && getAppSetting(db, KEY_BROADCASTER_ID)),
    broadcaster_login: getAppSetting(db, KEY_BROADCASTER_LOGIN),
    broadcaster_display_name: getAppSetting(db, KEY_BROADCASTER_DISPLAY_NAME),
  };
}

export function updateTwitchIntegrationConfig(
  db: BetterDatabase,
  input: {
    client_id?: string;
    client_secret?: string;
    remove_client_secret?: boolean;
  },
): TwitchIntegrationConfigPublic {
  if (input.client_id !== undefined) {
    const trimmed = input.client_id.trim();
    if (!trimmed) {
      throw new HttpError(400, 'Twitch Client ID is required.', 'twitch_client_id_required');
    }
    setAppSetting(db, KEY_CLIENT_ID, trimmed);
  }
  if (input.remove_client_secret) {
    deleteAppSetting(db, KEY_CLIENT_SECRET);
  } else if (input.client_secret !== undefined) {
    const trimmed = input.client_secret.trim();
    if (!trimmed) {
      throw new HttpError(400, 'Twitch Client Secret cannot be empty.', 'twitch_client_secret_invalid');
    }
    setAppSetting(db, KEY_CLIENT_SECRET, trimmed);
  }
  return getTwitchIntegrationPublic(db);
}

export function createOAuthState(db: BetterDatabase): string {
  const state = randomBytes(24).toString('hex');
  setAppSetting(db, KEY_OAUTH_STATE, state);
  return state;
}

export function setOAuthReturnTo(db: BetterDatabase, returnTo: string): void {
  setAppSetting(db, KEY_OAUTH_RETURN_TO, returnTo);
}

export function consumeOAuthReturnTo(db: BetterDatabase): string {
  const value = getAppSetting(db, KEY_OAUTH_RETURN_TO);
  deleteAppSetting(db, KEY_OAUTH_RETURN_TO);
  return value ?? 'http://localhost:5173/settings/twitch-presets';
}

export function consumeOAuthState(db: BetterDatabase, state: string | undefined): void {
  const expected = getAppSetting(db, KEY_OAUTH_STATE);
  deleteAppSetting(db, KEY_OAUTH_STATE);
  if (!expected || !state || expected !== state) {
    throw new HttpError(400, 'Invalid OAuth state.', 'twitch_oauth_state_invalid');
  }
}

export function saveTwitchTokens(
  db: BetterDatabase,
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    broadcaster_id: string;
    broadcaster_login: string;
    broadcaster_display_name: string;
  },
): void {
  const expiresAt = String(Date.now() + tokens.expires_in * 1000);
  setAppSetting(db, KEY_ACCESS_TOKEN, tokens.access_token);
  setAppSetting(db, KEY_REFRESH_TOKEN, tokens.refresh_token);
  setAppSetting(db, KEY_EXPIRES_AT, expiresAt);
  setAppSetting(db, KEY_BROADCASTER_ID, tokens.broadcaster_id);
  setAppSetting(db, KEY_BROADCASTER_LOGIN, tokens.broadcaster_login);
  setAppSetting(db, KEY_BROADCASTER_DISPLAY_NAME, tokens.broadcaster_display_name);
}

export function clearTwitchDeviceAuth(db: BetterDatabase): void {
  deleteAppSetting(db, KEY_DEVICE_CODE);
  deleteAppSetting(db, KEY_DEVICE_SCOPES);
}

export function saveTwitchDeviceSession(
  db: BetterDatabase,
  deviceCode: string,
  scopes: string,
): void {
  setAppSetting(db, KEY_DEVICE_CODE, deviceCode);
  setAppSetting(db, KEY_DEVICE_SCOPES, scopes);
}

export function getTwitchDeviceSession(db: BetterDatabase): {
  deviceCode: string | null;
  scopes: string;
} {
  return {
    deviceCode: getAppSetting(db, KEY_DEVICE_CODE),
    scopes: getAppSetting(db, KEY_DEVICE_SCOPES) ?? TWITCH_BROADCAST_SCOPE,
  };
}

export function clearTwitchConnection(db: BetterDatabase): void {
  deleteAppSetting(db, KEY_ACCESS_TOKEN);
  deleteAppSetting(db, KEY_REFRESH_TOKEN);
  deleteAppSetting(db, KEY_EXPIRES_AT);
  deleteAppSetting(db, KEY_BROADCASTER_ID);
  deleteAppSetting(db, KEY_BROADCASTER_LOGIN);
  deleteAppSetting(db, KEY_BROADCASTER_DISPLAY_NAME);
  deleteAppSetting(db, KEY_OAUTH_STATE);
  deleteAppSetting(db, KEY_OAUTH_RETURN_TO);
  clearTwitchDeviceAuth(db);
}

export function getTwitchAuthCredentials(db: BetterDatabase): {
  clientId: string;
  clientSecret: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  broadcasterId: string | null;
} {
  const expiresRaw = getAppSetting(db, KEY_EXPIRES_AT);
  const expiresAt = expiresRaw ? Number(expiresRaw) : null;
  return {
    clientId: getTwitchClientId(db) ?? '',
    clientSecret: getTwitchClientSecret(db),
    accessToken: getAppSetting(db, KEY_ACCESS_TOKEN),
    refreshToken: getAppSetting(db, KEY_REFRESH_TOKEN),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    broadcasterId: getAppSetting(db, KEY_BROADCASTER_ID),
  };
}

export function updateAccessToken(
  db: BetterDatabase,
  accessToken: string,
  expiresIn: number,
  refreshToken?: string,
): void {
  setAppSetting(db, KEY_ACCESS_TOKEN, accessToken);
  setAppSetting(db, KEY_EXPIRES_AT, String(Date.now() + expiresIn * 1000));
  if (refreshToken) {
    setAppSetting(db, KEY_REFRESH_TOKEN, refreshToken);
  }
}
