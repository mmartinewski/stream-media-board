export type AlertKind =
  | 'follow'
  | 'sub'
  | 'sub_prime'
  | 'resub'
  | 'gift_sub'
  | 'gift_bomb'
  | 'pay_it_forward'
  | 'gift_paid_upgrade'
  | 'prime_paid_upgrade'
  | 'cheer'
  | 'raid'
  | 'channel_points'
  | 'hype_train_start'
  | 'hype_train_level'
  | 'hype_train_end'
  | 'unknown';

export interface AlertTemplateVars {
  username: string;
  sender: string;
  tierLabel: string;
  months: number;
  monthsLabel: string;
  amount: number;
  bits: number;
  viewers: number;
  rewardTitle: string;
  pointsSpent: number;
  level: number;
  message: string;
  eventType: string;
}

export interface BuiltAlertMessage {
  kind: AlertKind;
  title: string;
  subtitle?: string;
}

const DEFAULT_USERNAME = 'Alguém';
const ANONYMOUS_SENDER = 'Alguém anônimo';

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
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

export function resolveUsername(body: Record<string, unknown>): string {
  return (
    asString(body.displayName) ||
    asString(body.userName) ||
    asString(body.user) ||
    asString(body.username) ||
    DEFAULT_USERNAME
  );
}

export function resolveSender(body: Record<string, unknown>): string {
  if (asBoolean(body.isAnonymous)) return ANONYMOUS_SENDER;
  return (
    asString(body.sender) ||
    asString(body.gifterName) ||
    asString(body.gifter) ||
    asString(body.user) ||
    asString(body.userName) ||
    asString(body.senderName) ||
    ANONYMOUS_SENDER
  );
}

export function resolveTierLabel(subTier: unknown, isPrime = false): string {
  if (isPrime) return 'Prime';
  const tier = asString(subTier);
  switch (tier) {
    case '1000':
      return 'Tier 1';
    case '2000':
      return 'Tier 2';
    case '3000':
      return 'Tier 3';
    case 'Prime':
      return 'Prime';
    default: {
      const tierMatch = tier.match(/^tier\s*(\d)$/i);
      if (tierMatch) return `Tier ${tierMatch[1]}`;
      if (/^prime$/i.test(tier)) return 'Prime';
      return tier || 'Tier 1';
    }
  }
}

export function formatMonthsLabel(months: number): string {
  if (months === 1) return '1 mês';
  return `${months} meses`;
}

