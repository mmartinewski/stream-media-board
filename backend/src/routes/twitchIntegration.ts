import { Router, type NextFunction, type Request, type Response } from 'express';
import { resolvePaths } from '../config/paths.js';
import { getDb } from '../db/connection.js';
import {
  applyTwitchStreamPreset,
  createTwitchStreamPreset,
  deleteTwitchStreamPreset,
  duplicateTwitchStreamPreset,
  getTwitchStreamPresetById,
  listTwitchStreamPresets,
  parseTwitchStreamPresetInput,
  updateTwitchStreamPreset,
} from '../db/repositories/twitchPresets.js';
import {
  clearTwitchConnection,
  clearTwitchDeviceAuth,
  consumeOAuthReturnTo,
  consumeOAuthState,
  createOAuthState,
  getTwitchClientId,
  getTwitchClientSecret,
  getTwitchDeviceSession,
  getTwitchIntegrationPublic,
  saveTwitchDeviceSession,
  saveTwitchTokens,
  setOAuthReturnTo,
  updateTwitchIntegrationConfig,
} from '../db/repositories/twitchSettings.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  exchangeTwitchCode,
  fetchTwitchUser,
  getTwitchChannelInfo,
  getTwitchContentClassificationLabels,
  searchTwitchCategories,
  searchTwitchTagSuggestions,
} from '../services/twitchHelix.js';
import { getLockedContentLabelsForGame } from '../services/twitchLockedContentLabels.js';
import {
  pollTwitchDeviceToken,
  startTwitchDeviceAuth,
} from '../services/twitchDeviceAuth.js';
import {
  buildOAuthReturnUrl,
  getTwitchOAuthRedirectUri,
  isAllowedOAuthReturnTo,
} from '../services/twitchOAuthConfig.js';
import { TWITCH_BROADCAST_SCOPE } from '../services/twitchTypes.js';
import { logger } from '../lib/logger.js';

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';

