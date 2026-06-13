import { randomUUID } from 'node:crypto';
import type { Database as BetterDatabase } from 'better-sqlite3';
import { HttpError } from '../../middleware/errorHandler.js';
import type {
  GiphyContentRating,
  GiphyIntegrationSettingsPublic,
  GiphyIntegrationSettingsUpdate,
} from '../../services/mediaSearchTypes.js';

const KEY_API = 'integration.giphy.api_key';
const KEY_ENABLED = 'integration.giphy.enabled';
const KEY_STATIC_SECONDS = 'media_search.static_display_seconds';
const KEY_MINIMUM_SECONDS = 'media_search.minimum_display_seconds';
const KEY_RATING = 'media_search.rating';
const KEY_CUSTOMER_ID = 'media_search.customer_id';

const DEFAULT_STATIC_SECONDS = 3;
const DEFAULT_MINIMUM_SECONDS = 3;
const DEFAULT_RATING: GiphyContentRating = 'pg-13';
const RATING_SET = new Set<string>(['g', 'pg', 'pg-13', 'r']);

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

export function getGiphyApiKey(db: BetterDatabase): string | null {
  const value = getAppSetting(db, KEY_API)?.trim();
  return value ? value : null;
}

function parseRating(raw: string | null): GiphyContentRating {
  if (raw && RATING_SET.has(raw)) return raw as GiphyContentRating;
  return DEFAULT_RATING;
}

function parseStaticSeconds(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_STATIC_SECONDS;
  return Math.max(1, Math.min(60, Math.round(parsed)));
}

function parseMinimumSeconds(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_MINIMUM_SECONDS;
  return Math.max(1, Math.min(60, Math.round(parsed)));
}

function isGiphyEnabled(db: BetterDatabase): boolean {
  const key = getGiphyApiKey(db);
  if (!key) return false;
  const raw = getAppSetting(db, KEY_ENABLED);
  if (raw === null) return true;
  return raw === '1';
}

function ensureCustomerId(db: BetterDatabase): string {
  const existing = getAppSetting(db, KEY_CUSTOMER_ID)?.trim();
  if (existing) return existing;
  const id = randomUUID().replace(/-/g, '');
  setAppSetting(db, KEY_CUSTOMER_ID, id);
  return id;
}

export function getGiphyIntegrationSettings(db: BetterDatabase): GiphyIntegrationSettingsPublic {
  const apiKeyConfigured = getGiphyApiKey(db) !== null;
  return {
    giphy_api_key_configured: apiKeyConfigured,
    enabled: isGiphyEnabled(db),
    static_display_seconds: parseStaticSeconds(getAppSetting(db, KEY_STATIC_SECONDS)),
    minimum_display_seconds: parseMinimumSeconds(getAppSetting(db, KEY_MINIMUM_SECONDS)),
    rating: parseRating(getAppSetting(db, KEY_RATING)),
    customer_id: getAppSetting(db, KEY_CUSTOMER_ID)?.trim() || null,
  };
}

export function updateGiphyIntegrationSettings(
  db: BetterDatabase,
  input: GiphyIntegrationSettingsUpdate,
): GiphyIntegrationSettingsPublic {
  if (input.remove_api_key === true) {
    deleteAppSetting(db, KEY_API);
    deleteAppSetting(db, KEY_ENABLED);
  }

  if (typeof input.api_key === 'string') {
    const trimmed = input.api_key.trim();
    if (trimmed) {
      setAppSetting(db, KEY_API, trimmed);
      ensureCustomerId(db);
      if (input.enabled === undefined && getAppSetting(db, KEY_ENABLED) === null) {
        setAppSetting(db, KEY_ENABLED, '1');
      }
    }
  }

  if (typeof input.enabled === 'boolean') {
    if (input.enabled && !getGiphyApiKey(db)) {
      throw new HttpError(
        400,
        'Configure a GIPHY API key before enabling the integration.',
        'giphy_api_key_required',
      );
    }
    setAppSetting(db, KEY_ENABLED, input.enabled ? '1' : '0');
  }

  if (input.static_display_seconds !== undefined) {
    const value = Number(input.static_display_seconds);
    if (!Number.isFinite(value)) {
      throw new HttpError(
        400,
        'static_display_seconds must be a number from 1 to 60.',
        'invalid_static_display_seconds',
      );
    }
    setAppSetting(db, KEY_STATIC_SECONDS, String(Math.max(1, Math.min(60, Math.round(value)))));
  }

  if (input.minimum_display_seconds !== undefined) {
    const value = Number(input.minimum_display_seconds);
    if (!Number.isFinite(value)) {
      throw new HttpError(
        400,
        'minimum_display_seconds must be a number from 1 to 60.',
        'invalid_minimum_display_seconds',
      );
    }
    setAppSetting(db, KEY_MINIMUM_SECONDS, String(Math.max(1, Math.min(60, Math.round(value)))));
  }

  if (input.rating !== undefined) {
    const normalized = String(input.rating).trim().toLowerCase();
    if (!RATING_SET.has(normalized)) {
      throw new HttpError(
        400,
        'rating must be one of: g, pg, pg-13, r.',
        'invalid_giphy_rating',
      );
    }
    setAppSetting(db, KEY_RATING, normalized);
  }

  if (getGiphyApiKey(db)) {
    ensureCustomerId(db);
  }

  return getGiphyIntegrationSettings(db);
}

export function assertGiphySearchReady(db: BetterDatabase): {
  apiKey: string;
  rating: GiphyContentRating;
  customerId: string;
} {
  const apiKey = getGiphyApiKey(db);
  if (!apiKey) {
    throw new HttpError(
      503,
      'GIPHY API key is not configured.',
      'giphy_not_configured',
    );
  }
  if (!isGiphyEnabled(db)) {
    throw new HttpError(503, 'GIPHY integration is disabled.', 'giphy_disabled');
  }
  const settings = getGiphyIntegrationSettings(db);
  const customerId = ensureCustomerId(db);
  return { apiKey, rating: settings.rating, customerId };
}
