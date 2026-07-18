import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type MacroDto } from '../lib/api';
import ImageThumbnailEditor, {
  parseServerCrop,
  type CropRect,
} from './ImageThumbnailEditor';
import { cropToJson } from '../lib/imageCrop';

interface Props {
  mode: 'create' | 'edit';
  macroId?: number;
  initial?: Pick<MacroDto, 'name' | 'event_message'> | null;
  onClose: () => void;
  onSaved: (macro: MacroDto) => void;
  onDeleted?: (id: number) => void;
}

export default function MacroEditModal({
  mode,
  macroId,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [loading, setLoading] = useState(mode === 'edit');
  const [name, setName] = useState(initial?.name ?? '');
  const [eventMessage, setEventMessage] = useState(initial?.event_message ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    if (mode !== 'edit' || macroId == null) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .getMacro(macroId)
      .then((detail) => {
        if (cancelled) return;
        setName(detail.name);
        setEventMessage(detail.event_message);
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
  }, [macroId, mode]);

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
    if (saving || deleting) return;
    const trimmedName = name.trim();
    const trimmedEvent = eventMessage.trim();
    if (!trimmedName) {
      setError('Nome é obrigatório.');
      return;
    }
    if (!trimmedEvent) {
      setError('Event é obrigatório.');
      return;
    }
    if (previewSrc && !crop) {
      setError('Aguarde a imagem carregar antes de salvar.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const form = new FormData();
      form.append('name', trimmedName);
      form.append('event_message', trimmedEvent);

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

      const saved =
        mode === 'create'
          ? await api.createMacro(form)
          : await api.updateMacro(macroId!, form);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    crop,
    deleting,
    eventMessage,
    hadExistingThumbnail,
    initialCropJson,
    macroId,
    mode,
    name,
    onClose,
    onSaved,
    previewSrc,
    removeThumbnail,
    saving,
    thumbFile,
  ]);

  const remove = useCallback(async () => {
    if (mode !== 'edit' || macroId == null || saving || deleting) return;
    if (!window.confirm('Excluir esta macro?')) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteMacro(macroId);
      onDeleted?.(macroId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }, [deleting, macroId, mode, onClose, onDeleted, saving]);

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

  const busy = saving || deleting;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-macro-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 sm:p-4"
    >
      <div className="flex max-h-[min(100dvh-1.5rem,40rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-surface bg-bg shadow-2xl">
        <div className="shrink-0 border-b border-surface/50 px-4 py-3 sm:px-5">
          <h2 id="edit-macro-title" className="text-base font-semibold sm:text-lg">
            {mode === 'create' ? 'Nova macro' : 'Editar macro'}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {loading ? (
            <p className="text-sm text-text-muted">Carregando…</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              <div className="space-y-3">
                <div>
                  <label htmlFor="edit-macro-name" className="block text-sm font-medium">
                    Nome
                  </label>
                  <input
                    ref={nameRef}
                    id="edit-macro-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                  />
                </div>

                <div>
                  <label htmlFor="edit-macro-event" className="block text-sm font-medium">
                    Event
                  </label>
                  <input
                    id="edit-macro-event"
                    value={eventMessage}
                    onChange={(e) => setEventMessage(e.target.value)}
                    disabled={busy}
                    spellCheck={false}
                    className="mt-1 w-full rounded-md border border-surface bg-bg-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent disabled:opacity-50"
                    placeholder="ja-vai-comecar"
                  />
                </div>
              </div>

              <ImageThumbnailEditor
                previewSrc={previewSrc}
                crop={crop}
                onPreviewSrcChange={setPreviewSrc}
                onCropChange={setCrop}
                onFileChange={handleFileChange}
                pendingServerCrop={pendingServerCrop}
                onPendingServerCropChange={setPendingServerCrop}
                inputId="edit-macro-thumb"
                label="Thumbnail"
                showRemove={Boolean(previewSrc)}
                onRemove={handleRemoveImage}
                error={thumbError}
                onError={setThumbError}
                compact
              />
            </div>
          )}

          {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-surface/50 px-4 py-3 sm:px-5">
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy || loading}
              className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? 'Excluindo…' : 'Excluir'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              title="Salvar (Ctrl+Enter)"
              disabled={busy || loading}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
