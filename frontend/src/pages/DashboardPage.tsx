import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ClipDto, type ClipsResponse } from '../lib/api';

export default function DashboardPage() {
  const [clips, setClips] = useState<ClipsResponse | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<number, string>>({});
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [playPulse, setPlayPulse] = useState<{ id: number; token: number } | null>(null);
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
  const [metadataCategory, setMetadataCategory] = useState('');
  const [metadataTags, setMetadataTags] = useState<string[]>([]);
  const [metadataTagInput, setMetadataTagInput] = useState('');
  const [metadataCategorySuggestions, setMetadataCategorySuggestions] = useState<string[]>([]);
  const [metadataTagSuggestions, setMetadataTagSuggestions] = useState<string[]>([]);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const metadataTitleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .getClips(search)
        .then((c) => {
          if (!cancelled) setClips(c);
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

  const reloadClips = async () => {
    setClips(await api.getClips(search));
  };

  const handlePlay = async (id: number) => {
    const token = Date.now();
    setPlayPulse({ id, token });
    window.setTimeout(() => {
      setPlayPulse((current) =>
        current?.id === id && current.token === token ? null : current,
      );
    }, 337);
    setCardErrors((prev) => ({ ...prev, [id]: '' }));
    setPlayingId(id);
    try {
      await api.playClip(id);
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
    setClipToEditMetadata(clip);
    setMetadataTitle(clip.title);
    setMetadataCategory(clip.category.name ?? '');
    setMetadataTags(parseTags(clip.tags ?? ''));
    setMetadataTagInput('');
    setMetadataError(null);
  };

  const saveMetadata = useCallback(async () => {
    if (!clipToEditMetadata || metadataSaving) return;
    const title = metadataTitle.trim();
    const category = metadataCategory.trim();
    if (!title || !category) {
      setMetadataError('Title and category are required.');
      return;
    }

    setMetadataError(null);
    setMetadataSaving(true);
    setCardErrors((prev) => ({ ...prev, [clipToEditMetadata.id]: '' }));
    try {
      await api.updateClipMetadata(clipToEditMetadata.id, {
        title,
        category,
        tags: metadataTags.join(', '),
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
    metadataCategory,
    metadataTags,
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
      .getCategorySuggestions(metadataCategory)
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
  }, [clipToEditMetadata, metadataCategory]);

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
    setOpenMenuKey(null);
    setClipToDelete(clip);
  };

  const handleDownload = async (clip: ClipDto) => {
    setOpenMenuKey(null);
    setCardErrors((prev) => ({ ...prev, [clip.id]: '' }));
    setDownloadingId(clip.id);
    try {
      const res = await fetch(api.getClipAudioDownloadUrl(clip.id));
      if (!res.ok) {
        throw new Error(`Download failed (${res.status} ${res.statusText})`);
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('audio')) {
        throw new Error('Download did not return an audio file.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${toDownloadFilename(clip.title)}.mp3`;
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
  const sections = isSearching
    ? [{
        type: 'search' as const,
        title: 'Search results',
        clips: uniqueClips(clips.sections.flatMap((section) => section.clips)),
      }]
    : clips.sections;

  return (
    <section className="space-y-6">
      <div className="sticky top-0 z-30 rounded-md border border-surface bg-bg/95 p-3 shadow-lg backdrop-blur">
        <label htmlFor="dashboard-search" className="block text-sm font-medium">
          Search clips
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="dashboard-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, category, or tag..."
            className="min-w-0 flex-1 rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="rounded-md border border-surface px-3 py-2 text-sm hover:border-accent"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {sections.map((section, idx) => (
        <article
          key={idx}
          className="rounded-md border border-surface bg-surface-soft p-4"
        >
          {section.type === 'category' && section.category.id != null ? (
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
                  : section.category.name}
            </h3>
          )}
          {section.clips.length === 0 ? (
            <p className="text-sm text-text-muted">
              {isSearching ? 'No clips match this search.' : 'No clips in this section.'}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {section.clips.map((clip) => {
                const menuKey = `${section.type}-${section.type === 'category' ? section.category.id ?? 'none' : section.type}-${clip.id}`;
                return (
                <li
                  key={clip.id}
                  className="overflow-hidden rounded-md border border-surface/70 bg-bg-soft text-sm"
                >
                  <div className="relative">
                    <img
                      src={clip.thumbnail_cropped_url}
                      alt=""
                      className="aspect-square w-full bg-surface object-cover"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      aria-label={clip.is_favorite === 1 ? 'Remove from favorites' : 'Mark as favorite'}
                      onClick={() => void handleToggleFavorite(clip)}
                      disabled={favoriteId === clip.id}
                      className={
                        'absolute left-2 top-2 z-10 rounded-full bg-black/45 px-2 py-1 text-xl leading-none shadow backdrop-blur ' +
                        (clip.is_favorite === 1 ? 'text-yellow-300' : 'text-white')
                      }
                    >
                      {clip.is_favorite === 1 ? '★' : '☆'}
                    </button>
                    <button
                      type="button"
                      aria-label="Open clip menu"
                      onClick={() => {
                        setOpenCategoryMenuKey(null);
                        setOpenMenuKey((current) => (current === menuKey ? null : menuKey));
                      }}
                      className="absolute right-2 top-2 z-20 rounded-full bg-black/45 px-2 py-1 text-xl leading-none text-white shadow backdrop-blur"
                    >
                      ⋮
                    </button>
                    {openMenuKey === menuKey && (
                      <>
                        <button
                          type="button"
                          aria-label="Close menu"
                          onClick={() => setOpenMenuKey(null)}
                          className="fixed inset-0 z-20 cursor-default bg-transparent"
                        />
                        <div className="absolute right-2 top-11 z-30 min-w-40 overflow-hidden rounded-md border border-surface bg-bg shadow-xl">
                        <button
                          type="button"
                          onClick={() => openMetadataEditor(clip)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft"
                        >
                          <span aria-hidden="true">📝</span>
                          Edit metadata
                        </button>
                        <Link
                          to={`/clips/${clip.id}/edit`}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-soft"
                          onClick={() => setOpenMenuKey(null)}
                        >
                          <span aria-hidden="true">✎</span>
                          Edit clip
                        </Link>
                        {clip.clip_type !== 'video' ? (
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
                        ) : null}
                        <button
                          type="button"
                          onClick={() => requestDelete(clip)}
                          disabled={deletingId === clip.id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span aria-hidden="true">🗑</span>
                          {deletingId === clip.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={`Play ${clip.title}`}
                      onClick={() => void handlePlay(clip.id)}
                      disabled={deletingId === clip.id}
                      className={
                        'absolute inset-0 flex items-center justify-center text-white transition duration-200 hover:bg-black/20 disabled:opacity-60 ' +
                        (playPulse?.id === clip.id ? 'bg-white/25' : 'bg-black/10')
                      }
                    >
                      <span
                        className={
                          'relative flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-lg backdrop-blur transition-all duration-300 ' +
                          (playPulse?.id === clip.id
                            ? 'scale-125 bg-white/90 text-bg ring-4 ring-white/60'
                            : 'scale-100 bg-black/45 text-white')
                        }
                      >
                        <span className="relative translate-x-0.5">▶</span>
                      </span>
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="truncate font-medium">
                      {clip.title}
                      {clip.clip_type === 'video' ? (
                        <span className="ml-2 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-200">
                          Video
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {clip.category.name ?? '(uncategorized)'}
                      {clip.clip_type === 'video' ? ' · Browser overlay' : ''}
                    </p>
                  </div>
                  {cardErrors[clip.id] && (
                    <div className="border-t border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
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
              Update title, category, and tags without leaving the dashboard.
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
                <label htmlFor="metadata-category" className="block text-sm font-medium">
                  Category
                </label>
                <input
                  id="metadata-category"
                  list="metadata-category-suggestions"
                  value={metadataCategory}
                  onChange={(e) => setMetadataCategory(e.target.value)}
                  disabled={metadataSaving}
                  placeholder="Category name"
                  className="mt-1 w-full rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                />
                <datalist id="metadata-category-suggestions">
                  {metadataCategorySuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
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
  );
}

function isModalSubmitShortcut(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
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
