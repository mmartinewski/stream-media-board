import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  type AlertKind,
  type AlertTriggerRow,
  type ClipDto,
  type MediaSearchResult,
} from '../lib/api';
import AlertKindInfoTooltip from '../components/AlertKindInfoTooltip';
import { ALERT_KIND_DESCRIPTIONS } from '../lib/alertsOverlay';

const SEARCH_DEBOUNCE_MS = 300;

function flattenClips(sections: Awaited<ReturnType<typeof api.getClips>>['sections']): ClipDto[] {
  const seen = new Set<number>();
  const clips: ClipDto[] = [];
  for (const section of sections) {
    for (const clip of section.clips) {
      if (seen.has(clip.id)) continue;
      seen.add(clip.id);
      clips.push(clip);
    }
  }
  return clips;
}

function clipTypeLabel(clipType: ClipDto['clip_type']): string {
  return clipType === 'video' ? 'Vídeo' : 'Áudio';
}

interface PickerModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function PickerModal({ title, onClose, children }: PickerModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="fixed inset-0 z-[70] cursor-default bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed left-1/2 top-1/2 z-[71] flex max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-surface bg-bg shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-surface/50 px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md px-2 py-1 text-xl leading-none text-text-muted hover:bg-surface-soft hover:text-text"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </>,
    document.body,
  );
}

