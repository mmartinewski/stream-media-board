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
