import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  api,
  type ClipDto,
  type ControlDashboardWidget,
  type ControlDashboardWidgetInput,
  type ControlWidgetType,
  type MacroDto,
  type MediaSearchResult,
} from '../lib/api';
import { renderSimpleMarkdownToHtml } from '../lib/simpleMarkdown';
import { useTopCenterToast } from '../components/TopCenterToast';
import {
  AudioClipIcon,
  PlayInShortcutIcon,
  VideoClipIcon,
} from '../components/clips/ClipCardIcons';

const PLAY_PULSE_MS = 337;

type LocalWidget = {
  key: string;
  widget_type: ControlWidgetType;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  macro_id: number | null;
  clip_id: number | null;
  gif_provider: string | null;
  gif_external_id: string | null;
  markdown_body: string | null;
  macro?: ControlDashboardWidget['macro'];
  clip?: ControlDashboardWidget['clip'];
  gif?: ControlDashboardWidget['gif'];
};

type PickerMode = 'macro' | 'clip' | 'gif' | null;

const COLS = 12;
const ROW_HEIGHT = 72;

function fromServer(widgets: ControlDashboardWidget[]): LocalWidget[] {
  return widgets.map((w) => ({
    key: `w-${w.id}`,
    widget_type: w.widget_type,
    grid_x: w.grid_x,
    grid_y: w.grid_y,
    grid_w: w.grid_w,
    grid_h: w.grid_h,
    macro_id: w.macro_id,
    clip_id: w.clip_id,
    gif_provider: w.gif_provider,
    gif_external_id: w.gif_external_id,
    markdown_body: w.markdown_body,
    macro: w.macro,
    clip: w.clip,
    gif: w.gif,
  }));
}

