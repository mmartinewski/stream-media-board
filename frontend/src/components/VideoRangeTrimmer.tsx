import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { bindDocumentPointerDrag } from '../lib/documentPointerDrag';
import { isValidTimeString, secondsToTimeString, timeStringToSeconds } from '../lib/time';
import { effectiveVolumeToElement } from '../lib/volume';
import { captureVideoFrameFile } from '../lib/videoFrameCapture';

export type VideoRangeTrimmerHandle = {
  captureCurrentFrame: () => Promise<File>;
};

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

const VideoRangeTrimmer = forwardRef<
  VideoRangeTrimmerHandle,
  {
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
  }
>(function VideoRangeTrimmer(
  {
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
  },
  ref,
) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragRef = useRef<'start' | 'end' | 'playhead' | null>(null);
  const scrubbingRef = useRef(false);
  const segmentPreviewActiveRef = useRef(false);
  const previewNonceRef = useRef(previewNonce);
  const durationRef = useRef(0);
  const startSecRef = useRef(0);
  const endSecRef = useRef(0);
  const caretSecRef = useRef(0);
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
  const [caretSec, setCaretSec] = useState(0);
  const [scrubDisplaySec, setScrubDisplaySec] = useState<number | null>(null);
  previewCutUrlRef.current = previewCutUrl;
  previewVolumeRef.current = previewVolume;
  caretSecRef.current = caretSec;

  useImperativeHandle(
    ref,
    () => ({
      captureCurrentFrame: async () => {
        const video = videoRef.current;
        if (!video || !videoUrl) {
          throw new Error('Load a video first.');
        }
        video.pause();
        const target = clampNumber(
          caretSecRef.current,
          startSecRef.current,
          endSecRef.current,
        );
        await waitForVideoSeek(video, target);
        return captureVideoFrameFile(video);
      },
    }),
    [videoUrl],
  );

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
    const clamped = clampNumber(absTime, startSecRef.current, endSecRef.current);
    caretSecRef.current = clamped;
    if (segmentPreviewActiveRef.current) {
      setCaretSec(clamped);
    }
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
      const target = clampNumber(
        seekAfterExit ?? caretSecRef.current,
        startSecRef.current,
        endSecRef.current,
      );
      caretSecRef.current = target;
      setCaretSec(target);
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
        const loopStart = useClipDuration
          ? Math.max(0, caretSecRef.current - startSecRef.current)
          : caretSecRef.current;
        if (video.currentTime < end - END_STOP_LEAD_SEC) {
          return false;
        }
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
    caretSecRef.current = startSecRef.current;
    setCaretSec(startSecRef.current);
    video.controls = false;
    video.muted = true;
    video.src = videoUrl;
    video.load();

    const onLoaded = () => {
      if (!segmentPreviewActiveRef.current) {
        void seekToTimePrecise(caretSecRef.current);
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
    const clamped = clampNumber(caretSecRef.current, startSec, endSec);
    if (clamped !== caretSecRef.current) {
      caretSecRef.current = clamped;
      setCaretSec(clamped);
    }
  }, [startSec, endSec]);

  useEffect(() => {
    if (segmentPreviewActiveRef.current || dragRef.current || !videoUrl || duration <= 0) {
      return;
    }
    void seekToTimePrecise(caretSecRef.current);
  }, [startTime, endTime, videoUrl, duration, seekToTimePrecise]);

  useEffect(() => {
    if (previewNonce === previewNonceRef.current) return;
    previewNonceRef.current = previewNonce;

    if (previewNonce === 0) {
      if (segmentPreviewActiveRef.current) {
        exitSegmentPreview();
      }
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

      const caretOffset = Math.max(0, caretSecRef.current - startSecRef.current);

      const begin = () => {
        video.loop = false;
        applyPreviewVolume(video);
        void waitForVideoSeek(video, caretOffset)
          .then(() => video.play())
          .then(() => {
            if (!segmentPreviewActiveRef.current) return;
            startPreviewWatch(video, { useClipDuration: true });
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

    const playStagingSegment = () => {
      stopPreviewWatch();
      const caret = clampNumber(caretSecRef.current, start, end);
      const begin = () => {
        video.loop = false;
        applyPreviewVolume(video);
        void waitForVideoSeek(video, caret)
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

  const clampCaretValue = (value: number): number => {
    return clampNumber(value, startSecRef.current, endSecRef.current);
  };

  const applyStart = (value: number, scrubVideo: boolean, immediateScrub = false) => {
    const clamped = clampStartValue(value);
    startSecRef.current = clamped;
    onStartChange(secondsToTimeString(clamped));
    if (scrubVideo && dragRef.current === 'start') {
      setScrubDisplaySec(clamped);
      if (immediateScrub) scrubSeekNow(clamped);
      else queueScrubSeek(clamped);
    }
  };

  const applyEnd = (value: number, scrubVideo: boolean, immediateScrub = false) => {
    const clamped = clampEndValue(value);
    endSecRef.current = clamped;
    onEndChange(secondsToTimeString(clamped));
    if (scrubVideo && dragRef.current === 'end') {
      setScrubDisplaySec(clamped);
      if (immediateScrub) scrubSeekNow(clamped);
      else queueScrubSeek(clamped);
    }
  };

  const applyCaret = (value: number, scrubVideo: boolean, immediateScrub = false) => {
    const clamped = clampCaretValue(value);
    caretSecRef.current = clamped;
    setCaretSec(clamped);
    setScrubDisplaySec(clamped);
    if (scrubVideo && dragRef.current === 'playhead') {
      if (immediateScrub) scrubSeekNow(clamped);
      else queueScrubSeek(clamped);
    }
  };

  const positionCaret = (seconds: number) => {
    const clamped = clampCaretValue(seconds);
    caretSecRef.current = clamped;
    setCaretSec(clamped);
    prepareVideoForScrub(clamped);
    void seekToTimePrecise(clamped);
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
    else if (dragRef.current === 'end') applyEnd(seconds, true, false);
    else applyCaret(seconds, true, false);
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
          : releaseHandle === 'playhead'
            ? caretSecRef.current
            : null;
    dragRef.current = null;
    stopScrubRaf();
    if (wasDragging) {
      lastScrubSeekRef.current = -1;
      const finishScrub = () => {
        scrubbingRef.current = false;
        setScrubDisplaySec(null);
      };
      if (releaseTarget !== null) {
        void seekToTimePrecise(releaseTarget).finally(finishScrub);
      } else {
        finishScrub();
      }
      if (releaseHandle === 'start' || releaseHandle === 'end') {
        if (onLoopTrimPreviewRef.current) {
          onLoopTrimPreviewRef.current();
        }
      }
    } else {
      scrubbingRef.current = false;
      setScrubDisplaySec(null);
    }
  };

  const beginDrag = (
    e: React.PointerEvent,
    handle: 'start' | 'end' | 'playhead',
    scrubTarget: number,
  ) => {
    const track = trackRef.current;
    if (!track || durationRef.current <= 0) return;

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
    prepareVideoForScrub(scrubTarget);
    queueScrubSeek(scrubTarget);
  };

  const onPlayheadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (durationRef.current <= 0) return;
    e.preventDefault();
    const seconds = clampCaretValue(xToSeconds(e.clientX));
    beginDrag(e, 'playhead', seconds);
    applyCaret(seconds, true, true);
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
    const playheadX = (caretSecRef.current / dur) * rect.width;
    const seconds = xToSeconds(e.clientX);
    const handleHitPx = 14;

    const distToPlayhead = Math.abs(x - playheadX);
    const distToStart = Math.abs(x - startX);
    const distToEnd = Math.abs(x - endX);

    if (distToPlayhead <= handleHitPx) {
      beginDrag(e, 'playhead', clampCaretValue(seconds));
      applyCaret(seconds, true, true);
      return;
    }

    if (x > startX + handleHitPx && x < endX - handleHitPx) {
      positionCaret(seconds);
      return;
    }

    const handle =
      distToStart <= distToEnd ? 'start' : 'end';
    const scrubTarget = handle === 'start' ? clampStartValue(seconds) : clampEndValue(seconds);

    beginDrag(e, handle, scrubTarget);
    if (handle === 'start') applyStart(seconds, true, true);
    else applyEnd(seconds, true, true);
  };

  if (!videoUrl) return null;

  const startPct = duration > 0 ? (startSec / duration) * 100 : 0;
  const endPct = duration > 0 ? (endSec / duration) * 100 : 0;
  const displaySec = scrubDisplaySec ?? caretSec;
  const playheadPct = duration > 0 ? (displaySec / duration) * 100 : 0;

  return (
    <div className="sm:col-span-2 rounded-md border border-surface/70 bg-bg/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Video trim</h3>
        <span className="text-xs text-text-muted">
          Drag trim handles or the frame caret (max. {MAX_CLIP_SEC / 60} min).
        </span>
      </div>
      <div className="relative mt-3 flex items-center justify-center overflow-hidden rounded-md border border-surface bg-black">
        <video
          ref={videoRef}
          className="max-h-[min(31.1rem,84.4vh)] w-full object-contain"
          playsInline
          preload="auto"
          draggable={false}
          controls={false}
        />
      </div>
      <div className="relative mt-3 overflow-visible pb-1">
        <div
          ref={trackRef}
          className="relative h-10 cursor-text touch-none rounded-md border border-surface bg-bg"
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
          {duration > 0 ? (
            <div
              className="absolute inset-y-0 z-10 -translate-x-1/2"
              style={{ left: `${playheadPct}%` }}
            >
              <div
                className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.85)]"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -top-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 border border-amber-200/80 bg-amber-300 rotate-45"
                aria-hidden
              />
              <div
                role="slider"
                aria-label="Current frame position"
                aria-valuemin={startSec}
                aria-valuemax={endSec}
                aria-valuenow={displaySec}
                className="absolute bottom-0 left-1/2 h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 cursor-grab rounded-full border-2 border-amber-200 bg-amber-300 shadow-md active:cursor-grabbing"
                onPointerDown={onPlayheadPointerDown}
              />
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs text-text-muted tabular-nums">
        Start <span className="font-mono text-text">{startTime}</span> · End{' '}
        <span className="font-mono text-text">{endTime}</span>
        {duration > 0 ? (
          <>
            {' '}
            · Frame <span className="font-mono text-text">{secondsToTimeString(displaySec)}</span>
          </>
        ) : null}
      </p>
    </div>
  );
});

export default VideoRangeTrimmer;
