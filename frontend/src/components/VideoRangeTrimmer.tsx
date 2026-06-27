import { useCallback, useEffect, useRef, useState } from 'react';
import { bindDocumentPointerDrag } from '../lib/documentPointerDrag';
import { isValidTimeString, secondsToTimeString, timeStringToSeconds } from '../lib/time';
import { effectiveVolumeToElement } from '../lib/volume';

const MAX_CLIP_SEC = 300;
const MIN_CLIP_SEC = 0.05;
/** Stop slightly before end so we never overshoot between checks (one ~60fps frame). */
const END_STOP_LEAD_SEC = 1 / 60;
/** Min time delta between scrub seeks (~30fps cap on decode; playhead still updates every frame). */
const SCRUB_MIN_DELTA_SEC = 1 / 30;

function waitForVideoSeek(video: HTMLVideoElement, targetSeconds: number): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', finish);
    };
    const timer = setTimeout(finish, 2000);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      if (Math.abs(video.currentTime - targetSeconds) < 0.02) {
        finish();
        return;
      }
      video.addEventListener('seeked', finish, { once: true });
      video.currentTime = targetSeconds;
      return;
    }
    const onMeta = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      void waitForVideoSeek(video, targetSeconds).then(resolve);
    };
    video.addEventListener('loadedmetadata', onMeta, { once: true });
  });
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export default function VideoRangeTrimmer({
  videoUrl,
  previewNonce = 0,
  previewCutUrl = null,
  previewVolume = 100,
  durationSeconds,
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  onPreviewEnd,
  onPreviewError,
  onLoopTrimPreview,
}: {
  videoUrl: string;
  previewNonce?: number;
  /** FFmpeg-cut segment from staging preview API (frame-accurate). */
  previewCutUrl?: string | null;
  /** Clip volume (0–100) applied to segment preview playback. */
  previewVolume?: number;
  durationSeconds: number | null;
  startTime: string;
  endTime: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onPreviewEnd?: () => void;
  onPreviewError?: (message: string) => void;
  /** Called after trim handles are released while loop preview is enabled. */
  onLoopTrimPreview?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const scrubbingRef = useRef(false);
  const segmentPreviewActiveRef = useRef(false);
  const previewNonceRef = useRef(previewNonce);
  const durationRef = useRef(0);
  const startSecRef = useRef(0);
  const endSecRef = useRef(0);
  const onPreviewEndRef = useRef(onPreviewEnd);
  const onPreviewErrorRef = useRef(onPreviewError);
  const onLoopTrimPreviewRef = useRef(onLoopTrimPreview);
  const lastScrubSeekRef = useRef(-1);
  const pendingScrubTargetRef = useRef<number | null>(null);
  const scrubRafRef = useRef<number | null>(null);
  const docDragCleanupRef = useRef<(() => void) | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const previewWatchRafRef = useRef<number | null>(null);
  const previewWatchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewCutUrlRef = useRef(previewCutUrl);
  const previewVolumeRef = useRef(previewVolume);
  const [playheadPct, setPlayheadPct] = useState<number | null>(null);
  previewCutUrlRef.current = previewCutUrl;
  previewVolumeRef.current = previewVolume;

  const applyPreviewVolume = useCallback((video: HTMLVideoElement) => {
    video.muted = false;
    video.volume = effectiveVolumeToElement(previewVolumeRef.current, 100);
  }, []);

  const duration = durationSeconds ?? 0;
  const startSec = isValidTimeString(startTime) ? timeStringToSeconds(startTime) : 0;
  const endSec = isValidTimeString(endTime)
    ? timeStringToSeconds(endTime)
    : Math.min(duration, MAX_CLIP_SEC);

  durationRef.current = duration;
  startSecRef.current = startSec;
  endSecRef.current = endSec;
  onPreviewEndRef.current = onPreviewEnd;
  onPreviewErrorRef.current = onPreviewError;
  onLoopTrimPreviewRef.current = onLoopTrimPreview;

  const canScrubVideo = useCallback(
    () => scrubbingRef.current || !segmentPreviewActiveRef.current,
    [],
  );

  const updatePlayheadFromVideo = useCallback(() => {
    const video = videoRef.current;
    const dur = durationRef.current;
    if (!video || dur <= 0) return;
    const cut = previewCutUrlRef.current;
    const absTime = cut ? startSecRef.current + video.currentTime : video.currentTime;
    setPlayheadPct(clampNumber((absTime / dur) * 100, 0, 100));
  }, []);

  const seekToTimeFast = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      const dur = durationRef.current;
      if (!video || dur <= 0 || !canScrubVideo()) return;
      const target = clampNumber(seconds, 0, Math.max(0, dur - 0.05));
      if (Math.abs(target - lastScrubSeekRef.current) < SCRUB_MIN_DELTA_SEC) return;
      lastScrubSeekRef.current = target;
      video.pause();
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        const onMeta = () => {
          video.removeEventListener('loadedmetadata', onMeta);
          lastScrubSeekRef.current = -1;
          seekToTimeFast(seconds);
        };
        video.addEventListener('loadedmetadata', onMeta, { once: true });
        return;
      }
      if (typeof video.fastSeek === 'function') {
        video.fastSeek(target);
      } else {
        video.currentTime = target;
      }
    },
    [canScrubVideo],
  );

  const seekToTimePrecise = useCallback(
    async (seconds: number) => {
      const video = videoRef.current;
      const dur = durationRef.current;
      if (!video || dur <= 0 || !canScrubVideo()) return;
      const target = clampNumber(seconds, 0, Math.max(0, dur - 0.001));
      lastScrubSeekRef.current = target;
      video.pause();
      await waitForVideoSeek(video, target);
    },
    [canScrubVideo],
  );

  const stopScrubRaf = useCallback(() => {
    if (scrubRafRef.current !== null) {
      cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = null;
    }
    pendingScrubTargetRef.current = null;
  }, []);

  const scrubRafTick = useCallback(() => {
    scrubRafRef.current = null;
    if (dragRef.current === null || !canScrubVideo()) {
      pendingScrubTargetRef.current = null;
      return;
    }
    const target = pendingScrubTargetRef.current;
    if (target !== null) {
      pendingScrubTargetRef.current = null;
      seekToTimeFast(target);
    }
    if (dragRef.current !== null) {
      scrubRafRef.current = requestAnimationFrame(scrubRafTick);
    }
  }, [canScrubVideo, seekToTimeFast]);

  const queueScrubSeek = useCallback(
    (seconds: number) => {
      if (!canScrubVideo() || dragRef.current === null) return;
      pendingScrubTargetRef.current = seconds;
      if (scrubRafRef.current === null) {
        scrubRafRef.current = requestAnimationFrame(scrubRafTick);
      }
    },
    [canScrubVideo, scrubRafTick],
  );

  const scrubSeekNow = useCallback(
    (seconds: number) => {
      if (!canScrubVideo() || dragRef.current === null) return;
      stopScrubRaf();
      seekToTimeFast(seconds);
    },
    [canScrubVideo, stopScrubRaf, seekToTimeFast],
  );

  const stopPreviewWatch = useCallback(() => {
    if (previewWatchRafRef.current !== null) {
      cancelAnimationFrame(previewWatchRafRef.current);
      previewWatchRafRef.current = null;
    }
    if (previewWatchIntervalRef.current !== null) {
      clearInterval(previewWatchIntervalRef.current);
      previewWatchIntervalRef.current = null;
    }
  }, []);

  const exitSegmentPreview = useCallback(
    (seekAfterExit?: number) => {
      const video = videoRef.current;
      stopPreviewWatch();
      segmentPreviewActiveRef.current = false;
      const target = seekAfterExit ?? startSecRef.current;
      const showPlayhead = seekAfterExit !== undefined;
      setPlayheadPct(
        showPlayhead && durationRef.current > 0
          ? clampNumber((target / durationRef.current) * 100, 0, 100)
          : null,
      );
      if (!video) {
        onPreviewEndRef.current?.();
        return;
      }
      video.controls = false;
      video.muted = true;
      video.loop = false;
      video.pause();
      const cutUrl = previewCutUrlRef.current;
      const onSourceReady = () => {
        void seekToTimePrecise(target);
      };
      if (videoUrl && cutUrl && video.src !== videoUrl) {
        video.src = videoUrl;
        video.load();
        const onLoaded = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          onSourceReady();
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
      } else if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        onSourceReady();
      } else {
        const onLoaded = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          onSourceReady();
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
      }
      onPreviewEndRef.current?.();
    },
    [seekToTimePrecise, stopPreviewWatch, videoUrl],
  );

  const startPreviewWatch = useCallback(
    (video: HTMLVideoElement, options?: { useClipDuration?: boolean }) => {
      stopPreviewWatch();
      const useClipDuration = options?.useClipDuration === true;

      const stopAtEndIfNeeded = (): boolean => {
        if (!segmentPreviewActiveRef.current) {
          return true;
        }
        const end = useClipDuration
          ? Number.isFinite(video.duration)
            ? video.duration
            : endSecRef.current - startSecRef.current
          : endSecRef.current;
        if (video.currentTime < end - END_STOP_LEAD_SEC) {
          return false;
        }
        const loopStart = useClipDuration ? 0 : startSecRef.current;
        void waitForVideoSeek(video, loopStart).then(() => {
          if (!segmentPreviewActiveRef.current) return;
          void video.play().catch(() => {
            segmentPreviewActiveRef.current = false;
            onPreviewErrorRef.current?.('Could not loop the segment preview.');
            onPreviewEndRef.current?.();
          });
        });
        return false;
      };

      const tick = () => {
        updatePlayheadFromVideo();
        if (stopAtEndIfNeeded()) {
          previewWatchRafRef.current = null;
          return;
        }
        previewWatchRafRef.current = requestAnimationFrame(tick);
      };

      previewWatchRafRef.current = requestAnimationFrame(tick);
      // Browsers throttle rAF in background tabs; interval keeps the end cut reliable.
      previewWatchIntervalRef.current = setInterval(() => {
        stopAtEndIfNeeded();
      }, 50);
    },
    [exitSegmentPreview, stopPreviewWatch, updatePlayheadFromVideo],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !segmentPreviewActiveRef.current || scrubbingRef.current) return;
    applyPreviewVolume(video);
  }, [previewVolume, applyPreviewVolume]);

  useEffect(() => {
    if (previewNonce <= 0) {
      if (!scrubbingRef.current) {
        setPlayheadPct(null);
      }
      return;
    }

    let raf = 0;
    const tick = () => {
      if (segmentPreviewActiveRef.current) {
        updatePlayheadFromVideo();
      }
      if (previewNonceRef.current > 0) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [previewNonce, updatePlayheadFromVideo]);

  useEffect(() => {
    return () => {
      docDragCleanupRef.current?.();
      docDragCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    segmentPreviewActiveRef.current = false;
    video.controls = false;
    video.muted = true;
    video.src = videoUrl;
    video.load();

    const onLoaded = () => {
      if (!segmentPreviewActiveRef.current) {
        void seekToTimePrecise(startSecRef.current);
      }
    };
    video.addEventListener('loadedmetadata', onLoaded);

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      segmentPreviewActiveRef.current = false;
      stopPreviewWatch();
      video.pause();
      stopScrubRaf();
    };
  }, [videoUrl, seekToTimePrecise, stopScrubRaf, stopPreviewWatch]);

  useEffect(() => {
    if (segmentPreviewActiveRef.current || dragRef.current || !videoUrl || duration <= 0) {
      return;
    }
    void seekToTimePrecise(startSec);
  }, [startTime, videoUrl, duration, seekToTimePrecise]);

  useEffect(() => {
    if (previewNonce === previewNonceRef.current) return;
    previewNonceRef.current = previewNonce;

    if (previewNonce === 0) {
      if (segmentPreviewActiveRef.current) {
        exitSegmentPreview();
      }
      setPlayheadPct(null);
      return;
    }

    const video = videoRef.current;
    const dur = durationRef.current;
    const start = startSecRef.current;
    const end = endSecRef.current;
    if (!video || !videoUrl || dur <= 0 || end <= start) return;

    segmentPreviewActiveRef.current = true;
    video.controls = false;
    applyPreviewVolume(video);

    const cutUrl = previewCutUrlRef.current;

    const playCutPreview = () => {
      if (!cutUrl) return;
      stopPreviewWatch();
      video.src = cutUrl;
      video.load();

      const begin = () => {
        video.loop = true;
        applyPreviewVolume(video);
        void waitForVideoSeek(video, 0)
          .then(() => video.play())
          .catch(() => {
            segmentPreviewActiveRef.current = false;
            stopPreviewWatch();
            onPreviewErrorRef.current?.('Could not start the segment preview.');
            onPreviewEndRef.current?.();
          });
      };

      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        begin();
      } else {
        video.addEventListener('loadedmetadata', begin, { once: true });
      }
    };

    const playStagingSegment = () => {
      stopPreviewWatch();
      const begin = () => {
        video.loop = false;
        applyPreviewVolume(video);
        void waitForVideoSeek(video, clampNumber(start, 0, dur))
          .then(() => video.play())
          .then(() => {
            if (!segmentPreviewActiveRef.current) return;
            startPreviewWatch(video);
          })
          .catch(() => {
            segmentPreviewActiveRef.current = false;
            stopPreviewWatch();
            onPreviewErrorRef.current?.('Could not start the segment preview.');
            onPreviewEndRef.current?.();
          });
      };

      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        begin();
      } else {
        video.addEventListener('loadedmetadata', begin, { once: true });
      }
    };

    const onError = () => {
      if (!segmentPreviewActiveRef.current) return;
      segmentPreviewActiveRef.current = false;
      stopPreviewWatch();
      onPreviewErrorRef.current?.('Could not play the segment preview.');
      onPreviewEndRef.current?.();
    };

    video.addEventListener('error', onError, { once: true });

    if (cutUrl) {
      playCutPreview();
    } else if (video.src !== videoUrl) {
      video.src = videoUrl;
      video.load();
      video.addEventListener(
        'loadedmetadata',
        () => {
          playStagingSegment();
        },
        { once: true },
      );
    } else {
      playStagingSegment();
    }

    return () => {
      segmentPreviewActiveRef.current = false;
      stopPreviewWatch();
      video.removeEventListener('error', onError);
      video.loop = false;
      video.pause();
    };
  }, [previewNonce, videoUrl, exitSegmentPreview, startPreviewWatch, stopPreviewWatch, applyPreviewVolume]);

  const xToSeconds = (clientX: number): number => {
    const track = trackRef.current;
    const dur = durationRef.current;
    if (!track || dur <= 0) return 0;
    const rect = track.getBoundingClientRect();
    return clampNumber(((clientX - rect.left) / rect.width) * dur, 0, dur);
  };

  const clampStartValue = (value: number): number => {
    const end = endSecRef.current;
    const maxStart = Math.max(0, end - MIN_CLIP_SEC);
    const minStart = Math.max(0, end - MAX_CLIP_SEC);
    return clampNumber(value, minStart, maxStart);
  };

  const clampEndValue = (value: number): number => {
    const start = startSecRef.current;
    const dur = durationRef.current;
    const minEnd = Math.min(dur, start + MIN_CLIP_SEC);
    const maxEnd = Math.min(dur, start + MAX_CLIP_SEC);
    return clampNumber(value, minEnd, maxEnd);
  };

  const applyStart = (value: number, scrubVideo: boolean, immediateScrub = false) => {
    const clamped = clampStartValue(value);
    startSecRef.current = clamped;
    onStartChange(secondsToTimeString(clamped));
    if (scrubVideo && dragRef.current === 'start') {
      const dur = durationRef.current;
      if (dur > 0) setPlayheadPct((clamped / dur) * 100);
      if (immediateScrub) scrubSeekNow(clamped);
      else queueScrubSeek(clamped);
    }
  };

  const applyEnd = (value: number, scrubVideo: boolean, immediateScrub = false) => {
    const clamped = clampEndValue(value);
    endSecRef.current = clamped;
    onEndChange(secondsToTimeString(clamped));
    if (scrubVideo && dragRef.current === 'end') {
      const dur = durationRef.current;
      if (dur > 0) setPlayheadPct((clamped / dur) * 100);
      if (immediateScrub) scrubSeekNow(clamped);
      else queueScrubSeek(clamped);
    }
  };

  const prepareVideoForScrub = (seekTarget: number) => {
    const video = videoRef.current;
    if (segmentPreviewActiveRef.current) {
      exitSegmentPreview(seekTarget);
      return;
    }
    if (!video) return;
    video.pause();
    video.controls = false;
    video.muted = true;
    video.loop = false;
    const cutUrl = previewCutUrlRef.current;
    if (videoUrl && cutUrl && video.src !== videoUrl) {
      video.src = videoUrl;
      video.load();
      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        lastScrubSeekRef.current = -1;
        seekToTimeFast(seekTarget);
      };
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
    }
  };

  const handleDragMoveRef = useRef<(clientX: number) => void>(() => {});
  const finishDragRef = useRef<() => void>(() => {});

  handleDragMoveRef.current = (clientX: number) => {
    if (!dragRef.current) return;
    const seconds = xToSeconds(clientX);
    if (dragRef.current === 'start') applyStart(seconds, true, false);
    else applyEnd(seconds, true, false);
  };

  finishDragRef.current = () => {
    const track = trackRef.current;
    const pointerId = activePointerIdRef.current;
    if (track && pointerId !== null && track.hasPointerCapture(pointerId)) {
      track.releasePointerCapture(pointerId);
    }
    activePointerIdRef.current = null;

    const wasDragging = dragRef.current !== null;
    const releaseHandle = dragRef.current;
    const releaseTarget =
      releaseHandle === 'start'
        ? startSecRef.current
        : releaseHandle === 'end'
          ? endSecRef.current
          : null;
    dragRef.current = null;
    stopScrubRaf();
    if (wasDragging) {
      lastScrubSeekRef.current = -1;
      const finishScrub = () => {
        scrubbingRef.current = false;
        if (!segmentPreviewActiveRef.current) {
          setPlayheadPct(null);
        }
      };
      if (releaseTarget !== null) {
        void seekToTimePrecise(releaseTarget).finally(finishScrub);
      } else {
        finishScrub();
      }
      if (onLoopTrimPreviewRef.current) {
        onLoopTrimPreviewRef.current();
      }
    } else {
      scrubbingRef.current = false;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (durationRef.current <= 0) return;
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    const dur = durationRef.current;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startX = (startSecRef.current / dur) * rect.width;
    const endX = (endSecRef.current / dur) * rect.width;
    const handle = Math.abs(x - startX) <= Math.abs(x - endX) ? 'start' : 'end';
    const seconds = xToSeconds(e.clientX);
    const scrubTarget = handle === 'start' ? clampStartValue(seconds) : clampEndValue(seconds);

    docDragCleanupRef.current?.();
    activePointerIdRef.current = e.pointerId;
    docDragCleanupRef.current = bindDocumentPointerDrag({
      pointerId: e.pointerId,
      onMove: (clientX) => handleDragMoveRef.current(clientX),
      onEnd: () => {
        docDragCleanupRef.current = null;
        finishDragRef.current();
      },
    });

    scrubbingRef.current = true;
    dragRef.current = handle;
    lastScrubSeekRef.current = -1;
    try {
      track.setPointerCapture(e.pointerId);
    } catch {
      /* capture may fail on some browsers; document listeners still handle the drag */
    }
    if (handle === 'start') applyStart(seconds, true, true);
    else applyEnd(seconds, true, true);
    queueScrubSeek(scrubTarget);
    prepareVideoForScrub(scrubTarget);
  };

  if (!videoUrl) return null;

  const startPct = duration > 0 ? (startSec / duration) * 100 : 0;
  const endPct = duration > 0 ? (endSec / duration) * 100 : 0;

  return (
    <div className="sm:col-span-2 rounded-md border border-surface/70 bg-bg/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Video trim</h3>
        <span className="text-xs text-text-muted">
          Drag the handles on the timeline (max. {MAX_CLIP_SEC / 60} min).
        </span>
      </div>
      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-md border border-surface bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
          preload="auto"
          draggable={false}
          controls={false}
        />
      </div>
      <div
        ref={trackRef}
        className="relative mt-3 h-10 cursor-text touch-none rounded-md border border-surface bg-bg"
        onPointerDown={onPointerDown}
      >
        <div
          className="absolute inset-y-0 rounded-sm bg-sky-500/25"
          style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-1 -translate-x-1/2 rounded bg-sky-100"
          style={{ left: `${startPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-1 -translate-x-1/2 rounded bg-sky-100"
          style={{ left: `${endPct}%` }}
        />
        {playheadPct !== null ? (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.85)]"
            style={{ left: `${playheadPct}%` }}
            aria-hidden
          >
            <div className="absolute -top-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 border border-amber-200/80 bg-amber-300 rotate-45" />
          </div>
        ) : null}
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs text-text-muted tabular-nums">
        Start <span className="font-mono text-text">{startTime}</span> · End{' '}
        <span className="font-mono text-text">{endTime}</span>
      </p>
    </div>
  );
}