function nextKey(): string {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function findOpenSpot(widgets: LocalWidget[], w: number, h: number): { x: number; y: number } {
  let y = 0;
  for (;;) {
    for (let x = 0; x <= COLS - w; x += 1) {
      const overlaps = widgets.some((item) => {
        return !(
          x + w <= item.grid_x ||
          item.grid_x + item.grid_w <= x ||
          y + h <= item.grid_y ||
          item.grid_y + item.grid_h <= y
        );
      });
      if (!overlaps) return { x, y };
    }
    y += 1;
    if (y > 200) return { x: 0, y: 0 };
  }
}

export default function ControlPanelPage() {
  const { id: idParam } = useParams();
  const dashboardId = Number(idParam);
  const navigate = useNavigate();
  const { showToast, toastPortal } = useTopCenterToast();
  const [name, setName] = useState('Painel');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [widgets, setWidgets] = useState<LocalWidget[]>([]);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<PickerMode>(null);
  const [macros, setMacros] = useState<MacroDto[]>([]);
  const [clips, setClips] = useState<ClipDto[]>([]);
  const [gifs, setGifs] = useState<MediaSearchResult[]>([]);
  const [playPulse, setPlayPulse] = useState<{ key: string; token: number } | null>(null);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(dashboardId) || dashboardId < 1) {
      showToast('Painel inválido.', 'error');
      navigate('/panel');
      return;
    }
    setLoading(true);
    try {
      const dash = await api.getControlDashboard(dashboardId);
      setName(dash.name);
      setWidgets(fromServer(dash.widgets));
      setDirty(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
      navigate('/panel');
    } finally {
      setLoading(false);
    }
  }, [dashboardId, navigate, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout: Layout[] = useMemo(
    () =>
      widgets.map((w) => ({
        i: w.key,
        x: w.grid_x,
        y: w.grid_y,
        w: w.grid_w,
        h: w.grid_h,
        minW: w.widget_type === 'markdown' ? 2 : 1,
        minH: w.widget_type === 'markdown' ? 1 : 2,
      })),
    [widgets],
  );

  const commitLayout = (next: Layout[]) => {
    setWidgets((prev) => {
      let changed = false;
      const updated = prev.map((widget) => {
        const item = next.find((l) => l.i === widget.key);
        if (!item) return widget;
        if (
          item.x === widget.grid_x &&
          item.y === widget.grid_y &&
          item.w === widget.grid_w &&
          item.h === widget.grid_h
        ) {
          return widget;
        }
        changed = true;
        return {
          ...widget,
          grid_x: item.x,
          grid_y: item.y,
          grid_w: item.w,
          grid_h: item.h,
        };
      });
      if (changed) setDirty(true);
      return changed ? updated : prev;
    });
  };

  const openPicker = async (mode: 'macro' | 'clip' | 'gif') => {
    setPicker(mode);
    try {
      if (mode === 'macro') {
        const res = await api.getMacros();
        setMacros(res.macros);
      } else if (mode === 'clip') {
        const res = await api.getClips();
        const flat = res.sections.flatMap((section) => section.clips);
        const byId = new Map<number, ClipDto>();
        for (const clip of flat) byId.set(clip.id, clip);
        setClips([...byId.values()].sort((a, b) => a.title.localeCompare(b.title)));
      } else {
        const res = await api.searchMedia({ local: true, limit: 200 });
        setGifs(
          [...res.results].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
      setPicker(null);
    }
  };

  const addMacro = (macro: MacroDto) => {
    const size = { w: 2, h: 3 };
    const spot = findOpenSpot(widgets, size.w, size.h);
    setWidgets((prev) => [
      ...prev,
      {
        key: nextKey(),
        widget_type: 'macro',
        grid_x: spot.x,
        grid_y: spot.y,
        grid_w: size.w,
        grid_h: size.h,
        macro_id: macro.id,
        clip_id: null,
        gif_provider: null,
        gif_external_id: null,
        markdown_body: null,
        macro: {
          id: macro.id,
          name: macro.name,
          event_message: macro.event_message,
          thumbnail_cropped_url: macro.thumbnail_cropped_url ?? null,
        },
      },
    ]);
    setDirty(true);
    setPicker(null);
  };

  const addClip = (clip: ClipDto) => {
    const size = { w: 2, h: 3 };
    const spot = findOpenSpot(widgets, size.w, size.h);
    setWidgets((prev) => [
      ...prev,
      {
        key: nextKey(),
        widget_type: 'clip',
        grid_x: spot.x,
        grid_y: spot.y,
        grid_w: size.w,
        grid_h: size.h,
        macro_id: null,
        clip_id: clip.id,
        gif_provider: null,
        gif_external_id: null,
        markdown_body: null,
        clip: {
          id: clip.id,
          title: clip.title,
          clip_type: clip.clip_type,
          thumbnail_cropped_url: clip.thumbnail_cropped_url,
        },
      },
    ]);
    setDirty(true);
    setPicker(null);
  };

  const addGif = (gif: MediaSearchResult) => {
    const size = { w: 2, h: 3 };
    const spot = findOpenSpot(widgets, size.w, size.h);
    setWidgets((prev) => [
      ...prev,
      {
        key: nextKey(),
        widget_type: 'gif',
        grid_x: spot.x,
        grid_y: spot.y,
        grid_w: size.w,
        grid_h: size.h,
        macro_id: null,
        clip_id: null,
        gif_provider: gif.provider,
        gif_external_id: gif.externalId,
        markdown_body: null,
        gif: {
          provider: gif.provider,
          external_id: gif.externalId,
          title: gif.title,
          preview_url: gif.previewUrl,
          is_animated: gif.isAnimated,
        },
      },
    ]);
    setDirty(true);
    setPicker(null);
  };

  const addMarkdown = () => {
    const size = { w: 4, h: 2 };
    const spot = findOpenSpot(widgets, size.w, size.h);
    setWidgets((prev) => [
      ...prev,
      {
        key: nextKey(),
        widget_type: 'markdown',
        grid_x: spot.x,
        grid_y: spot.y,
        grid_w: size.w,
        grid_h: size.h,
        macro_id: null,
        clip_id: null,
        gif_provider: null,
        gif_external_id: null,
        markdown_body: '# Seção\n\nTexto de apoio.',
      },
    ]);
    setDirty(true);
  };

  const removeWidget = (key: string) => {
    setWidgets((prev) => prev.filter((w) => w.key !== key));
    setDirty(true);
  };

  const updateMarkdown = (key: string, markdown_body: string) => {
    setWidgets((prev) =>
      prev.map((w) => (w.key === key ? { ...w, markdown_body } : w)),
    );
    setDirty(true);
  };

  const save = async () => {
    if (!Number.isInteger(dashboardId) || dashboardId < 1) return;
    setSaving(true);
    try {
      const trimmed = name.trim() || 'Painel';
      if (trimmed !== name) setName(trimmed);
      await api.updateControlDashboard(dashboardId, { name: trimmed });
      const payload: ControlDashboardWidgetInput[] = widgets.map((w) => ({
        widget_type: w.widget_type,
        grid_x: w.grid_x,
        grid_y: w.grid_y,
        grid_w: w.grid_w,
        grid_h: w.grid_h,
        macro_id: w.macro_id,
        clip_id: w.clip_id,
        gif_provider: w.gif_provider,
        gif_external_id: w.gif_external_id,
        markdown_body: w.markdown_body,
      }));
      const saved = await api.saveControlDashboard(dashboardId, payload);
      setName(saved.name);
      setWidgets(fromServer(saved.widgets));
      setDirty(false);
      setEditing(false);
      showToast('Painel salvo.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = async () => {
    if (dirty && !window.confirm('Descartar alterações não salvas?')) return;
    setEditing(false);
    await load();
  };

  const pulsePlay = (key: string) => {
    const token = Date.now();
    setPlayPulse({ key, token });
    window.setTimeout(() => {
      setPlayPulse((current) =>
        current?.key === key && current.token === token ? null : current,
      );
    }, PLAY_PULSE_MS);
  };

  const triggerMacro = async (widget: LocalWidget) => {
    if (!widget.macro?.event_message) {
      showToast('Macro indisponível (removida?).', 'error');
      return;
    }
    pulsePlay(widget.key);
    try {
      const res = await api.sendAdvssMessage(widget.macro.event_message);
      if (res.sent === 0) {
        showToast('Nenhum cliente AdvSS conectado.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const triggerClip = async (widget: LocalWidget) => {
    if (!widget.clip_id) {
      showToast('Clipe indisponível (removido?).', 'error');
      return;
    }
    pulsePlay(widget.key);
    try {
      const result = await api.playClip(widget.clip_id);
      if (result.playback === 'browser_source' && (result.connected_clients ?? 0) === 0) {
        showToast('Nenhum browser source conectado.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const triggerGif = async (widget: LocalWidget) => {
    if (!widget.gif_provider || !widget.gif_external_id) {
      showToast('GIF indisponível (removido?).', 'error');
      return;
    }
    pulsePlay(widget.key);
    try {
      const res = await api.playMediaSearch({
        provider: widget.gif_provider as 'giphy' | 'imported',
        external_id: widget.gif_external_id,
      });
      if (res.connected_clients === 0) {
        showToast('Nenhum browser source conectado.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="w-full space-y-4">
      {toastPortal}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to="/panel"
            className="text-sm text-text-muted hover:text-accent"
          >
            ← Painéis
          </Link>
          {editing ? (
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              className="mt-1 block w-full max-w-md rounded-md border border-surface bg-bg-soft px-3 py-2 text-2xl font-semibold tracking-tight outline-none focus:border-accent"
              aria-label="Nome do painel"
            />
          ) : (
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{name}</h1>
          )}
          <p className="mt-1 text-sm text-text-muted">
            Monte atalhos de macros, clipes e GIFs em uma grade editável.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => void openPicker('macro')}
                className="rounded-md border border-surface px-3 py-2 text-sm hover:border-accent"
              >
                + Macro
              </button>
              <button
                type="button"
                onClick={() => void openPicker('clip')}
                className="rounded-md border border-surface px-3 py-2 text-sm hover:border-accent"
              >
                + Clipe
              </button>
              <button
                type="button"
                onClick={() => void openPicker('gif')}
                className="rounded-md border border-surface px-3 py-2 text-sm hover:border-accent"
              >
                + GIF
              </button>
              <button
                type="button"
                onClick={addMarkdown}
                className="rounded-md border border-surface px-3 py-2 text-sm hover:border-accent"
              >
                + Texto
              </button>
              <button
                type="button"
                onClick={() => void cancelEdit()}
                disabled={saving}
                className="rounded-md border border-surface px-3 py-2 text-sm hover:border-accent disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              Editar painel
            </button>
          )}
        </div>
      </div>

      {loading ? <p className="text-sm text-text-muted">Carregando…</p> : null}

      {!loading && widgets.length === 0 ? (
        <p className="text-sm text-text-muted">
          Painel vazio. Entre em <span className="text-text">Editar painel</span> e adicione
          widgets.
        </p>
      ) : null}

      <div ref={containerRef} className="w-full min-h-[12rem]">
        {width > 0 && widgets.length > 0 ? (
          <GridLayout
            className={editing ? 'layout control-panel-editing' : 'layout'}
            layout={layout}
            cols={COLS}
            rowHeight={ROW_HEIGHT}
            width={width}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            isDraggable={editing}
            isResizable={editing}
            draggableHandle=".widget-drag-handle"
            draggableCancel=".no-drag"
            onDragStop={(next) => commitLayout(next)}
            onResizeStop={(next) => commitLayout(next)}
            compactType="vertical"
          >
            {widgets.map((widget) => (
              <div
                key={widget.key}
                className={
                  'relative rounded-md border border-surface/70 bg-bg-soft ' +
                  (editing ? 'ring-1 ring-accent/30' : '')
                }
              >
                {editing ? (
                  <>
                    <div
                      className="widget-drag-handle absolute left-1 top-1 z-20 flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-white/15 bg-bg/35 text-sm leading-none text-text-muted/90 backdrop-blur-[2px] active:cursor-grabbing hover:bg-bg/55"
                      title="Arrastar"
                      aria-label="Arrastar widget"
                    >
                      ⠿
                    </div>
                    <button
                      type="button"
                      className="no-drag absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-bg/35 text-red-300/90 backdrop-blur-[2px] hover:border-red-400/50 hover:bg-bg/55 hover:text-red-300"
                      onClick={() => removeWidget(widget.key)}
                      aria-label="Remover widget"
                      title="Remover"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </>
                ) : null}

                <div className="h-full overflow-hidden rounded-md">
                  {widget.widget_type === 'markdown' ? (
                    <MarkdownWidget
                      editing={editing}
                      body={widget.markdown_body ?? ''}
                      onChange={(value) => updateMarkdown(widget.key, value)}
                    />
                  ) : widget.widget_type === 'macro' ? (
                    <ActionCard
                      title={widget.macro?.name ?? 'Macro removida'}
                      subtitle="macro"
                      thumb={widget.macro?.thumbnail_cropped_url}
                      playPulse={playPulse?.key === widget.key}
                      playStyle="macro"
                      disabled={editing || !widget.macro}
                      onActivate={() => void triggerMacro(widget)}
                    />
                  ) : widget.widget_type === 'gif' ? (
                    <ActionCard
                      title={widget.gif?.title ?? 'GIF removido'}
                      subtitle={widget.gif?.is_animated ? 'gif' : 'imagem'}
                      thumb={widget.gif?.preview_url}
                      playPulse={playPulse?.key === widget.key}
                      playStyle="gif"
                      disabled={editing || !widget.gif}
                      onActivate={() => void triggerGif(widget)}
                    />
                  ) : (
                    <ActionCard
                      title={widget.clip?.title ?? 'Clipe removido'}
                      subtitle={widget.clip?.clip_type ?? '—'}
                      thumb={widget.clip?.thumbnail_cropped_url}
                      playPulse={playPulse?.key === widget.key}
                      playStyle={widget.clip?.clip_type === 'video' ? 'video' : 'audio'}
                      disabled={editing || !widget.clip}
                      onActivate={() => void triggerClip(widget)}
                    />
                  )}
                </div>
              </div>
            ))}
          </GridLayout>
        ) : null}
      </div>

      {picker ? (
        <PickerModal
          mode={picker}
          macros={macros}
          clips={clips}
          gifs={gifs}
          onClose={() => setPicker(null)}
          onPickMacro={addMacro}
          onPickClip={addClip}
          onPickGif={addGif}
        />
      ) : null}
    </div>
  );
}

function ActionCard({
  title,
  subtitle,
  thumb,
  disabled,
  playStyle,
  playPulse = false,
  onActivate,
}: {
  title: string;
  subtitle: string;
  thumb?: string | null;
  disabled: boolean;
  playStyle?: 'video' | 'audio' | 'gif' | 'macro';
  playPulse?: boolean;
  onActivate: () => void;
}) {
  const initial = title.trim().charAt(0).toUpperCase() || '?';
  const showPlay = playStyle != null && !disabled;

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={showPlay ? `Play ${title}` : title}
      onClick={() => {
        if (!disabled) onActivate();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      className={
        'flex h-full cursor-pointer flex-col ' +
        (disabled ? 'cursor-default opacity-80' : 'hover:bg-surface-soft/40')
      }
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-soft">
        {thumb ? (
          <>
            <img
              src={thumb}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
              decoding="async"
            />
            <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-3xl font-semibold text-text-muted/50">{initial}</span>
          </div>
        )}

        {showPlay ? (
          <div
            className={
              'pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white transition duration-200 ' +
              (playPulse ? 'bg-white/25' : 'bg-black/10')
            }
            aria-hidden="true"
          >
            <span
              className={
                'relative flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur transition-all duration-300 ' +
                (playPulse
                  ? 'scale-125 bg-white/90 text-bg ring-2 ring-white/60'
                  : 'scale-100 bg-black/45 text-white')
              }
            >
              {playStyle === 'video' ? (
                <VideoClipIcon className="h-4 w-4" />
              ) : playStyle === 'audio' ? (
                <AudioClipIcon className="h-4 w-4" />
              ) : (
                <PlayInShortcutIcon className="h-4 w-4" />
              )}
            </span>
          </div>
        ) : null}
      </div>
      <div className="shrink-0 px-2.5 py-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{title}</p>
        <p className="mt-0.5 truncate font-mono text-xs text-text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function MarkdownWidget({
  editing,
  body,
  onChange,
}: {
  editing: boolean;
  body: string;
  onChange: (value: string) => void;
}) {
  const [sourceEditing, setSourceEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setSourceEditing(false);
  }, [editing]);

  useEffect(() => {
    if (sourceEditing) textareaRef.current?.focus();
  }, [sourceEditing]);

  const html = renderSimpleMarkdownToHtml(body || '');
  const showSource = editing && sourceEditing;

  if (showSource) {
    return (
      <div className="relative h-full">
        <button
          type="button"
          className="no-drag absolute right-9 top-1 z-10 rounded-md border border-white/15 bg-bg/35 px-2 py-0.5 text-xs text-text-muted backdrop-blur-[2px] hover:border-accent/50 hover:bg-bg/55 hover:text-text"
          onClick={() => setSourceEditing(false)}
        >
          Pronto
        </button>
        <textarea
          ref={textareaRef}
          className="no-drag h-full w-full resize-none bg-transparent p-3 font-mono text-sm outline-none"
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setSourceEditing(false);
            }
          }}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div
      className={
        'control-md h-full overflow-auto p-3 text-sm leading-relaxed ' +
        (editing ? 'cursor-text' : '')
      }
      role={editing ? 'button' : undefined}
      tabIndex={editing ? 0 : undefined}
      title={editing ? 'Clique para editar o markdown' : undefined}
      onClick={editing ? () => setSourceEditing(true) : undefined}
      onKeyDown={
        editing
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSourceEditing(true);
              }
            }
          : undefined
      }
    >
      {html ? (
        <div
          // Safe: renderSimpleMarkdownToHtml escapes HTML before formatting.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : editing ? (
        <p className="text-text-muted">Clique para editar…</p>
      ) : null}
    </div>
  );
}

function PickerModal({
  mode,
  macros,
  clips,
  gifs,
  onClose,
  onPickMacro,
  onPickClip,
  onPickGif,
}: {
  mode: 'macro' | 'clip' | 'gif';
  macros: MacroDto[];
  clips: ClipDto[];
  gifs: MediaSearchResult[];
  onClose: () => void;
  onPickMacro: (macro: MacroDto) => void;
  onPickClip: (clip: ClipDto) => void;
  onPickGif: (gif: MediaSearchResult) => void;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const filteredMacros = macros.filter((m) => {
    if (!query) return true;
    return (
      m.name.toLowerCase().includes(query) || m.event_message.toLowerCase().includes(query)
    );
  });
  const filteredClips = clips.filter((c) => {
    if (!query) return true;
    return c.title.toLowerCase().includes(query);
  });
  const filteredGifs = gifs.filter((g) => {
    if (!query) return true;
    return (
      g.title.toLowerCase().includes(query) ||
      g.externalId.toLowerCase().includes(query) ||
      g.provider.toLowerCase().includes(query)
    );
  });

  const title =
    mode === 'macro' ? 'Escolher macro' : mode === 'clip' ? 'Escolher clipe' : 'Escolher GIF';
  const emptyCount =
    mode === 'macro'
      ? filteredMacros.length
      : mode === 'clip'
        ? filteredClips.length
        : filteredGifs.length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
    >
      <div className="flex max-h-[min(100dvh-2rem,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-surface bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface/50 px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-text-muted hover:text-text"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="border-b border-surface/50 px-4 py-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="w-full rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {mode === 'macro'
            ? filteredMacros.map((macro) => (
                <li key={macro.id}>
                  <button
                    type="button"
                    onClick={() => onPickMacro(macro)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-soft"
                  >
                    <Thumb url={macro.thumbnail_cropped_url} label={macro.name} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{macro.name}</span>
                      <span className="block truncate font-mono text-xs text-text-muted">
                        {macro.event_message}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            : mode === 'clip'
              ? filteredClips.map((clip) => (
                  <li key={clip.id}>
                    <button
                      type="button"
                      onClick={() => onPickClip(clip)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-soft"
                    >
                      <Thumb url={clip.thumbnail_cropped_url} label={clip.title} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{clip.title}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {clip.clip_type}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              : filteredGifs.map((gif) => (
                  <li key={`${gif.provider}:${gif.externalId}`}>
                    <button
                      type="button"
                      onClick={() => onPickGif(gif)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-soft"
                    >
                      <Thumb url={gif.previewUrl} label={gif.title} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{gif.title}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {gif.isAnimated ? 'gif' : 'imagem'} · {gif.provider}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
          {emptyCount === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-muted">
              {mode === 'gif'
                ? 'Nenhum GIF salvo. Salve GIFs na tela de GIFs primeiro.'
                : 'Nenhum item.'}
            </li>
          ) : null}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function Thumb({ url, label }: { url?: string | null; label: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-surface-soft">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sm text-text-muted">
          {initial}
        </span>
      )}
    </span>
  );
}
