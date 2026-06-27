import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  api,
  type ClipDto,
  type LayoutAreaDto,
  type LayoutSettingsResponse,
} from '../lib/api';
import { computeGridPopoverStyle } from '../lib/clipCardPopover';
import { parseTags, toDownloadFilename } from '../lib/clipLabels';
import { resolvePlayLayoutAreaId } from '../lib/clipPlaybackLayout';
import { clampClipVolume } from '../lib/volume';
import { useDismissOnOutsidePointerDown } from './useDismissOnOutsidePointerDown';

const CARD_ERROR_DISMISS_MS = 4000;
const VOLUME_SAVE_DEBOUNCE_MS = 400;

interface UseClipCardsOptions {
  reloadClips: () => Promise<void>;
  updateClipVolume?: (clipId: number, volume: number) => void;
}

export function useClipCards({ reloadClips, updateClipVolume }: UseClipCardsOptions) {
  const [cardErrors, setCardErrors] = useState<Record<number, string>>({});
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [playPulse, setPlayPulse] = useState<{ id: number; token: number } | null>(null);
  const cardErrorTimersRef = useRef<Map<number, number>>(new Map());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [favoriteId, setFavoriteId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [clipToDelete, setClipToDelete] = useState<ClipDto | null>(null);
  const [clipToEditMetadata, setClipToEditMetadata] = useState<ClipDto | null>(null);
  const [metadataTitle, setMetadataTitle] = useState('');
  const [metadataCategories, setMetadataCategories] = useState<string[]>([]);
  const [metadataCategoryInput, setMetadataCategoryInput] = useState('');
  const [metadataTags, setMetadataTags] = useState<string[]>([]);
  const [metadataTagInput, setMetadataTagInput] = useState('');
  const [metadataCategorySuggestions, setMetadataCategorySuggestions] = useState<string[]>([]);
  const [metadataTagSuggestions, setMetadataTagSuggestions] = useState<string[]>([]);
  const [metadataDefaultLayoutAreaId, setMetadataDefaultLayoutAreaId] = useState<number | ''>('');
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
  const gridPopoverAnchorRef = useRef<HTMLElement | null>(null);
  const gridPopoverMenuRef = useRef<HTMLDivElement | null>(null);
  const [gridPopoverStyle, setGridPopoverStyle] = useState<CSSProperties | null>(null);

  const clearCardErrorTimer = useCallback((clipId: number) => {
    const timer = cardErrorTimersRef.current.get(clipId);
    if (timer) {
      clearTimeout(timer);
      cardErrorTimersRef.current.delete(clipId);
    }
  }, []);

  const scheduleCardErrorDismiss = useCallback(
    (clipId: number) => {
      clearCardErrorTimer(clipId);
      const timer = window.setTimeout(() => {
        setCardErrors((prev) => {
          if (!prev[clipId]) return prev;
          const next = { ...prev };
          delete next[clipId];
          return next;
        });
        cardErrorTimersRef.current.delete(clipId);
      }, CARD_ERROR_DISMISS_MS);
      cardErrorTimersRef.current.set(clipId, timer);
    },
    [clearCardErrorTimer],
  );

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
  }, [openMenuKey, playAtFlyoutKey, editFlyoutKey, volumeFlyoutKey, syncGridPopoverPosition]);

  useDismissOnOutsidePointerDown(
    openMenuKey != null || playAtFlyoutKey != null,
    closeClipCardMenus,
    (target) =>
      gridPopoverMenuRef.current?.contains(target) ||
      gridPopoverAnchorRef.current?.contains(target) ||
      false,
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.getLayoutAreas(), api.getLayoutSettings()])
      .then(([areasRes, settingsRes]) => {
        if (!cancelled) {
          setLayoutAreas(areasRes.areas);
          setLayoutSettings(settingsRes);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timers = cardErrorTimersRef.current;
    const volumeTimers = clipVolumeTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const timer of volumeTimers.values()) clearTimeout(timer);
      volumeTimers.clear();
    };
  }, []);

  const handlePlay = useCallback(
    async (clip: ClipDto, explicitLayoutAreaId?: number) => {
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
            ? (explicitLayoutAreaId ??
              resolvePlayLayoutAreaId(clip, layoutSettings, layoutAreas))
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
    },
    [clearCardErrorTimer, layoutAreas, layoutSettings, scheduleCardErrorDismiss],
  );

  const handleToggleFavorite = useCallback(
    async (clip: ClipDto) => {
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
    },
    [reloadClips],
  );

  const handleClipVolumeChange = useCallback(
    (clip: ClipDto, raw: number) => {
      const volume = clampClipVolume(raw, clip.clip_type);
      updateClipVolume?.(clip.id, volume);

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
              setCardErrors((prev) => ({
                ...prev,
                [clip.id]: err instanceof Error ? err.message : String(err),
              }));
              await reloadClips();
            } finally {
              setVolumeSavingId((current) => (current === clip.id ? null : current));
            }
          })();
        }, VOLUME_SAVE_DEBOUNCE_MS),
      );
    },
    [reloadClips, updateClipVolume],
  );

  const handleDownload = useCallback(async (clip: ClipDto) => {
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
  }, [closeClipCardMenus]);

  const openMetadataEditor = useCallback(
    (clip: ClipDto) => {
      closeClipCardMenus();
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
    },
    [closeClipCardMenus],
  );

  const closeMetadataModal = useCallback(() => {
    if (metadataSaving) return;
    setClipToEditMetadata(null);
    setMetadataError(null);
    setMetadataTagInput('');
    setMetadataDefaultLayoutAreaId('');
  }, [metadataSaving]);

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
    reloadClips,
  ]);

  const requestDelete = useCallback(
    (clip: ClipDto) => {
      closeClipCardMenus();
      setClipToDelete(clip);
    },
    [closeClipCardMenus],
  );

  const confirmDelete = useCallback(async () => {
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
  }, [clipToDelete, reloadClips]);

  const addMetadataCategory = useCallback((raw: string) => {
    const name = raw.trim();
    if (!name) return;
    setMetadataCategories((current) => {
      const key = name.toLocaleLowerCase('en');
      if (current.some((item) => item.toLocaleLowerCase('en') === key)) return current;
      return [...current, name];
    });
    setMetadataCategoryInput('');
  }, []);

  const removeMetadataCategory = useCallback((name: string) => {
    setMetadataCategories((current) => current.filter((item) => item !== name));
  }, []);

  const addMetadataTag = useCallback((raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setMetadataTags((current) => {
      const key = tag.toLocaleLowerCase('en');
      if (current.some((item) => item.toLocaleLowerCase('en') === key)) return current;
      return [...current, tag];
    });
    setMetadataTagInput('');
  }, []);

  const removeMetadataTag = useCallback((tag: string) => {
    setMetadataTags((current) => current.filter((item) => item !== tag));
  }, []);

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

  useEffect(() => {
    if (!clipToEditMetadata) return;
    const focusTimer = window.setTimeout(() => {
      metadataTitleRef.current?.focus();
      metadataTitleRef.current?.select();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [clipToEditMetadata?.id]);

  return {
    cardErrors,
    playingId,
    playPulse,
    deletingId,
    favoriteId,
    downloadingId,
    openMenuKey,
    setOpenMenuKey,
    playAtFlyoutKey,
    setPlayAtFlyoutKey,
    editFlyoutKey,
    setEditFlyoutKey,
    volumeFlyoutKey,
    setVolumeFlyoutKey,
    volumeSavingId,
    layoutAreas,
    layoutSettings,
    gridPopoverStyle,
    gridPopoverMenuRef,
    closeClipCardMenus,
    pinGridPopoverAnchor,
    handlePlay,
    handleToggleFavorite,
    handleClipVolumeChange,
    handleDownload,
    openMetadataEditor,
    requestDelete,
    clipToDelete,
    setClipToDelete,
    confirmDelete,
    clipToEditMetadata,
    closeMetadataModal,
    saveMetadata,
    metadataTitle,
    setMetadataTitle,
    metadataCategories,
    metadataCategoryInput,
    setMetadataCategoryInput,
    metadataTags,
    metadataTagInput,
    setMetadataTagInput,
    metadataCategorySuggestions,
    metadataTagSuggestions,
    metadataDefaultLayoutAreaId,
    setMetadataDefaultLayoutAreaId,
    metadataSaving,
    metadataError,
    metadataTitleRef,
    addMetadataCategory,
    removeMetadataCategory,
    addMetadataTag,
    removeMetadataTag,
  };
}

export function updateClipVolumeInList(
  setClips: Dispatch<SetStateAction<ClipDto[]>>,
  clipId: number,
  volume: number,
): void {
  setClips((prev) =>
    prev.map((clip) => (clip.id === clipId ? { ...clip, volume } : clip)),
  );
}
