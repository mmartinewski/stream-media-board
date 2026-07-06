import {
  buildAlertMessage,
  DEFAULT_ALERT_DURATION_SEC,
  extractTemplateVars,
  type AlertKind,
} from './alertTemplates.js';
import type { AlertDto } from './alertsHub.js';
import { enqueueAlert } from './alertsHub.js';
import {
  normalizeStreamerBotPayload,
  resolveStreamerBotEventType,
} from './streamerBotNormalize.js';

function asRecord(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function resolveEventType(body: Record<string, unknown>): string | null {
  return resolveStreamerBotEventType(body);
}

const MAX_ALERT_DURATION_SEC = 30;

function resolveDurationSec(body: Record<string, unknown>): number {
  // Only explicit alert-duration fields — SB also sends `duration` for hype trains,
  // multi-month subs, etc. which must NOT control overlay display time.
  const raw = body.durationSec ?? body.duration_sec ?? body.alertDurationSec;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.min(raw, MAX_ALERT_DURATION_SEC);
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, MAX_ALERT_DURATION_SEC);
    }
  }
  return DEFAULT_ALERT_DURATION_SEC;
}

export function processStreamerBotWebhook(body: unknown): AlertDto | null {
  const record = asRecord(body);
  if (!record) return null;

  const normalized = normalizeStreamerBotPayload(record);
  const eventType = resolveEventType(normalized);
  if (!eventType) return null;

  const built = buildAlertMessage(eventType, normalized);
  const vars = extractTemplateVars({ ...normalized, eventType });

  const variables: Record<string, string | number | boolean> = {
    username: vars.username,
    sender: vars.sender,
    tierLabel: vars.tierLabel,
    months: vars.months,
    amount: vars.amount,
    bits: vars.bits,
    viewers: vars.viewers,
    rewardTitle: vars.rewardTitle,
    pointsSpent: vars.pointsSpent,
    level: vars.level,
  };
  if (vars.message) variables.message = vars.message;

  return enqueueAlert({
    kind: built.kind as AlertKind,
    title: built.title,
    subtitle: built.subtitle,
    durationSec: resolveDurationSec(normalized),
    eventType,
    variables,
  });
}

export function buildAlertFromTestRequest(body: unknown): AlertDto | null {
  const record = asRecord(body);
  if (!record) return null;

  if (typeof record.eventType === 'string' && record.eventType.trim()) {
    return processStreamerBotWebhook(record);
  }

  const kind = typeof record.kind === 'string' ? record.kind : 'sub';
  const testBody: Record<string, unknown> = {
    eventType: mapKindToEventType(kind),
    userName: record.userName ?? record.username ?? 'ViewerTeste',
    displayName: record.displayName ?? record.userName ?? record.username ?? 'ViewerTeste',
    subTier: record.subTier ?? '1000',
    months: record.months ?? 3,
    isPrime: kind === 'sub_prime' || record.isPrime === true,
    sender: record.sender ?? 'GifterTeste',
    recipient: record.recipient ?? record.recipientDisplayName,
    amount: record.amount ?? 5,
    bits: record.bits ?? 100,
    viewers: record.viewers ?? 42,
    rewardTitle: record.rewardTitle ?? 'Hidratar',
    pointsSpent: record.pointsSpent ?? 500,
    level: record.level ?? 3,
    message: record.message ?? '',
    durationSec: record.durationSec,
  };

  return processStreamerBotWebhook(testBody);
}

function mapKindToEventType(kind: string): string {
  const map: Record<string, string> = {
    follow: 'Twitch.Follow',
    sub: 'Twitch.Sub',
    sub_prime: 'Twitch.Sub',
    resub: 'Twitch.ReSub',
    gift_sub: 'Twitch.GiftSub',
    gift_bomb: 'Twitch.GiftBomb',
    pay_it_forward: 'Twitch.PayItForward',
    gift_paid_upgrade: 'Twitch.GiftPaidUpgrade',
    prime_paid_upgrade: 'Twitch.PrimePaidUpgrade',
    cheer: 'Twitch.Cheer',
    raid: 'Twitch.Raid',
    channel_points: 'Twitch.RewardRedemption',
    hype_train_start: 'Twitch.HypeTrainStart',
    hype_train_level: 'Twitch.HypeTrainLevelUp',
    hype_train_end: 'Twitch.HypeTrainEnd',
  };
  return map[kind] ?? 'Twitch.Sub';
}
