import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type CategoryDetail, type CategorySummary } from '../lib/api';
import ImageThumbnailEditor, {
  parseServerCrop,
  type CropRect,
} from './ImageThumbnailEditor';
import { cropToJson } from '../lib/imageCrop';

interface Props {
  categoryId: number;
  initialName?: string;
  onClose: () => void;
  onSaved: (updated: CategorySummary) => void;
}

export default function CategoryEditModal({
  categoryId,
  initialName,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(initialName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState<string | null>(null);

  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [pendingServerCrop, setPendingServerCrop] = useState<CropRect | null>(null);
  const [hadExistingThumbnail, setHadExistingThumbnail] = useState(false);
  const [removeThumbnail, setRemoveThumbnail] = useState(false);
  const [initialCropJson, setInitialCropJson] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .getCategory(categoryId)
      .then((detail: CategoryDetail) => {
        if (cancelled) return;
        setName(detail.name);
        setInitialCropJson(detail.thumbnail_crop_meta ?? null);
        const imageUrl =
          detail.thumbnail_original_url ?? detail.thumbnail_cropped_url ?? '';
        if (imageUrl) {
          setHadExistingThumbnail(true);
          setPreviewSrc(imageUrl);
          setPendingServerCrop(parseServerCrop(detail.thumbnail_crop_meta));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  useEffect(() => {
    return () => {
      if (previewSrc.startsWith('blob:')) {
        URL.revokeObjectURL(previewSrc);
      }
    };
  }, [previewSrc]);

  const handleRemoveImage = () => {
    if (previewSrc.startsWith('blob:')) {
      URL.revokeObjectURL(previewSrc);
    }
    setPreviewSrc('');
    setThumbFile(null);
    setCrop(null);
    setPendingServerCrop(null);
    setRemoveThumbnail(hadExistingThumbnail);
    setThumbError(null);
  };

  const handleFileChange = (file: File | null) => {
    setThumbFile(file);
    if (file) setRemoveThumbnail(false);
  };

  const save = useCallback(async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Category name is required.');
      return;
    }
    if (previewSrc && !crop) {
      setError('Wait for the image to load before saving.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const form = new FormData();
      form.append('name', trimmed);
      if (removeThumbnail) {
        form.append('remove_thumbnail', '1');
      } else if (thumbFile) {
        form.append('thumbnail', thumbFile);
        if (crop) form.append('thumbnail_crop_meta', cropToJson(crop));
      } else if (crop && hadExistingThumbnail && !removeThumbnail) {
        const cropJson = cropToJson(crop);
        if (cropJson !== initialCropJson) {
          form.append('thumbnail_crop_meta', cropJson);
        }
      }

      const updated = await api.updateCategory(categoryId, form);
      onSaved({
        id: updated.id,
        name: updated.name,
        clip_count: updated.clip_count ?? 0,
        thumbnail_cropped_url: updated.thumbnail_cropped_url,
        thumbnail_original_url: updated.thumbnail_original_url,
        thumbnail_crop_meta: updated.thumbnail_crop_meta,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    categoryId,
    crop,
    hadExistingThumbnail,
    initialCropJson,
    name,
    onClose,
    onSaved,
    previewSrc,
    removeThumbnail,
    saving,
    thumbFile,
  ]);

  saveRef.current = () => void save();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!loading) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [loading]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-category-title"
      onClick={() => {
        if (!saving) onClose();
      }}
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
    >
      <div
        className="my-auto w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-surface bg-bg p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-category-title" className="text-lg font-semibold">
          Edit category
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Change the name and background image shown on category cards.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-text-muted">Loading...</p>
        ) : (
          <>
            <div className="mt-4">
              <label htmlFor="edit-category-name" className="block text-sm font-medium">
                Category name
              </label>
              <input
                ref={nameRef}
                id="edit-category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                className="mt-1 w-full rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
              />
            </div>

            <div className="mt-4">
              <ImageThumbnailEditor
                previewSrc={previewSrc}
                crop={crop}
                onPreviewSrcChange={setPreviewSrc}
                onCropChange={setCrop}
                onFileChange={handleFileChange}
                pendingServerCrop={pendingServerCrop}
                onPendingServerCropChange={setPendingServerCrop}
                inputId="edit-category-thumb"
                label="Background image"
                showRemove={Boolean(previewSrc)}
                onRemove={handleRemoveImage}
                error={thumbError}
                onError={setThumbError}
              />
            </div>
          </>
        )}

        {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-surface px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            title="Save (Ctrl+Enter)"
            disabled={saving || loading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