export function twitchIntegrationRouter(): Router {
  const router = Router();
  const paths = resolvePaths();

  router.get('/status', (_req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    res.json(getTwitchIntegrationPublic(db));
  });

  router.put('/config', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const body = (req.body ?? {}) as {
        client_id?: string;
        client_secret?: string;
        remove_client_secret?: boolean;
      };
      const saved = updateTwitchIntegrationConfig(db, body);
      res.json(saved);
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth-url', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const clientId = getTwitchClientId(db);
      if (!clientId) {
        throw new HttpError(400, 'Configure Twitch Client ID first.', 'twitch_not_configured');
      }
      const state = createOAuthState(db);
      const returnTo = typeof req.query.return_to === 'string' ? req.query.return_to : '';
      if (returnTo && isAllowedOAuthReturnTo(returnTo)) {
        setOAuthReturnTo(db, returnTo);
      }
      const redirectUri = getTwitchOAuthRedirectUri();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: TWITCH_BROADCAST_SCOPE,
        state,
      });
      res.json({ url: `${TWITCH_AUTH_URL}?${params.toString()}` });
    } catch (err) {
      next(err);
    }
  });

  router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
    const db = getDb(paths.databaseFile);
    const returnTo = consumeOAuthReturnTo(db);
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      const oauthError = typeof req.query.error === 'string' ? req.query.error : null;

      if (oauthError) {
        res.redirect(buildOAuthReturnUrl(returnTo, { oauth_error: oauthError }));
        return;
      }
      if (!code) {
        throw new HttpError(400, 'Missing OAuth code.', 'twitch_oauth_code_missing');
      }

      consumeOAuthState(db, state);
      const clientId = getTwitchClientId(db);
      if (!clientId) {
        throw new HttpError(400, 'Twitch Client ID is not configured.', 'twitch_not_configured');
      }

      const clientSecret = getTwitchClientSecret(db);
      if (!clientSecret) {
        throw new HttpError(
          400,
          'Twitch Client Secret is not configured.',
          'twitch_client_secret_required',
        );
      }

      const redirectUri = getTwitchOAuthRedirectUri();
      logger.info(`twitch oauth callback: exchanging code (redirect_uri=${redirectUri})`);
      const tokens = await exchangeTwitchCode(clientId, clientSecret, code, redirectUri);
      const user = await fetchTwitchUser(tokens.access_token, clientId);
      saveTwitchTokens(db, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        broadcaster_id: user.id,
        broadcaster_login: user.login,
        broadcaster_display_name: user.display_name,
      });

      logger.info(`twitch oauth connected: ${user.login}`);
      res.redirect(buildOAuthReturnUrl(returnTo, { oauth: 'success' }));
    } catch (err) {
      const message =
        err instanceof HttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'OAuth failed';
      logger.error('twitch oauth callback failed', err);
      try {
        res.redirect(buildOAuthReturnUrl(returnTo, { oauth_error: message }));
      } catch {
        next(err);
      }
    }
  });

  router.post('/device/start', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const clientId = getTwitchClientId(db);
      if (!clientId) {
        throw new HttpError(400, 'Configure Twitch Client ID first.', 'twitch_not_configured');
      }
      const started = await startTwitchDeviceAuth(clientId, TWITCH_BROADCAST_SCOPE);
      saveTwitchDeviceSession(db, started.device_code, TWITCH_BROADCAST_SCOPE);
      res.json({
        user_code: started.user_code,
        verification_uri: started.verification_uri,
        expires_in: started.expires_in,
        interval: started.interval,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/device/poll', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const clientId = getTwitchClientId(db);
      if (!clientId) {
        throw new HttpError(400, 'Configure Twitch Client ID first.', 'twitch_not_configured');
      }
      const { deviceCode, scopes } = getTwitchDeviceSession(db);
      if (!deviceCode) {
        throw new HttpError(400, 'No device login in progress.', 'twitch_device_not_started');
      }

      const clientSecret = getTwitchClientSecret(db);
      const result = await pollTwitchDeviceToken(clientId, clientSecret, deviceCode, scopes);

      if (result.status === 'pending' || result.status === 'slow_down') {
        res.json(result);
        return;
      }

      if (result.status === 'error') {
        clearTwitchDeviceAuth(db);
        res.json(result);
        return;
      }

      const user = await fetchTwitchUser(result.access_token, clientId);
      saveTwitchTokens(db, {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_in: result.expires_in,
        broadcaster_id: user.id,
        broadcaster_login: user.login,
        broadcaster_display_name: user.display_name,
      });
      clearTwitchDeviceAuth(db);
      logger.info(`twitch device auth connected: ${user.login}`);
      res.json({
        status: 'connected',
        ...getTwitchIntegrationPublic(db),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (_req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    clearTwitchConnection(db);
    res.json({ ok: true });
  });

  router.get('/channel', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const channel = await getTwitchChannelInfo(db);
      res.json(channel);
    } catch (err) {
      next(err);
    }
  });

  router.get('/categories/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const categories = await searchTwitchCategories(db, q);
      res.json({ categories });
    } catch (err) {
      next(err);
    }
  });

  router.get('/tags/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const gameId = typeof req.query.game_id === 'string' ? req.query.game_id : '';
      const fromApi = await searchTwitchTagSuggestions(db, q, gameId || undefined);
      const needle = q.trim().toLowerCase();
      const fromPresets = listTwitchStreamPresets(db)
        .flatMap((preset) => preset.tags)
        .filter((tag) => tag.toLowerCase().includes(needle));
      const merged = new Map<string, string>();
      for (const tag of [...fromApi, ...fromPresets]) {
        merged.set(tag.toLowerCase(), tag);
      }
      const tags = [...merged.values()]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .slice(0, 25);
      res.json({ tags });
    } catch (err) {
      next(err);
    }
  });

  router.get('/content-labels', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const labels = await getTwitchContentClassificationLabels(db);
      res.json({ labels });
    } catch (err) {
      next(err);
    }
  });

  router.get('/content-labels/locked', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gameId = typeof req.query.game_id === 'string' ? req.query.game_id.trim() : '';
      if (!gameId) {
        throw new HttpError(400, 'game_id is required.', 'twitch_game_id_required');
      }
      const db = getDb(paths.databaseFile);
      const locked = await getLockedContentLabelsForGame(db, gameId);
      res.json({ locked });
    } catch (err) {
      next(err);
    }
  });

  router.get('/presets', (_req: Request, res: Response) => {
    const db = getDb(paths.databaseFile);
    res.json({ presets: listTwitchStreamPresets(db) });
  });

  router.get('/presets/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parsePresetId(req.params.id);
      const preset = getTwitchStreamPresetById(db, id);
      if (!preset) {
        throw new HttpError(404, 'Preset not found.', 'twitch_preset_not_found');
      }
      res.json(preset);
    } catch (err) {
      next(err);
    }
  });

  router.post('/presets', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const preset = createTwitchStreamPreset(db, parseTwitchStreamPresetInput(req.body));
      res.status(201).json(preset);
    } catch (err) {
      next(err);
    }
  });

  router.put('/presets/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parsePresetId(req.params.id);
      const preset = updateTwitchStreamPreset(db, id, parseTwitchStreamPresetInput(req.body));
      res.json(preset);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/presets/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parsePresetId(req.params.id);
      deleteTwitchStreamPreset(db, id);
      res.json({ status: 'deleted', id });
    } catch (err) {
      next(err);
    }
  });

  router.post('/presets/:id/duplicate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parsePresetId(req.params.id);
      const preset = duplicateTwitchStreamPreset(db, id);
      res.status(201).json(preset);
    } catch (err) {
      next(err);
    }
  });

  router.post('/presets/:id/apply', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb(paths.databaseFile);
      const id = parsePresetId(req.params.id);
      const preset = await applyTwitchStreamPreset(db, id);
      res.json({ ok: true, preset });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function parsePresetId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid preset ID.', 'twitch_preset_id_invalid');
  }
  return id;
}
