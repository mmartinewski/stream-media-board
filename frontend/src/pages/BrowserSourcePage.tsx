import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getBrowserSourceEventsUrl } from '../lib/overlay';
import { parseBrowserSourceMode } from '../lib/videoOrientation';
import { effectiveVolumeToElement } from '../lib/volume';
import { computeVideoSlotLayout, type LayoutAreaDto, type VideoSlotLayout } from '../lib/layoutSlot';

interface BrowserSourcePlayEvent {
  type: 'play';
  mediaUrl: string;
  mediaKind?: 'audio' | 'video';
  volume?: number;
  playbackVolume?: number;
  width?: number;
  height?: number;
  orientation?: 'landscape' | 'portrait';
  layoutArea?: LayoutAreaDto;
}

interface BrowserSourceStopEvent {
  type: 'stop';
}

type BrowserSourceSseEvent = BrowserSourcePlayEvent | BrowserSourceStopEvent;

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

function resolveMediaUrl(mediaUrl: string): string {
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
  const path = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
  return `${window.location.origin}${path}`;
}

function isAudioPlayEvent(event: BrowserSourcePlayEvent): boolean {
  if (event.mediaKind === 'audio') return true;
  if (event.mediaKind === 'video') return false;
  return /\/audio(?:\?|$)/i.test(event.mediaUrl);
}

