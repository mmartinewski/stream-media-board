import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type LayoutAreaDto, type PrefetchResponse } from '../lib/api';
import { getBrowserOverlayUrl } from '../lib/overlay';
import type { VideoOrientation } from '../lib/api';
import { normalizeVideoOrientation, videoOrientationLabel, type BrowserSourceMode } from '../lib/videoOrientation';
import VideoRangeTrimmer from '../components/VideoRangeTrimmer';
import { isValidYoutubeUrl } from '../lib/youtube';
import { isValidTimeString, secondsToTimeString, timeStringToSeconds } from '../lib/time';
import { bindDocumentPointerDrag } from '../lib/documentPointerDrag';
import { effectiveVolumeToElement } from '../lib/volume';

type AudioSourceType = 'youtube' | 'mp3-url' | 'local-file';
type VideoSourceType = 'youtube' | 'local-file';
type EditorKind = 'audio' | 'video';

const BROWSER_SOURCE_MODES: ReadonlyArray<[BrowserSourceMode, string]> = [
  ['audio', 'Audio clips'],
  ['universal', 'Universal (audio + all videos)'],
  ['landscape', 'Landscape video (legacy)'],
  ['portrait', 'Portrait video (legacy)'],
];

const BROWSER_SOURCE_MODES_VIDEO: ReadonlyArray<[BrowserSourceMode, string]> = [
  ['stage', 'Stage (recommended — layout areas)'],
  ['landscape', 'Landscape (legacy)'],
  ['portrait', 'Portrait (legacy)'],
  ['universal', 'Universal (legacy)'],
];

function BrowserSourceInstructionsCard({
  editorKind,
  onCopyError,
}: {
  editorKind: EditorKind;
  onCopyError?: (message: string) => void;
}) {
  const modes =
    editorKind === 'audio'
      ? BROWSER_SOURCE_MODES.filter(([mode]) => mode === 'audio' || mode === 'universal')
      : BROWSER_SOURCE_MODES_VIDEO;

  return (
    <div className="rounded-md border border-sky-500/40 bg-sky-500/10 p-4">
      <h3 className="text-sm font-medium text-sky-100">
        Browser overlay (OBS, Streamlabs, and similar)
      </h3>
      <p className="mt-2 text-sm text-text-muted">
        {editorKind === 'audio' ? (
          <>
            Audio clips play on a browser overlay in your streaming app when you click them on the
            Media Board. Add a source with{' '}
            <span className="font-medium text-text">?mode=audio</span> for audio only (or{' '}
            <span className="font-medium text-text">universal</span> for a single overlay for
            everything).
          </>
        ) : (
          <>
            Video clips play on browser overlays. Prefer{' '}
            <span className="font-medium text-text">?mode=stage</span> at canvas resolution (layout
            areas in the app), or legacy{' '}
            <span className="font-medium text-text">?mode=landscape</span> /{' '}
            <span className="font-medium text-text">?mode=portrait</span>. Add{' '}
            <span className="font-medium text-text">?mode=audio</span> for audio clips. Avoid{' '}
            <span className="font-medium text-text">universal</span> if you already use
            orientation-specific video sources (videos would play twice).
          </>
        )}
      </p>
      <p className="mt-2 text-xs text-text-muted">Overlay URLs (copy the ones you need):</p>
      <ul className="mt-2 space-y-2 text-xs text-text-muted">
        {modes.map(([mode, label]) => (
          <li key={mode} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[7rem] font-medium text-text">{label}</span>
            <code className="min-w-0 flex-1 break-all rounded-md border border-surface bg-bg px-2 py-1 text-text">
              {getBrowserOverlayUrl(mode)}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(getBrowserOverlayUrl(mode)).catch(() => {
                  onCopyError?.('Could not copy the overlay URL to the clipboard.');
                });
              }}
              className="shrink-0 rounded-md border border-surface bg-bg px-2 py-1 text-xs font-medium hover:border-accent"
            >
              Copy
            </button>
          </li>
        ))}
      </ul>
      <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-text-muted">
        <li>
          <span className="font-medium text-text">Any browser source:</span> add a web/browser
          overlay source, paste the URL, set size (video: canvas; audio: small/hidden is fine).
        </li>
        <li>
          <span className="font-medium text-text">OBS Studio:</span> Sources → + → Browser.
        </li>
        <li>
          <span className="font-medium text-text">Streamlabs:</span> Sources → + → Browser Source.
        </li>
      </ul>
    </div>
  );
}

interface Props {
  mode: 'create' | 'edit';
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_CLIP_SEC = 30;
const MIN_CLIP_SEC = 0.05;
const MAX_THUMBNAIL_BYTES = 1024 * 1024;
const VALID_THUMBNAIL_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VALID_THUMBNAIL_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function centeredSquare(nw: number, nh: number): CropRect {
  const side = Math.min(nw, nh);
  return {
    x: Math.floor((nw - side) / 2),
    y: Math.floor((nh - side) / 2),
    width: side,
    height: side,
  };
}

function clampCrop(c: CropRect, nw: number, nh: number): CropRect {
  const side = Math.min(c.width, c.height, nw, nh);
  const x = Math.max(0, Math.min(c.x, nw - side));
  const y = Math.max(0, Math.min(c.y, nh - side));
  return { x, y, width: side, height: side };
}

function resizeCropAroundCenter(
  crop: CropRect,
  side: number,
  nw: number,
  nh: number,
): CropRect {
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  const safeSide = Math.max(1, Math.min(side, nw, nh));
  return clampCrop(
    {
      x: centerX - safeSide / 2,
      y: centerY - safeSide / 2,
      width: safeSide,
      height: safeSide,
    },
    nw,
    nh,
  );
}

function parseServerCrop(json: string | null | undefined): CropRect | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const x = Number(o.x);
    const y = Number(o.y);
    const w = Number(o.width);
    const h = Number(o.height);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    return { x, y, width: w, height: h };
  } catch {
    return null;
  }
}

function isSavedClipSourceReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('local-file://') || trimmed.startsWith('existing-clip://');
}

function savedClipSourceLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('local-file://')) {
    return trimmed.slice('local-file://'.length) || 'local file';
  }
  if (trimmed.startsWith('existing-clip://')) {
    return trimmed.slice('existing-clip://'.length) || 'saved clip';
  }
  return trimmed;
}

