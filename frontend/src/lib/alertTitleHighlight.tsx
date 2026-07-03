import type { ReactNode } from 'react';
import type { AlertKind } from './alertsOverlay';

export type AlertHighlightKey = 'username' | 'sender';

export function getAlertHighlightKeys(kind: AlertKind): AlertHighlightKey[] {
  switch (kind) {
    case 'gift_sub':
      return ['sender', 'username'];
    case 'gift_bomb':
      return ['sender'];
    case 'hype_train_start':
    case 'hype_train_level':
    case 'hype_train_end':
      return [];
    default:
      return ['username'];
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitTitleForHighlights(
  title: string,
  variables: Record<string, string | number | boolean>,
  highlightKeys: AlertHighlightKey[],
): Array<{ text: string; highlight: boolean }> {
  const phrases = highlightKeys
    .map((key) => String(variables[key] ?? '').trim())
    .filter((phrase) => phrase.length > 0)
    .sort((a, b) => b.length - a.length);

  if (phrases.length === 0) {
    return [{ text: title, highlight: false }];
  }

  const pattern = phrases.map(escapeRegExp).join('|');
  const regex = new RegExp(`(${pattern})`, 'g');
  const parts = title.split(regex).filter((part) => part.length > 0);

  return parts.map((text) => ({
    text,
    highlight: phrases.includes(text),
  }));
}

export function renderHighlightedAlertTitle(
  title: string,
  kind: AlertKind,
  variables: Record<string, string | number | boolean>,
): ReactNode {
  const segments = splitTitleForHighlights(title, variables, getAlertHighlightKeys(kind));
  return segments.map((segment, index) =>
    segment.highlight ? (
      <span key={`${index}-${segment.text}`} className="alert-card-highlight">
        {segment.text}
      </span>
    ) : (
      <span key={`${index}-${segment.text}`}>{segment.text}</span>
    ),
  );
}
