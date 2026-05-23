import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getBrowserSourceEventsUrl } from '../lib/overlay';
import { parseBrowserSourceMode } from '../lib/videoOrientation';

interface BrowserSourcePlayEvent {
  type: 'play';
  mediaUrl: string;
  width?: number;
  height?: number;
  orientation?: 'landscape' | 'portrait';
}

const FADE_MS = 400;
const FADE_OUT_LEAD_SEC = FADE_MS / 1000 + 0.1;

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      resolve();
      return;
    }
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });
}

export default function BrowserSourcePage() {
  const [searchParams] = useSearchParams();
  const mode = useMemo(
    () => parseBrowserSourceMode(searchParams.get('mode')),
    [searchParams],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('connecting');
  const fadeOutFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeOutStartedRef = useRef(false);
  const detachEndWatchRef = useRef<(() => void) | null>(null);

  const clearFadeOutFallback = () => {
    if (fadeOutFallbackRef.current) {
      clearTimeout(fadeOutFallbackRef.current);
      fadeOutFallbackRef.current = null;
    }
  };

  const detachEndWatch = () => {
    detachEndWatchRef.current?.();
    detachEndWatchRef.current = null;
  };

  const attachEarlyFadeOutWatch = (video: HTMLVideoElement) => {
    detachEndWatch();
    fadeOutStartedRef.current = false;

    const onTimeUpdate = () => {
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      if (dur - video.currentTime > FADE_OUT_LEAD_SEC) return;
      startFadeOut();
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    detachEndWatchRef.current = () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  };

  const clearVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  };

  const finishFadeOut = () => {
    clearFadeOutFallback();
    const video = videoRef.current;
    if (!video?.getAttribute('src')) return;
    clearVideo();
  };

  const startFadeOut = () => {
    if (fadeOutStartedRef.current) return;
    fadeOutStartedRef.current = true;
    detachEndWatch();
    clearFadeOutFallback();
    setVisible(false);
    fadeOutFallbackRef.current = setTimeout(finishFadeOut, FADE_MS + 50);
  };

  useEffect(() => {
    document.documentElement.classList.add('browser-source-root');
    document.body.classList.add('browser-source-root');
    return () => {
      document.documentElement.classList.remove('browser-source-root');
      document.body.classList.remove('browser-source-root');
      clearFadeOutFallback();
      detachEndWatch();
    };
  }, []);

  useEffect(() => {
    const source = new EventSource(getBrowserSourceEventsUrl(mode));

    source.onopen = () => {
      setStatus(`connected (${mode})`);
    };

    source.onmessage = (message) => {
      let event: BrowserSourcePlayEvent;
      try {
        event = JSON.parse(message.data) as BrowserSourcePlayEvent;
      } catch {
        return;
      }
      if (event.type !== 'play' || !event.mediaUrl) return;

      const video = videoRef.current;
      if (!video) return;

      clearFadeOutFallback();
      detachEndWatch();
      fadeOutStartedRef.current = false;
      setVisible(false);
      video.src = event.mediaUrl;

      void (async () => {
        try {
          await waitForVideoMetadata(video);
          video.currentTime = 0;
          await video.play();
          attachEarlyFadeOutWatch(video);
          requestAnimationFrame(() => {
            setVisible(true);
          });
        } catch {
          startFadeOut();
        }
      })();
    };

    source.onerror = () => {
      setStatus(`reconnecting (${mode})`);
    };

    return () => {
      source.close();
      detachEndWatch();
    };
  }, [mode]);

  const handleEnded = () => {
    if (!fadeOutStartedRef.current) {
      startFadeOut();
    }
  };

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'opacity') return;
    if (event.currentTarget.classList.contains('is-visible')) return;
    finishFadeOut();
  };

  return (
    <div className={`browser-source-stage browser-source-mode-${mode}`}>
      <MotionStageInner
        className={visible ? 'browser-source-media is-visible' : 'browser-source-media'}
        style={{
          ['--browser-source-fade-duration' as string]: `${FADE_MS}ms`,
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        <video ref={videoRef} className="browser-source-video" playsInline onEnded={handleEnded} />
      </MotionStageInner>
      {import.meta.env.DEV ? (
        <p className="browser-source-debug" aria-hidden="true">
          {status}
        </p>
      ) : null}
    </div>
  );
}

function MotionStageInner({
  className,
  style,
  children,
  onTransitionEnd,
}: {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onTransitionEnd?: (event: React.TransitionEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className={className} style={style} onTransitionEnd={onTransitionEnd}>
      {children}
    </div>
  );
}