function clampTrimTimesToDuration(
  startTime: string,
  endTime: string,
  durationSeconds: number,
): { startTime: string; endTime: string } {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { startTime, endTime };
  }
  let startSec = isValidTimeString(startTime) ? timeStringToSeconds(startTime) : 0;
  let endSec = isValidTimeString(endTime) ? timeStringToSeconds(endTime) : durationSeconds;
  if (!Number.isFinite(startSec)) startSec = 0;
  if (!Number.isFinite(endSec)) endSec = durationSeconds;

  startSec = Math.max(0, Math.min(startSec, durationSeconds));
  endSec = Math.max(0, Math.min(endSec, durationSeconds));
  if (endSec <= startSec) {
    endSec = Math.min(durationSeconds, startSec + MIN_CLIP_SEC);
  }
  if (endSec <= startSec) {
    startSec = 0;
    endSec = Math.min(durationSeconds, MAX_CLIP_SEC);
  }

  return {
    startTime: secondsToTimeString(startSec),
    endTime: secondsToTimeString(endSec),
  };
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of raw.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean)) {
    const key = tag.toLocaleLowerCase('en');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function getImageLayout(img: HTMLImageElement) {
  const cw = img.clientWidth;
  const ch = img.clientHeight;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const ratio = Math.min(cw / nw, ch / nh);
  const dw = nw * ratio;
  const dh = nh * ratio;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  return { ratio, ox, oy, nw, nh, cw, ch };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateThumbnailFile(file: File): string | null {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  const hasValidType = VALID_THUMBNAIL_TYPES.has(type);
  const hasValidExtension = Array.from(VALID_THUMBNAIL_EXTENSIONS).some((ext) =>
    name.endsWith(ext),
  );
  if (!hasValidType && !hasValidExtension) {
    return 'Only JPEG, PNG, and WebP images are supported.';
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return 'Image is too large (max 1 MB).';
  }
  return null;
}

function imageExtensionFromMime(type: string): 'jpg' | 'png' | 'webp' {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function firstDroppedImageFile(dataTransfer: DataTransfer): File | null {
  return Array.from(dataTransfer.files).find((file) => file.type.startsWith('image/')) ?? null;
}

function formatSessionTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function droppedImageUrl(dataTransfer: DataTransfer): string {
  const html = dataTransfer.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const imgSrc = doc.querySelector('img')?.getAttribute('src')?.trim();
    if (imgSrc) return imgSrc;
  }

  const uriList = dataTransfer
    .getData('text/uri-list')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  if (uriList) return uriList;

  const plain = dataTransfer.getData('text/plain').trim();
  return isValidHttpUrl(plain) ? plain : '';
}

function getAudioContext(): AudioContext {
  return new AudioContext();
}

function WaveformTrimmer({
  audioUrl,
  durationSeconds,
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  playheadSec = null,
  onTrimRelease,
}: {
  audioUrl: string;
  durationSeconds: number | null;
  startTime: string;
  endTime: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  playheadSec?: number | null;
  onTrimRelease?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const docDragCleanupRef = useRef<(() => void) | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const finishDragRef = useRef<() => void>(() => {});
  const handleDragMoveRef = useRef<(clientX: number) => void>(() => {});
  const [scrubPlayheadSec, setScrubPlayheadSec] = useState<number | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [loading, setLoading] = useState(false);
  const [waveError, setWaveError] = useState<string | null>(null);

  const duration = durationSeconds ?? 0;
  const startSec = isValidTimeString(startTime) ? timeStringToSeconds(startTime) : 0;
  const endSec = isValidTimeString(endTime)
    ? timeStringToSeconds(endTime)
    : Math.min(duration, MAX_CLIP_SEC);

  const effectivePlayheadSec = scrubPlayheadSec ?? playheadSec;

  useEffect(() => {
    return () => {
      docDragCleanupRef.current?.();
      docDragCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => setCanvasWidth(canvas.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    setLoading(true);
    setWaveError(null);
    setPeaks([]);

    (async () => {
      try {
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const audioData = await res.arrayBuffer();
        const ctx = getAudioContext();
        const buffer = await ctx.decodeAudioData(audioData.slice(0));
        await ctx.close();
        if (cancelled) return;

        const channel = buffer.getChannelData(0);
        const targetBars = Math.max(120, Math.min(600, Math.round((canvasWidth || 600) / 3)));
        const blockSize = Math.max(1, Math.floor(channel.length / targetBars));
        const nextPeaks: number[] = [];
        for (let i = 0; i < targetBars; i += 1) {
          let max = 0;
          const start = i * blockSize;
          const end = Math.min(channel.length, start + blockSize);
          for (let j = start; j < end; j += 1) {
            const v = Math.abs(channel[j] ?? 0);
            if (v > max) max = v;
          }
          nextPeaks.push(max);
        }
        const peakMax = Math.max(...nextPeaks, 0.001);
        setPeaks(nextPeaks.map((p) => p / peakMax));
      } catch {
        if (!cancelled) {
          setWaveError('Could not draw the waveform for this audio.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, canvasWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssWidth = Math.max(1, canvas.clientWidth);
    const cssHeight = Math.max(1, canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const mid = cssHeight / 2;
    const barGap = 1;
    const barWidth = Math.max(1, cssWidth / Math.max(peaks.length, 1) - barGap);
    const startX = duration > 0 ? (startSec / duration) * cssWidth : 0;
    const endX = duration > 0 ? (endSec / duration) * cssWidth : 0;

    peaks.forEach((peak, index) => {
      const x = index * (barWidth + barGap);
      const h = Math.max(1, peak * (cssHeight - 18));
      const inSelection = x >= startX && x <= endX;
      ctx.fillStyle = inSelection ? '#38bdf8' : '#475569';
      ctx.fillRect(x, mid - h / 2, barWidth, h);
    });

    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.fillRect(startX, 0, Math.max(0, endX - startX), cssHeight);

    for (const x of [startX, endX]) {
      ctx.fillStyle = '#e5f6ff';
      ctx.fillRect(x - 2, 0, 4, cssHeight);
      ctx.beginPath();
      ctx.arc(x, mid, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    if (effectivePlayheadSec !== null && duration > 0) {
      const playheadX = clampNumber((effectivePlayheadSec / duration) * cssWidth, 0, cssWidth);
      ctx.fillStyle = '#fcd34d';
      ctx.shadowColor = 'rgba(252, 211, 77, 0.85)';
      ctx.shadowBlur = 8;
      ctx.fillRect(playheadX - 1, 0, 2, cssHeight);
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX + 5, 5);
      ctx.lineTo(playheadX - 5, 5);
      ctx.closePath();
      ctx.fillStyle = '#fcd34d';
      ctx.fill();
    }
  }, [peaks, canvasWidth, duration, startSec, endSec, effectivePlayheadSec]);

  const xToSeconds = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    return clampNumber(((clientX - rect.left) / rect.width) * duration, 0, duration);
  };

  const applyStart = (value: number) => {
    const maxStart = Math.max(0, endSec - MIN_CLIP_SEC);
    const minStart = Math.max(0, endSec - MAX_CLIP_SEC);
    const clamped = clampNumber(value, minStart, maxStart);
    if (dragRef.current === 'start' && duration > 0) {
      setScrubPlayheadSec(clamped);
    }
    onStartChange(secondsToTimeString(clamped));
  };

  const applyEnd = (value: number) => {
    const minEnd = Math.min(duration, startSec + MIN_CLIP_SEC);
    const maxEnd = Math.min(duration, startSec + MAX_CLIP_SEC);
    onEndChange(secondsToTimeString(clampNumber(value, minEnd, maxEnd)));
  };

  handleDragMoveRef.current = (clientX: number) => {
    if (!dragRef.current) return;
    const seconds = xToSeconds(clientX);
    if (dragRef.current === 'start') applyStart(seconds);
    else applyEnd(seconds);
  };

  finishDragRef.current = () => {
    const canvas = canvasRef.current;
    const pointerId = activePointerIdRef.current;
    if (canvas && pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    activePointerIdRef.current = null;

    const wasDragging = dragRef.current !== null;
    dragRef.current = null;
    setScrubPlayheadSec(null);
    if (wasDragging) {
      onTrimRelease?.();
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startX = (startSec / duration) * rect.width;
    const endX = (endSec / duration) * rect.width;
    dragRef.current = Math.abs(x - startX) <= Math.abs(x - endX) ? 'start' : 'end';

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

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* document listeners handle the drag if capture fails */
    }
    if (dragRef.current === 'start') applyStart(xToSeconds(e.clientX));
    else applyEnd(xToSeconds(e.clientX));
  };

  if (!audioUrl) return null;

  return (
    <div className="sm:col-span-2 rounded-md border border-surface/70 bg-bg/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Audio trim</h3>
        <span className="text-xs text-text-muted">
          Drag the handles on the waveform to adjust start and end.
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="mt-3 h-32 w-full cursor-text touch-none rounded-md border border-surface bg-bg"
        onPointerDown={onPointerDown}
      />
      {loading && <p className="mt-2 text-xs text-text-muted">Generating waveform...</p>}
      {waveError && <p className="mt-2 text-xs text-red-300">{waveError}</p>}
      <p className="mt-2 text-xs text-text-muted">
        Start <span className="font-mono text-text">{startTime}</span> · End{' '}
        <span className="font-mono text-text">{endTime}</span>
      </p>
    </div>
  );
}

function ThumbnailCropper({
  src,
  crop,
  onCropChange,
  onNaturalReady,
}: {
  src: string;
  crop: CropRect | null;
  onCropChange: (c: CropRect) => void;
  onNaturalReady: (nw: number, nh: number) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);
  const [, bump] = useState(0);
  const relayout = useCallback(() => bump((n) => n + 1), []);

  useEffect(() => {
    const onResize = () => relayout();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [relayout]);

  useEffect(() => {
    relayout();
  }, [crop, relayout]);

  const onPointerDown = (e: React.PointerEvent) => {
    const img = imgRef.current;
    if (!img || img.naturalWidth === 0 || !crop) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const img = imgRef.current;
    if (!d || !img) return;
    const L = getImageLayout(img);
    const dxNat = (e.clientX - d.startX) / L.ratio;
    const dyNat = (e.clientY - d.startY) / L.ratio;
    const next = clampCrop(
      {
        x: d.startCrop.x + dxNat,
        y: d.startCrop.y + dyNat,
        width: d.startCrop.width,
        height: d.startCrop.height,
      },
      L.nw,
      L.nh,
    );
    onCropChange(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  };

  const box = useMemo(() => {
    if (!crop) return null;
    const img = imgRef.current;
    if (!img || img.naturalWidth === 0) return null;
    const L = getImageLayout(img);
    return {
      left: L.ox + crop.x * L.ratio,
      top: L.oy + crop.y * L.ratio,
      width: crop.width * L.ratio,
      height: crop.height * L.ratio,
    };
  }, [crop, src, relayout]);

  const zoom = useMemo(() => {
    const img = imgRef.current;
    if (!img || !crop || img.naturalWidth === 0) return 100;
    const maxSide = Math.min(img.naturalWidth, img.naturalHeight);
    return Math.round((maxSide / crop.width) * 100);
  }, [crop, src, relayout]);

  const onZoomChange = (nextZoom: number) => {
    const img = imgRef.current;
    if (!img || !crop || img.naturalWidth === 0) return;
    const maxSide = Math.min(img.naturalWidth, img.naturalHeight);
    const clampedZoom = Math.max(100, Math.min(500, nextZoom));
    const nextSide = maxSide / (clampedZoom / 100);
    onCropChange(
      resizeCropAroundCenter(crop, nextSide, img.naturalWidth, img.naturalHeight),
    );
  };

  return (
    <div className="max-w-full rounded-md border border-surface bg-bg-soft p-2">
      <div className="relative inline-block max-w-full">
        <img
          ref={imgRef}
          src={src}
          alt="Thumbnail preview"
          className="block max-h-72 w-auto max-w-full select-none"
          onLoad={() => {
            const img = imgRef.current;
            if (img) {
              onNaturalReady(img.naturalWidth, img.naturalHeight);
            }
            relayout();
          }}
          draggable={false}
        />
        {crop && box && (
          <div
            className="pointer-events-auto absolute cursor-grab border-2 border-accent shadow-md active:cursor-grabbing"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
      </div>
      {crop && (
        <div className="mt-3 max-w-md">
          <label htmlFor="thumbnail-zoom" className="block text-xs font-medium text-text-muted">
            Thumbnail zoom: {zoom}%
          </label>
          <input
            id="thumbnail-zoom"
            type="range"
            min={100}
            max={500}
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="mt-1 w-full accent-accent"
          />
        </div>
      )}
      <p className="mt-2 text-xs text-text-muted">
        Adjust the zoom and drag the square to choose the 1:1 thumbnail area.
      </p>
    </div>
  );
}

export default function ClipFormPage({ mode }: Props) {
  const navigate = useNavigate();
  const params = useParams();
  const clipId = mode === 'edit' ? Number(params.id) : NaN;
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const loopTrimPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSessionActiveRef = useRef(false);
  const [videoPreviewNonce, setVideoPreviewNonce] = useState(0);
  const [videoPreviewCutUrl, setVideoPreviewCutUrl] = useState<string | null>(null);
  const [audioPlayheadSec, setAudioPlayheadSec] = useState<number | null>(null);
  const [videoOrientation, setVideoOrientation] = useState<VideoOrientation>('landscape');
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [layoutAreas, setLayoutAreas] = useState<LayoutAreaDto[]>([]);
  const [defaultLayoutAreaId, setDefaultLayoutAreaId] = useState<number | ''>('');

  const [editorKind, setEditorKind] = useState<EditorKind>('audio');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [mp3Url, setMp3Url] = useState('');
  const [localMp3File, setLocalMp3File] = useState<File | null>(null);
  const [localVideoFile, setLocalVideoFile] = useState<File | null>(null);
  const [audioSourceType, setAudioSourceType] = useState<AudioSourceType>('youtube');
  const [videoSourceType, setVideoSourceType] = useState<VideoSourceType>('youtube');
  const [sourceReference, setSourceReference] = useState('');
  const [processId, setProcessId] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [suggestedThumbnailUrl, setSuggestedThumbnailUrl] = useState('');
  const [startTime, setStartTime] = useState('00:00:00.000');
  const [endTime, setEndTime] = useState('00:00:30.000');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [volume, setVolume] = useState(75);
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreviewSrc, setThumbPreviewSrc] = useState('');
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [pendingServerCrop, setPendingServerCrop] = useState<CropRect | null>(null);

  const [loadingClip, setLoadingClip] = useState(mode === 'edit');
  const [prefetching, setPrefetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [thumbnailDragActive, setThumbnailDragActive] = useState(false);
  const [loadingDroppedThumbnail, setLoadingDroppedThumbnail] = useState(false);
  const [loadingSuggestedThumbnail, setLoadingSuggestedThumbnail] = useState(false);
  const [youtubeSessionConnected, setYoutubeSessionConnected] = useState(false);
  const [youtubeSessionUpdatedAt, setYoutubeSessionUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validYoutubeUrl = isValidYoutubeUrl(youtubeUrl);
  const validMp3Url = isValidHttpUrl(mp3Url);
  const timesOk =
    isValidTimeString(startTime) &&
    isValidTimeString(endTime) &&
    timeStringToSeconds(endTime) > timeStringToSeconds(startTime);
  const clipLen =
    timesOk && isValidTimeString(startTime) && isValidTimeString(endTime)
      ? timeStringToSeconds(endTime) - timeStringToSeconds(startTime)
      : 0;
  const clipLenOk = clipLen > 0 && clipLen <= MAX_CLIP_SEC + 0.001;
  const durationOk =
    durationSeconds === null ||
    !timesOk ||
    (timeStringToSeconds(endTime) <= durationSeconds + 0.05 &&
      timeStringToSeconds(startTime) >= -0.001);

  const canPrefetchAudio =
    !prefetching &&
    (audioSourceType === 'youtube'
      ? validYoutubeUrl
      : audioSourceType === 'mp3-url'
        ? validMp3Url
        : Boolean(localMp3File));
  const canPrefetchVideo =
    !prefetching &&
    (videoSourceType === 'youtube'
      ? validYoutubeUrl
      : Boolean(localVideoFile) ||
        (mode === 'edit' && isSavedClipSourceReference(sourceReference)));
  const thumbReady = Boolean(thumbPreviewSrc && crop);
  const canSaveCreate =
    mode === 'create' &&
    Boolean(processId && thumbFile && title.trim() && category.trim() && thumbReady) &&
    timesOk &&
    clipLenOk &&
    durationOk;
  const canSaveEdit =
    mode === 'edit' &&
    Number.isInteger(clipId) &&
    clipId >= 1 &&
    Boolean(processId && title.trim() && category.trim() && thumbReady) &&
    timesOk &&
    clipLenOk &&
    durationOk;

  const applyPrefetchResult = useCallback((pf: PrefetchResponse, options?: {
    sourceReference?: string;
    updateTitle?: boolean;
    preserveTimes?: boolean;
    mediaKind?: EditorKind;
  }) => {
    const kind = options?.mediaKind ?? pf.media_kind ?? 'audio';
    setProcessId(pf.process_id);
    setDurationSeconds(pf.duration_seconds);
    setAudioUrl(kind === 'audio' ? pf.audio_url : '');
    setVideoUrl(kind === 'video' ? (pf.video_url ?? '') : '');
    setSuggestedThumbnailUrl(pf.thumbnail_url);
    if (options?.sourceReference) setSourceReference(options.sourceReference);
    if (options?.updateTitle !== false && pf.title?.trim()) {
      setTitle((current) => current.trim() ? current : pf.title?.trim() ?? current);
    }
    if (!options?.preserveTimes) {
      const endSec = Math.min(MAX_CLIP_SEC, pf.duration_seconds);
      setStartTime('00:00:00.000');
      setEndTime(secondsToTimeString(endSec));
    }
    if (kind === 'video' && pf.suggested_orientation) {
      setVideoOrientation(pf.suggested_orientation);
    }
    if (kind === 'video' && pf.video_width && pf.video_height) {
      setVideoDimensions({ width: pf.video_width, height: pf.video_height });
    }
  }, []);

  const clearLoadedMedia = () => {
    setProcessId('');
    setDurationSeconds(null);
    setAudioUrl('');
    setVideoUrl('');
    setSuggestedThumbnailUrl('');
    setSourceReference('');
  };

  const stopClientPreview = useCallback(() => {
    previewSessionActiveRef.current = false;
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.loop = false;
      audio.removeAttribute('src');
      audio.load();
    }
    setPreviewing(false);
    setAudioPlayheadSec(null);
  }, []);

  const stopVideoPreview = useCallback(() => {
    previewSessionActiveRef.current = false;
    setPreviewing(false);
  }, []);

  const pauseVideoPreview = useCallback(() => {
    setVideoPreviewCutUrl(null);
    setPreviewing(false);
  }, []);

  useEffect(() => {
    if (editorKind !== 'video') return;
    let cancelled = false;
    void api
      .getLayoutAreas()
      .then((res) => {
        if (!cancelled) setLayoutAreas(res.areas);
      })
      .catch(() => {
        if (!cancelled) setLayoutAreas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [editorKind]);

  useEffect(() => {
    if (mode !== 'edit' || !Number.isInteger(clipId) || clipId < 1) return;
    let cancelled = false;
    setLoadingClip(true);
    setError(null);
    (async () => {
      try {
        const c = await api.getClip(clipId);
        if (cancelled) return;
        setTitle(c.title);
        setCategory(c.category.name ?? '');
        setTags(parseTags(c.tags ?? ''));
        setIsFavorite(c.is_favorite === 1);
        const isVideoClip = c.clip_type === 'video';
        setVolume(isVideoClip ? Math.min(100, c.volume) : c.volume);
        setSourceReference(c.youtube_url);
        setEditorKind(isVideoClip ? 'video' : 'audio');
        if (isVideoClip) {
          if (isValidYoutubeUrl(c.youtube_url)) {
            setVideoSourceType('youtube');
            setYoutubeUrl(c.youtube_url);
          } else {
            setVideoSourceType('local-file');
          }
        } else if (isValidYoutubeUrl(c.youtube_url)) {
          setAudioSourceType('youtube');
          setYoutubeUrl(c.youtube_url);
        } else if (isValidHttpUrl(c.youtube_url)) {
          setAudioSourceType('mp3-url');
          setMp3Url(c.youtube_url);
        } else {
          setAudioSourceType('local-file');
        }
        setStartTime(c.start_time);
        setEndTime(c.end_time);
        if (isVideoClip && c.video_orientation) {
          setVideoOrientation(normalizeVideoOrientation(c.video_orientation));
        }
        if (isVideoClip) {
          setDefaultLayoutAreaId(
            c.default_layout_area_id != null ? c.default_layout_area_id : '',
          );
        }
        if (isVideoClip && c.video_width && c.video_height) {
          setVideoDimensions({ width: c.video_width, height: c.video_height });
        }
        setPendingServerCrop(parseServerCrop(c.thumbnail_crop_meta));
        setThumbFile(null);
        setThumbPreviewSrc(c.thumbnail_original_url);
        setCrop(null);
        const pf = isVideoClip
          ? isValidYoutubeUrl(c.youtube_url)
            ? await api.prefetchYoutubeVideo(c.youtube_url)
            : await api.stageClipVideo(clipId)
          : isValidYoutubeUrl(c.youtube_url)
            ? await api.prefetchYoutube(c.youtube_url)
            : await api.stageClipAudio(clipId);
        if (cancelled) return;
        applyPrefetchResult(pf, {
          updateTitle: false,
          preserveTimes: true,
          mediaKind: isVideoClip ? 'video' : 'audio',
        });
        const clamped = clampTrimTimesToDuration(
          c.start_time,
          c.end_time,
          pf.duration_seconds,
        );
        setStartTime(clamped.startTime);
        setEndTime(clamped.endTime);
        if (isVideoClip && !isValidYoutubeUrl(c.youtube_url) && isSavedClipSourceReference(c.youtube_url)) {
          setSourceReference(`existing-clip://${c.title.trim() || 'clip'}`);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingClip(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, clipId, applyPrefetchResult]);

  useEffect(() => {
    return () => {
      if (thumbPreviewSrc.startsWith('blob:')) {
        URL.revokeObjectURL(thumbPreviewSrc);
      }
    };
  }, [thumbPreviewSrc]);

  useEffect(() => {
    stopClientPreview();
    stopVideoPreview();
  }, [audioUrl, videoUrl, stopClientPreview, stopVideoPreview]);

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    const onEnded = () => {
      if (!audio.loop) {
        setPreviewing(false);
        setAudioPlayheadSec(null);
      }
    };
    const onError = () => {
      previewSessionActiveRef.current = false;
      setPreviewing(false);
      setAudioPlayheadSec(null);
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    if (!previewing || editorKind !== 'audio') {
      setAudioPlayheadSec(null);
      return;
    }

    let raf = 0;
    const tick = () => {
      const audio = previewAudioRef.current;
      const start = isValidTimeString(startTime) ? timeStringToSeconds(startTime) : 0;
      if (audio && previewing) {
        setAudioPlayheadSec(start + audio.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [previewing, editorKind, startTime]);

  useEffect(() => {
    if (!previewing || editorKind !== 'audio') return;
    const audio = previewAudioRef.current;
    if (!audio) return;
    audio.volume = effectiveVolumeToElement(volume, 100);
  }, [previewing, editorKind, volume]);

  const refreshYoutubeSession = useCallback(async () => {
    try {
      const session = await api.getYoutubeSession();
      setYoutubeSessionConnected(session.connected);
      setYoutubeSessionUpdatedAt(session.updated_at);
    } catch {
      setYoutubeSessionConnected(false);
      setYoutubeSessionUpdatedAt(null);
    }
  }, []);

  useEffect(() => {
    void refreshYoutubeSession();
    const onFocus = () => void refreshYoutubeSession();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshYoutubeSession]);

  useEffect(() => {
    let cancelled = false;
    api
      .getCategorySuggestions(category)
      .then((res) => {
        if (!cancelled) {
          setCategorySuggestions(res.categories.map((c) => c.name));
        }
      })
      .catch(() => {
        if (!cancelled) setCategorySuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    let cancelled = false;
    api
      .getTagSuggestions(tagInput)
      .then((res) => {
        if (!cancelled) setTagSuggestions(res.tags);
      })
      .catch(() => {
        if (!cancelled) setTagSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tagInput]);

  const onThumbFile = (file: File | null) => {
    if (file) {
      const validationError = validateThumbnailFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setThumbFile(file);
    setPendingServerCrop(null);
    setCrop(null);
    setThumbPreviewSrc((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : '';
    });
  };

  const handleThumbnailDrop = async (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    setThumbnailDragActive(false);
    setError(null);

    const droppedFile = firstDroppedImageFile(ev.dataTransfer);
    if (droppedFile) {
      onThumbFile(droppedFile);
      return;
    }

    const imageUrl = droppedImageUrl(ev.dataTransfer);
    if (!imageUrl) {
      setError('Drop a JPEG, PNG, or WebP image file or image from the browser.');
      return;
    }

    setLoadingDroppedThumbnail(true);
    try {
      const blob = await api.fetchThumbnailFromUrl(imageUrl);
      const type = blob.type || 'image/jpeg';
      const file = new File(
        [blob],
        `dropped-thumbnail.${imageExtensionFromMime(type)}`,
        { type },
      );
      onThumbFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDroppedThumbnail(false);
    }
  };

  const handleNaturalReady = useCallback(
    (nw: number, nh: number) => {
      setCrop((prev) => {
        if (prev) return prev;
        if (pendingServerCrop) {
          return clampCrop(pendingServerCrop, nw, nh);
        }
        return centeredSquare(nw, nh);
      });
      setPendingServerCrop(null);
    },
    [pendingServerCrop],
  );

  const handleLoadVideo = async () => {
    if (!canPrefetchVideo) return;
    setPrefetching(true);
    setError(null);
    try {
      if (videoSourceType === 'youtube') {
        const source = youtubeUrl.trim();
        const pf = await api.prefetchYoutubeVideo(source);
        applyPrefetchResult(pf, { sourceReference: source, mediaKind: 'video' });
      } else if (
        mode === 'edit' &&
        Number.isInteger(clipId) &&
        clipId >= 1 &&
        isSavedClipSourceReference(sourceReference)
      ) {
        const pf = await api.stageClipVideo(clipId);
        applyPrefetchResult(pf, {
          sourceReference: `existing-clip://${title.trim() || 'clip'}`,
          mediaKind: 'video',
        });
      } else if (localVideoFile) {
        const pf = await api.prefetchVideoFile(localVideoFile);
        applyPrefetchResult(pf, {
          sourceReference: `local-file://${localVideoFile.name}`,
          mediaKind: 'video',
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPrefetching(false);
    }
  };

  const handleLoadAudio = async () => {
    if (!canPrefetchAudio) return;
    setPrefetching(true);
    setError(null);
    try {
      if (audioSourceType === 'youtube') {
        const source = youtubeUrl.trim();
        const pf = await api.prefetchYoutube(source);
        applyPrefetchResult(pf, { sourceReference: source, mediaKind: 'audio' });
      } else if (audioSourceType === 'mp3-url') {
        const source = mp3Url.trim();
        const pf = await api.prefetchMp3Url(source);
        applyPrefetchResult(pf, { sourceReference: source });
      } else if (localMp3File) {
        const pf = await api.prefetchMp3File(localMp3File);
        applyPrefetchResult(pf, { sourceReference: `local-file://${localMp3File.name}` });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPrefetching(false);
    }
  };

  const startAudioSegmentPreview = useCallback(async () => {
    if (!processId || !audioUrl || !timesOk || !clipLenOk || !durationOk) return;
    const audio = previewAudioRef.current;
    if (!audio) return;
    setError(null);
    previewSessionActiveRef.current = true;
    audio.pause();
    audio.volume = effectiveVolumeToElement(volume, 100);
    audio.loop = true;
    audio.src = `${api.getStagingPreviewUrl({
      process_id: processId,
      start_time: startTime.trim(),
      end_time: endTime.trim(),
      audio_normalize: true,
    })}&_=${Date.now()}`;
    audio.load();
    setPreviewing(true);
    try {
      await audio.play();
    } catch (e) {
      previewSessionActiveRef.current = false;
      setPreviewing(false);
      setAudioPlayheadSec(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [
    processId,
    audioUrl,
    timesOk,
    clipLenOk,
    durationOk,
    startTime,
    endTime,
    volume,
  ]);

  const startVideoSegmentPreview = useCallback(() => {
    if (!processId || !videoUrl || !timesOk || !clipLenOk || !durationOk) return;
    previewSessionActiveRef.current = true;
    setPreviewing(true);
    setVideoPreviewCutUrl(
      `${api.getStagingVideoPreviewUrl({
        process_id: processId,
        start_time: startTime.trim(),
        end_time: endTime.trim(),
      })}&_=${Date.now()}`,
    );
    setVideoPreviewNonce((n) => n + 1);
  }, [processId, videoUrl, timesOk, clipLenOk, durationOk, startTime, endTime]);

  const scheduleLoopPreviewAfterTrim = useCallback(() => {
    if (!previewSessionActiveRef.current) return;
    if (loopTrimPreviewTimerRef.current) {
      clearTimeout(loopTrimPreviewTimerRef.current);
    }
    loopTrimPreviewTimerRef.current = setTimeout(() => {
      loopTrimPreviewTimerRef.current = null;
      if (editorKind === 'video') {
        startVideoSegmentPreview();
      } else {
        void startAudioSegmentPreview();
      }
    }, 350);
  }, [editorKind, startVideoSegmentPreview, startAudioSegmentPreview]);

  useEffect(() => {
    return () => {
      if (loopTrimPreviewTimerRef.current) {
        clearTimeout(loopTrimPreviewTimerRef.current);
      }
    };
  }, []);

  const handleClientPreview = async () => {
    if (!processId || !timesOk || !clipLenOk || !durationOk) return;
    setError(null);
    try {
      if (editorKind === 'video') {
        if (!videoUrl) return;
        if (previewing) {
          setVideoPreviewNonce(0);
          setVideoPreviewCutUrl(null);
          stopVideoPreview();
          return;
        }
        startVideoSegmentPreview();
        return;
      }
      if (!audioUrl) return;
      if (previewing) {
        stopClientPreview();
        return;
      }
      await startAudioSegmentPreview();
    } catch (e) {
      setPreviewing(false);
      setAudioPlayheadSec(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleUseYoutubeThumbnail = async () => {
    if (!suggestedThumbnailUrl) return;
    setLoadingSuggestedThumbnail(true);
    setError(null);
    try {
      const res = await fetch(suggestedThumbnailUrl);
      if (!res.ok) {
        throw new Error(`Could not load the thumbnail (${res.status}).`);
      }
      const blob = await res.blob();
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      onThumbFile(new File([blob], `youtube-thumbnail.${ext}`, { type: blob.type || 'image/jpeg' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSuggestedThumbnail(false);
    }
  };

  useEffect(() => {
    if (!suggestedThumbnailUrl || thumbFile || thumbPreviewSrc) return;
    void handleUseYoutubeThumbnail();
  }, [suggestedThumbnailUrl]);

  const addTag = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    setTags((current) => {
      const exists = current.some(
        (tag) => tag.toLocaleLowerCase('en') === next.toLocaleLowerCase('en'),
      );
      return exists ? current : [...current, next];
    });
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  };

  const buildFormData = (): FormData => {
    const fd = new FormData();
    fd.append('youtube_url', sourceReference.trim());
    fd.append('start_time', startTime.trim());
    fd.append('end_time', endTime.trim());
    fd.append('title', title.trim());
    fd.append('category', category.trim());
    fd.append('tags', tags.join(', '));
    fd.append('process_id', processId);
    fd.append('is_favorite', isFavorite ? '1' : '0');
    fd.append('volume', String(volume));
    fd.append('audio_normalize', editorKind === 'audio' ? '1' : '0');
    fd.append('clip_type', editorKind);
    if (editorKind === 'video') {
      fd.append('video_orientation', videoOrientation);
      fd.append(
        'default_layout_area_id',
        defaultLayoutAreaId === '' ? '' : String(defaultLayoutAreaId),
      );
    }
    if (crop) {
      fd.append('thumbnail_crop_meta', JSON.stringify(crop));
    }
    if (thumbFile) {
      fd.append('thumbnail', thumbFile);
    }
    return fd;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (mode === 'create' && !thumbFile) {
      setError('Select a thumbnail image (<= 1 MB).');
      return;
    }
    if (!processId) {
      setError(editorKind === 'video' ? 'Load the video before saving.' : 'Load the audio before saving.');
      return;
    }
    if (
      editorKind === 'video' &&
      videoSourceType === 'youtube' &&
      !isValidYoutubeUrl(sourceReference.trim())
    ) {
      setError('Load the YouTube video before saving.');
      return;
    }
    if (
      editorKind === 'audio' &&
      audioSourceType === 'youtube' &&
      !isValidYoutubeUrl(sourceReference.trim())
    ) {
      setError('Load the YouTube audio before saving.');
      return;
    }
    if (!thumbReady) {
      setError('Wait for the thumbnail image to finish loading.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = buildFormData();
      if (mode === 'create') {
        await api.createClip(fd);
      } else {
        await api.updateClip(clipId, fd);
      }
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteClip = async () => {
    if (mode !== 'edit' || !Number.isInteger(clipId) || clipId < 1) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteClip(clipId);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (mode === 'edit' && (!Number.isInteger(clipId) || clipId < 1)) {
    return (
      <p className="text-sm text-red-300">Invalid clip ID in the URL.</p>
    );
  }

  if (loadingClip) {
    return <p className="text-text-muted">Loading clip...</p>;
  }

  return (
    <section className="space-y-6">
      {error && (
        <div
          role="alert"
          className="fixed right-4 top-4 z-50 max-w-md rounded-md border border-red-500/50 bg-red-950/95 p-4 text-sm text-red-100 shadow-lg"
        >
          <div className="flex gap-3">
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-200 hover:text-white"
              aria-label="Close error message"
            >
              x
            </button>
          </div>
        </div>
      )}

      <header>
        <h2 className="text-xl font-semibold">
          {mode === 'create' ? 'New clip' : 'Edit clip'}
        </h2>
        <p className="text-sm text-text-muted">
          {editorKind === 'video'
            ? 'Load a YouTube link or a video from your computer, choose the segment (max. 30s), and save for browser overlay playback.'
            : 'Load the audio, choose the segment (max. 30s), adjust the thumbnail, and save for browser overlay playback.'}
        </p>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="flex flex-wrap gap-2">
          {([
            ['audio', 'Audio clip'],
            ['video', 'Video clip'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={mode === 'edit'}
              onClick={() => {
                setEditorKind(key);
                clearLoadedMedia();
                stopClientPreview();
                stopVideoPreview();
              }}
              className={
                'rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ' +
                (editorKind === key
                  ? 'bg-accent text-white'
                  : 'border border-surface bg-surface-soft hover:border-accent')
              }
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'edit' ? (
          <p className="text-xs text-text-muted">
            Clip type cannot be changed after saving.
          </p>
        ) : null}

        <BrowserSourceInstructionsCard
          editorKind={editorKind}
          onCopyError={(message) => setError(message)}
        />

        <div className="rounded-md border border-surface bg-surface-soft p-4">
          <h3 className="text-sm font-medium">
            {editorKind === 'video' ? 'Video source' : 'Audio source'}
          </h3>
          {editorKind === 'audio' ? (
          <div className="mt-3 flex flex-wrap gap-2 border-b border-surface pb-3">
            {([
              ['youtube', 'YouTube'],
              ['mp3-url', 'MP3 URL'],
              ['local-file', 'Local file'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setAudioSourceType(key);
                  clearLoadedMedia();
                }}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium ' +
                  (audioSourceType === key
                    ? 'bg-accent text-white'
                    : 'border border-surface bg-bg hover:border-accent')
                }
              >
                {label}
              </button>
            ))}
          </div>
          ) : (
          <div className="mt-3 flex flex-wrap gap-2 border-b border-surface pb-3">
            {([
              ['youtube', 'YouTube'],
              ['local-file', 'Local file'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setVideoSourceType(key);
                  clearLoadedMedia();
                }}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium ' +
                  (videoSourceType === key
                    ? 'bg-accent text-white'
                    : 'border border-surface bg-bg hover:border-accent')
                }
              >
                {label}
              </button>
            ))}
          </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {((editorKind === 'video' && videoSourceType === 'youtube') ||
              (editorKind === 'audio' && audioSourceType === 'youtube')) && (
              <>
                <input
                  id="youtube-url"
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => {
                    setYoutubeUrl(e.target.value);
                    clearLoadedMedia();
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="min-w-[200px] flex-1 rounded-md border border-surface bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
                {validYoutubeUrl && (
                  <a
                    href={youtubeUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-surface px-4 py-2 text-sm font-medium hover:border-accent"
                  >
                    Open YouTube
                  </a>
                )}
              </>
            )}

            {editorKind === 'audio' && audioSourceType === 'mp3-url' && (
              <input
                id="mp3-url"
                type="url"
                value={mp3Url}
                onChange={(e) => {
                  setMp3Url(e.target.value);
                  clearLoadedMedia();
                }}
                placeholder="https://example.com/audio.mp3"
                className="min-w-[200px] flex-1 rounded-md border border-surface bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            )}

            {editorKind === 'audio' && audioSourceType === 'local-file' && (
              <input
                id="local-mp3"
                type="file"
                accept="audio/mpeg,.mp3"
                onChange={(e) => {
                  setLocalMp3File(e.target.files?.[0] ?? null);
                  clearLoadedMedia();
                }}
                className="block min-w-[200px] flex-1 text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
              />
            )}

            {editorKind === 'video' && videoSourceType === 'local-file' && (
              mode === 'edit' && isSavedClipSourceReference(sourceReference) ? (
                <p className="min-w-[200px] flex-1 text-sm text-text-muted">
                  Saved clip ({savedClipSourceLabel(sourceReference)}). Preview and save use the
                  exported MP4. Switch to YouTube above if you want to re-download from a link.
                </p>
              ) : (
              <input
                id="local-video"
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.mkv,.m4v"
                onChange={(e) => {
                  setLocalVideoFile(e.target.files?.[0] ?? null);
                  clearLoadedMedia();
                }}
                className="block min-w-[200px] flex-1 text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
              />
              )
            )}

            <button
              type="button"
              disabled={
                editorKind === 'video' ? !canPrefetchVideo : !canPrefetchAudio
              }
              onClick={() => void (editorKind === 'video' ? handleLoadVideo() : handleLoadAudio())}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {prefetching
                ? 'Loading...'
                : editorKind === 'video'
                  ? 'Load video'
                  : 'Load audio'}
            </button>
          </div>

          {((editorKind === 'video' && videoSourceType === 'youtube') ||
            (editorKind === 'audio' && audioSourceType === 'youtube')) &&
            !validYoutubeUrl &&
            youtubeUrl.length > 0 && (
            <p className="mt-2 text-sm text-red-300">Invalid YouTube URL.</p>
          )}
          {editorKind === 'video' &&
            videoSourceType === 'local-file' &&
            !localVideoFile &&
            !(mode === 'edit' && isSavedClipSourceReference(sourceReference)) && (
            <p className="mt-2 text-xs text-text-muted">
              MP4, WebM, MOV, or MKV — up to 10 minutes and 300 MB.
            </p>
          )}
          {audioSourceType === 'mp3-url' && !validMp3Url && mp3Url.length > 0 && (
            <p className="mt-2 text-sm text-red-300">Invalid MP3 URL.</p>
          )}
          {mode === 'edit' && (
            <p className="mt-2 text-xs text-text-muted">
              {editorKind === 'video'
                ? 'The saved video is reloaded automatically so the trim can be updated.'
                : 'The saved audio is reloaded automatically so the trim can be updated.'}
            </p>
          )}
          {((editorKind === 'video' && videoSourceType === 'youtube') ||
            (editorKind === 'audio' && audioSourceType === 'youtube')) && (
            <div
              className={
                'mt-3 rounded-md border p-3 ' +
                (youtubeSessionConnected
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10')
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">YouTube sign-in</p>
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-xs font-medium ' +
                    (youtubeSessionConnected
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'bg-amber-500/20 text-amber-200')
                  }
                >
                  {youtubeSessionConnected ? 'Session saved' : 'Not saved yet'}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {youtubeSessionConnected
                  ? `Downloads can use your saved Google session${youtubeSessionUpdatedAt ? ` (saved ${formatSessionTime(youtubeSessionUpdatedAt)})` : ''}.`
                  : 'Opening YouTube is not enough. In the login window, click the blue bar button Save session, or confirm save when closing the window.'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href="soundboard://youtube-login"
                  className="rounded-md border border-surface bg-bg px-3 py-1.5 text-sm font-medium hover:border-accent"
                >
                  {youtubeSessionConnected ? 'Update sign-in' : 'Open sign-in window'}
                </a>
                <button
                  type="button"
                  onClick={() => void refreshYoutubeSession()}
                  className="rounded-md border border-surface bg-bg px-3 py-1.5 text-sm font-medium hover:border-accent"
                >
                  Refresh status
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 rounded-md border border-surface bg-surface-soft p-4 sm:grid-cols-2">
          <audio ref={previewAudioRef} preload="none" className="hidden" />
          {editorKind === 'video' ? (
            <VideoRangeTrimmer
              videoUrl={videoUrl}
              previewNonce={videoPreviewNonce}
              previewCutUrl={videoPreviewCutUrl}
              previewVolume={volume}
              durationSeconds={durationSeconds}
              startTime={startTime}
              endTime={endTime}
              onStartChange={setStartTime}
              onEndChange={setEndTime}
              onPreviewEnd={pauseVideoPreview}
              onPreviewError={(message) => {
                setVideoPreviewCutUrl(null);
                setError(message);
                stopVideoPreview();
              }}
              onLoopTrimPreview={scheduleLoopPreviewAfterTrim}
            />
          ) : (
            <WaveformTrimmer
              audioUrl={audioUrl}
              durationSeconds={durationSeconds}
              startTime={startTime}
              endTime={endTime}
              onStartChange={setStartTime}
              onEndChange={setEndTime}
              playheadSec={audioPlayheadSec}
              onTrimRelease={scheduleLoopPreviewAfterTrim}
            />
          )}
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={
                !processId ||
                !timesOk ||
                !clipLenOk ||
                !durationOk ||
                (editorKind === 'video' ? !videoUrl : !audioUrl)
              }
              onClick={() => void handleClientPreview()}
              className="rounded-md border border-surface bg-bg px-4 py-2 text-sm font-medium hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {previewing ? 'Stop preview' : 'Preview'}
            </button>
            {timesOk && (
              <span className="text-xs text-text-muted">
                Segment duration: {clipLen.toFixed(3)}s
                {!clipLenOk && ` - maximum ${MAX_CLIP_SEC}s`}
                {!durationOk && ' - outside the downloaded duration'}
              </span>
            )}
            {(!timesOk || !isValidTimeString(startTime) || !isValidTimeString(endTime)) &&
              (startTime.length > 0 || endTime.length > 0) && (
                <span className="text-xs text-red-300">
                  Use the HH:MM:SS.mmm format (ex.: 00:01:23.456).
                </span>
              )}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="volume" className="block text-sm font-medium">
              Volume: {volume}
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="volume"
                type="range"
                min={0}
                max={editorKind === 'audio' ? 300 : 100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <input
                type="number"
                min={0}
                max={editorKind === 'audio' ? 300 : 100}
                value={volume}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  const max = editorKind === 'audio' ? 300 : 100;
                  setVolume(Math.max(0, Math.min(max, Math.round(next))));
                }}
                className="w-20 rounded-md border border-surface bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
                aria-label="Clip volume"
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {editorKind === 'audio'
                ? '100 is neutral volume; use up to 300 to boost quieter clips.'
                : '100 is normal volume in the browser source (maximum).'}
            </p>
          </div>
          {editorKind === 'video' ? (
            <p className="sm:col-span-2 text-xs text-text-muted">
              The player shows the start of the trim. Preview encodes the segment with FFmpeg
              (same as save) so playback matches the cut. Saving writes the final MP4 for OBS.
            </p>
          ) : null}
          {editorKind === 'video' ? (
            <p className="sm:col-span-2">
              <label htmlFor="video-orientation" className="block text-sm font-medium">
                Video orientation
              </label>
              <select
                id="video-orientation"
                value={videoOrientation}
                onChange={(e) => setVideoOrientation(e.target.value as VideoOrientation)}
                className="form-select mt-1 rounded-md border border-surface bg-bg pl-3 pr-9 py-2 text-sm outline-none focus:border-accent"
              >
                {(['landscape', 'portrait'] as const).map((value) => (
                  <option key={value} value={value}>
                    {videoOrientationLabel(value)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-text-muted">
                Suggested when the video loads (near-square videos count as landscape).
                {videoDimensions ? (
                  <>
                    {' '}
                    Detected size: {videoDimensions.width}×{videoDimensions.height}.
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
          {editorKind === 'video' && layoutAreas.length > 0 ? (
            <p className="sm:col-span-2">
              <label htmlFor="default-layout-area" className="block text-sm font-medium">
                Default layout area
              </label>
              <select
                id="default-layout-area"
                value={defaultLayoutAreaId}
                onChange={(e) =>
                  setDefaultLayoutAreaId(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="form-select mt-1 rounded-md border border-surface bg-bg pl-3 pr-9 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">By orientation (global default)</option>
                {layoutAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-text-muted">
                Used when you play this clip from the Media Board (▶). Use Play in… in the clip
                menu for a one-time override.
              </span>
            </p>
          ) : null}
        </div>

        <div
          className={
            'rounded-md border p-4 transition ' +
            (thumbnailDragActive
              ? 'border-accent bg-accent/10'
              : 'border-surface bg-surface-soft')
          }
          onDragEnter={(e) => {
            e.preventDefault();
            setThumbnailDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setThumbnailDragActive(true);
          }}
          onDragLeave={() => setThumbnailDragActive(false)}
          onDrop={(e) => void handleThumbnailDrop(e)}
        >
          <label htmlFor="thumb" className="block text-sm font-medium">
            Thumbnail
          </label>
          <p className="mt-1 text-xs text-text-muted">
            Select, paste by drag-and-drop, or drag an image from the browser. Supported formats:
            JPEG, PNG, and WebP up to 1 MB.
          </p>
          {suggestedThumbnailUrl && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleUseYoutubeThumbnail()}
                disabled={loadingSuggestedThumbnail}
                className="rounded-md border border-surface bg-bg px-3 py-1.5 text-sm font-medium hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingSuggestedThumbnail
                  ? 'Loading thumbnail...'
                  : 'Use YouTube thumbnail'}
              </button>
              <span className="text-xs text-text-muted">
                Uses the image suggested by the video and lets you adjust the crop below.
              </span>
            </div>
          )}
          <input
            id="thumb"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="mt-2 block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
            onChange={(e) => onThumbFile(e.target.files?.[0] ?? null)}
          />
          {loadingDroppedThumbnail && (
            <p className="mt-2 text-xs text-text-muted">Loading dropped image...</p>
          )}
          <p
            className={
              'mt-2 rounded-md border border-dashed p-3 text-center text-sm transition ' +
              (thumbnailDragActive
                ? 'border-accent bg-bg/40 text-accent opacity-100'
                : 'border-transparent text-text-muted opacity-60')
            }
          >
            Drop the image here to use it as the thumbnail.
          </p>
          {thumbPreviewSrc && (
            <div className="mt-4">
              <ThumbnailCropper
                src={thumbPreviewSrc}
                crop={crop}
                onCropChange={setCrop}
                onNaturalReady={handleNaturalReady}
              />
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-md border border-surface bg-surface-soft p-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium">
              Title
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-surface bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="category" className="block text-sm font-medium">
              Category
            </label>
            <input
              id="category"
              list="category-suggestions"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              placeholder="Category name"
              className="mt-1 w-full rounded-md border border-surface bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <datalist id="category-suggestions">
              {categorySuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-text-muted">
              If the category does not exist, it will be created when you save.
            </p>
          </div>
          <div>
            <label htmlFor="tags" className="block text-sm font-medium">
              Tags
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="tags"
                list="tag-suggestions"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Type a tag"
                className="min-w-0 flex-1 rounded-md border border-surface bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                disabled={!tagInput.trim()}
                className="rounded-md border border-surface px-3 py-2 text-sm font-medium hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add
              </button>
            </div>
            <datalist id="tag-suggestions">
              {tagSuggestions.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
            {tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-2 rounded-full border border-surface bg-bg px-3 py-1 text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-text-muted hover:text-red-200"
                      aria-label={`Remove tag ${tag}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                Add one or more reusable tags.
              </p>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              className="rounded border-surface"
            />
            Favorite
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving || deleting || !(mode === 'create' ? canSaveCreate : canSaveEdit)}
            className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save clip'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            disabled={saving || deleting}
            className="rounded-md border border-surface px-5 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || deleting}
              className="ml-auto rounded-md border border-red-500/40 px-5 py-2 text-sm font-medium text-red-200 hover:border-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete clip
            </button>
          ) : null}
        </div>
      </form>

      {showDeleteConfirm && mode === 'edit' ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-delete-clip-title"
          onClick={() => {
            if (!deleting) setShowDeleteConfirm(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-surface bg-bg p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-delete-clip-title" className="text-lg font-semibold">
              Delete clip?
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              This action will remove{' '}
              <strong className="text-text">{title.trim() || 'this clip'}</strong> and its media
              and thumbnail files. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-md border border-surface px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteClip()}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
