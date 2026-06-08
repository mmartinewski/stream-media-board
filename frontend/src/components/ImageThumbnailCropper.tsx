import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clampCrop,
  getImageLayout,
  resizeCropAroundCenter,
  type CropRect,
} from '../lib/imageCrop';

interface Props {
  src: string;
  crop: CropRect | null;
  onCropChange: (c: CropRect) => void;
  onNaturalReady: (nw: number, nh: number) => void;
}

export default function ImageThumbnailCropper({
  src,
  crop,
  onCropChange,
  onNaturalReady,
}: Props) {
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
