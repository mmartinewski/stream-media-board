import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type PrefetchResponse } from '../lib/api';
import VideoRangeTrimmer from '../components/VideoRangeTrimmer';
import { isValidYoutubeUrl } from '../lib/youtube';
import { isValidTimeString, secondsToTimeString, timeStringToSeconds } from '../lib/time';

interface Props {
  mode: 'create' | 'edit';
}

type AudioSourceType = 'youtube' | 'mp3-url' | 'local-file';
type EditorKind = 'audio' | 'video';

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
}: {
  audioUrl: string;
  durationSeconds: number | null;
  startTime: string;
  endTime: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [loading, setLoading] = useState(false);
  const [waveError, setWaveError] = useState<string | null>(null);

  const duration = durationSeconds ?? 0;
  const startSec = isValidTimeString(startTime) ? timeStringToSeconds(startTime) : 0;
  const endSec = isValidTimeString(endTime)
    ? timeStringToSeconds(endTime)
    : Math.min(duration, MAX_CLIP_SEC);

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
  }, [peaks, canvasWidth, duration, startSec, endSec]);

  const xToSeconds = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    return clampNumber(((clientX - rect.left) / rect.width) * duration, 0, duration);
  };

  const applyStart = (value: number) => {
    const maxStart = Math.max(0, endSec - MIN_CLIP_SEC);
    const minStart = Math.max(0, endSec - MAX_CLIP_SEC);
    onStartChange(secondsToTimeString(clampNumber(value, minStart, maxStart)));
  };

  const applyEnd = (value: number) => {
    const minEnd = Math.min(duration, startSec + MIN_CLIP_SEC);
    const maxEnd = Math.min(duration, startSec + MAX_CLIP_SEC);
    onEndChange(secondsToTimeString(clampNumber(value, minEnd, maxEnd)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startX = (startSec / duration) * rect.width;
    const endX = (endSec / duration) * rect.width;
    dragRef.current = Math.abs(x - startX) <= Math.abs(x - endX) ? 'start' : 'end';
    canvas.setPointerCapture(e.pointerId);
    if (dragRef.current === 'start') applyStart(xToSeconds(e.clientX));
    else applyEnd(xToSeconds(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const seconds = xToSeconds(e.clientX);
    if (dragRef.current === 'start') applyStart(seconds);
    else applyEnd(seconds);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
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
        className="mt-3 h-32 w-full touch-none rounded-md border border-surface bg-bg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
  const [videoPreviewNonce, setVideoPreviewNonce] = useState(0);

  const [editorKind, setEditorKind] = useState<EditorKind>('audio');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [mp3Url, setMp3Url] = useState('');
  const [localMp3File, setLocalMp3File] = useState<File | null>(null);
  const [audioSourceType, setAudioSourceType] = useState<AudioSourceType>('youtube');
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

  const canPrefetch =
    !prefetching &&
    (audioSourceType === 'youtube'
      ? validYoutubeUrl
      : audioSourceType === 'mp3-url'
        ? validMp3Url
        : Boolean(localMp3File));
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
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setPreviewing(false);
  }, []);

  const stopVideoPreview = useCallback(() => {
    setPreviewing(false);
  }, []);

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
        setVolume(c.volume);
        setSourceReference(c.youtube_url);
        const isVideoClip = c.clip_type === 'video';
        setEditorKind(isVideoClip ? 'video' : 'audio');
        if (isValidYoutubeUrl(c.youtube_url)) {
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

    const resetPreview = () => setPreviewing(false);
    audio.addEventListener('ended', resetPreview);
    audio.addEventListener('error', resetPreview);
    return () => {
      audio.removeEventListener('ended', resetPreview);
      audio.removeEventListener('error', resetPreview);
      audio.pause();
    };
  }, []);

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
    if (!validYoutubeUrl || prefetching) return;
    setPrefetching(true);
    setError(null);
    try {
      const source = youtubeUrl.trim();
      const pf = await api.prefetchYoutubeVideo(source);
      applyPrefetchResult(pf, { sourceReference: source, mediaKind: 'video' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPrefetching(false);
    }
  };

  const handleLoadAudio = async () => {
    if (!canPrefetch) return;
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

  const handleClientPreview = async () => {
    if (!processId || !timesOk || !clipLenOk || !durationOk) return;
    setError(null);
    try {
      if (editorKind === 'video') {
        if (!videoUrl) return;
        setPreviewing(true);
        setVideoPreviewNonce((n) => n + 1);
        return;
      }
      if (!audioUrl) return;
      const audio = previewAudioRef.current;
      if (!audio) return;
      audio.pause();
      audio.volume = clampNumber(volume / 100, 0, 1);
      audio.src = api.getStagingPreviewUrl({
        process_id: processId,
        start_time: startTime.trim(),
        end_time: endTime.trim(),
        audio_normalize: true,
      });
      audio.load();
      setPreviewing(true);
      await audio.play();
    } catch (e) {
      setPreviewing(false);
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
            ? 'Download a YouTube video, choose the segment (max. 30s), and save for browser overlay playback.'
            : 'Download the audio, choose the segment (max. 30s), adjust the thumbnail, and save.'}
        </p>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="flex flex-wrap gap-2">
          {([
            ['audio', 'Audio clip'],
            ['video', 'YouTube video'],
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

        <div className="rounded-md border border-surface bg-surface-soft p-4">
          <h3 className="text-sm font-medium">
            {editorKind === 'video' ? 'YouTube video source' : 'Audio source'}
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
                onClick={() => setAudioSourceType(key)}
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
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {(editorKind === 'video' || audioSourceType === 'youtube') && (
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

            <button
              type="button"
              disabled={editorKind === 'video' ? !validYoutubeUrl || prefetching : !canPrefetch}
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

          {(editorKind === 'video' || audioSourceType === 'youtube') &&
            !validYoutubeUrl &&
            youtubeUrl.length > 0 && (
            <p className="mt-2 text-sm text-red-300">Invalid YouTube URL.</p>
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
          {(editorKind === 'video' || audioSourceType === 'youtube') && (
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
              durationSeconds={durationSeconds}
              startTime={startTime}
              endTime={endTime}
              onStartChange={setStartTime}
              onEndChange={setEndTime}
              onPreviewEnd={stopVideoPreview}
              onPreviewError={(message) => {
                setError(message);
                stopVideoPreview();
              }}
            />
          ) : (
            <WaveformTrimmer
              audioUrl={audioUrl}
              durationSeconds={durationSeconds}
              startTime={startTime}
              endTime={endTime}
              onStartChange={setStartTime}
              onEndChange={setEndTime}
            />
          )}
          {editorKind === 'audio' ? (
          <div className="sm:col-span-2">
            <label htmlFor="volume" className="block text-sm font-medium">
              Volume: {volume}
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="volume"
                type="range"
                min={0}
                max={300}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <input
                type="number"
                min={0}
                max={300}
                value={volume}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  setVolume(Math.max(0, Math.min(300, Math.round(next))));
                }}
                className="w-20 rounded-md border border-surface bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
                aria-label="Clip volume"
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              100 is neutral volume; use up to 300 to boost quieter clips.
            </p>
          </div>
          ) : (
            <p className="sm:col-span-2 text-xs text-text-muted">
              Preview plays the selected segment instantly. Saving encodes the final MP4 for
              the OBS browser overlay.
            </p>
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
              Preview
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

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving || !(mode === 'create' ? canSaveCreate : canSaveEdit)}
            className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save clip'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-md border border-surface px-5 py-2 text-sm hover:border-accent"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