export default function BrowserSourcePage() {
  const [searchParams] = useSearchParams();
  const mode = useMemo(
    () => parseBrowserSourceMode(searchParams.get('mode')),
    [searchParams],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const generationRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [videoSlotLayout, setVideoSlotLayout] = useState<VideoSlotLayout | null>(null);
  const fadeOutFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeOutStartedRef = useRef(false);
  const detachEndWatchRef = useRef<(() => void) | null>(null);

  const clearFadeOutFallback = useCallback(() => {
    if (fadeOutFallbackRef.current) {
      clearTimeout(fadeOutFallbackRef.current);
      fadeOutFallbackRef.current = null;
    }
  }, []);

  const detachEndWatch = useCallback(() => {
    detachEndWatchRef.current?.();
    detachEndWatchRef.current = null;
  }, []);

  const clearVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }, []);

  const clearAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, []);

  const stopAllPlayback = useCallback(() => {
    generationRef.current += 1;
    clearFadeOutFallback();
    detachEndWatch();
    fadeOutStartedRef.current = false;
    setVisible(false);
    clearVideo();
    clearAudio();
    setVideoSlotLayout(null);
  }, [clearAudio, clearFadeOutFallback, clearVideo, detachEndWatch]);

  const finishFadeOut = useCallback(() => {
    clearFadeOutFallback();
    const video = videoRef.current;
    if (!video?.getAttribute('src')) return;
    clearVideo();
  }, [clearFadeOutFallback, clearVideo]);

  const startFadeOut = useCallback(() => {
    if (fadeOutStartedRef.current) return;
    fadeOutStartedRef.current = true;
    detachEndWatch();
    clearFadeOutFallback();
    setVisible(false);
    fadeOutFallbackRef.current = setTimeout(finishFadeOut, FADE_MS + 50);
  }, [clearFadeOutFallback, detachEndWatch, finishFadeOut]);

  const attachEarlyFadeOutWatch = useCallback(
    (video: HTMLVideoElement) => {
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
    },
    [detachEndWatch, startFadeOut],
  );

  const playVideoClip = useCallback(
    async (event: BrowserSourcePlayEvent) => {
      const video = videoRef.current;
      if (!video) return;

      const gen = ++generationRef.current;
      clearAudio();
      clearFadeOutFallback();
      detachEndWatch();
      fadeOutStartedRef.current = false;
      setVisible(false);
      video.volume = effectiveVolumeToElement(event.volume, event.playbackVolume);
      video.src = resolveMediaUrl(event.mediaUrl);

      try {
        await waitForVideoMetadata(video);
        if (gen !== generationRef.current) return;

        if (mode === 'stage' && event.layoutArea) {
          const vw = video.videoWidth || event.width || 16;
          const vh = video.videoHeight || event.height || 9;
          setVideoSlotLayout(
            computeVideoSlotLayout(
              window.innerWidth,
              window.innerHeight,
              event.layoutArea,
              vw,
              vh,
            ),
          );
        } else {
          setVideoSlotLayout(null);
        }

        video.currentTime = 0;
        await video.play();
        if (gen !== generationRef.current) return;
        attachEarlyFadeOutWatch(video);
        requestAnimationFrame(() => {
          if (gen !== generationRef.current) return;
          setVisible(true);
        });
      } catch {
        if (gen === generationRef.current) {
          startFadeOut();
        }
      }
    },
    [
      attachEarlyFadeOutWatch,
      clearAudio,
      clearFadeOutFallback,
      detachEndWatch,
      startFadeOut,
      mode,
    ],
  );

  const playAudioClip = useCallback(
    async (event: BrowserSourcePlayEvent) => {
      const audio = audioRef.current;
      if (!audio) return;

      const gen = ++generationRef.current;
      clearVideo();
      setVisible(false);
      clearFadeOutFallback();
      detachEndWatch();
      fadeOutStartedRef.current = false;

      audio.volume = effectiveVolumeToElement(event.volume, event.playbackVolume);
      audio.src = resolveMediaUrl(event.mediaUrl);

      try {
        audio.currentTime = 0;
        await audio.play();
        if (gen !== generationRef.current) {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        }
      } catch {
        if (gen === generationRef.current) {
          clearAudio();
        }
      }
    },
    [clearAudio, clearFadeOutFallback, clearVideo, detachEndWatch],
  );

  useEffect(() => {
    document.documentElement.classList.add('browser-source-root');
    document.body.classList.add('browser-source-root');
    return () => {
      document.documentElement.classList.remove('browser-source-root');
      document.body.classList.remove('browser-source-root');
      clearFadeOutFallback();
      detachEndWatch();
    };
  }, [clearFadeOutFallback, detachEndWatch]);

  useEffect(() => {
    const source = new EventSource(getBrowserSourceEventsUrl(mode));

    source.onopen = () => {
      setStatus(`connected (${mode})`);
    };

    source.onmessage = (message) => {
      let event: BrowserSourceSseEvent;
      try {
        event = JSON.parse(message.data) as BrowserSourceSseEvent;
      } catch {
        return;
      }

      if (event.type === 'stop') {
        stopAllPlayback();
        return;
      }

      if (event.type !== 'play' || !event.mediaUrl) return;

      if (isAudioPlayEvent(event)) {
        void playAudioClip(event);
        return;
      }

      void playVideoClip(event);
    };

    source.onerror = () => {
      setStatus(`reconnecting (${mode})`);
    };

    return () => {
      source.close();
      detachEndWatch();
    };
  }, [mode, playAudioClip, playVideoClip, stopAllPlayback, detachEndWatch]);

  const handleVideoEnded = () => {
    if (!fadeOutStartedRef.current) {
      startFadeOut();
    }
  };

  const handleAudioEnded = () => {
    clearAudio();
  };

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'opacity') return;
    if (event.currentTarget.classList.contains('is-visible')) return;
    finishFadeOut();
  };

  return (
    <div className={`browser-source-stage browser-source-mode-${mode}`}>
      <audio
        ref={audioRef}
        className="browser-source-audio"
        preload="auto"
        onEnded={handleAudioEnded}
      />
      <MotionStageInner
        className={
          videoSlotLayout
            ? 'browser-source-video-slot'
            : visible
              ? 'browser-source-media is-visible'
              : 'browser-source-media'
        }
        style={{
          ...(videoSlotLayout?.slotStyle ?? {}),
          ...(videoSlotLayout
            ? {}
            : {
                ['--browser-source-fade-duration' as string]: `${FADE_MS}ms`,
              }),
        }}
        onTransitionEnd={videoSlotLayout ? undefined : handleTransitionEnd}
      >
        <div
          className={
            videoSlotLayout
              ? visible
                ? 'browser-source-media is-visible'
                : 'browser-source-media'
              : undefined
          }
          style={
            videoSlotLayout
              ? { ['--browser-source-fade-duration' as string]: `${FADE_MS}ms` }
              : undefined
          }
          onTransitionEnd={videoSlotLayout ? handleTransitionEnd : undefined}
        >
          <video
            ref={videoRef}
            className="browser-source-video"
            playsInline
            onEnded={handleVideoEnded}
            style={
              videoSlotLayout
                ? { objectFit: videoSlotLayout.videoObjectFit, width: '100%', height: '100%' }
                : undefined
            }
          />
        </div>
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
