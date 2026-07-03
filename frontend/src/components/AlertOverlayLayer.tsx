import { useCallback, useEffect, useRef, useState } from 'react';
import { renderHighlightedAlertTitle } from '../lib/alertTitleHighlight';
import {
  ALERT_KIND_ICONS,
  ALERT_KIND_LABELS,
  type AlertDisplayState,
} from '../lib/alertsOverlay';

interface AlertOverlayLayerProps {
  alert: AlertDisplayState | null;
  phase: 'hidden' | 'entering' | 'visible' | 'exiting';
  onEnterComplete: () => void;
  onExitComplete: () => void;
}

export default function AlertOverlayLayer({
  alert,
  phase,
  onEnterComplete,
  onExitComplete,
}: AlertOverlayLayerProps) {
  const enterFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitHandledRef = useRef(false);
  const enterHandledRef = useRef(false);
  const [enterReady, setEnterReady] = useState(false);

  useEffect(() => {
    if (phase === 'exiting') exitHandledRef.current = false;
    if (phase === 'entering') enterHandledRef.current = false;
  }, [alert?.id, phase]);

  useEffect(() => {
    if (phase !== 'entering') {
      setEnterReady(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEnterReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, [alert?.id, phase]);

  useEffect(() => {
    return () => {
      if (enterFallbackRef.current) clearTimeout(enterFallbackRef.current);
      if (exitFallbackRef.current) clearTimeout(exitFallbackRef.current);
    };
  }, []);

  const completeExitOnce = useCallback(() => {
    if (exitHandledRef.current) return;
    exitHandledRef.current = true;
    onExitComplete();
  }, [onExitComplete]);

  const completeEnterOnce = useCallback(() => {
    if (enterHandledRef.current) return;
    enterHandledRef.current = true;
    onEnterComplete();
  }, [onEnterComplete]);

  const handleTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.propertyName !== 'opacity' && event.propertyName !== 'transform') return;
      if (phase === 'entering' && enterReady) {
        completeEnterOnce();
        return;
      }
      if (phase === 'exiting') {
        completeExitOnce();
      }
    },
    [completeEnterOnce, completeExitOnce, enterReady, phase],
  );

  useEffect(() => {
    if (phase !== 'entering' || !alert || !enterReady) return;
    if (enterFallbackRef.current) clearTimeout(enterFallbackRef.current);
    enterFallbackRef.current = setTimeout(completeEnterOnce, 550);
  }, [alert, completeEnterOnce, enterReady, phase]);

  useEffect(() => {
    if (phase !== 'exiting' || !alert) return;
    if (exitFallbackRef.current) clearTimeout(exitFallbackRef.current);
    exitFallbackRef.current = setTimeout(completeExitOnce, 550);
  }, [alert, completeExitOnce, phase]);

  if (!alert || phase === 'hidden') return null;

  const phaseClass =
    phase === 'entering'
      ? 'is-entering' + (enterReady ? ' is-visible' : '')
      : phase === 'visible'
        ? 'is-visible'
        : phase === 'exiting'
          ? 'is-visible is-exiting'
          : '';

  return (
    <div className="alert-overlay" aria-live="polite" aria-hidden={phase !== 'visible'}>
      <div className="alert-overlay-anchor">
        <div
          className={`alert-card alert-card--${alert.kind} ${phaseClass}`}
          onTransitionEnd={handleTransitionEnd}
        >
          <div className="alert-card-icon" aria-hidden>
            {ALERT_KIND_ICONS[alert.kind]}
          </div>
          <div className="alert-card-content">
            <p className="alert-card-label">{ALERT_KIND_LABELS[alert.kind]}</p>
            <p className="alert-card-title">
              {renderHighlightedAlertTitle(alert.title, alert.kind, alert.variables)}
            </p>
            {alert.subtitle ? (
              <p className="alert-card-subtitle">{alert.subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
