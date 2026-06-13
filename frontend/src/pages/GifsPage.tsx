import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTopCenterToast } from '../components/TopCenterToast';
import {
  api,
  type GiphyContentRating,
  type GiphyIntegrationSettings,
  type MediaSearchResult,
} from '../lib/api';
import { preloadMediaSearchResult } from '../lib/mediaPreload';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 25;

function gifKey(gif: Pick<MediaSearchResult, 'provider' | 'externalId'>): string {
  return `${gif.provider}:${gif.externalId}`;
}

function fireAnalytics(url: string | undefined) {
  if (!url) return;
  void api.sendMediaSearchAnalytics(url).catch(() => {});
}

export default function GifsPage() {
  const [integration, setIntegration] = useState<GiphyIntegrationSettings | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(true);
  const [setupApiKey, setSetupApiKey] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsApiKey, setSettingsApiKey] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [searchLocalOnly, setSearchLocalOnly] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [savedGifKeys, setSavedGifKeys] = useState<Set<string>>(() => new Set());
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [tagsModalGif, setTagsModalGif] = useState<MediaSearchResult | null>(null);
  const [tagsUserTags, setTagsUserTags] = useState<string[]>([]);
  const [tagsTagInput, setTagsTagInput] = useState('');
  const [tagsProviderTags, setTagsProviderTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsSaving, setTagsSaving] = useState(false);

  const playActionRef = useRef(false);
  const { showToast, toastPortal } = useTopCenterToast();

  const showError = useCallback(
    (err: unknown) => {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    },
    [showToast],
  );

  const reloadIntegration = useCallback(async () => {
    const settings = await api.getGiphyIntegration();
    setIntegration(settings);
    return settings;
  }, []);

  useEffect(() => {
    void reloadIntegration()
      .catch(showError)
      .finally(() => setIntegrationLoading(false));
  }, [reloadIntegration, showError]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const canSearchOnline = integration?.giphy_api_key_configured && integration.enabled;
    const canSearchLocal = integration?.giphy_api_key_configured;
    if (searchLocalOnly ? !canSearchLocal : !canSearchOnline) {
      setResults([]);
      setOffset(0);
      setTotalCount(0);
      return;
    }
    if (!searchLocalOnly && !debouncedQuery) {
      setResults([]);
      setOffset(0);
      setTotalCount(0);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    void api
      .searchMedia({
        q: debouncedQuery || undefined,
        offset: 0,
        limit: PAGE_SIZE,
        local: searchLocalOnly || undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setResults(res.results);
        setOffset(res.pagination.count);
        setTotalCount(res.pagination.totalCount);
      })
      .catch((err: unknown) => {
        if (!cancelled) showError(err);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    debouncedQuery,
    integration?.enabled,
    integration?.giphy_api_key_configured,
    searchLocalOnly,
    showError,
  ]);

  useEffect(() => {
    setSavedGifKeys((prev) => {
      const next = new Set(prev);
      for (const gif of results) {
        if (gif.cached) next.add(gifKey(gif));
      }
      return next;
    });
  }, [results]);

  const markGifSaved = useCallback((gif: MediaSearchResult) => {
    setSavedGifKeys((prev) => {
      const next = new Set(prev);
      next.add(gifKey(gif));
      return next;
    });
  }, []);

  const handleDownloadGif = async (gif: MediaSearchResult) => {
    const key = gifKey(gif);
    if (downloadingKey === key || savedGifKeys.has(key)) return;
    setDownloadingKey(key);
    try {
      await api.cacheMediaSearch({
        provider: gif.provider,
        external_id: gif.externalId,
      });
      markGifSaved(gif);
      showToast('GIF saved for offline use.', 'success');
    } catch (err: unknown) {
      showError(err);
    } finally {
      setDownloadingKey(null);
    }
  };

  const addGifTag = useCallback((raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setTagsUserTags((current) => {
      const key = tag.toLocaleLowerCase('en');
      if (current.some((item) => item.toLocaleLowerCase('en') === key)) return current;
      return [...current, tag];
    });
    setTagsTagInput('');
  }, []);

  const removeGifTag = useCallback((tag: string) => {
    setTagsUserTags((current) => current.filter((item) => item !== tag));
  }, []);

  const handleOpenTagsModal = async (gif: MediaSearchResult) => {
    if (!savedGifKeys.has(gifKey(gif)) && !gif.cached) {
      showToast('Save this GIF locally before editing tags.', 'error');
      return;
    }
    setTagsModalGif(gif);
    setTagsUserTags([]);
    setTagsTagInput('');
    setTagsProviderTags([]);
    setTagsLoading(true);
    try {
      const metadata = await api.getMediaSearchCache(gif.provider, gif.externalId);
      setTagsProviderTags(metadata.provider_tags);
      setTagsUserTags(metadata.user_tags);
      if (metadata.cached) markGifSaved(gif);
    } catch (err: unknown) {
      showError(err);
      setTagsModalGif(null);
    } finally {
      setTagsLoading(false);
    }
  };

  const handleSaveTags = async () => {
    if (!tagsModalGif) return;
    setTagsSaving(true);
    try {
      await api.updateMediaSearchCacheTags(
        tagsModalGif.provider,
        tagsModalGif.externalId,
        tagsUserTags,
      );
      markGifSaved(tagsModalGif);
      showToast('Tags saved.', 'success');
      setTagsModalGif(null);
    } catch (err: unknown) {
      showError(err);
    } finally {
      setTagsSaving(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || results.length >= totalCount) return;
    if (!searchLocalOnly && !debouncedQuery) return;
    setLoadingMore(true);
    try {
      const res = await api.searchMedia({
        q: debouncedQuery || undefined,
        offset,
        limit: PAGE_SIZE,
        local: searchLocalOnly || undefined,
      });
      setResults((prev) => [...prev, ...res.results]);
      setOffset((prev) => prev + res.pagination.count);
      setTotalCount(res.pagination.totalCount);
    } catch (err: unknown) {
      showError(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSetupSave = async () => {
    const trimmed = setupApiKey.trim();
    if (!trimmed) {
      showToast('Enter your GIPHY API key.', 'error');
      return;
    }
    setSetupSaving(true);
    try {
      const saved = await api.updateGiphyIntegration({ api_key: trimmed, enabled: true });
      setIntegration(saved);
      setSetupApiKey('');
      showToast('GIPHY integration saved.', 'success');
    } catch (err: unknown) {
      showError(err);
    } finally {
      setSetupSaving(false);
    }
  };

  const handleSettingsSave = async () => {
    if (!integration) return;
    setSettingsSaving(true);
    try {
      const body: {
        api_key?: string;
        enabled?: boolean;
        static_display_seconds?: number;
        minimum_display_seconds?: number;
        rating?: GiphyContentRating;
      } = {
        enabled: integration.enabled,
        static_display_seconds: integration.static_display_seconds,
        minimum_display_seconds: integration.minimum_display_seconds,
        rating: integration.rating,
      };
      const trimmedKey = settingsApiKey.trim();
      if (trimmedKey) body.api_key = trimmedKey;
      const saved = await api.updateGiphyIntegration(body);
      setIntegration(saved);
      setSettingsApiKey('');
      showToast('Settings saved.', 'success');
    } catch (err: unknown) {
      showError(err);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleEnableIntegration = async () => {
    setSettingsSaving(true);
    try {
      const saved = await api.updateGiphyIntegration({ enabled: true });
      setIntegration(saved);
      showToast('GIPHY integration enabled.', 'success');
    } catch (err: unknown) {
      showError(err);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handlePlay = async (gif: MediaSearchResult) => {
    if (playActionRef.current) return;
    playActionRef.current = true;
    setPlayingId(`${gif.provider}:${gif.externalId}`);
    fireAnalytics(gif.analytics?.onclick);
    try {
      try {
        await preloadMediaSearchResult(gif);
      } catch {
        // Warm cache when possible; overlay still buffers before showing.
      }
      const result = await api.playMediaSearch({
        provider: gif.provider,
        external_id: gif.externalId,
      });
      fireAnalytics(gif.analytics?.onsent);
      markGifSaved(gif);
      if ((result.connected_clients ?? 0) === 0) {
        showToast(
          'No stage browser source — use ?mode=stage in OBS (Layout areas)',
          'error',
        );
      }
    } catch (err: unknown) {
      showError(err);
    } finally {
      setPlayingId(null);
      playActionRef.current = false;
    }
  };

  const hasMore = results.length > 0 && results.length < totalCount;
  const ready = integration?.giphy_api_key_configured && integration.enabled;
  const canShowSearch =
    integration?.giphy_api_key_configured && (integration.enabled || searchLocalOnly);

  return (
    <>
      {toastPortal}
      <div className="flex w-full max-w-5xl flex-col gap-4 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">GIFs</h1>
          {integration?.giphy_api_key_configured ? (
            <button
              type="button"
              onClick={() => setShowSettings((open) => !open)}
              className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent"
            >
              {showSettings ? 'Hide settings' : 'Settings'}
            </button>
          ) : null}
        </div>

        {integrationLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : !integration?.giphy_api_key_configured ? (
          <GiphySetupPanel
            apiKey={setupApiKey}
            saving={setupSaving}
            onApiKeyChange={setSetupApiKey}
            onSave={() => void handleSetupSave()}
          />
        ) : !integration.enabled && !searchLocalOnly ? (
          <div className="rounded-lg border border-surface bg-surface-soft/40 p-4 text-sm">
            <p className="text-text-muted">GIPHY integration is disabled.</p>
            <button
              type="button"
              disabled={settingsSaving}
              onClick={() => void handleEnableIntegration()}
              className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
            >
              {settingsSaving ? 'Enabling…' : 'Enable integration'}
            </button>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={searchLocalOnly}
                onChange={(e) => setSearchLocalOnly(e.target.checked)}
              />
              Search saved GIFs only
            </label>
          </div>
        ) : (
          <>
            {showSettings && integration ? (
              <GiphySettingsPanel
                integration={integration}
                apiKey={settingsApiKey}
                saving={settingsSaving}
                onIntegrationChange={setIntegration}
                onApiKeyChange={setSettingsApiKey}
                onSave={() => void handleSettingsSave()}
              />
            ) : null}

            {canShowSearch ? (
              <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={searchLocalOnly}
                onChange={(e) => setSearchLocalOnly(e.target.checked)}
              />
              Search saved GIFs only
            </label>

            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchLocalOnly ? 'Search saved GIFs' : 'Search GIFs'}
                aria-label="Search GIFs"
                className="w-full rounded-md border border-surface bg-bg-soft py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
              />
            </div>

            {!debouncedQuery && !searchLocalOnly ? (
              <p className="text-sm text-text-muted">
                Type a search term to find GIFs. Click a result to play it on the stage overlay.
              </p>
            ) : searchLoading ? (
              <p className="text-sm text-text-muted">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-text-muted">
                {searchLocalOnly
                  ? debouncedQuery
                    ? `No saved GIFs found for "${debouncedQuery}".`
                    : 'No saved GIFs yet. Play or save GIFs to see them here.'
                  : `No GIFs found for "${debouncedQuery}".`}
              </p>
            ) : (
              <>
                {searchLocalOnly && !debouncedQuery ? (
                  <p className="text-sm text-text-muted">Most played saved GIFs.</p>
                ) : null}
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {results.map((gif) => (
                    <GifGridItem
                      key={gifKey(gif)}
                      gif={gif}
                      playing={playingId === gifKey(gif)}
                      isSaved={savedGifKeys.has(gifKey(gif)) || Boolean(gif.cached)}
                      downloading={downloadingKey === gifKey(gif)}
                      onPlay={() => void handlePlay(gif)}
                      onDownload={() => void handleDownloadGif(gif)}
                      onEditTags={() => void handleOpenTagsModal(gif)}
                    />
                  ))}
                </ul>
                {hasMore ? (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => void handleLoadMore()}
                      className="rounded-md border border-surface px-4 py-2 text-sm hover:border-accent disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
              </>
            ) : null}
          </>
        )}

        {ready || integration?.giphy_api_key_configured ? (
          <footer className="mt-4 flex justify-center border-t border-surface/50 pt-4">
            <img
              src="/powered-by-giphy.svg"
              alt="Powered by GIPHY"
              width={200}
              height={26}
              className="h-6 w-auto opacity-90"
            />
          </footer>
        ) : null}
      </div>

      {tagsModalGif ? (
        <GifTagsModal
          gif={tagsModalGif}
          userTags={tagsUserTags}
          tagInput={tagsTagInput}
          providerTags={tagsProviderTags}
          loading={tagsLoading}
          saving={tagsSaving}
          onTagInputChange={setTagsTagInput}
          onAddTag={addGifTag}
          onRemoveTag={removeGifTag}
          onClose={() => setTagsModalGif(null)}
          onSave={() => void handleSaveTags()}
        />
      ) : null}
    </>
  );
}

function GiphySetupPanel({
  apiKey,
  saving,
  onApiKeyChange,
  onSave,
}: {
  apiKey: string;
  saving: boolean;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-lg border border-surface bg-surface-soft/40 p-4">
      <h2 className="text-sm font-semibold">GIPHY setup</h2>
      <p className="mt-2 text-sm text-text-muted">
        Add your GIPHY API key to search and play GIFs on the stage overlay. Get a key from the{' '}
        <a
          href="https://developers.giphy.com/dashboard/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          GIPHY Developers Dashboard
        </a>
        .
      </p>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-text-muted">API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          autoComplete="off"
          placeholder="Paste your GIPHY API key"
          className="w-full rounded-md border border-surface bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save API key'}
      </button>
    </div>
  );
}

function GiphySettingsPanel({
  integration,
  apiKey,
  saving,
  onIntegrationChange,
  onApiKeyChange,
  onSave,
}: {
  integration: GiphyIntegrationSettings;
  apiKey: string;
  saving: boolean;
  onIntegrationChange: (value: GiphyIntegrationSettings) => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-lg border border-surface bg-surface-soft/40 p-4">
      <h2 className="text-sm font-semibold">GIPHY settings</h2>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={integration.enabled}
          onChange={(e) =>
            onIntegrationChange({ ...integration, enabled: e.target.checked })
          }
        />
        Enable GIPHY integration
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-text-muted">Replace API key (optional)</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          autoComplete="off"
          placeholder={integration.giphy_api_key_configured ? 'Leave blank to keep current key' : ''}
          className="w-full rounded-md border border-surface bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-text-muted">Content rating</span>
        <select
          value={integration.rating}
          onChange={(e) =>
            onIntegrationChange({
              ...integration,
              rating: e.target.value as GiphyContentRating,
            })
          }
          className="w-full rounded-md border border-surface bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="g">G</option>
          <option value="pg">PG</option>
          <option value="pg-13">PG-13</option>
          <option value="r">R</option>
        </select>
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-text-muted">Static image display (seconds)</span>
        <input
          type="number"
          min={1}
          max={60}
          value={integration.static_display_seconds}
          onChange={(e) =>
            onIntegrationChange({
              ...integration,
              static_display_seconds: Number(e.target.value),
            })
          }
          className="w-full rounded-md border border-surface bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-text-muted">Minimum animated display (seconds)</span>
        <input
          type="number"
          min={1}
          max={60}
          value={integration.minimum_display_seconds}
          onChange={(e) =>
            onIntegrationChange({
              ...integration,
              minimum_display_seconds: Number(e.target.value),
            })
          }
          className="w-full rounded-md border border-surface bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-text-muted">
          Short looping GIFs stay visible at least this long before fade out.
        </span>
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}

function GifGridItem({
  gif,
  playing,
  isSaved,
  downloading,
  onPlay,
  onDownload,
  onEditTags,
}: {
  gif: MediaSearchResult;
  playing: boolean;
  isSaved: boolean;
  downloading: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onEditTags: () => void;
}) {
  const itemRef = useRef<HTMLLIElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onloadFiredRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuStyle(null);
  }, []);

  const openMenu = useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 176;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    setMenuStyle({ top: rect.bottom + 4, left });
    setMenuOpen(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeMenu, menuOpen]);

  useEffect(() => {
    const node = itemRef.current;
    if (!node || onloadFiredRef.current || !gif.analytics?.onload) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !onloadFiredRef.current) {
            onloadFiredRef.current = true;
            fireAnalytics(gif.analytics?.onload);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [gif.analytics?.onload]);

  return (
    <li ref={itemRef} className="relative">
      <div className="relative">
        <button
          type="button"
          disabled={playing}
          onClick={onPlay}
          title={gif.title}
          aria-label={`Play GIF: ${gif.title}`}
          className="group relative block w-full overflow-hidden rounded-md border border-surface bg-bg-soft focus:border-accent focus:outline-none disabled:opacity-60"
        >
          <span className="block aspect-square w-full">
            <img
              src={gif.previewUrl}
              alt={gif.title}
              loading="lazy"
              className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
            />
          </span>
          {isSaved ? (
            <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
              Saved
            </span>
          ) : null}
          {playing ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium uppercase tracking-wide text-white">
              Loading…
            </span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label={`Open menu for ${gif.title}`}
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpen) {
              closeMenu();
              return;
            }
            openMenu(e.currentTarget);
          }}
          className="absolute right-1.5 top-1.5 z-20 rounded-full bg-black/45 px-1.5 py-0.5 text-base leading-none text-white shadow backdrop-blur hover:bg-black/60"
        >
          ⋮
        </button>
        {menuOpen && menuStyle
          ? createPortal(
              <div
                ref={menuRef}
                style={{ top: menuStyle.top, left: menuStyle.left }}
                className="fixed z-[60] min-w-44 overflow-hidden rounded-md border border-surface bg-bg shadow-xl"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={downloading || isSaved}
                  onClick={() => {
                    closeMenu();
                    onDownload();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading ? 'Saving…' : isSaved ? 'Saved locally' : 'Save locally'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!isSaved}
                  onClick={() => {
                    closeMenu();
                    onEditTags();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Edit tags
                </button>
              </div>,
              document.body,
            )
          : null}
      </div>
    </li>
  );
}

function GifTagsModal({
  gif,
  userTags,
  tagInput,
  providerTags,
  loading,
  saving,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  onClose,
  onSave,
}: {
  gif: MediaSearchResult;
  userTags: string[];
  tagInput: string;
  providerTags: string[];
  loading: boolean;
  saving: boolean;
  onTagInputChange: (value: string) => void;
  onAddTag: (raw: string) => void;
  onRemoveTag: (tag: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const disabled = loading || saving;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-surface bg-bg p-4 shadow-xl"
        role="dialog"
        aria-labelledby="gif-tags-modal-title"
      >
        <h2 id="gif-tags-modal-title" className="text-sm font-semibold">
          Edit search tags
        </h2>
        <p className="mt-1 text-xs text-text-muted">{gif.title}</p>
        {providerTags.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs text-text-muted">GIPHY tags (read-only)</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {providerTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-surface/70 bg-bg-soft px-3 py-1 text-xs text-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-4">
          <label htmlFor="gif-tags-input" className="block text-sm font-medium">
            Your tags
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="gif-tags-input"
              type="text"
              value={tagInput}
              disabled={disabled}
              onChange={(e) => onTagInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  onAddTag(tagInput);
                }
              }}
              placeholder="Type a tag"
              className="min-w-0 flex-1 rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => onAddTag(tagInput)}
              disabled={disabled || !tagInput.trim()}
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
                    onClick={() => onRemoveTag(tag)}
                    disabled={disabled}
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
        <p className="mt-2 text-xs text-text-muted">
          Used when searching saved GIFs. GIPHY tags are kept automatically.
        </p>
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
            disabled={disabled}
            onClick={onSave}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save tags'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
