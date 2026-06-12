import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useBrowseView } from '../contexts/BrowseViewContext';
import {
  GridViewIcon,
  ListViewIcon,
  useDashboardView,
} from '../contexts/DashboardViewContext';
import { api, type CategorySummary } from '../lib/api';
import { APP_SHELL_H_PADDING } from '../lib/appShellLayout';
import { getBrowserOverlayUrl } from '../lib/overlay';
import { IN_CATEGORY_SEARCH_PARAM, isInCategorySearch } from '../lib/browseSearchScope';

type ToolbarToastVariant = 'error' | 'success';

const TOAST_CLASS: Record<ToolbarToastVariant, string> = {
  error: 'border-red-500/50 bg-red-950/95 text-red-100',
  success: 'border-emerald-500/50 bg-emerald-950/95 text-emerald-100',
};

const ICON_BTN =
  'flex shrink-0 items-center justify-center rounded-md border px-2.5 py-2 disabled:cursor-not-allowed disabled:opacity-50';

function parseCategoryId(pathname: string): number | null {
  const match = pathname.match(/^\/browse\/categories\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export default function MediaToolbar() {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDashboard = pathname === '/';
  const isCategoryGrid = pathname === '/browse';
  const isFavorites = pathname === '/browse/favorites';
  const categoryId = parseCategoryId(pathname);
  const isCategoryFocus = isFavorites || categoryId != null;

  const search = searchParams.get('search') ?? '';
  const searchInCategoryOnly = isInCategorySearch(searchParams);
  const { gridMode: dashboardGridMode, setGridModePersisted: setDashboardGridMode } =
    useDashboardView();
  const { gridMode: browseGridMode, setGridModePersisted: setBrowseGridMode } = useBrowseView();
  const gridMode = isCategoryFocus ? browseGridMode : dashboardGridMode;
  const toggleGridMode = () => {
    if (isCategoryFocus) {
      setBrowseGridMode((current) => !current);
    } else {
      setDashboardGridMode((current) => !current);
    }
  };

  const [stoppingAll, setStoppingAll] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [playbackVolume, setPlaybackVolume] = useState(75);
  const [globalVolumeSaving, setGlobalVolumeSaving] = useState(false);
  const [stageClientCount, setStageClientCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
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

  const updateSearchInCategoryOnly = useCallback(
    (checked: boolean) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (checked) next.delete(IN_CATEGORY_SEARCH_PARAM);
          else next.set(IN_CATEGORY_SEARCH_PARAM, '0');
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
    if (!isDashboard && !isCategoryGrid && !isCategoryFocus) return;
    let cancelled = false;
    void Promise.all([api.getCategories(), api.getClips()])
      .then(([categoriesRes, clipsRes]) => {
        if (cancelled) return;
        setCategories(categoriesRes.categories.filter((category) => category.clip_count > 0));
        const favoritesSection = clipsRes.sections.find((section) => section.type === 'favorites');
        setFavoriteCount(favoritesSection?.clips.length ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isCategoryFocus, isCategoryGrid, isDashboard]);

  useEffect(() => {
    if (!isDashboard) return;
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
  }, [isDashboard]);

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

  const searchPlaceholder = isCategoryFocus
    ? searchInCategoryOnly
      ? isFavorites
        ? 'Search favorites'
        : 'Search in category'
      : 'Search all clips'
    : 'Search clips';

  const chipSearchSuffix = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';

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

      <div className="border-b border-surface/50 bg-bg/95 shadow-sm backdrop-blur">
        <div className={'flex items-center gap-2 py-2 ' + APP_SHELL_H_PADDING}>
          {isCategoryFocus ? (
            <Link
              to="/browse"
              className={
                ICON_BTN +
                ' shrink-0 border-surface text-text-muted hover:border-accent hover:text-text'
              }
              aria-label="Back to categories"
              title="Categories"
            >
              <BackIcon />
            </Link>
          ) : isCategoryGrid ? (
            <Link
              to="/"
              className={
                ICON_BTN +
                ' shrink-0 border-surface text-text-muted hover:border-accent hover:text-text'
              }
              aria-label="Back to Media Board"
              title="Media Board"
            >
              <BackIcon />
            </Link>
          ) : null}
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <SearchIcon />
            </span>
            <input
              id="media-toolbar-search"
              type="search"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full rounded-md border border-surface bg-bg-soft py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleStopAll()}
            disabled={stoppingAll}
            aria-label={stoppingAll ? 'Stopping overlays' : 'Stop all overlays'}
            title={stoppingAll ? 'Stopping...' : 'Stop all'}
            className={
              ICON_BTN +
              ' border-surface text-text-muted hover:border-red-400 hover:text-red-200'
            }
          >
            <StopIcon />
          </button>
          <button
            type="button"
            onClick={toggleGridMode}
            aria-pressed={gridMode}
            aria-label={gridMode ? 'Switch to standard view' : 'Switch to grid view'}
            title={gridMode ? 'Standard view' : 'Grid view'}
            className={
              ICON_BTN +
              (gridMode
                ? ' border-accent bg-accent/15 text-text hover:bg-accent/25'
                : ' border-surface text-text-muted hover:border-accent hover:text-text')
            }
          >
            {gridMode ? <ListViewIcon /> : <GridViewIcon />}
          </button>
          <button
            type="button"
            onClick={() => setControlsOpen((current) => !current)}
            aria-expanded={controlsOpen}
            aria-label={controlsOpen ? 'Hide volume' : 'Show volume'}
            title={controlsOpen ? 'Hide volume' : 'Volume'}
            className={
              ICON_BTN +
              (controlsOpen
                ? ' border-accent bg-accent/15 text-text'
                : ' border-surface text-text-muted hover:border-accent hover:text-text')
            }
          >
            <VolumeIcon />
          </button>
          {isDashboard ? (
            <Link
              to="/clips/new"
              className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              New clip
            </Link>
          ) : null}
        </div>

        {isCategoryFocus ? (
          <div
            className={
              'flex items-center border-t border-surface/30 py-1.5 ' + APP_SHELL_H_PADDING
            }
          >
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={searchInCategoryOnly}
                onChange={(e) => updateSearchInCategoryOnly(e.target.checked)}
                className="accent-accent"
              />
              {isFavorites ? 'Limit search to favorites' : 'Limit search to this category'}
            </label>
          </div>
        ) : null}

        {controlsOpen ? (
          <div className={'space-y-3 border-t border-surface/50 pb-2 pt-2 ' + APP_SHELL_H_PADDING}>
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
              {isDashboard ? (
                <p className="mt-1 text-xs text-text-muted">
                  Applied on top of each clip&apos;s volume when playing in OBS.
                </p>
              ) : null}
            </div>
            {isDashboard && stageClientCount === 0 ? (
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

        {!isCategoryGrid && !isCategoryFocus ? (
          <div
            className={
              'flex gap-1.5 overflow-x-auto border-t border-surface/30 py-2 ' + APP_SHELL_H_PADDING
            }
          >
            <CategoryChip
              to="/browse"
              active={false}
              label="Categories"
              leading={<CategoriesGridIcon />}
            />
            <CategoryChip
              to={'/' + chipSearchSuffix}
              active={isDashboard}
              label="All"
            />
            {favoriteCount > 0 ? (
              <CategoryChip
                to={`/browse/favorites${chipSearchSuffix}`}
                active={isFavorites}
                label="Favorites"
                icon="★"
              />
            ) : null}
            {categories.map((category) => (
              <CategoryChip
                key={category.id}
                to={`/browse/categories/${category.id}${chipSearchSuffix}`}
                active={categoryId === category.id}
                label={category.name}
              />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

function CategoryChip({
  to,
  active,
  label,
  icon,
  leading,
}: {
  to: string;
  active: boolean;
  label: string;
  icon?: string;
  leading?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={
        'flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
        (active
          ? 'border-accent bg-accent/15 text-text'
          : 'border-surface text-text-muted hover:border-accent hover:text-text')
      }
    >
      {leading ? <span className="opacity-80" aria-hidden="true">{leading}</span> : null}
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </Link>
  );
}

function CategoriesGridIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <path d="M11 14h6M11 17h4" />
    </svg>
  );
}

function BackIcon() {
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
      <path d="M12 16l-6-6 6-6" />
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

function VolumeIcon() {
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
      <path d="M3 8v4h3l4 3V5L6 8H3z" />
      <path d="M13 7a4 4 0 0 1 0 6" />
    </svg>
  );
}
