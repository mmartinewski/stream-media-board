import { useCallback, useRef, useState } from 'react';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_BYTES = 1024 * 1024;

function firstDroppedImageFile(dataTransfer: DataTransfer): File | null {
  return Array.from(dataTransfer.files).find((file) => file.type.startsWith('image/')) ?? null;
}

interface TodoThumbnailDropzoneProps {
  thumbnailUrl: string | null;
  cacheBust?: number;
  ariaLabel: string;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  onError: (message: string) => void;
}

export default function TodoThumbnailDropzone({
  thumbnailUrl,
  cacheBust = 0,
  ariaLabel,
  onUpload,
  onRemove,
  onError,
}: TodoThumbnailDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const previewSrc = thumbnailUrl
    ? cacheBust
      ? `${thumbnailUrl}${thumbnailUrl.includes('?') ? '&' : '?'}t=${cacheBust}`
      : thumbnailUrl
    : null;

  const busy = uploading || removing;

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        onError('Use an image (JPEG, PNG, WebP, or GIF).');
        return;
      }
      if (file.size > MAX_BYTES) {
        onError('Image must be at most 1 MB.');
        return;
      }
      setUploading(true);
      try {
        await onUpload(file);
      } catch (err: unknown) {
        onError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
      }
    },
    [onError, onUpload],
  );

  const handleRemove = useCallback(async () => {
    if (!onRemove || !previewSrc) return;
    setRemoving(true);
    try {
      await onRemove();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  }, [onError, onRemove, previewSrc]);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div
        role="button"
        tabIndex={0}
        title="Drag an image or click to choose"
        aria-label={ariaLabel}
        className={
          'relative flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded border border-dashed text-xs transition-colors ' +
          (dragActive
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-surface text-text-muted hover:border-accent hover:text-accent')
        }
        onClick={() => {
          if (!busy) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!busy) inputRef.current?.click();
          }
        }}
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
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const file = firstDroppedImageFile(e.dataTransfer);
          if (file) void handleFile(file);
        }}
      >
        {previewSrc ? (
          <img src={previewSrc} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span className="px-0.5 text-center leading-tight">{uploading ? '…' : 'Img'}</span>
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-bg/70 text-[10px]">
            …
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {previewSrc && onRemove ? (
        <button
          type="button"
          title="Remove image"
          aria-label="Remove image"
          disabled={busy}
          onClick={() => void handleRemove()}
          className="rounded border border-surface px-1.5 py-0.5 text-xs text-text-muted hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
