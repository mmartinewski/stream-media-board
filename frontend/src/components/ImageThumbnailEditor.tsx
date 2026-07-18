import { useCallback, useState } from 'react';
import { api } from '../lib/api';
import {
  droppedImageUrl,
  firstDroppedImageFile,
  imageExtensionFromMime,
  validateThumbnailFile,
} from '../lib/imageDrop';
import ImageThumbnailCropper from './ImageThumbnailCropper';
import {
  centeredSquare,
  clampCrop,
  parseServerCrop,
  type CropRect,
} from '../lib/imageCrop';

interface Props {
  previewSrc: string;
  crop: CropRect | null;
  onPreviewSrcChange: (src: string) => void;
  onCropChange: (crop: CropRect | null) => void;
  onFileChange: (file: File | null) => void;
  pendingServerCrop: CropRect | null;
  onPendingServerCropChange: (crop: CropRect | null) => void;
  inputId?: string;
  label?: string;
  showRemove?: boolean;
  onRemove?: () => void;
  error?: string | null;
  onError?: (message: string | null) => void;
  /** Tighter spacing / smaller preview for compact modals. */
  compact?: boolean;
}

export default function ImageThumbnailEditor({
  previewSrc,
  crop,
  onPreviewSrcChange,
  onCropChange,
  onFileChange,
  pendingServerCrop,
  onPendingServerCropChange,
  inputId = 'thumbnail-file',
  label = 'Background image',
  showRemove = false,
  onRemove,
  error,
  onError,
  compact = false,
}: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [loadingDropped, setLoadingDropped] = useState(false);

  const applyFile = useCallback(
    (file: File | null) => {
      if (file) {
        const validationError = validateThumbnailFile(file);
        if (validationError) {
          onError?.(validationError);
          return;
        }
      }
      onError?.(null);
      onFileChange(file);
      onPendingServerCropChange(null);
      onCropChange(null);
      if (previewSrc.startsWith('blob:')) {
        URL.revokeObjectURL(previewSrc);
      }
      onPreviewSrcChange(file ? URL.createObjectURL(file) : '');
    },
    [
      onCropChange,
      onError,
      onFileChange,
      onPendingServerCropChange,
      onPreviewSrcChange,
      previewSrc,
    ],
  );

  const handleDrop = async (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    setDragActive(false);
    onError?.(null);

    const droppedFile = firstDroppedImageFile(ev.dataTransfer);
    if (droppedFile) {
      applyFile(droppedFile);
      return;
    }

    const imageUrl = droppedImageUrl(ev.dataTransfer);
    if (!imageUrl) {
      onError?.('Drop a JPEG, PNG, or WebP image file or image from the browser.');
      return;
    }

    setLoadingDropped(true);
    try {
      const blob = await api.fetchThumbnailFromUrl(imageUrl);
      const type = blob.type || 'image/jpeg';
      const file = new File(
        [blob],
        `dropped-thumbnail.${imageExtensionFromMime(type)}`,
        { type },
      );
      applyFile(file);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDropped(false);
    }
  };

  const handleNaturalReady = useCallback(
    (nw: number, nh: number) => {
      if (crop) return;
      if (pendingServerCrop) {
        onCropChange(clampCrop(pendingServerCrop, nw, nh));
      } else {
        onCropChange(centeredSquare(nw, nh));
      }
      onPendingServerCropChange(null);
    },
    [crop, onCropChange, onPendingServerCropChange, pendingServerCrop],
  );

  return (
    <div
      className={
        'rounded-md border transition ' +
        (compact ? 'p-2.5' : 'p-4') +
        ' ' +
        (dragActive ? 'border-accent bg-accent/10' : 'border-surface bg-surface-soft')
      }
      onDragEnter={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="block text-sm font-medium">
          {label}
        </label>
        {showRemove && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-surface px-2.5 py-1 text-xs hover:border-red-400/60 hover:text-red-200"
          >
            {compact ? 'Remover' : 'Remove image'}
          </button>
        ) : null}
      </div>
      {!compact ? (
        <p className="mt-1 text-xs text-text-muted">
          Select a file or drag an image here. JPEG, PNG, and WebP up to 1 MB.
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-text-muted">JPEG, PNG ou WebP · até 1 MB · arraste aqui</p>
      )}
      <div className={compact ? 'mt-1.5' : 'mt-2'}>
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          onChange={(e) => applyFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {loadingDropped && (
        <p className="mt-2 text-xs text-text-muted">Loading dropped image...</p>
      )}
      {!compact ? (
        <p
          className={
            'mt-2 rounded-md border border-dashed p-3 text-center text-sm transition ' +
            (dragActive
              ? 'border-accent bg-bg/40 text-accent opacity-100'
              : 'border-transparent text-text-muted opacity-60')
          }
        >
          Drop the image here to use it as the background.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
      {previewSrc ? (
        <div className={compact ? 'mt-2' : 'mt-3'}>
          <ImageThumbnailCropper
            src={previewSrc}
            crop={crop}
            onCropChange={onCropChange}
            onNaturalReady={handleNaturalReady}
            compact={compact}
          />
        </div>
      ) : null}
    </div>
  );
}

export { parseServerCrop, centeredSquare, clampCrop, type CropRect };
