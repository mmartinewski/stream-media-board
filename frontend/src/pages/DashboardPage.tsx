import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  api,
  type ClipDto,
  type ClipsResponse,
  type LayoutAreaDto,
  type LayoutSettingsResponse,
} from '../lib/api';
import { useDashboardView } from '../contexts/DashboardViewContext';
import { clampClipVolume, clipVolumeMax } from '../lib/volume';

function resolvePlayLayoutAreaId(
  clip: ClipDto,
  settings: LayoutSettingsResponse | null,
  areas: LayoutAreaDto[],
): number | undefined {
  if (areas.length === 0) return undefined;
  if (
    clip.default_layout_area_id != null &&
    areas.some((a) => a.id === clip.default_layout_area_id)
  ) {
    return clip.default_layout_area_id;
  }
  if (!settings) return areas[0]?.id;
  const orient = clip.video_orientation ?? 'landscape';
  const fromSettings =
    orient === 'portrait'
      ? settings.layout_area_id_portrait
      : settings.layout_area_id_landscape;
  if (fromSettings != null && areas.some((a) => a.id === fromSettings)) {
    return fromSettings;
  }
  return areas[0]?.id;
}

function layoutAreaName(
  areaId: number | undefined,
  areas: LayoutAreaDto[],
): string | null {
  if (areaId == null) return null;
  return areas.find((a) => a.id === areaId)?.name ?? null;
}

type DashboardToastVariant = 'error' | 'success' | 'warning';

interface DashboardToast {
  message: string;
  variant: DashboardToastVariant;
}

const TOAST_CLASS: Record<DashboardToastVariant, string> = {
  error: 'border-red-500/50 bg-red-950/95 text-red-100',
  success: 'border-emerald-500/50 bg-emerald-950/95 text-emerald-100',
  warning: 'border-amber-500/50 bg-amber-950/95 text-amber-100',
};

const TOAST_DISMISS_MS = 4000;
const CARD_ERROR_DISMISS_MS = 4000;
const VOLUME_SAVE_DEBOUNCE_MS = 400;
const GRID_POPOVER_MARGIN = 8;
const GRID_POPOVER_GAP = 4;
const GRID_POPOVER_ESTIMATED_WIDTH = 176;
const GRID_POPOVER_ESTIMATED_HEIGHT = 280;

