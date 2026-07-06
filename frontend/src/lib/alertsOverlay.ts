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

export interface AlertShowEvent {
  type: 'alert_show';
  id: string;
  kind: AlertKind;
  title: string;
  subtitle?: string;
  durationSec: number;
  eventType: string;
  variables: Record<string, string | number | boolean>;
}

export interface AlertHideEvent {
  type: 'alert_hide';
  id: string;
}

export type AlertsSseEvent = AlertShowEvent | AlertHideEvent;

export interface AlertDisplayState {
  id: string;
  kind: AlertKind;
  title: string;
  subtitle?: string;
  durationSec: number;
  eventType: string;
  variables: Record<string, string | number | boolean>;
}

export const ALERTS_OVERLAY_PATH = '/overlay/alerts';

export function getAlertsOverlayUrl(origin = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}${ALERTS_OVERLAY_PATH}`;
}

export function getAlertsEventsUrl(): string {
  return '/api/alerts/events';
}

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  follow: 'Novo seguidor',
  sub: 'Nova inscrição',
  sub_prime: 'Inscrição Prime',
  resub: 'Renovação de inscrição',
  gift_sub: 'Inscrição presenteada',
  gift_bomb: 'Gift bomb',
  pay_it_forward: 'Inscrição em frente',
  gift_paid_upgrade: 'Sub presenteada renovada',
  prime_paid_upgrade: 'Prime → paga',
  cheer: 'Bits',
  raid: 'Raid recebida',
  channel_points: 'Pontos de canal',
  hype_train_start: 'Hype Train',
  hype_train_level: 'Hype Train',
  hype_train_end: 'Hype Train',
  unknown: 'Evento',
};

export const ALERT_KIND_ICONS: Record<AlertKind, string> = {
  follow: '❤️',
  sub: '🎉',
  sub_prime: '⭐',
  resub: '💜',
  gift_sub: '🎁',
  gift_bomb: '🎁',
  pay_it_forward: '💜',
  gift_paid_upgrade: '💜',
  prime_paid_upgrade: '⭐',
  cheer: '💎',
  raid: '🚀',
  channel_points: '🎯',
  hype_train_start: '🚂',
  hype_train_level: '🔥',
  hype_train_end: '🎉',
  unknown: '✨',
};

/** Breve explicação de cada tipo de alerta (UI de gatilhos). */
export const ALERT_KIND_DESCRIPTIONS: Record<AlertKind, string> = {
  follow: 'Alguém segue o canal pela primeira vez.',
  sub: 'Nova inscrição paga (Tier 1, 2 ou 3).',
  sub_prime: 'Nova inscrição usando benefício Prime Gaming.',
  resub: 'Viewer renova uma inscrição que já estava ativa.',
  gift_sub: 'Alguém presenteia uma inscrição para outro viewer.',
  gift_bomb: 'Alguém presenteia várias inscrições de uma vez.',
  pay_it_forward: 'Viewer paga a inscrição em frente na cadeia de gifts.',
  gift_paid_upgrade: 'Viewer renova a inscrição que tinha recebido de presente.',
  prime_paid_upgrade: 'Viewer converte inscrição Prime em inscrição paga.',
  cheer: 'Viewer envia bits, com ou sem mensagem no chat.',
  raid: 'Outro canal redireciona viewers para a sua live.',
  channel_points: 'Viewer resgata uma recompensa de pontos de canal.',
  hype_train_start: 'Um Hype Train começa na live.',
  hype_train_level: 'O Hype Train sobe de nível.',
  hype_train_end: 'O Hype Train termina.',
  unknown: 'Evento não reconhecido pelo app.',
};