export default function AlertTriggersPage() {
  const [rows, setRows] = useState<AlertTriggerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKind, setSavingKind] = useState<AlertKind | null>(null);
  const [testingKind, setTestingKind] = useState<AlertKind | null>(null);
  const [clipPickerKind, setClipPickerKind] = useState<AlertKind | null>(null);
  const [gifPickerKind, setGifPickerKind] = useState<AlertKind | null>(null);
  const [clipSearch, setClipSearch] = useState('');
  const [debouncedClipSearch, setDebouncedClipSearch] = useState('');
  const [clipResults, setClipResults] = useState<ClipDto[]>([]);
  const [clipSearchLoading, setClipSearchLoading] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [debouncedGifSearch, setDebouncedGifSearch] = useState('');
  const [gifResults, setGifResults] = useState<MediaSearchResult[]>([]);
  const [gifSearchLoading, setGifSearchLoading] = useState(false);
  const clipSearchInputRef = useRef<HTMLInputElement>(null);
  const gifSearchInputRef = useRef<HTMLInputElement>(null);

  const openClipPicker = useCallback((kind: AlertKind) => {
    setClipResults([]);
    setClipSearch('');
    setDebouncedClipSearch('');
    setClipPickerKind(kind);
  }, []);

  const openGifPicker = useCallback((kind: AlertKind) => {
    setGifResults([]);
    setGifSearch('');
    setDebouncedGifSearch('');
    setGifPickerKind(kind);
  }, []);

  useEffect(() => {
    if (!clipPickerKind) return;
    clipSearchInputRef.current?.focus({ preventScroll: true });
  }, [clipPickerKind]);

  useEffect(() => {
    if (!gifPickerKind) return;
    gifSearchInputRef.current?.focus({ preventScroll: true });
  }, [gifPickerKind]);

  const reload = useCallback(async () => {
    const res = await api.getAlertTriggers();
    setRows(res.triggers);
  }, []);

  useEffect(() => {
    void reload()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedClipSearch(clipSearch.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [clipSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedGifSearch(gifSearch.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [gifSearch]);

  useEffect(() => {
    if (!clipPickerKind) return;
    setClipSearchLoading(true);
    void api
      .getClips(debouncedClipSearch || undefined)
      .then((res) => setClipResults(flattenClips(res.sections)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setClipSearchLoading(false));
  }, [clipPickerKind, debouncedClipSearch]);

  useEffect(() => {
    if (!gifPickerKind) return;
    setGifSearchLoading(true);
    void api
      .searchMedia({ q: debouncedGifSearch || undefined, local: true, limit: 30 })
      .then((res) => setGifResults(res.results))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setGifSearchLoading(false));
  }, [gifPickerKind, debouncedGifSearch]);

  const handleSaveClip = useCallback(
    async (kind: AlertKind, clip: ClipDto) => {
      setSavingKind(kind);
      setError(null);
      try {
        const updated = await api.setAlertTrigger(kind, {
          media_source: 'clip',
          clip_id: clip.id,
        });
        setRows((prev) => prev.map((row) => (row.kind === kind ? updated : row)));
        setClipPickerKind(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSavingKind(null);
      }
    },
    [],
  );

  const handleSaveGif = useCallback(
    async (kind: AlertKind, gif: MediaSearchResult) => {
      setSavingKind(kind);
      setError(null);
      try {
        const updated = await api.setAlertTrigger(kind, {
          media_source: 'gif',
          gif_provider: gif.provider,
          gif_external_id: gif.externalId,
        });
        setRows((prev) => prev.map((row) => (row.kind === kind ? updated : row)));
        setGifPickerKind(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSavingKind(null);
      }
    },
    [],
  );

  const submitClipPicker = useCallback(async () => {
    if (!clipPickerKind || savingKind === clipPickerKind) return;
    const query = clipSearch.trim();
    setClipSearchLoading(true);
    setError(null);
    try {
      const res = await api.getClips(query || undefined);
      const clips = flattenClips(res.sections);
      setClipResults(clips);
      setDebouncedClipSearch(query);
      const first = clips[0];
      if (!first) return;
      await handleSaveClip(clipPickerKind, first);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClipSearchLoading(false);
    }
  }, [clipPickerKind, clipSearch, handleSaveClip, savingKind]);

  const submitGifPicker = useCallback(async () => {
    if (!gifPickerKind || savingKind === gifPickerKind) return;
    const query = gifSearch.trim();
    setGifSearchLoading(true);
    setError(null);
    try {
      const res = await api.searchMedia({ q: query || undefined, local: true, limit: 30 });
      setGifResults(res.results);
      setDebouncedGifSearch(query);
      const first = res.results[0];
      if (!first) return;
      await handleSaveGif(gifPickerKind, first);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGifSearchLoading(false);
    }
  }, [gifPickerKind, gifSearch, handleSaveGif, savingKind]);

  const handleRemove = useCallback(
    async (kind: AlertKind) => {
      setSavingKind(kind);
      setError(null);
      try {
        await api.deleteAlertTrigger(kind);
        setRows((prev) =>
          prev.map((row) => (row.kind === kind ? { ...row, trigger: null } : row)),
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSavingKind(null);
      }
    },
    [],
  );

  const handleTest = useCallback(async (kind: AlertKind) => {
    setTestingKind(kind);
    setError(null);
    try {
      await api.testAlertTrigger(kind);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingKind(null);
    }
  }, []);

  const configuredCount = useMemo(
    () => rows.filter((row) => row.trigger != null).length,
    [rows],
  );

  if (loading) {
    return <p className="text-sm text-text-muted">Carregando gatilhos…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Gatilhos de alerta</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Vincule um clip ou GIF a cada tipo de notificação do Streamer.bot. Quando o evento
          chegar, a mídia será reproduzida no overlay com as mesmas configurações do play manual.
        </p>
        <p className="mt-2 text-xs text-text-muted">
          {configuredCount} de {rows.length} tipos configurados
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {rows.map((row) => {
          const busy = savingKind === row.kind || testingKind === row.kind;
          const trigger = row.trigger;
          return (
            <article
              key={row.kind}
              className="rounded-lg border border-surface bg-bg-soft p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-lg">
                      {row.icon}
                    </span>
                    <h2 className="text-sm font-semibold">{row.label}</h2>
                    <AlertKindInfoTooltip
                      tooltipId={`alert-kind-info-${row.kind}`}
                      description={ALERT_KIND_DESCRIPTIONS[row.kind]}
                    />
                  </div>

                  {trigger ? (
                    <div className="mt-3 flex items-center gap-3">
                      {trigger.thumbnail_url ? (
                        <img
                          src={trigger.thumbnail_url}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface text-xs text-text-muted">
                          {trigger.media_source === 'clip' ? '♪' : 'GIF'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{trigger.title}</p>
                        <p className="text-xs text-text-muted">
                          {trigger.media_source === 'clip'
                            ? clipTypeLabel(trigger.clip_type ?? 'audio')
                            : trigger.is_animated
                              ? 'GIF animado'
                              : 'Imagem'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-text-muted">Nenhuma mídia vinculada</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openClipPicker(row.kind)}
                    className="rounded-md border border-surface px-3 py-1.5 text-xs font-medium text-text hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    Clip
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openGifPicker(row.kind)}
                    className="rounded-md border border-surface px-3 py-1.5 text-xs font-medium text-text hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    GIF
                  </button>
                  {trigger ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleTest(row.kind)}
                        className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-text hover:bg-accent/20 disabled:opacity-50"
                      >
                        {testingKind === row.kind ? 'Testando…' : 'Testar'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRemove(row.kind)}
                        className="rounded-md border border-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
                      >
                        Remover
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {clipPickerKind ? (
        <PickerModal title="Escolher clip" onClose={() => setClipPickerKind(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitClipPicker();
            }}
          >
            <input
              ref={clipSearchInputRef}
              type="search"
              value={clipSearch}
              onChange={(event) => setClipSearch(event.target.value)}
              placeholder="Buscar clips…"
              className="mb-3 w-full rounded-md border border-surface bg-bg px-3 py-2 text-sm"
            />
          </form>
          {clipSearchLoading ? (
            <p className="text-sm text-text-muted">Buscando…</p>
          ) : clipResults.length === 0 ? (
            <p className="text-sm text-text-muted">Nenhum clip encontrado.</p>
          ) : (
            <ul className="space-y-2">
              {clipResults.map((clip) => (
                <li key={clip.id}>
                  <button
                    type="button"
                    disabled={savingKind === clipPickerKind}
                    onClick={() => void handleSaveClip(clipPickerKind, clip)}
                    className="flex w-full items-center gap-3 rounded-md border border-surface px-3 py-2 text-left hover:border-accent disabled:opacity-50"
                  >
                    <img
                      src={clip.thumbnail_cropped_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{clip.title}</span>
                      <span className="text-xs text-text-muted">{clipTypeLabel(clip.clip_type)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PickerModal>
      ) : null}

      {gifPickerKind ? (
        <PickerModal title="Escolher GIF" onClose={() => setGifPickerKind(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitGifPicker();
            }}
          >
            <input
              ref={gifSearchInputRef}
              type="search"
              value={gifSearch}
              onChange={(event) => setGifSearch(event.target.value)}
              placeholder="Buscar GIFs locais…"
              className="mb-3 w-full rounded-md border border-surface bg-bg px-3 py-2 text-sm"
            />
          </form>
          {gifSearchLoading ? (
            <p className="text-sm text-text-muted">Buscando…</p>
          ) : gifResults.length === 0 ? (
            <p className="text-sm text-text-muted">Nenhum GIF local encontrado.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {gifResults.map((gif) => (
                <li key={`${gif.provider}:${gif.externalId}`}>
                  <button
                    type="button"
                    disabled={savingKind === gifPickerKind}
                    onClick={() => void handleSaveGif(gifPickerKind, gif)}
                    className="group w-full overflow-hidden rounded-md border border-surface text-left hover:border-accent disabled:opacity-50"
                  >
                    <img
                      src={gif.previewUrl}
                      alt={gif.title}
                      className="aspect-square w-full object-cover"
                    />
                    <span className="block truncate px-2 py-1 text-xs text-text-muted group-hover:text-text">
                      {gif.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PickerModal>
      ) : null}
    </div>
  );
}
