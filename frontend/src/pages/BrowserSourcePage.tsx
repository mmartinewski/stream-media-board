import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { getBrowserSourceEventsUrl } from '../lib/overlay';
import { parseBrowserSourceMode } from '../lib/videoOrientation';
import { effectiveVolumeToElement } from '../lib/volume';
import { computeVideoSlotLayout, type LayoutAreaDto, type VideoSlotLayout } from '../lib/layoutSlot';
import { waitForVideoElementReady } from '../lib/mediaPreload';
import { runBrowserSourceFadeIn, waitForNextPaint, handoffBrowserSourceFadeInToCssVisible, releaseBrowserSourceFadeInHandoff } from '../lib/browserSourceFadeIn';
import TodoOverlayLayer from '../components/TodoOverlayLayer';
import {
  mergeItemHighlights,
  resolveItemHighlights,
  type TodoItemHighlight,
  type TodoItemHighlightMode,
  type TodoListOverlayDto,
} from '../lib/todoOverlay';

interface BrowserSourcePlayEvent {
  type: 'play';
  mediaUrl: string;
  mediaKind?: 'audio' | 'video' | 'image';
  volume?: number;
  playbackVolume?: number;
  width?: number;
  height?: number;
  orientation?: 'landscape' | 'portrait';
  layoutArea?: LayoutAreaDto;
  displayDurationSec?: number;
  minimumDisplaySec?: number;
}

interface BrowserSourceStopEvent {
  type: 'stop';
}

interface BrowserSourceTodoShowEvent {
  type: 'todo_show';
  list: TodoListOverlayDto;
  highlight_item_id?: number;
  highlight_item_mode?: TodoItemHighlightMode;
}

interface BrowserSourceTodoHideEvent {
  type: 'todo_hide';
}

interface BrowserSourceTodoSyncEvent {
  type: 'todo_sync';
  list: TodoListOverlayDto;
  highlight_item_id?: number;
  highlight_item_mode?: TodoItemHighlightMode;
}

type BrowserSourceSseEvent =
  | BrowserSourcePlayEvent
  | BrowserSourceStopEvent
  | BrowserSourceTodoShowEvent
  | BrowserSourceTodoHideEvent
  | BrowserSourceTodoSyncEvent;

type TodoPhase = 'hidden' | 'entering' | 'visible' | 'exiting';

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

function isExternalMediaUrl(mediaUrl: string): boolean {
  return /^https?:\/\//i.test(mediaUrl);
}

function resolveSlotMediaDimensions(
  mediaUrl: string,
  event: BrowserSourcePlayEvent,
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } {
  if (isExternalMediaUrl(mediaUrl)) {
    return {
      width: event.width && event.width > 0 ? event.width : naturalWidth || 16,
      height: event.height && event.height > 0 ? event.height : naturalHeight || 9,
    };
  }
  return {
    width: naturalWidth || event.width || 16,
    height: naturalHeight || event.height || 9,
  };
}

function resolveSlotObjectFit(
  layout: VideoSlotLayout,
  mediaUrl: string,
): VideoSlotLayout['videoObjectFit'] {
  if (isExternalMediaUrl(mediaUrl)) return 'cover';
  return layout.videoObjectFit;
}

function waitForImageLoad(image: HTMLImageElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('image_load_failed')), { once: true });
  });
}

function browserSourceMediaFadeClass(visible: boolean): string {
  return visible ? 'browser-source-media is-visible' : 'browser-source-media';
}

function resolveMinimumDisplayLoop(
  video: HTMLVideoElement,
  minimumDisplaySec?: number,
): boolean {
  const minSec = Number(minimumDisplaySec);
  if (!Number.isFinite(minSec) || minSec <= 0) return false;
  const naturalSec =
    Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  if (naturalSec <= 0) return false;
  return naturalSec < minSec;
}

function commitVideoSlotLayout(
  mode: ReturnType<typeof parseBrowserSourceMode>,
  event: BrowserSourcePlayEvent,
  mediaUrl: string,
  naturalWidth: number,
  naturalHeight: number,
  setSlotMediaUrl: (url: string | null) => void,
  setVideoSlotLayout: (layout: VideoSlotLayout | null) => void,
): void {
  if (mode === 'stage' && event.layoutArea) {
    const dims = resolveSlotMediaDimensions(mediaUrl, event, naturalWidth, naturalHeight);
    const layout = computeVideoSlotLayout(
      window.innerWidth,
      window.innerHeight,
      event.layoutArea,
      dims.width,
      dims.height,
    );
    flushSync(() => {
      setSlotMediaUrl(mediaUrl);
      setVideoSlotLayout(layout);
    });
    return;
  }
  flushSync(() => {
    setSlotMediaUrl(null);
    setVideoSlotLayout(null);
  });
}

