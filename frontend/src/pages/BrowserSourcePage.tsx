import { useEffect, useRef, useState } from 'react';

interface BrowserSourcePlayEvent {
  type: 'play';
  mediaUrl: string;
}

const FADE_MS = 400;

export default function BrowserSourcePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('connecting');
  const fadeOutFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFadeOutFallback = () => {
    if (fadeOutFallbackRef.current) {
      clearTimeout(fadeOutFallbackRef.current);
      fadeOutFallbackRef.current = null;
    }
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
    };
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/browser-source/events');

    source.onopen = () => {
      setStatus('connected');
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
      setVisible(false);
      video.src = event.mediaUrl;

      void video.play().then(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      }).catch(() => {
        startFadeOut();
      });
    };

    source.onerror = () => {
      setStatus('reconnecting');
    };

    return () => {
      source.close();
    };
  }, []);

  const handleEnded = () => {
    startFadeOut();
  };

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLVideoElement>) => {
    if (event.propertyName !== 'opacity') return;
    if (event.currentTarget.classList.contains('is-visible')) return;
    finishFadeOut();
  };

  return (
    <div className="browser-source-stage">
      <video
        ref={videoRef}
        className={visible ? 'browser-source-video is-visible' : 'browser-source-video'}
        style={{ ['--browser-source-fade-duration' as string]: `${FADE_MS}ms` }}
        playsInline
        onEnded={handleEnded}
        onTransitionEnd={handleTransitionEnd}
      />
      {import.meta.env.DEV ? (
        <p className="browser-source-debug" aria-hidden="true">
          {status}
        </p>
      ) : null}
    </div>
  );
}
