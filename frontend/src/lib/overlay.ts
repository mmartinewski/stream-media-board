import type { BrowserSourceMode } from './videoOrientation';

/** Browser overlay page path (OBS / Streamlabs Browser Source). */
export const BROWSER_OVERLAY_PATH = '/overlay/browser';

export function getBrowserOverlayUrl(
  mode: BrowserSourceMode = 'universal',
  origin = window.location.origin,
): string {
  const base = `${origin.replace(/\/$/, '')}${BROWSER_OVERLAY_PATH}`;
  const params = new URLSearchParams({ mode });
  return `${base}?${params.toString()}`;
}

export function getBrowserSourceEventsUrl(mode: BrowserSourceMode): string {
  const params = new URLSearchParams({ mode });
  return `/api/browser-source/events?${params.toString()}`;
}