function clearVideoSlotLayout(
  setSlotMediaUrl: (url: string | null) => void,
  setVideoSlotLayout: (layout: VideoSlotLayout | null) => void,
  setSlotFrameReady: (ready: boolean) => void,
): void {
  flushSync(() => {
    setSlotMediaUrl(null);
    setVideoSlotLayout(null);
    setSlotFrameReady(false);
  });
}

function isAudioPlayEvent(event: BrowserSourcePlayEvent): boolean {
  if (event.mediaKind === 'audio') return true;
  if (event.mediaKind === 'video' || event.mediaKind === 'image') return false;
  return /\/audio(?:\?|$)/i.test(event.mediaUrl);
}

function isImagePlayEvent(event: BrowserSourcePlayEvent): boolean {
  return event.mediaKind === 'image';
}

export default function BrowserSourcePage() {
  const [searchParams] = useSearchParams();
  const mode = useMemo(
    () => parseBrowserSourceMode(searchParams.get('mode')),
    [searchParams],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const generationRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const [slotFrameReady, setSlotFrameReady] = useState(false);
  const [showingImage, setShowingImage] = useState(false);
  const [videoSlotLayout, setVideoSlotLayout] = useState<VideoSlotLayout | null>(null);
  const [slotMediaUrl, setSlotMediaUrl] = useState<string | null>(null);
  const [todoList, setTodoList] = useState<TodoListOverlayDto | null>(null);
  const [todoEnterList, setTodoEnterList] = useState<TodoListOverlayDto | null>(null);
  const [todoPhase, setTodoPhase] = useState<TodoPhase>('hidden');
  const [highlightedItems, setHighlightedItems] = useState<Map<number, TodoItemHighlightMode>>(
    () => new Map(),
  );
  const todoListRef = useRef<TodoListOverlayDto | null>(null);
  const todoPhaseRef = useRef<TodoPhase>('hidden');
  const pendingTodoListRef = useRef<TodoListOverlayDto | null>(null);
  const pendingHighlightItemsRef = useRef<TodoItemHighlight[]>([]);
  const fadeOutFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeOutStartedRef = useRef(false);
  const useMinDisplayTimerRef = useRef(false);
  const detachEndWatchRef = useRef<(() => void) | null>(null);
  const mediaFadeTargetRef = useRef<HTMLDivElement | null>(null);
  const fadeInCancelRef = useRef<(() => void) | null>(null);

  const cancelFadeIn = useCallback(() => {
    fadeInCancelRef.current?.();
    fadeInCancelRef.current = null;
  }, []);

  const beginMediaFadeIn = useCallback(
    (gen: number, onReveal?: () => void) => {
      void (async () => {
        await waitForNextPaint();
        if (gen !== generationRef.current) return;

        setSlotFrameReady(true);
        onReveal?.();

        const { finished, cancel } = runBrowserSourceFadeIn(
          mediaFadeTargetRef.current,
          FADE_MS,
        );
        fadeInCancelRef.current = cancel;

        try {
          await finished;
          if (gen !== generationRef.current) return;
          fadeInCancelRef.current = null;

          const fadeEl = mediaFadeTargetRef.current;
          fadeEl?.classList.add('is-fade-commit');
          flushSync(() => setVisible(true));
          handoffBrowserSourceFadeInToCssVisible(fadeEl);
          requestAnimationFrame(() => releaseBrowserSourceFadeInHandoff(fadeEl));
        } catch {
          fadeInCancelRef.current = null;
        }
      })();
    },
    [],
  );

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

  useEffect(() => {
    todoPhaseRef.current = todoPhase;
  }, [todoPhase]);

  useEffect(() => {
    todoListRef.current = todoList;
  }, [todoList]);

  const clearImageEndTimer = useCallback(() => {
    if (imageEndTimerRef.current) {
      clearTimeout(imageEndTimerRef.current);
      imageEndTimerRef.current = null;
    }
  }, []);

  const clearVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.loop = false;
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

  const clearImage = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    image.removeAttribute('src');
    setShowingImage(false);
  }, []);

  const stopAllPlayback = useCallback(() => {
    generationRef.current += 1;
    clearFadeOutFallback();
    clearImageEndTimer();
    detachEndWatch();
    cancelFadeIn();
    fadeOutStartedRef.current = false;
    useMinDisplayTimerRef.current = false;
    setVisible(false);
    setSlotFrameReady(false);
    clearVideo();
    clearImage();
    clearAudio();
    setVideoSlotLayout(null);
    setSlotMediaUrl(null);
  }, [cancelFadeIn, clearAudio, clearFadeOutFallback, clearImage, clearImageEndTimer, clearVideo, detachEndWatch]);

  const addHighlightedItems = useCallback((highlights: TodoItemHighlight[]) => {
    if (highlights.length === 0) return;
    setHighlightedItems((prev) => {
      const next = new Map(prev);
      for (const { itemId, mode } of highlights) next.set(itemId, mode);
      return next;
    });
  }, []);

  const handleHighlightAnimationEnd = useCallback((itemId: number) => {
    setHighlightedItems((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  const queueHighlights = useCallback(
    (highlights: TodoItemHighlight[], deferUntilVisible: boolean) => {
      if (highlights.length === 0) return;
      if (deferUntilVisible) {
        pendingHighlightItemsRef.current = mergeItemHighlights(
          pendingHighlightItemsRef.current,
          highlights,
        );
        return;
      }
      addHighlightedItems(highlights);
    },
    [addHighlightedItems],
  );

  const resolveEventHighlight = useCallback(
    (
      previous: TodoListOverlayDto | null,
      next: TodoListOverlayDto,
      highlightItemId?: number,
      highlightItemMode?: TodoItemHighlightMode,
    ): TodoItemHighlight[] => {
      const explicit =
        highlightItemId != null && highlightItemMode != null
          ? { itemId: highlightItemId, mode: highlightItemMode }
          : undefined;
      return resolveItemHighlights(previous, next, explicit);
    },
    [],
  );

  const showTodoList = useCallback(
    (list: TodoListOverlayDto, highlightItemId?: number, highlightItemMode?: TodoItemHighlightMode) => {
      const current = todoListRef.current;
      const phase = todoPhaseRef.current;
      const highlights = resolveEventHighlight(
        current,
        list,
        highlightItemId,
        highlightItemMode,
      );

      if (
        current?.id === list.id &&
        (phase === 'visible' || phase === 'entering')
      ) {
        queueHighlights(highlights, phase === 'entering');
        setTodoList(list);
        return;
      }

      pendingHighlightItemsRef.current = highlights;

      if (!current || phase === 'hidden') {
        pendingTodoListRef.current = null;
        setTodoEnterList(null);
        setTodoList(list);
        setTodoPhase('entering');
        return;
      }

      pendingTodoListRef.current = list;
      if (phase !== 'exiting') {
        setTodoPhase('exiting');
      }
    },
    [queueHighlights, resolveEventHighlight],
  );

  const completeTodoEnter = useCallback(() => {
    addHighlightedItems(pendingHighlightItemsRef.current);
    pendingHighlightItemsRef.current = [];
    setTodoPhase('visible');
    setTodoEnterList(null);
  }, [addHighlightedItems]);

  const hideTodoComplete = useCallback(() => {
    const pending = pendingTodoListRef.current;
    if (pending) {
      pendingTodoListRef.current = null;
      setTodoEnterList(pending);
      setTodoList(null);
      setTodoPhase('hidden');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTodoList(pending);
          setTodoPhase('entering');
        });
      });
      return;
    }
    setTodoEnterList(null);
    setTodoList(null);
    setTodoPhase('hidden');
  }, []);

  const startTodoHide = useCallback(() => {
    pendingTodoListRef.current = null;
    pendingHighlightItemsRef.current = [];
    setTodoEnterList(null);
    setHighlightedItems(new Map());
    setTodoPhase((current) => (current === 'hidden' ? current : 'exiting'));
  }, []);

  const finishFadeOut = useCallback(() => {
    clearFadeOutFallback();
    clearImageEndTimer();
    setSlotFrameReady(false);
    setVideoSlotLayout(null);
    setSlotMediaUrl(null);
    const video = videoRef.current;
    const image = imageRef.current;
    if (video?.getAttribute('src')) clearVideo();
    if (image?.getAttribute('src')) clearImage();
  }, [clearFadeOutFallback, clearImage, clearImageEndTimer, clearVideo]);

  const startFadeOut = useCallback(() => {
    if (fadeOutStartedRef.current) return;
    fadeOutStartedRef.current = true;
    detachEndWatch();
    clearFadeOutFallback();
    if (fadeInCancelRef.current) {
      const fadeEl = mediaFadeTargetRef.current;
      cancelFadeIn();
      fadeEl?.classList.add('is-fade-commit');
      flushSync(() => setVisible(true));
      handoffBrowserSourceFadeInToCssVisible(fadeEl);
      releaseBrowserSourceFadeInHandoff(fadeEl);
    }
    setVisible(false);
    fadeOutFallbackRef.current = setTimeout(finishFadeOut, FADE_MS + 50);
  }, [cancelFadeIn, clearFadeOutFallback, detachEndWatch, finishFadeOut]);

  const attachFadeOutWatch = useCallback(
    (video: HTMLVideoElement, minimumDisplaySec?: number) => {
      detachEndWatch();
      clearImageEndTimer();
      fadeOutStartedRef.current = false;

      const minSec = Number(minimumDisplaySec);
      const hasMinimum = Number.isFinite(minSec) && minSec > 0;
      useMinDisplayTimerRef.current = hasMinimum;

      if (hasMinimum) {
        const naturalSec =
          Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const totalSec = Math.max(minSec, naturalSec);
        const fadeLeadMs = Math.max(0, (totalSec - FADE_OUT_LEAD_SEC) * 1000);
        imageEndTimerRef.current = setTimeout(() => {
          startFadeOut();
        }, fadeLeadMs);
        return;
      }

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
    [clearImageEndTimer, detachEndWatch, startFadeOut],
  );

  const playVideoClip = useCallback(
    async (event: BrowserSourcePlayEvent) => {
      const video = videoRef.current;
      if (!video) return;

      const gen = ++generationRef.current;
      clearAudio();
      clearImage();
      clearImageEndTimer();
      clearFadeOutFallback();
      detachEndWatch();
      fadeOutStartedRef.current = false;
      cancelFadeIn();
      setVisible(false);
      setShowingImage(false);
      useMinDisplayTimerRef.current = false;
      if (mode === 'stage') {
        clearVideoSlotLayout(setSlotMediaUrl, setVideoSlotLayout, setSlotFrameReady);
      }
      video.volume = effectiveVolumeToElement(event.volume, event.playbackVolume);
      const resolvedUrl = resolveMediaUrl(event.mediaUrl);
      const external = isExternalMediaUrl(event.mediaUrl);
      video.loop = false;
      video.preload = external ? 'auto' : 'metadata';
      video.src = resolvedUrl;

      try {
        if (external) {
          await waitForVideoElementReady(video);
        } else {
          await waitForVideoMetadata(video);
        }
        if (gen !== generationRef.current) return;

        commitVideoSlotLayout(
          mode,
          event,
          event.mediaUrl,
          video.videoWidth,
          video.videoHeight,
          setSlotMediaUrl,
          setVideoSlotLayout,
        );

        attachFadeOutWatch(video, event.minimumDisplaySec);
        video.loop = resolveMinimumDisplayLoop(video, event.minimumDisplaySec);
        video.pause();
        video.currentTime = 0;
        beginMediaFadeIn(gen, () => {
          void video.play().catch(() => {
            if (gen === generationRef.current) {
              startFadeOut();
            }
          });
        });
      } catch {
        if (gen === generationRef.current) {
          startFadeOut();
        }
      }
    },
    [attachFadeOutWatch, beginMediaFadeIn, cancelFadeIn, clearAudio, clearFadeOutFallback, clearImage, clearImageEndTimer, detachEndWatch, startFadeOut, mode],
  );

  const playImageClip = useCallback(
    async (event: BrowserSourcePlayEvent) => {
      const image = imageRef.current;
      if (!image) return;

      const gen = ++generationRef.current;
      clearAudio();
      clearVideo();
      clearImageEndTimer();
      clearFadeOutFallback();
      detachEndWatch();
      fadeOutStartedRef.current = false;
      cancelFadeIn();
      setVisible(false);
      setShowingImage(true);
      if (mode === 'stage') {
        clearVideoSlotLayout(setSlotMediaUrl, setVideoSlotLayout, setSlotFrameReady);
      }

      const durationSec = Number(event.displayDurationSec);
      const safeDurationSec =
        Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 3;

      image.src = resolveMediaUrl(event.mediaUrl);

      try {
        await waitForImageLoad(image);
        if (gen !== generationRef.current) return;

        commitVideoSlotLayout(
          mode,
          event,
          event.mediaUrl,
          image.naturalWidth,
          image.naturalHeight,
          setSlotMediaUrl,
          setVideoSlotLayout,
        );

        beginMediaFadeIn(gen);

        const fadeLeadMs = Math.max(0, (safeDurationSec - FADE_OUT_LEAD_SEC) * 1000);
        imageEndTimerRef.current = setTimeout(() => {
          if (gen !== generationRef.current) return;
          startFadeOut();
        }, fadeLeadMs);
      } catch {
        if (gen === generationRef.current) {
          startFadeOut();
        }
      }
    },
    [
      beginMediaFadeIn,
      cancelFadeIn,
      clearAudio,
      clearFadeOutFallback,
      clearImageEndTimer,
      clearVideo,
      detachEndWatch,
      mode,
      startFadeOut,
    ],
  );

  const playAudioClip = useCallback(
    async (event: BrowserSourcePlayEvent) => {
      const audio = audioRef.current;
      if (!audio) return;

      const gen = ++generationRef.current;
      clearVideo();
      clearImage();
      setShowingImage(false);
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
      clearImageEndTimer();
      detachEndWatch();
    };
  }, [clearFadeOutFallback, clearImageEndTimer, detachEndWatch]);

  useEffect(() => {
    const source = new EventSource(getBrowserSourceEventsUrl(mode));

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

      if (event.type === 'todo_show') {
        showTodoList(event.list, event.highlight_item_id, event.highlight_item_mode);
        return;
      }

      if (event.type === 'todo_hide') {
        startTodoHide();
        return;
      }

      if (event.type === 'todo_sync') {
        const prev = todoListRef.current;
        const phase = todoPhaseRef.current;
        queueHighlights(
          resolveEventHighlight(
            prev,
            event.list,
            event.highlight_item_id,
            event.highlight_item_mode,
          ),
          phase === 'entering',
        );
        setTodoList(event.list);
        return;
      }

      if (event.type !== 'play' || !event.mediaUrl) return;

      if (isAudioPlayEvent(event)) {
        void playAudioClip(event);
        return;
      }

      if (isImagePlayEvent(event)) {
        void playImageClip(event);
        return;
      }

      void playVideoClip(event);
    };

    return () => {
      source.close();
      detachEndWatch();
    };
  }, [mode, playAudioClip, playImageClip, playVideoClip, showTodoList, startTodoHide, stopAllPlayback, detachEndWatch, queueHighlights, resolveEventHighlight]);

  const handleVideoEnded = () => {
    if (fadeOutStartedRef.current || useMinDisplayTimerRef.current) return;
    startFadeOut();
  };

  const handleAudioEnded = () => {
    clearAudio();
  };

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'opacity') return;
    if (event.currentTarget.classList.contains('is-visible')) return;
    if (!fadeOutStartedRef.current) return;
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
          videoSlotLayout ? 'browser-source-video-slot' : 'browser-source-media-host'
        }
        style={videoSlotLayout?.slotStyle}
      >
        <div
          ref={mediaFadeTargetRef}
          className={browserSourceMediaFadeClass(visible)}
          style={{ ['--browser-source-fade-duration' as string]: `${FADE_MS}ms` }}
          onTransitionEnd={handleTransitionEnd}
        >
          <video
            ref={videoRef}
            className={'browser-source-video' + (slotFrameReady ? ' is-revealed' : '')}
            playsInline
            preload="auto"
            onEnded={handleVideoEnded}
            hidden={showingImage}
            style={
              videoSlotLayout && slotMediaUrl
                ? {
                    objectFit: resolveSlotObjectFit(videoSlotLayout, slotMediaUrl),
                    width: '100%',
                    height: '100%',
                  }
                : videoSlotLayout
                  ? { objectFit: videoSlotLayout.videoObjectFit, width: '100%', height: '100%' }
                  : undefined
            }
          />
          <img
            ref={imageRef}
            className={'browser-source-image' + (slotFrameReady ? ' is-revealed' : '')}
            alt=""
            hidden={!showingImage}
            style={
              videoSlotLayout && slotMediaUrl
                ? {
                    objectFit: resolveSlotObjectFit(videoSlotLayout, slotMediaUrl),
                    width: '100%',
                    height: '100%',
                  }
                : videoSlotLayout
                  ? { objectFit: videoSlotLayout.videoObjectFit, width: '100%', height: '100%' }
                  : undefined
            }
          />
        </div>
      </MotionStageInner>
      <TodoOverlayLayer
        list={todoList}
        enterList={todoEnterList}
        phase={todoPhase}
        onEnterComplete={completeTodoEnter}
        onExitComplete={hideTodoComplete}
        highlightedItems={highlightedItems}
        onHighlightAnimationEnd={handleHighlightAnimationEnd}
      />
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
