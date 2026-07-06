/**
 * Normalizes Streamer.bot action args (forwarded as-is from C# Execute Code)
 * into the shape expected by alertTemplates / streamerBotAlerts.
 *
 * SB sends __source as EventType enum name (e.g. "TwitchFollow"), not "Twitch.Follow".
 */

const SOURCE_TO_EVENT_TYPE: Record<string, string> = {
  TwitchFollow: 'Twitch.Follow',
  TwitchSub: 'Twitch.Sub',
  TwitchReSub: 'Twitch.ReSub',
  TwitchGiftSub: 'Twitch.GiftSub',
  TwitchGiftBomb: 'Twitch.GiftBomb',
  TwitchPayItForward: 'Twitch.PayItForward',
  TwitchGiftPaidUpgrade: 'Twitch.GiftPaidUpgrade',
  TwitchPrimePaidUpgrade: 'Twitch.PrimePaidUpgrade',
  TwitchCheer: 'Twitch.Cheer',
  TwitchCoinCheer: 'Twitch.CoinCheer',
  TwitchRaid: 'Twitch.Raid',
  TwitchRewardRedemption: 'Twitch.RewardRedemption',
  TwitchAutomaticRewardRedemption: 'Twitch.RewardRedemption',
  TwitchHypeTrainStart: 'Twitch.HypeTrainStart',
  TwitchHypeTrainLevelUp: 'Twitch.HypeTrainLevelUp',
  TwitchHypeTrainEnd: 'Twitch.HypeTrainEnd',
  TwitchHypeTrainUpdate: 'Twitch.HypeTrainLevelUp',
};

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const s = asString(value);
    if (s) return s;
  }
  return '';
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return false;
}

function resolveGiftAmount(body: Record<string, unknown>): number {
  for (const key of ['gifts', 'giftCount', 'amount', 'count', 'subBombCount'] as const) {
    const n = asNumber(body[key], -1);
    if (n > 0) return n;
  }
  const totalGifts = asNumber(body.totalGifts, -1);
  if (totalGifts > 0) return totalGifts;
  return 0;
}

function isGiftSubEvent(source: string, eventType: string | null): boolean {
  return source === 'TwitchGiftSub' || eventType === 'Twitch.GiftSub';
}

function isGiftBombEvent(source: string, eventType: string | null): boolean {
  return source === 'TwitchGiftBomb' || eventType === 'Twitch.GiftBomb';
}

function isPayItForwardEvent(source: string, eventType: string | null): boolean {
  return source === 'TwitchPayItForward' || eventType === 'Twitch.PayItForward';
}

export function resolveStreamerBotEventType(body: Record<string, unknown>): string | null {
  const explicit = firstString(body.eventType, body.event_type);
  if (explicit) return explicit;

  const source = firstString(body.__source, body.source_type);
  if (source && SOURCE_TO_EVENT_TYPE[source]) {
    return SOURCE_TO_EVENT_TYPE[source];
  }

  // Twitch.Follow style already dotted
  if (source.startsWith('Twitch.') || source.startsWith('twitch.')) {
    return source;
  }

  // Infer from trigger metadata when __source missing
  const triggerName = firstString(body.triggerName).toLowerCase();
  if (triggerName === 'follow') return 'Twitch.Follow';
  if (triggerName === 'subscription' || triggerName === 'sub') return 'Twitch.Sub';
  if (triggerName === 'resubscription' || triggerName === 'resub') return 'Twitch.ReSub';
  if (triggerName === 'cheer') return 'Twitch.Cheer';
  if (triggerName === 'raid') return 'Twitch.Raid';

  return null;
}

export function normalizeStreamerBotPayload(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const eventType = resolveStreamerBotEventType(body);
  const source = firstString(body.__source, body.source_type);
  const anonymous = asBoolean(body.isAnonymous ?? body.anonymous ?? body.is_anonymous);

  let displayName = firstString(body.displayName, body.user, body.targetUser, body.fromUser);
  let userName = firstString(body.userName, body.login, body.targetUserName);

  let sender = firstString(
    body.sender,
    body.gifter,
    body.gifterName,
    body.fromUser,
    body.fromBroadcasterUserName,
  );

  if (isGiftSubEvent(source, eventType)) {
    displayName = firstString(
      body.recipientUser,
      body.recipientDisplayName,
      body.displayName,
      body.targetUser,
    );
    userName = firstString(body.recipientUserName, body.recipientLogin, body.targetUserName);
    if (!anonymous) {
      sender = firstString(body.user, body.userName, sender);
    }
  } else if (isGiftBombEvent(source, eventType) && !anonymous) {
    sender = firstString(body.user, body.userName, sender);
  } else if (isPayItForwardEvent(source, eventType)) {
    displayName = firstString(body.displayName, body.user, body.userName);
    userName = firstString(body.userName, body.login, body.user);
  }

  const recipient = isPayItForwardEvent(source, eventType)
    ? firstString(
        body.recipient,
        body.recipientDisplayName,
        body.recipientUser,
        body.targetUser,
        body.targetDisplayName,
      )
    : '';

  return {
    ...body,
    ...(eventType ? { eventType } : {}),
    ...(displayName ? { displayName } : {}),
    ...(userName ? { userName } : {}),
    ...(recipient ? { recipient } : {}),
    subTier: body.subTier ?? body.sub_tier ?? body.tier ?? body.subTierString,
    months:
      body.months ??
      body.durationMonths ??
      body.cumulativeMonths ??
      body.monthsSubscribed ??
      body.monthsGifted ??
      body.tenure,
    isPrime: body.isPrime ?? body.is_prime ?? body.primeSub,
    isAnonymous: anonymous,
    sender,
    amount: resolveGiftAmount(body),
    bits: body.bits ?? body.bitAmount ?? body.cheerBits,
    viewers: body.viewers ?? body.viewerCount ?? body.raidViewers ?? body.viewersInRaid,
    rewardTitle:
      body.rewardTitle ?? body.reward_title ?? body.rewardName ?? body.redemption ?? body.reward,
    pointsSpent:
      body.pointsSpent ?? body.rewardCost ?? body.cost ?? body.rewardPointCost ?? body.rewardPoints,
    level: body.level ?? body.hypeTrainLevel ?? body.trainLevel,
    message:
      body.message ??
      body.cheerMessage ??
      body.systemMessage ??
      body.subMessage ??
      body.rawInputEscaped,
  };
}