function interpolate(template: string, vars: AlertTemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = vars[key as keyof AlertTemplateVars];
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

export function extractTemplateVars(body: Record<string, unknown>): AlertTemplateVars {
  const months = asNumber(body.months ?? body.durationMonths ?? body.cumulativeMonths, 1);
  const isPrime = asBoolean(body.isPrime ?? body.is_prime);
  return {
    username: resolveUsername(body),
    sender: resolveSender(body),
    tierLabel: resolveTierLabel(body.subTier ?? body.sub_tier ?? body.tier, isPrime),
    months,
    monthsLabel: formatMonthsLabel(months),
    amount: asNumber(body.amount ?? body.giftCount ?? body.totalGifts),
    bits: asNumber(body.bits ?? body.bitAmount),
    viewers: asNumber(body.viewers ?? body.viewerCount ?? body.raidViewers),
    rewardTitle: asString(body.rewardTitle ?? body.reward_title) || 'recompensa',
    pointsSpent: asNumber(body.pointsSpent ?? body.rewardCost ?? body.cost),
    level: asNumber(body.level ?? body.hypeTrainLevel),
    message: asString(body.message ?? body.cheerMessage ?? body.systemMessage),
    eventType: asString(body.eventType) || 'unknown',
  };
}

export function buildAlertMessage(
  eventType: string,
  body: Record<string, unknown>,
): BuiltAlertMessage {
  const vars = extractTemplateVars({ ...body, eventType });
  const normalized = eventType.trim();

  if (normalized === 'Twitch.Follow') {
    return {
      kind: 'follow',
      title: interpolate('{username} está seguindo o canal', vars),
    };
  }

  if (normalized === 'Twitch.Sub') {
    const isPrime = asBoolean(body.isPrime ?? body.is_prime);
    if (isPrime) {
      return {
        kind: 'sub_prime',
        title: interpolate('{username} se inscreveu com Prime!', vars),
      };
    }
    return {
      kind: 'sub',
      title: interpolate('{username} se inscreveu no canal!', vars),
      subtitle: vars.tierLabel,
    };
  }

  if (normalized === 'Twitch.ReSub') {
    const result: BuiltAlertMessage = {
      kind: 'resub',
      title: interpolate('{username} renovou a inscrição!', vars),
      subtitle: vars.monthsLabel,
    };
    if (vars.message) result.subtitle = `${vars.monthsLabel} — "${vars.message}"`;
    return result;
  }

  if (normalized === 'Twitch.GiftSub') {
    return {
      kind: 'gift_sub',
      title: interpolate('{sender} presenteou uma inscrição para {username}!', vars),
      subtitle: vars.tierLabel,
    };
  }

  if (normalized === 'Twitch.GiftBomb') {
    return {
      kind: 'gift_bomb',
      title: interpolate('{sender} presenteou {amount} inscrições!', vars),
      subtitle: vars.tierLabel,
    };
  }

  if (normalized === 'Twitch.PayItForward') {
    return {
      kind: 'pay_it_forward',
      title: interpolate('{username} pagou a inscrição em frente!', vars),
    };
  }

  if (normalized === 'Twitch.GiftPaidUpgrade') {
    return {
      kind: 'gift_paid_upgrade',
      title: interpolate('{username} continuou a inscrição presenteada!', vars),
    };
  }

  if (normalized === 'Twitch.PrimePaidUpgrade') {
    return {
      kind: 'prime_paid_upgrade',
      title: interpolate('{username} converteu Prime em inscrição paga!', vars),
    };
  }

  if (normalized === 'Twitch.Cheer' || normalized === 'Twitch.CoinCheer') {
    const result: BuiltAlertMessage = {
      kind: 'cheer',
      title: interpolate('{username} doou {bits} bits!', vars),
    };
    if (vars.message) result.subtitle = vars.message;
    return result;
  }

  if (normalized === 'Twitch.Raid') {
    return {
      kind: 'raid',
      title: interpolate('{username} raidou o canal com {viewers} viewers!', vars),
    };
  }

  if (normalized === 'Twitch.RewardRedemption') {
    const result: BuiltAlertMessage = {
      kind: 'channel_points',
      title: interpolate('{username} resgatou: {rewardTitle}', vars),
    };
    if (vars.pointsSpent > 0) {
      result.subtitle = `${vars.pointsSpent} pontos de canal`;
    }
    return result;
  }

  if (normalized === 'Twitch.HypeTrainStart') {
    return {
      kind: 'hype_train_start',
      title: 'Hype Train começou!',
    };
  }

  if (normalized === 'Twitch.HypeTrainLevelUp') {
    return {
      kind: 'hype_train_level',
      title: interpolate('Hype Train nível {level}!', vars),
    };
  }

  if (normalized === 'Twitch.HypeTrainEnd') {
    const result: BuiltAlertMessage = {
      kind: 'hype_train_end',
      title: 'Hype Train finalizado!',
    };
    if (vars.level > 0) {
      result.subtitle = `Nível ${vars.level} alcançado`;
    }
    return result;
  }

  return {
    kind: 'unknown',
    title: interpolate('Evento: {eventType}', vars),
    subtitle: vars.username !== DEFAULT_USERNAME ? vars.username : undefined,
  };
}

export const SUPPORTED_EVENT_TYPES = [
  'Twitch.Follow',
  'Twitch.Sub',
  'Twitch.ReSub',
  'Twitch.GiftSub',
  'Twitch.GiftBomb',
  'Twitch.PayItForward',
  'Twitch.GiftPaidUpgrade',
  'Twitch.PrimePaidUpgrade',
  'Twitch.Cheer',
  'Twitch.CoinCheer',
  'Twitch.Raid',
  'Twitch.RewardRedemption',
  'Twitch.HypeTrainStart',
  'Twitch.HypeTrainLevelUp',
  'Twitch.HypeTrainEnd',
] as const;

export const DEFAULT_ALERT_DURATION_SEC = 5;
