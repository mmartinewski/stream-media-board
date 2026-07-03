import { useCallback, useEffect, useRef, useState } from 'react';
import AlertOverlayLayer from '../components/AlertOverlayLayer';
import {
  getAlertsEventsUrl,
  type AlertDisplayState,
  type AlertsSseEvent,
} from '../lib/alertsOverlay';
import {
  ALERT_NOTIFICATION_SOUND_URL,
  playAlertNotificationSound,
  prepareAlertAudio,
} from '../lib/alertNotificationSound';

type AlertPhase = 'hidden' | 'entering' | 'visible' | 'exiting';

export default function AlertsOverlayPage() {
  const [alert, setAlert] = useState<AlertDisplayState | null>(null);
  const [phase, setPhase] = useState<AlertPhase>('hidden');
  const activeAlertIdRef = useRef<string | null>(null);
  const phaseRef = useRef<AlertPhase>('hidden');
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQueueRef = useRef<AlertDisplayState[]>([]);
  const notificationAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearHideTimer();
  }, [clearHideTimer]);

  useEffect(() => {
    document.documentElement.classList.add('browser-source-root');
    document.body.classList.add('browser-source-root');

    const audio = notificationAudioRef.current;
    if (audio) void prepareAlertAudio(audio);

    const unlockAudio = () => {
      const el = notificationAudioRef.current;
      if (el) void prepareAlertAudio(el);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      document.documentElement.classList.remove('browser-source-root');
      document.body.classList.remove('browser-source-root');
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const displayAlert = useCallback((event: AlertDisplayState) => {
    clearHideTimer();
    activeAlertIdRef.current = event.id;
    setAlert(event);
    setPhase('entering');

    const audio = notificationAudioRef.current;
    if (audio) void playAlertNotificationSound(audio);

    const durationMs = Math.max(event.durationSec, 1) * 1000;
    hideTimerRef.current = setTimeout(() => {
      if (activeAlertIdRef.current !== event.id) return;
      setPhase('exiting');
    }, durationMs);
  }, [clearHideTimer]);

  const tryShowNextFromQueue = useCallback(() => {
    if (phaseRef.current !== 'hidden' || activeAlertIdRef.current !== null) return;
    const next = pendingQueueRef.current.shift();
    if (next) displayAlert(next);
  }, [displayAlert]);

  const enqueueAlert = useCallback((event: AlertDisplayState) => {
    pendingQueueRef.current.push(event);
    tryShowNextFromQueue();
  }, [tryShowNextFromQueue]);

  const hideAlert = useCallback((id: string) => {
    if (activeAlertIdRef.current !== id) return;
    clearHideTimer();
    if (phaseRef.current !== 'exiting') {
      setPhase('exiting');
    }
  }, [clearHideTimer]);

  const handleEnterComplete = useCallback(() => {
    setPhase((current) => (current === 'entering' ? 'visible' : current));
  }, []);

  const handleExitComplete = useCallback(() => {
    clearHideTimer();
    activeAlertIdRef.current = null;
    setAlert(null);
    setPhase('hidden');
  }, [clearHideTimer]);

  useEffect(() => {
    if (phase !== 'hidden') return;
    tryShowNextFromQueue();
  }, [phase, tryShowNextFromQueue]);

  useEffect(() => {
    const source = new EventSource(getAlertsEventsUrl());

    source.onmessage = (message) => {
      let event: AlertsSseEvent;
      try {
        event = JSON.parse(message.data) as AlertsSseEvent;
      } catch {
        return;
      }

      if (event.type === 'alert_show') {
        enqueueAlert({
          id: event.id,
          kind: event.kind,
          title: event.title,
          subtitle: event.subtitle,
          durationSec: event.durationSec,
          eventType: event.eventType,
          variables: event.variables ?? {},
        });
        return;
      }

      if (event.type === 'alert_hide') {
        hideAlert(event.id);
      }
    };

    return () => {
      source.close();
    };
  }, [enqueueAlert, hideAlert]);

  return (
    <div className="browser-source-stage alerts-overlay-stage">
      <audio
        ref={notificationAudioRef}
        className="browser-source-audio"
        src={ALERT_NOTIFICATION_SOUND_URL}
        preload="auto"
      />
      <AlertOverlayLayer
        alert={alert}
        phase={phase}
        onEnterComplete={handleEnterComplete}
        onExitComplete={handleExitComplete}
      />
    </div>
  );
}
