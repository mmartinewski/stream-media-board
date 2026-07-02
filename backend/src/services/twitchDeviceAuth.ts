import { HttpError } from '../middleware/errorHandler.js';
import { TWITCH_BROADCAST_SCOPE } from './twitchTypes.js';

const DEVICE_URL = 'https://id.twitch.tv/oauth2/device';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

export interface TwitchDeviceStartResult {
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function startTwitchDeviceAuth(
  clientId: string,
  scopes: string = TWITCH_BROADCAST_SCOPE,
): Promise<TwitchDeviceStartResult & { device_code: string }> {
  const params = new URLSearchParams({
    client_id: clientId,
    scopes,
  });
  const res = await fetch(DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HttpError(502, `Twitch device auth failed: ${text}`, 'twitch_device_start_failed');
  }
  const data = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };
  return data;
}

export type TwitchDevicePollResult =
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | {
      status: 'connected';
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }
  | { status: 'error'; message: string };

export async function pollTwitchDeviceToken(
  clientId: string,
  clientSecret: string | null,
  deviceCode: string,
  scopes: string,
): Promise<TwitchDevicePollResult> {
  const params = new URLSearchParams({
    client_id: clientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    scopes,
  });
  if (clientSecret) {
    params.set('client_secret', clientSecret);
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (res.ok) {
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      status: 'connected',
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  }

  let message = res.statusText;
  try {
    const body = (await res.json()) as { message?: string };
    message = body.message ?? message;
  } catch {
    /* noop */
  }

  const normalized = message.toLowerCase();
  if (normalized.includes('authorization_pending')) {
    return { status: 'pending' };
  }
  if (normalized.includes('slow_down')) {
    return { status: 'slow_down', interval: 10 };
  }
  if (
    normalized.includes('access_denied') ||
    normalized.includes('expired') ||
    normalized.includes('invalid device')
  ) {
    return { status: 'error', message };
  }

  throw new HttpError(502, `Twitch device poll failed: ${message}`, 'twitch_device_poll_failed');
}
