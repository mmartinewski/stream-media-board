import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const ACCEPT = 'image/gif,image/jpeg,image/png,image/webp,video/mp4,.gif,.jpg,.jpeg,.png,.webp,.mp4';

function extractImageUrlFromHtml(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function revokePreviewUrl(url: string | null) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

interface NewGifModalProps {
  saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    tags: string[];
    file?: File;
    sourceUrl?: string;
  }) => void;
}

export default function NewGifModal({ saving, onClose, onSave }: NewGifModalProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [userTags, setUserTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSourceUrl, setImportSourceUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captureHint, setCaptureHint] = useState<string | null>(null);

  const clearImport = useCallback(() => {
    setImportFile(null);
    setImportSourceUrl(null);
    setPreviewUrl((current) => {
      revokePreviewUrl(current);
      return null;
    });
    if (captureRef.current) {
      captureRef.current.innerHTML = '';
    }
  }, []);

  const applyFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'video/mp4') {
      setCaptureHint('Use a GIF, image, or MP4 file.');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setCaptureHint('File must be at most 50 MB.');
      return;
    }
    setCaptureHint(null);
    setImportSourceUrl(null);
    setImportFile(file);
    setPreviewUrl((current) => {
      revokePreviewUrl(current);
      return URL.createObjectURL(file);
    });
    if (captureRef.current) {
      captureRef.current.innerHTML = '';
    }
  }, []);

  const applySourceUrl = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setCaptureHint('Only http(s) URLs are supported.');
        return;
      }
    } catch {
      setCaptureHint('Could not read the image URL.');
      return;
    }
    setCaptureHint(null);
    setImportFile(null);
    setImportSourceUrl(trimmed);
    setPreviewUrl((current) => {
      revokePreviewUrl(current);
      return trimmed;
    });
    if (captureRef.current) {
      captureRef.current.innerHTML = '';
    }
  }, []);

  const readCaptureArea = useCallback(() => {
    const node = captureRef.current;
    if (!node) return;
    const img = node.querySelector('img');
    if (img?.src) {
      applySourceUrl(img.src);
    }
  }, [applySourceUrl]);

  useEffect(() => {
    const node = captureRef.current;
    if (!node) return;

    const observer = new MutationObserver(() => {
      readCaptureArea();
    });
    observer.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    return () => observer.disconnect();
  }, [readCaptureArea]);

  useEffect(() => {
    return () => {
      revokePreviewUrl(previewUrl);
    };
  }, [previewUrl]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const items = event.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/') || item.type === 'video/mp4') {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              applyFile(file);
              return;
            }
          }
        }
      }

      const html = event.clipboardData?.getData('text/html') ?? '';
      const htmlUrl = extractImageUrlFromHtml(html);
      if (htmlUrl) {
        event.preventDefault();
        applySourceUrl(htmlUrl);
        return;
      }

      const plain = event.clipboardData?.getData('text/plain')?.trim() ?? '';
      if (plain.startsWith('http://') || plain.startsWith('https://')) {
        event.preventDefault();
        applySourceUrl(plain);
      }
    },
    [applyFile, applySourceUrl],
  );

  const handleCaptureInput = useCallback(() => {
    readCaptureArea();
  }, [readCaptureArea]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file =
        Array.from(event.dataTransfer.files).find(
          (item) => item.type.startsWith('image/') || item.type === 'video/mp4',
        ) ?? null;
      if (file) applyFile(file);
    },
    [applyFile],
  );

  const addTag = useCallback((raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setUserTags((current) => {
      const key = tag.toLocaleLowerCase('en');
      if (current.some((item) => item.toLocaleLowerCase('en') === key)) return current;
      return [...current, tag];
    });
    setTagInput('');
  }, []);

  const removeTag = useCallback((tag: string) => {
    setUserTags((current) => current.filter((item) => item !== tag));
  }, []);

  const hasImport = Boolean(importFile || importSourceUrl);
  const canSave = hasImport && title.trim().length > 0 && !saving;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-surface bg-bg p-4 shadow-xl"
        role="dialog"
        aria-labelledby="new-gif-modal-title"
      >
        <h2 id="new-gif-modal-title" className="text-sm font-semibold">
          New GIF
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Click the area below, press <kbd className="rounded border border-surface px-1">Win</kbd> +{' '}
          <kbd className="rounded border border-surface px-1">.</kbd> to pick a Tenor GIF, or paste
          with Ctrl+V. You can also drop a file here.
        </p>

        <div className="mt-4">
          <div className="flex items-start gap-3">
            <div
              ref={captureRef}
              contentEditable={!saving}
              suppressContentEditableWarning
              onPaste={handlePaste}
              onInput={handleCaptureInput}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="min-h-28 min-w-0 flex-1 rounded-md border border-dashed border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent empty:before:text-text-muted empty:before:content-[attr(data-placeholder)]"
              data-placeholder="Paste or insert a GIF here"
              aria-label="GIF capture area"
            />
            {previewUrl ? (
              <div className="relative shrink-0">
                <img
                  src={previewUrl}
                  alt="GIF preview"
                  className="h-28 w-28 rounded-md border border-surface object-cover"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={clearImport}
                  className="absolute -right-2 -top-2 rounded-full border border-surface bg-bg px-1.5 py-0.5 text-xs shadow hover:border-accent disabled:opacity-50"
                  aria-label="Clear imported GIF"
                >
                  x
                </button>
              </div>
            ) : null}
          </div>
          {captureHint ? <p className="mt-1 text-xs text-red-300">{captureHint}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 text-xs text-accent hover:underline disabled:opacity-50"
          >
            Choose file instead
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) applyFile(file);
              e.target.value = '';
            }}
          />
        </div>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Title</span>
          <input
            type="text"
            value={title}
            disabled={saving}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="GIF title"
            className="w-full rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
        </label>

        <div className="mt-4">
          <label htmlFor="new-gif-tags-input" className="block text-sm font-medium">
            Tags
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="new-gif-tags-input"
              type="text"
              value={tagInput}
              disabled={saving}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder="Type a tag"
              className="min-w-0 flex-1 rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => addTag(tagInput)}
              disabled={saving || !tagInput.trim()}
              className="rounded-md border border-surface px-3 py-2 text-sm font-medium hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {userTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {userTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-2 rounded-full border border-surface bg-bg-soft px-3 py-1 text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    disabled={saving}
                    className="text-text-muted hover:text-red-200 disabled:opacity-50"
                    aria-label={`Remove tag ${tag}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-text-muted">Optional. Used when searching saved GIFs.</p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                title: title.trim(),
                tags: userTags,
                file: importFile ?? undefined,
                sourceUrl: importSourceUrl ?? undefined,
              })
            }
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save GIF'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
