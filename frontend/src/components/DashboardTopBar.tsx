import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  GridViewIcon,
  ListViewIcon,
  useDashboardView,
} from '../contexts/DashboardViewContext';
import { api } from '../lib/api';
import { getBrowserOverlayUrl } from '../lib/overlay';

type ToolbarToastVariant = 'error' | 'success';

const TOAST_CLASS: Record<ToolbarToastVariant, string> = {
  error: 'border-red-500/50 bg-red-950/95 text-red-100',
  success: 'border-emerald-500/50 bg-emerald-950/95 text-emerald-100',
};

export default function DashboardTopBar() {
  const { gridMode, setGridModePersisted } = useDashboardView();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [stoppingAll, setStoppingAll] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [playbackVolume, setPlaybackVolume] = useState(75);
  const [globalVolumeSaving, setGlobalVolumeSaving] = useState(false);
  const [stageClientCount, setStageClientCount] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: ToolbarToastVariant } | null>(
    null,
  );
  const globalVolumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, variant: ToolbarToastVariant) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, variant });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4000);
  }, []);

  const updateSearch = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set('search', value);
          else next.delete('search');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    let cancelled = false;
    void api
      .getSettings()
      .then((settings) => {
        if (!cancelled) setPlaybackVolume(settings.playback_volume);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void api
        .getBrowserSourceStatus()
        .then((status) => {
          if (!cancelled) setStageClientCount(status.clients_by_mode?.stage ?? 0);
        })
        .catch(() => {
          if (!cancelled) setStageClientCount(null);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (globalVolumeTimerRef.current) clearTimeout(globalVolumeTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleGlobalVolumeChange = (value: number) => {
    const safe = Math.max(0, Math.min(100, Math.round(value)));
    setPlaybackVolume(safe);
    if (globalVolumeTimerRef.current) clearTimeout(globalVolumeTimerRef.current);
    globalVolumeTimerRef.current = setTimeout(() => {
      void (async () => {
        setGlobalVolumeSaving(true);
        try {
          const saved = await api.setVolume(safe);
          setPlaybackVolume(saved.playback_volume);
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err), 'error');
        } finally {
          setGlobalVolumeSaving(false);
        }
      })();
    }, 400);
  };

  const handleStopAll = async () => {
    setStoppingAll(true);
    try {
      await api.stop();
      showToast('All overlays stopped.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setStoppingAll(false);
    }
  };

  const bar = (
    <div className="border-b border-surface/50 bg-bg/95 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[10rem] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <SearchIcon />
          </span>
          <input
            id="dashboard-search"
            type="search"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search clips"
            className="w-full rounded-md border border-surface bg-bg-soft py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleStopAll()}
          disabled={stoppingAll}
          className="flex shrink-0 items-center gap-2 rounded-md border border-surface px-3 py-2 text-sm font-medium hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <StopIcon />
          {stoppingAll ? 'Stopping...' : 'Stop all'}
        </button>
        <button
          type="button"
          onClick={() => setGridModePersisted((current) => !current)}
          aria-pressed={gridMode}
          aria-label={gridMode ? 'Switch to standard view' : 'Switch to grid view'}
          title={gridMode ? 'Standard view' : 'Grid view'}
          className={
            'flex shrink-0 items-center justify-center rounded-md border px-3 py-2 ' +
            (gridMode
              ? 'border-accent bg-accent/15 text-text hover:bg-accent/25'
              : 'border-surface text-text-muted hover:border-accent hover:text-text')
          }
        >
          {gridMode ? <ListViewIcon /> : <GridViewIcon />}
        </button>
        <button
          type="button"
          onClick={() => setControlsOpen((current) => !current)}
          aria-expanded={controlsOpen}
          aria-label={controlsOpen ? 'Hide controls' : 'Show controls'}
          title={controlsOpen ? 'Hide controls' : 'Show controls'}
          className={
            'flex shrink-0 items-center justify-center rounded-md border px-3 py-2 ' +
            (controlsOpen
              ? 'border-accent bg-accent/15 text-text hover:bg-accent/25'
              : 'border-surface text-text-muted hover:border-accent hover:text-text')
          }
        >
          <ControlsIcon />
        </button>
      </div>
      {controlsOpen ? (
        <div className="space-y-3 border-t border-surface/50 px-3 pb-3 pt-3">
          <div>
            <label
              htmlFor="global-playback-volume"
              className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium"
            >
              <span>Global volume</span>
              <span className="text-xs font-normal text-text-muted">
                {globalVolumeSaving ? 'Saving…' : `${playbackVolume}%`}
              </span>
            </label>
            <input
              id="global-playback-volume"
              type="range"
              min={0}
              max={100}
              value={playbackVolume}
              onChange={(e) => handleGlobalVolumeChange(Number(e.target.value))}
              className="mt-1 w-full accent-accent"
            />
            <p className="mt-1 text-xs text-text-muted">
              Applied on top of each clip&apos;s volume when playing in OBS.
            </p>
          </div>
          {stageClientCount === 0 ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Video overlay: no browser source on{' '}
              <code className="rounded bg-black/30 px-1">?mode=stage</code>. Add{' '}
              <a
                href={getBrowserOverlayUrl('stage')}
                className="text-accent underline"
                target="_blank"
                rel="noreferrer"
              >
                stage URL
              </a>{' '}
              in OBS, or use{' '}
              <Link to="/settings/layout-areas" className="text-accent underline">
                Layout areas
              </Link>{' '}
              to configure positions.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {toast
        ? createPortal(
            <div
              role="alert"
              className={
                'pointer-events-auto fixed right-4 top-4 z-[100] max-w-md rounded-md border p-4 text-sm shadow-lg ' +
                TOAST_CLASS[toast.variant]
              }
            >
              <div className="flex gap-3">
                <p className="flex-1">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="opacity-80 hover:opacity-100"
                  aria-label="Close notification"
                >
                  ×
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
      {bar}
    </>
  );
}

function ControlsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M3 6h14M3 10h14M3 14h14" />
      <circle cx="7" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path d="m13 13 3.5 3.5" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
      <rect x="5" y="5" width="10" height="10" rx="1" />
    </svg>
  );
}