function computeGridPopoverStyle(
  anchor: DOMRect,
  menu?: { width: number; height: number },
): CSSProperties {
  const margin = GRID_POPOVER_MARGIN;
  const gap = GRID_POPOVER_GAP;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const menuWidth = Math.min(
    menu?.width ?? GRID_POPOVER_ESTIMATED_WIDTH,
    viewportW - margin * 2,
  );
  const menuHeight = menu?.height ?? GRID_POPOVER_ESTIMATED_HEIGHT;
  const maxHeight = viewportH - margin * 2;

  const spaceBelow = viewportH - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  let openBelow = spaceBelow >= menuHeight || spaceBelow >= spaceAbove;

  let top = openBelow ? anchor.bottom + gap : anchor.top - gap - menuHeight;
  if (openBelow && top + menuHeight > viewportH - margin) {
    const aboveTop = anchor.top - gap - menuHeight;
    if (aboveTop >= margin) {
      openBelow = false;
      top = aboveTop;
    } else {
      top = Math.max(margin, viewportH - margin - Math.min(menuHeight, maxHeight));
    }
  }
  if (!openBelow && top < margin) {
    top = margin;
  }

  let left = anchor.right - menuWidth;
  left = Math.max(margin, Math.min(left, viewportW - margin - menuWidth));

  const style: CSSProperties = {
    position: 'fixed',
    top,
    left,
  };

  const availableBelow = viewportH - margin - top;
  if (menuHeight > availableBelow) {
    style.maxHeight = Math.max(120, availableBelow);
    style.overflowY = 'auto';
  }

  return style;
}

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [clips, setClips] = useState<ClipsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<number, string>>({});
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [playPulse, setPlayPulse] = useState<{ id: number; token: number } | null>(null);
  const [toast, setToast] = useState<DashboardToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardErrorTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [favoriteId, setFavoriteId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [openCategoryMenuKey, setOpenCategoryMenuKey] = useState<string | null>(null);
  const [categoryToRename, setCategoryToRename] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [categoryRenameName, setCategoryRenameName] = useState('');
  const [categoryRenameSaving, setCategoryRenameSaving] = useState(false);
  const [categoryRenameError, setCategoryRenameError] = useState<string | null>(null);
  const categoryRenameNameRef = useRef<HTMLInputElement>(null);
  const [clipToDelete, setClipToDelete] = useState<ClipDto | null>(null);
  const [clipToEditMetadata, setClipToEditMetadata] = useState<ClipDto | null>(null);
  const [metadataTitle, setMetadataTitle] = useState('');
  const [metadataCategories, setMetadataCategories] = useState<string[]>([]);
  const [metadataCategoryInput, setMetadataCategoryInput] = useState('');
  const [metadataTags, setMetadataTags] = useState<string[]>([]);
  const [metadataTagInput, setMetadataTagInput] = useState('');
  const [metadataCategorySuggestions, setMetadataCategorySuggestions] = useState<string[]>([]);
  const [metadataTagSuggestions, setMetadataTagSuggestions] = useState<string[]>([]);
  const [metadataDefaultLayoutAreaId, setMetadataDefaultLayoutAreaId] = useState<number | ''>(
    '',
  );
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const metadataTitleRef = useRef<HTMLInputElement>(null);
  const [volumeSavingId, setVolumeSavingId] = useState<number | null>(null);
  const clipVolumeTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [layoutAreas, setLayoutAreas] = useState<LayoutAreaDto[]>([]);
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettingsResponse | null>(null);
  const [playAtFlyoutKey, setPlayAtFlyoutKey] = useState<string | null>(null);
  const [editFlyoutKey, setEditFlyoutKey] = useState<string | null>(null);
  const [volumeFlyoutKey, setVolumeFlyoutKey] = useState<string | null>(null);
  const { gridMode } = useDashboardView();
  const gridPopoverAnchorRef = useRef<HTMLElement | null>(null);
  const gridPopoverMenuRef = useRef<HTMLDivElement | null>(null);
  const [gridPopoverStyle, setGridPopoverStyle] = useState<CSSProperties | null>(null);

  const showToast = useCallback((message: string, variant: DashboardToastVariant) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, variant });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_DISMISS_MS);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  const clearCardErrorTimer = useCallback((clipId: number) => {
    const timer = cardErrorTimersRef.current.get(clipId);
    if (timer) {
      clearTimeout(timer);
      cardErrorTimersRef.current.delete(clipId);
    }
  }, []);

  const scheduleCardErrorDismiss = useCallback(
    (clipId: number, delayMs = CARD_ERROR_DISMISS_MS) => {
      clearCardErrorTimer(clipId);
      const timer = window.setTimeout(() => {
        setCardErrors((prev) => {
          if (!prev[clipId]) return prev;
          const next = { ...prev };
          delete next[clipId];
          return next;
        });
        cardErrorTimersRef.current.delete(clipId);
      }, delayMs);
      cardErrorTimersRef.current.set(clipId, timer);
    },
    [clearCardErrorTimer],
  );

  useEffect(() => {
    const timers = cardErrorTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const closeClipCardMenus = useCallback(() => {
    setOpenMenuKey(null);
    setPlayAtFlyoutKey(null);
    setEditFlyoutKey(null);
    setVolumeFlyoutKey(null);
    gridPopoverAnchorRef.current = null;
    gridPopoverMenuRef.current = null;
    setGridPopoverStyle(null);
  }, []);

  const syncGridPopoverPosition = useCallback(() => {
    const anchorEl = gridPopoverAnchorRef.current;
    if (!anchorEl) return;
    const anchor = anchorEl.getBoundingClientRect();
    const menuEl = gridPopoverMenuRef.current;
    const menuSize = menuEl
      ? { width: menuEl.offsetWidth, height: menuEl.offsetHeight }
      : undefined;
    setGridPopoverStyle(computeGridPopoverStyle(anchor, menuSize));
  }, []);

  const pinGridPopoverAnchor = useCallback(
    (element: HTMLElement) => {
      gridPopoverAnchorRef.current = element;
      syncGridPopoverPosition();
    },
    [syncGridPopoverPosition],
  );

  useLayoutEffect(() => {
    if (!openMenuKey && !playAtFlyoutKey) {
      setGridPopoverStyle(null);
      return;
    }
    syncGridPopoverPosition();
    const menuEl = gridPopoverMenuRef.current;
    const resizeObserver =
      menuEl && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncGridPopoverPosition())
        : null;
    resizeObserver?.observe(menuEl!);
    window.addEventListener('scroll', syncGridPopoverPosition, true);
    window.addEventListener('resize', syncGridPopoverPosition);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', syncGridPopoverPosition, true);
      window.removeEventListener('resize', syncGridPopoverPosition);
    };
  }, [
    openMenuKey,
    playAtFlyoutKey,
    editFlyoutKey,
    volumeFlyoutKey,
    syncGridPopoverPosition,
  ]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      for (const timer of clipVolumeTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .getClips(search)
        .then((c) => {
          if (!cancelled) {
            setClips(c);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.getLayoutAreas(), api.getLayoutSettings()])
      .then(([areasRes, settingsRes]) => {
        if (!cancelled) {
          setLayoutAreas(areasRes.areas);
          setLayoutSettings(settingsRes);
        }
      })
      .catch(() => {
        /* layout areas optional for dashboard */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadClips = async () => {
    const next = await api.getClips(search);
    setClips(next);
  };

  const updateClipVolumeInState = useCallback((clipId: number, volume: number) => {
    setClips((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((section) => ({
          ...section,
          clips: section.clips.map((clip) =>
            clip.id === clipId ? { ...clip, volume } : clip,
          ),
        })),
      };
    });
  }, []);

  const handleClipVolumeChange = (clip: ClipDto, raw: number) => {
    const volume = clampClipVolume(raw, clip.clip_type);
    updateClipVolumeInState(clip.id, volume);

    const existing = clipVolumeTimersRef.current.get(clip.id);
    if (existing) clearTimeout(existing);

    clipVolumeTimersRef.current.set(
      clip.id,
      setTimeout(() => {
        clipVolumeTimersRef.current.delete(clip.id);
        void (async () => {
          setVolumeSavingId(clip.id);
          try {
            await api.updateClipVolume(clip.id, volume);
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err), 'error');
            await reloadClips();
          } finally {
            setVolumeSavingId((current) => (current === clip.id ? null : current));
          }
        })();
      }, VOLUME_SAVE_DEBOUNCE_MS),
    );
  };

  const handlePlay = async (clip: ClipDto, explicitLayoutAreaId?: number) => {
    const id = clip.id;
    const token = Date.now();
    setPlayPulse({ id, token });
    window.setTimeout(() => {
      setPlayPulse((current) =>
        current?.id === id && current.token === token ? null : current,
      );
    }, 337);
    clearCardErrorTimer(id);
    setCardErrors((prev) => ({ ...prev, [id]: '' }));
    setPlayingId(id);
    try {
      const layoutAreaId =
        clip.clip_type === 'video'
          ? (explicitLayoutAreaId ?? resolvePlayLayoutAreaId(clip, layoutSettings, layoutAreas))
          : undefined;
      const result = await api.playClip(
        id,
        layoutAreaId != null ? { layout_area_id: layoutAreaId } : undefined,
      );
      if (
        result.playback === 'browser_source' &&
        (result.connected_clients ?? 0) === 0
      ) {
        setCardErrors((prev) => ({
          ...prev,
          [id]:
            clip.clip_type === 'video'
              ? 'No stage browser source — use ?mode=stage in OBS (Layout areas)'
              : 'No audio browser source — add ?mode=audio or universal in OBS',
        }));
        scheduleCardErrorDismiss(id);
      }
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setPlayingId(null);
    }
  };

  const closeMetadataModal = useCallback(() => {
    if (metadataSaving) return;
    setClipToEditMetadata(null);
    setMetadataError(null);
    setMetadataTagInput('');
    setMetadataDefaultLayoutAreaId('');
  }, [metadataSaving]);

  const closeCategoryRenameModal = useCallback(() => {
    if (categoryRenameSaving) return;
    setCategoryToRename(null);
    setCategoryRenameError(null);
  }, [categoryRenameSaving]);

  const openCategoryRename = (category: { id: number; name: string }) => {
    setOpenCategoryMenuKey(null);
    setCategoryToRename(category);
    setCategoryRenameName(category.name);
    setCategoryRenameError(null);
  };

  const saveCategoryRename = useCallback(async () => {
    if (!categoryToRename || categoryRenameSaving) return;
    const name = categoryRenameName.trim();
    if (!name) {
      setCategoryRenameError('Category name is required.');
      return;
    }

    setCategoryRenameError(null);
    setCategoryRenameSaving(true);
    try {
      await api.renameCategory(categoryToRename.id, name);
      setCategoryToRename(null);
      await reloadClips();
    } catch (err) {
      setCategoryRenameError(err instanceof Error ? err.message : String(err));
    } finally {
      setCategoryRenameSaving(false);
    }
  }, [categoryToRename, categoryRenameName, categoryRenameSaving]);

  const saveCategoryRenameRef = useRef(saveCategoryRename);
  saveCategoryRenameRef.current = saveCategoryRename;

  useEffect(() => {
    if (!categoryToRename) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCategoryRenameModal();
      if (isModalSubmitShortcut(event)) {
        event.preventDefault();
        void saveCategoryRenameRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [categoryToRename?.id, closeCategoryRenameModal]);

  useEffect(() => {
    if (!categoryToRename) return;
    const focusTimer = window.setTimeout(() => {
      categoryRenameNameRef.current?.focus();
      categoryRenameNameRef.current?.select();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [categoryToRename?.id]);

  const openMetadataEditor = (clip: ClipDto) => {
    setOpenMenuKey(null);
    setOpenCategoryMenuKey(null);
    setPlayAtFlyoutKey(null);
    setEditFlyoutKey(null);
    setClipToEditMetadata(clip);
    setMetadataTitle(clip.title);
    setMetadataCategories(
      clip.categories?.length
        ? clip.categories.map((category) => category.name)
        : clip.category.name
          ? [clip.category.name]
          : [],
    );
    setMetadataCategoryInput('');
    setMetadataTags(parseTags(clip.tags ?? ''));
    setMetadataDefaultLayoutAreaId(
      clip.clip_type === 'video' && clip.default_layout_area_id != null
        ? clip.default_layout_area_id
        : '',
    );
    setMetadataTagInput('');
    setMetadataError(null);
  };

  const saveMetadata = useCallback(async () => {
    if (!clipToEditMetadata || metadataSaving) return;
    const title = metadataTitle.trim();
    if (!title || metadataCategories.length === 0) {
      setMetadataError('Title and at least one category are required.');
      return;
    }

    setMetadataError(null);
    setMetadataSaving(true);
    setCardErrors((prev) => ({ ...prev, [clipToEditMetadata.id]: '' }));
    try {
      await api.updateClipMetadata(clipToEditMetadata.id, {
        title,
        categories: metadataCategories,
        tags: metadataTags.join(', '),
        ...(clipToEditMetadata.clip_type === 'video'
          ? {
              default_layout_area_id:
                metadataDefaultLayoutAreaId === '' ? null : metadataDefaultLayoutAreaId,
            }
          : {}),
      });
      setClipToEditMetadata(null);
      setMetadataTagInput('');
      await reloadClips();
    } catch (err) {
      setMetadataError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetadataSaving(false);
    }
  }, [
    clipToEditMetadata,
    metadataTitle,
    metadataCategories,
    metadataTags,
    metadataDefaultLayoutAreaId,
    metadataSaving,
  ]);

  const saveMetadataRef = useRef(saveMetadata);
  saveMetadataRef.current = saveMetadata;

  useEffect(() => {
    if (!clipToEditMetadata) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMetadataModal();
      if (isModalSubmitShortcut(event)) {
        event.preventDefault();
        void saveMetadataRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clipToEditMetadata?.id, closeMetadataModal]);

  useEffect(() => {
    if (!clipToEditMetadata) return;
    const focusTimer = window.setTimeout(() => {
      metadataTitleRef.current?.focus();
      metadataTitleRef.current?.select();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [clipToEditMetadata?.id]);

  useEffect(() => {
    if (!clipToEditMetadata) return;
    let cancelled = false;
    api
      .getCategorySuggestions(metadataCategoryInput)
      .then((res) => {
        if (!cancelled) {
          setMetadataCategorySuggestions(res.categories.map((category) => category.name));
        }
      })
      .catch(() => {
        if (!cancelled) setMetadataCategorySuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clipToEditMetadata, metadataCategoryInput]);

  useEffect(() => {
    if (!clipToEditMetadata) return;
    let cancelled = false;
    api
      .getTagSuggestions(metadataTagInput)
      .then((res) => {
        if (!cancelled) setMetadataTagSuggestions(res.tags);
      })
      .catch(() => {
        if (!cancelled) setMetadataTagSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clipToEditMetadata, metadataTagInput]);

  const addMetadataCategory = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    setMetadataCategories((current) => {
      const key = name.toLocaleLowerCase('en');
      if (current.some((item) => item.toLocaleLowerCase('en') === key)) return current;
      return [...current, name];
    });
    setMetadataCategoryInput('');
  };

  const removeMetadataCategory = (name: string) => {
    setMetadataCategories((current) => current.filter((item) => item !== name));
  };

  const addMetadataTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setMetadataTags((current) => {
      const key = tag.toLocaleLowerCase('en');
      if (current.some((item) => item.toLocaleLowerCase('en') === key)) return current;
      return [...current, tag];
    });
    setMetadataTagInput('');
  };

  const removeMetadataTag = (tag: string) => {
    setMetadataTags((current) => current.filter((item) => item !== tag));
  };

  const requestDelete = (clip: ClipDto) => {
    closeClipCardMenus();
    setClipToDelete(clip);
  };

  const handleDownload = async (clip: ClipDto) => {
    closeClipCardMenus();
    setCardErrors((prev) => ({ ...prev, [clip.id]: '' }));
    setDownloadingId(clip.id);
    const isVideo = clip.clip_type === 'video';
    try {
      const downloadUrl = isVideo
        ? api.getClipVideoDownloadUrl(clip.id)
        : api.getClipAudioDownloadUrl(clip.id);
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        throw new Error(`Download failed (${res.status} ${res.statusText})`);
      }
      const contentType = res.headers.get('content-type') ?? '';
      const expectedKind = isVideo ? 'video' : 'audio';
      if (!contentType.toLowerCase().includes(expectedKind)) {
        throw new Error(`Download did not return a ${expectedKind} file.`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${toDownloadFilename(clip.title)}.${isVideo ? 'mp4' : 'mp3'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [clip.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setDownloadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!clipToDelete) return;
    const clip = clipToDelete;
    setCardErrors((prev) => ({ ...prev, [clip.id]: '' }));
    setDeletingId(clip.id);
    try {
      await api.deleteClip(clip.id);
      setClipToDelete(null);
      await reloadClips();
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [clip.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleFavorite = async (clip: ClipDto) => {
    setCardErrors((prev) => ({ ...prev, [clip.id]: '' }));
    setFavoriteId(clip.id);
    try {
      await api.setFavorite(clip.id, clip.is_favorite !== 1);
      await reloadClips();
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [clip.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setFavoriteId(null);
    }
  };

  if (error) {
    return (
      <section className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-red-200">
        <p className="font-semibold">Could not contact the backend.</p>
        <p className="text-sm opacity-80">{error}</p>
      </section>
    );
  }

  if (!clips) {
    return <p className="text-text-muted">Loading...</p>;
  }

  const isSearching = search.trim().length > 0;
  const allClips = uniqueClips(clips.sections.flatMap((section) => section.clips));
  const sections = isSearching
    ? [{
        type: 'search' as const,
        title: 'Search results',
        clips: allClips,
      }]
    : gridMode
      ? [{ type: 'all' as const, clips: allClips }]
      : clips.sections;

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
                  onClick={dismissToast}
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

      <section className="w-full space-y-6">
      {sections.map((section, idx) => (
        <article
          key={idx}
          className={
            'rounded-md border border-surface bg-surface-soft ' +
            (gridMode ? 'p-2 sm:p-3' : 'p-4')
          }
        >
          {!gridMode &&
            (section.type === 'category' && section.category.id != null ? (
              <div className="relative mb-2 flex items-center justify-between gap-2">
                <h3 className="min-w-0 flex-1 truncate text-base font-semibold">
                  {section.category.name}
                </h3>
                <button
                  type="button"
                  aria-label="Open category menu"
                  onClick={() =>
                    setOpenCategoryMenuKey((current) =>
                      current === `category-${section.category.id}`
                        ? null
                        : `category-${section.category.id}`,
                    )
                  }
                  className="shrink-0 rounded-full border border-surface bg-bg px-2 py-1 text-lg leading-none text-text-muted hover:border-accent hover:text-text"
                >
                  ⋮
                </button>
                {openCategoryMenuKey === `category-${section.category.id}` && (
                  <>
                    <button
                      type="button"
                      aria-label="Close category menu"
                      onClick={() => setOpenCategoryMenuKey(null)}
                      className="fixed inset-0 z-20 cursor-default bg-transparent"
                    />
                    <div className="absolute right-0 top-9 z-30 min-w-36 overflow-hidden rounded-md border border-surface bg-bg shadow-xl">
                      <button
                        type="button"
                        onClick={() =>
                          openCategoryRename({
                            id: section.category.id!,
                            name: section.category.name,
                          })
                        }
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft"
                      >
                        <span aria-hidden="true">✎</span>
                        Edit category
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <h3 className="mb-2 text-base font-semibold">
                {section.type === 'favorites'
                  ? 'Favorites'
                  : section.type === 'search'
                    ? section.title
                    : section.type === 'category'
                      ? section.category.name
                      : ''}
              </h3>
            ))}
          {section.clips.length === 0 ? (
            <p className="text-sm text-text-muted">
              {isSearching
                ? 'No clips match this search.'
                : gridMode
                  ? 'No clips yet.'
                  : 'No clips in this section.'}
            </p>
          ) : (
            <ul
              className={
                gridMode
                  ? 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10'
                  : 'grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12'
              }
            >
              {section.clips.map((clip) => {
                const menuKey = gridMode
                  ? `grid-${clip.id}`
                  : `${section.type}-${section.type === 'category' ? section.category.id ?? 'none' : section.type}-${clip.id}`;
                const clipMenuPanel = (
                  <>
                    {clip.clip_type === 'video' && layoutAreas.length > 0 ? (
                      <div className="border-b border-surface">
                        <button
                          type="button"
                          aria-expanded={playAtFlyoutKey === menuKey}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditFlyoutKey(null);
                            setVolumeFlyoutKey(null);
                            setPlayAtFlyoutKey((current) =>
                              current === menuKey ? null : menuKey,
                            );
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft"
                        >
                          <span aria-hidden="true">▶</span>
                          <span className="flex-1">Play in…</span>
                          <span className="text-text-muted" aria-hidden="true">
                            {playAtFlyoutKey === menuKey ? '▾' : '▸'}
                          </span>
                        </button>
                        {playAtFlyoutKey === menuKey ? (
                          <div
                            className="max-h-48 overflow-y-auto border-t border-surface/50 bg-bg-soft py-1"
                            role="menu"
                            aria-label="Layout areas"
                          >
                            <PlayInAreaList
                              clip={clip}
                              areas={layoutAreas}
                              settings={layoutSettings}
                              playingId={playingId}
                              onSelect={(areaId) => {
                                closeClipCardMenus();
                                void handlePlay(clip, areaId);
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="border-b border-surface">
                      <button
                        type="button"
                        aria-expanded={editFlyoutKey === menuKey}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlayAtFlyoutKey(null);
                          setVolumeFlyoutKey(null);
                          setEditFlyoutKey((current) =>
                            current === menuKey ? null : menuKey,
                          );
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft"
                      >
                        <span aria-hidden="true">✎</span>
                        <span className="flex-1">Edit</span>
                        <span className="text-text-muted" aria-hidden="true">
                          {editFlyoutKey === menuKey ? '▾' : '▸'}
                        </span>
                      </button>
                      {editFlyoutKey === menuKey ? (
                        <div
                          className="border-t border-surface/50 bg-bg-soft py-1"
                          role="menu"
                          aria-label="Edit options"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => openMetadataEditor(clip)}
                            className="flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left text-sm hover:bg-surface-soft"
                          >
                            <span aria-hidden="true">📝</span>
                            Metadata
                          </button>
                          <Link
                            to={`/clips/${clip.id}/edit`}
                            role="menuitem"
                            className="flex items-center gap-2 py-2 pl-8 pr-3 text-sm hover:bg-surface-soft"
                            onClick={closeClipCardMenus}
                          >
                            <span aria-hidden="true">🎬</span>
                            Full editor
                          </Link>
                        </div>
                      ) : null}
                    </div>
                    <div className="border-b border-surface">
                      <button
                        type="button"
                        aria-expanded={volumeFlyoutKey === menuKey}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlayAtFlyoutKey(null);
                          setEditFlyoutKey(null);
                          setVolumeFlyoutKey((current) =>
                            current === menuKey ? null : menuKey,
                          );
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft"
                      >
                        <span aria-hidden="true">🔊</span>
                        <span className="flex-1">Volume</span>
                        <span className="text-xs tabular-nums text-text-muted">
                          {volumeSavingId === clip.id ? 'Saving…' : clip.volume}
                        </span>
                        <span className="text-text-muted" aria-hidden="true">
                          {volumeFlyoutKey === menuKey ? '▾' : '▸'}
                        </span>
                      </button>
                      {volumeFlyoutKey === menuKey ? (
                        <div className="border-t border-surface/50 bg-bg-soft px-3 py-3">
                          <label
                            htmlFor={`clip-menu-volume-${clip.id}`}
                            className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-text-muted"
                          >
                            <span>Level</span>
                            <span>
                              {volumeSavingId === clip.id ? 'Saving…' : clip.volume}
                            </span>
                          </label>
                          <input
                            id={`clip-menu-volume-${clip.id}`}
                            type="range"
                            min={0}
                            max={clipVolumeMax(clip.clip_type)}
                            value={Math.min(clip.volume, clipVolumeMax(clip.clip_type))}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              handleClipVolumeChange(clip, Number(e.target.value))
                            }
                            className="mt-2 w-full accent-accent"
                            aria-label={`Volume for ${clip.title}`}
                          />
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDownload(clip)}
                      disabled={downloadingId === clip.id}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span aria-hidden="true">
                        <DownloadIcon />
                      </span>
                      {downloadingId === clip.id ? 'Downloading...' : 'Download'}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(clip)}
                      disabled={deletingId === clip.id}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span aria-hidden="true">🗑</span>
                      {deletingId === clip.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </>
                );
                const playInFlyoutPanel = (
                  <>
                    <p className="border-b border-surface px-3 py-2 text-xs font-medium text-text-muted">
                      Play in…
                    </p>
                    <div
                      className="max-h-48 overflow-y-auto py-1"
                      role="menu"
                      aria-label="Layout areas"
                    >
                      <PlayInAreaList
                        clip={clip}
                        areas={layoutAreas}
                        settings={layoutSettings}
                        playingId={playingId}
                        itemClassName="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"
                        onSelect={(areaId) => {
                          closeClipCardMenus();
                          void handlePlay(clip, areaId);
                        }}
                      />
                    </div>
                  </>
                );
                return (
                <li
                  key={clip.id}
                  className={
                    'relative rounded-md border border-surface/70 bg-bg-soft text-sm ' +
                    (gridMode ? 'aspect-square overflow-hidden' : '')
                  }
                >
                  <div className={gridMode ? 'relative h-full w-full' : 'relative'}>
                    <img
                      src={clip.thumbnail_cropped_url}
                      alt=""
                      className={
                        gridMode
                          ? 'absolute inset-0 h-full w-full bg-surface object-cover'
                          : 'aspect-square w-full rounded-t-md bg-surface object-cover'
                      }
                      loading="lazy"
                    />
                    <button
                      type="button"
                      aria-label={clip.is_favorite === 1 ? 'Remove from favorites' : 'Mark as favorite'}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleFavorite(clip);
                      }}
                      disabled={favoriteId === clip.id}
                      className={
                        'absolute left-1.5 top-1.5 z-20 rounded-full bg-black/45 px-1.5 py-0.5 text-base leading-none shadow backdrop-blur ' +
                        (clip.is_favorite === 1 ? 'text-yellow-300' : 'text-white')
                      }
                    >
                      {clip.is_favorite === 1 ? '★' : '☆'}
                    </button>
                    {clip.clip_type === 'video' && layoutAreas.length > 0 ? (
                      <>
                        <button
                          type="button"
                          aria-label={`Play ${clip.title} in layout area`}
                          aria-expanded={
                            playAtFlyoutKey === menuKey && openMenuKey !== menuKey
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenCategoryMenuKey(null);
                            setOpenMenuKey(null);
                            setEditFlyoutKey(null);
                            setVolumeFlyoutKey(null);
                            if (playAtFlyoutKey === menuKey) {
                              closeClipCardMenus();
                              return;
                            }
                            pinGridPopoverAnchor(e.currentTarget);
                            setPlayAtFlyoutKey(menuKey);
                          }}
                          className="absolute right-8 top-1.5 z-20 rounded-full bg-black/45 p-1 text-white shadow backdrop-blur hover:bg-black/60"
                        >
                          <PlayInShortcutIcon className="h-3.5 w-3.5" />
                        </button>
                        {playAtFlyoutKey === menuKey && openMenuKey !== menuKey ? (
                          <>
                            <button
                              type="button"
                              aria-label="Close play in menu"
                              onClick={closeClipCardMenus}
                              className="fixed inset-0 z-[45] cursor-default bg-transparent"
                            />
                            {gridPopoverStyle
                              ? createPortal(
                                  <div
                                    ref={gridPopoverMenuRef}
                                    style={gridPopoverStyle}
                                    className="z-[50] min-w-44 overflow-hidden rounded-md border border-surface bg-bg shadow-xl"
                                  >
                                    {playInFlyoutPanel}
                                  </div>,
                                  document.body,
                                )
                              : null}
                          </>
                        ) : null}
                      </>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Open clip menu"
                      onClick={(e) => {
                        setOpenCategoryMenuKey(null);
                        if (openMenuKey === menuKey) {
                          closeClipCardMenus();
                          return;
                        }
                        pinGridPopoverAnchor(e.currentTarget);
                        setPlayAtFlyoutKey(null);
                        setEditFlyoutKey(null);
                        setVolumeFlyoutKey(null);
                        setOpenMenuKey(menuKey);
                      }}
                      className="absolute right-1.5 top-1.5 z-20 rounded-full bg-black/45 px-1.5 py-0.5 text-base leading-none text-white shadow backdrop-blur"
                    >
                      ⋮
                    </button>
                    {openMenuKey === menuKey && (
                      <>
                        <button
                          type="button"
                          aria-label="Close menu"
                          onClick={closeClipCardMenus}
                          className="fixed inset-0 z-[45] cursor-default bg-transparent"
                        />
                        {gridPopoverStyle
                          ? createPortal(
                              <div
                                ref={gridPopoverMenuRef}
                                style={gridPopoverStyle}
                                className="z-[50] min-w-44 rounded-md border border-surface bg-bg shadow-xl"
                              >
                                {clipMenuPanel}
                              </div>,
                              document.body,
                            )
                          : null}
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={`Play ${clip.title}`}
                      onClick={() => void handlePlay(clip)}
                      disabled={deletingId === clip.id}
                      className={
                        'absolute flex items-center justify-center text-white transition duration-200 hover:bg-black/20 disabled:opacity-60 ' +
                        'inset-0 z-[1] ' +
                        ' ' +
                        (playPulse?.id === clip.id ? 'bg-white/25' : 'bg-black/10')
                      }
                    >
                      <span
                        className={
                          'relative flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur transition-all duration-300 ' +
                          (playPulse?.id === clip.id
                            ? 'scale-125 bg-white/90 text-bg ring-2 ring-white/60'
                            : 'scale-100 bg-black/45 text-white')
                        }
                      >
                        {clip.clip_type === 'video' ? (
                          <VideoClipIcon className="h-4 w-4" />
                        ) : (
                          <AudioClipIcon className="h-4 w-4" />
                        )}
                      </span>
                    </button>
                    {gridMode ? (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-2 pt-8 text-left">
                        <p
                          className="truncate text-xs font-medium leading-tight text-white"
                          title={clip.title}
                        >
                          {clip.title}
                        </p>
                        <p className="truncate text-[10px] leading-tight text-white/75">
                          {formatClipCategories(clip)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {!gridMode ? (
                  <div className="px-2 py-1.5">
                    <p
                      className="truncate text-xs font-medium leading-tight"
                      title={clip.title}
                    >
                      {clip.title}
                    </p>
                    <p className="truncate text-[10px] leading-tight text-text-muted">
                      {formatClipCategories(clip)}
                    </p>
                    {clip.clip_type === 'video' && layoutAreas.length > 0 ? (
                      <p className="mt-0.5 truncate text-[9px] text-text-muted">
                        Play →{' '}
                        {layoutAreaName(
                          resolvePlayLayoutAreaId(clip, layoutSettings, layoutAreas),
                          layoutAreas,
                        ) ?? 'default area'}
                      </p>
                    ) : clip.clip_type === 'audio' ? (
                      <p className="mt-0.5 truncate text-[9px] text-text-muted">
                        Play → Audio clip
                      </p>
                    ) : null}
                  </div>
                  ) : null}
                  {cardErrors[clip.id] && (
                    <div
                      className={
                        gridMode
                          ? 'absolute inset-x-0 top-0 z-20 border-b border-red-500/30 bg-red-950/90 px-2 py-1 text-[10px] text-red-200'
                          : 'absolute inset-x-0 top-0 z-20 border-b border-red-500/30 bg-red-950/90 px-1.5 py-0.5 text-[9px] text-red-200'
                      }
                    >
                      {cardErrors[clip.id]}
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </article>
      ))}
      {categoryToRename && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-category-title"
          onClick={closeCategoryRenameModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-surface bg-bg p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="rename-category-title" className="text-lg font-semibold">
              Edit category
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Renaming updates every clip in this category.
            </p>
            <div className="mt-4">
              <label htmlFor="rename-category-name" className="block text-sm font-medium">
                Category name
              </label>
              <input
                ref={categoryRenameNameRef}
                id="rename-category-name"
                value={categoryRenameName}
                onChange={(e) => setCategoryRenameName(e.target.value)}
                disabled={categoryRenameSaving}
                className="mt-1 w-full rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
              />
            </div>
            {categoryRenameError && (
              <p className="mt-3 text-sm text-red-200">{categoryRenameError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCategoryRenameModal}
                disabled={categoryRenameSaving}
                className="rounded-md border border-surface px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveCategoryRename()}
                title="Save (Ctrl+Enter)"
                disabled={categoryRenameSaving}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {categoryRenameSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {clipToEditMetadata && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-metadata-title"
          onClick={closeMetadataModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            className="w-full max-w-md rounded-lg border border-surface bg-bg p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-metadata-title" className="text-lg font-semibold">
              Edit metadata
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Update title, categories, and tags without leaving the Media Board.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="metadata-title" className="block text-sm font-medium">
                  Title
                </label>
                <input
                  ref={metadataTitleRef}
                  id="metadata-title"
                  value={metadataTitle}
                  onChange={(e) => setMetadataTitle(e.target.value)}
                  disabled={metadataSaving}
                  className="mt-1 w-full rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="metadata-categories" className="block text-sm font-medium">
                  Categories
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="metadata-categories"
                    list="metadata-category-suggestions"
                    value={metadataCategoryInput}
                    onChange={(e) => setMetadataCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addMetadataCategory(metadataCategoryInput);
                      }
                    }}
                    disabled={metadataSaving}
                    placeholder="Type a category"
                    className="min-w-0 flex-1 rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => addMetadataCategory(metadataCategoryInput)}
                    disabled={metadataSaving || !metadataCategoryInput.trim()}
                    className="rounded-md border border-surface px-3 py-2 text-sm font-medium hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                <datalist id="metadata-category-suggestions">
                  {metadataCategorySuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                {metadataCategories.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {metadataCategories.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded-full border border-surface bg-bg px-2.5 py-1 text-xs"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => removeMetadataCategory(name)}
                          disabled={metadataSaving}
                          aria-label={`Remove category ${name}`}
                          className="text-text-muted hover:text-text disabled:opacity-40"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {clipToEditMetadata.clip_type === 'video' && layoutAreas.length > 0 ? (
                <div>
                  <label htmlFor="metadata-layout-area" className="block text-sm font-medium">
                    Default layout area
                  </label>
                  <select
                    id="metadata-layout-area"
                    value={metadataDefaultLayoutAreaId}
                    onChange={(e) =>
                      setMetadataDefaultLayoutAreaId(
                        e.target.value === '' ? '' : Number(e.target.value),
                      )
                    }
                    disabled={metadataSaving}
                    className="form-select mt-1 w-full rounded-md border border-surface bg-bg-soft pl-3 pr-9 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                  >
                    <option value="">By orientation (global default)</option>
                    {layoutAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-muted">
                    Used when you press ▶ on the Media Board. Override once via Play in… in the
                    clip menu.
                  </p>
                </div>
              ) : null}
              <div>
                <label htmlFor="metadata-tags" className="block text-sm font-medium">
                  Tags
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="metadata-tags"
                    list="metadata-tag-suggestions"
                    value={metadataTagInput}
                    onChange={(e) => setMetadataTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        addMetadataTag(metadataTagInput);
                      }
                    }}
                    disabled={metadataSaving}
                    placeholder="Type a tag"
                    className="min-w-0 flex-1 rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => addMetadataTag(metadataTagInput)}
                    disabled={metadataSaving || !metadataTagInput.trim()}
                    className="rounded-md border border-surface px-3 py-2 text-sm font-medium hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                <datalist id="metadata-tag-suggestions">
                  {metadataTagSuggestions.map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
                {metadataTags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {metadataTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 rounded-full border border-surface bg-bg-soft px-3 py-1 text-xs"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeMetadataTag(tag)}
                          disabled={metadataSaving}
                          className="text-text-muted hover:text-red-200 disabled:opacity-50"
                          aria-label={`Remove tag ${tag}`}
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-text-muted">Add one or more tags.</p>
                )}
              </div>
            </div>

            {metadataError && (
              <p className="mt-3 text-sm text-red-200">{metadataError}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeMetadataModal}
                disabled={metadataSaving}
                className="rounded-md border border-surface px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveMetadata()}
                disabled={metadataSaving}
                title="Save (Ctrl+Enter)"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {metadataSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {clipToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-clip-title"
          onClick={() => {
            if (deletingId !== clipToDelete.id) setClipToDelete(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-surface bg-bg p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-clip-title" className="text-lg font-semibold">
              Delete clip?
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              This action will remove <strong className="text-text">{clipToDelete.title}</strong> and its audio/thumbnail files.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClipToDelete(null)}
                disabled={deletingId === clipToDelete.id}
                className="rounded-md border border-surface px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deletingId === clipToDelete.id}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId === clipToDelete.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
    </>
  );
}

function isModalSubmitShortcut(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

function formatClipCategories(clip: ClipDto): string {
  const names = clip.categories?.length
    ? clip.categories.map((category) => category.name)
    : clip.category.name
      ? [clip.category.name]
      : [];
  return names.length > 0 ? names.join(', ') : '(uncategorized)';
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of raw.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean)) {
    const key = tag.toLocaleLowerCase('en');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function uniqueClips(clips: ClipDto[]): ClipDto[] {
  const seen = new Set<number>();
  const result: ClipDto[] = [];
  for (const clip of clips) {
    if (seen.has(clip.id)) continue;
    seen.add(clip.id);
    result.push(clip);
  }
  return result;
}

function toDownloadFilename(title: string): string {
  const safe = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return safe || 'clip';
}

function PlayInAreaList({
  clip,
  areas,
  settings,
  playingId,
  onSelect,
  itemClassName = 'flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left text-sm hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50',
}: {
  clip: ClipDto;
  areas: LayoutAreaDto[];
  settings: LayoutSettingsResponse | null;
  playingId: number | null;
  onSelect: (areaId: number) => void;
  itemClassName?: string;
}) {
  const defaultAreaId = resolvePlayLayoutAreaId(clip, settings, areas);
  return (
    <>
      {areas.map((area) => {
        const isDefault = defaultAreaId === area.id;
        return (
          <button
            key={area.id}
            type="button"
            role="menuitem"
            disabled={playingId === clip.id}
            onClick={() => onSelect(area.id)}
            className={itemClassName + (isDefault ? ' bg-accent/10 text-accent' : '')}
          >
            <span className="truncate">{area.name}</span>
          </button>
        );
      })}
    </>
  );
}

function VideoClipIcon({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <rect x="3" y="7" width="12" height="10" rx="1.5" />
      <path d="M15 10.5 21 7v10l-6-3.5" />
    </svg>
  );
}

/** Speaker icon paths from Wikimedia Commons (Speaker_Icon.svg). */
function AudioClipIcon({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 75 75"
      className={className}
      fill="currentColor"
      stroke="currentColor"
    >
      <path
        d="M39.389,13.769 L22.235,28.606 L6,28.606 L6,47.699 L21.989,47.699 L39.389,62.75 L39.389,13.769z"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path
        d="M48,27.6a19.5,19.5 0 0 1 0,21.4M55.1,20.5a30,30 0 0 1 0,35.6M61.6,14a38.8,38.8 0 0 1 0,48.6"
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlayInShortcutIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="currentColor"
    >
      <path d="M7.5 5.5v9l7-4.5-7-4.5Z" />
    </svg>
  );
}

function DownloadIcon() {
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
      <path d="M10 3v8" />
      <path d="M6.5 7.5 10 11l3.5-3.5" />
      <path d="M4 14.5h12" />
    </svg>
  );
}
