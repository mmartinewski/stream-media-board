import { getDb } from '../db/connection.js';
import { resolvePaths } from '../config/paths.js';
import type { AlertDto } from './alertsHub.js';
import { playAlertMediaTrigger } from './alertMediaTriggerPlayback.js';
import { estimateAlertTriggerMediaDurationSec } from './alertTriggerMediaDuration.js';

export async function resolveAlertDisplayDurationSec(alert: AlertDto): Promise<number> {
  const paths = resolvePaths();
  const db = getDb(paths.databaseFile);
  const mediaSec = await estimateAlertTriggerMediaDurationSec(paths, db, alert.kind);
  if (mediaSec == null) return alert.durationSec;
  return Math.max(alert.durationSec, mediaSec);
}

export function playAlertMediaForShow(alert: AlertDto): void {
  const paths = resolvePaths();
  const db = getDb(paths.databaseFile);
  playAlertMediaTrigger(paths, db, alert.kind);
}
