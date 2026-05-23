import { useCallback, useEffect, useRef } from 'react';
import { isValidTimeString, secondsToTimeString, timeStringToSeconds } from '../lib/time';

const MAX_CLIP_SEC = 30;
const MIN_CLIP_SEC = 0.05;
const END_EPSILON = 0.05;
/** Min interval between scrub seeks while dragging (avoids decode/rebuffer storms). */
const SCRUB_SEEK_MS = 80;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export default function VideoRangeTrimmer({
  videoUrl,
  previewNonce = 0,
  durationSeconds,
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  onPreviewEnd,
  onPreviewError,
}: {
  videoUrl: string;
  previewNonce?: number;
  durationSeconds: number | null;
  startTime: string;
  endTime: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onPreviewEnd?: () => void;
  onPreviewError?: (message: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const segmentPreviewActiveRef = useRef(false);
  const previewNonceRef = useRef(previewNonce);
  const durationRef = useRef(0);
  const startSecRef = useRef(0);
  const endSecRef = useRef(0);
  const onPreviewEndRef = useRef(onPreviewEnd);
  const onPreviewErrorRef = useRef(onPreviewError);
  const lastScrubSeekRef = useRef(-1);
  const scrubSeekTargetRef = useRef<number | null>(null);
  const scrubSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const seekToTime = useCallback((seconds: number) => {
    const video = videoRef.current;
    const dur = durationRef.current;
    if (!video || dur <= 0 || segmentPreviewActiveRef.current) return;
    const target = clampNumber(seconds, 0, Math.max(0, dur - 0.05));
    if (Math.abs(target - lastScrubSeekRef.current) < 0.04) return;
    lastScrubSeekRef.current = target;
    video.pause();
    if (typeof video.fastSeek === 'function') {
      video.fastSeek(target);
    } else {
      video.currentTime = target;
    }
  }, []);

  const clearScrubSeekTimer = useCallback(() => {
    if (scrubSeekTimerRef.current) {
      clearTimeout(scrubSeekTimerRef.current);
      scrubSeekTimerRef.current = null;
    }
    scrubSeekTargetRef.current = null;
  }, []);

  const scrubSeekNow = useCallback(
    (seconds: number) => {
      if (segmentPreviewActiveRef.current || dragRef.current === null) return;
      clearScrubSeekTimer();
      seekToTime(seconds);
    },
    [clearScrubSeekTimer, seekToTime],
  );

  const scheduleScrubSeek = useCallback(
    (seconds: number) => {
      if (segmentPreviewActiveRef.current || dragRef.current === null) return;
      scrubSeekTargetRef.current = seconds;
      if (scrubSeekTimerRef.current) {
        clearTimeout(scrubSeekTimerRef.current);
      }
      scrubSeekTimerRef.current = setTimeout(() => {
        scrubSeekTimerRef.current = null;
        const target = scrubSeekTargetRef.current;
        scrubSeekTargetRef.current = null;
        if (target === null || dragRef.current === null) return;
        seekToTime(target);
      }, SCRUB_SEEK_MS);
    },
    [seekToTime],
  );

  const seekToMidpoint = useCallback(() => {
    const midpoint = (startSecRef.current + endSecRef.current) / 2;
    if (!Number.isFinite(midpoint)) return;
    lastScrubSeekRef.current = -1;
    seekToTime(midpoint);
  }, [seekToTime]);

  const exitSegmentPreview = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    segmentPreviewActiveRef.current = false;
    video.controls = false;
    video.muted = true;
    video.pause();
    seekToMidpoint();
    onPreviewEndRef.current?.();
  }, [seekToMidpoint]);

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
        seekToMidpoint();
      }
    };
    video.addEventListener('loadedmetadata', onLoaded);

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      segmentPreviewActiveRef.current = false;
      video.pause();
      clearScrubSeekTimer();
    };
  }, [videoUrl, seekToMidpoint, clearScrubSeekTimer]);

  useEffect(() => {
    if (previewNonce === previewNonceRef.current) return;
    previewNonceRef.current = previewNonce;
    if (previewNonce === 0) return;

    const video = videoRef.current;
    const dur = durationRef.current;
    const start = startSecRef.current;
    const end = endSecRef.current;
    if (!video || !videoUrl || dur <= 0 || end <= start) return;

    segmentPreviewActiveRef.current = true;
    video.controls = true;
    video.muted = false;

    const startPlayback = () => {
      video.currentTime = clampNumber(start, 0, dur);
      void video.play().catch(() => {
        segmentPreviewActiveRef.current = false;
        onPreviewErrorRef.current?.('Could not start the segment preview.');
        onPreviewEndRef.current?.();
      });
    };

    const onTimeUpdate = () => {
      if (!segmentPreviewActiveRef.current) return;
      if (video.currentTime >= endSecRef.current - END_EPSILON) {
        video.pause();
        exitSegmentPreview();
      }
    };

    const onError = () => {
      if (!segmentPreviewActiveRef.current) return;
      segmentPreviewActiveRef.current = false;
      onPreviewErrorRef.current?.('Could not play the segment preview.');
      onPreviewEndRef.current?.();
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('error', onError, { once: true });

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      startPlayback();
    } else {
      video.addEventListener('loadedmetadata', startPlayback, { once: true });
    }

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('error', onError);
    };
  }, [previewNonce, videoUrl, exitSegmentPreview]);

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
      if (immediateScrub) scrubSeekNow(clamped);
      else scheduleScrubSeek(clamped);
    }
  };

  const applyEnd = (value: number, scrubVideo: boolean, immediateScrub = false) => {
    const clamped = clampEndValue(value);
    endSecRef.current = clamped;
    onEndChange(secondsToTimeString(clamped));
    if (scrubVideo && dragRef.current === 'end') {
      if (immediateScrub) scrubSeekNow(clamped);
      else scheduleScrubSeek(clamped);
    }
  };

  const stopPreviewForScrub = () => {
    if (segmentPreviewActiveRef.current) {
      exitSegmentPreview();
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (durationRef.current <= 0) return;
    stopPreviewForScrub();
    const track = trackRef.current;
    if (!track) return;
    const dur = durationRef.current;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startX = (startSecRef.current / dur) * rect.width;
    const endX = (endSecRef.current / dur) * rect.width;
    dragRef.current = Math.abs(x - startX) <= Math.abs(x - endX) ? 'start' : 'end';
    track.setPointerCapture(e.pointerId);
    lastScrubSeekRef.current = -1;
    const seconds = xToSeconds(e.clientX);
    if (dragRef.current === 'start') applyStart(seconds, true, true);
    else applyEnd(seconds, true, true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const seconds = xToSeconds(e.clientX);
    if (dragRef.current === 'start') applyStart(seconds, true, false);
    else applyEnd(seconds, true, false);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (track?.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId);
    }
    const wasDragging = dragRef.current !== null;
    dragRef.current = null;
    clearScrubSeekTimer();
    if (wasDragging) {
      seekToMidpoint();
    }
  };

  if (!videoUrl) return null;

  const startPct = duration > 0 ? (startSec / duration) * 100 : 0;
  const endPct = duration > 0 ? (endSec / duration) * 100 : 0;

  return (
    <div className="sm:col-span-2 rounded-md border border-surface/70 bg-bg/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Video trim</h3>
        <span className="text-xs text-text-muted">
          Drag the handles on the timeline (max. {MAX_CLIP_SEC}s).
        </span>
      </div>
      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-md border border-surface bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
          preload="auto"
        />
      </div>
      <div
        ref={trackRef}
        className="relative mt-3 h-10 touch-none rounded-md border border-surface bg-bg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs text-text-muted tabular-nums">
        Start <span className="font-mono text-text">{startTime}</span> · End{' '}
        <span className="font-mono text-text">{endTime}</span>
      </p>
    </div>
  );
}
