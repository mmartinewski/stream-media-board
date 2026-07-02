import { resolvePaths } from '../config/paths.js';
import { resolvePort } from '../config/port.js';

/** Must match the OAuth Redirect URL registered in the Twitch Developer Console. */
export function getTwitchOAuthRedirectUri(): string {
  const paths = resolvePaths();
  const port = resolvePort(paths.configFile);
  return `http://localhost:${port}/api/integrations/twitch/callback`;
}

export function isAllowedOAuthReturnTo(returnTo: string): boolean {
  try {
    const parsed = new URL(returnTo);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function buildOAuthReturnUrl(
  returnTo: string,
  params: Record<string, string>,
): string {
  const url = new URL(returnTo);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
