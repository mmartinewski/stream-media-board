import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CategoryBrowseCard from '../components/browse/CategoryBrowseCard';
import ClipCard from '../components/clips/ClipCard';
import ClipCardsModals from '../components/clips/ClipCardsModals';
import CategoryEditModal from '../components/CategoryEditModal';
import SwipeBackShell from '../components/SwipeBackShell';
import { useBrowseView } from '../contexts/BrowseViewContext';
import { updateClipVolumeInList, useClipCards } from '../hooks/useClipCards';
import { api, type CategorySummary, type ClipDto } from '../lib/api';
import {
  buildBrowseQuerySuffix,
  favoritesLabelMatchesSearch,
  fetchGlobalSearchClips,
  filterCategoriesBySearch,
  isInCategorySearch,
} from '../lib/browseSearchScope';

export default function BrowseCategoriesPage() {
  const [searchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const searchInCategoryOnly = isInCategorySearch(searchParams);
  const query = search.trim();
  const showGlobalClipSearch = query.length > 0 && !searchInCategoryOnly;
  const browseQuerySuffix = buildBrowseQuerySuffix(search, searchInCategoryOnly);
  const { gridMode } = useBrowseView();

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [clips, setClips] = useState<ClipDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryToEdit, setCategoryToEdit] = useState<CategorySummary | null>(null);

  const filteredCategories = useMemo(
    () => (query && searchInCategoryOnly ? filterCategoriesBySearch(categories, query) : categories),
    [categories, query, searchInCategoryOnly],
  );
  const showFavoritesCard =
    favoriteCount > 0 && (!query || !searchInCategoryOnly || favoritesLabelMatchesSearch(query));

  const reloadClips = useCallback(async () => {
    if (!showGlobalClipSearch) return [];
    return fetchGlobalSearchClips(query);
  }, [query, showGlobalClipSearch]);

  const refreshClips = useCallback(async () => {
    const next = await reloadClips();
    setClips(next);
  }, [reloadClips]);

  const cards = useClipCards({
    reloadClips: refreshClips,
    updateClipVolume: (clipId, volume) => updateClipVolumeInList(setClips, clipId, volume),
  });

  const loadCategories = useCallback(async () => {
    setError(null);
    try {
      const [categoriesRes, clipsRes] = await Promise.all([
        api.getCategories(),
        api.getClips(),
      ]);
      setCategories(categoriesRes.categories.filter((category) => category.clip_count > 0));
      const favoritesSection = clipsRes.sections.find((section) => section.type === 'favorites');
      setFavoriteCount(favoritesSection?.clips.length ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!showGlobalClipSearch) {
      setLoading(true);
    }
    void loadCategories().finally(() => {
      if (!cancelled && !showGlobalClipSearch) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadCategories, showGlobalClipSearch]);

  useEffect(() => {
    if (!showGlobalClipSearch) {
      setClips([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void reloadClips()
        .then((next) => {
          if (!cancelled) setClips(next);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reloadClips, showGlobalClipSearch]);

  const handleCategorySaved = (updated: CategorySummary) => {
    const cacheBust = (url: string | null | undefined) =>
      url ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` : null;
    setCategories((prev) =>
      prev.map((category) =>
        category.id === updated.id
          ? {
              ...category,
              name: updated.name,
              thumbnail_cropped_url: cacheBust(updated.thumbnail_cropped_url),
              thumbnail_original_url: cacheBust(updated.thumbnail_original_url),
              thumbnail_crop_meta: updated.thumbnail_crop_meta,
            }
          : category,
      ),
    );
  };

  const swipeBackEnabled =
    !categoryToEdit &&
    !cards.clipToDelete &&
    !cards.clipToEditMetadata &&
    cards.openMenuKey == null &&
    cards.playAtFlyoutKey == null &&
    cards.editFlyoutKey == null &&
    cards.volumeFlyoutKey == null;

  const emptyCategoryGrid =
    !showGlobalClipSearch &&
    filteredCategories.length === 0 &&
    !showFavoritesCard;

  return (
    <>
      <SwipeBackShell to="/" enabled={swipeBackEnabled} hintLabel="Media Board">
        <section>
          {error ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </p>
          ) : loading ? (
            <p className="text-text-muted">
              {showGlobalClipSearch ? 'Loading clips...' : 'Loading categories...'}
            </p>
          ) : showGlobalClipSearch ? (
            clips.length === 0 ? (
              <p className="text-text-muted">No clips match this search.</p>
            ) : (
              <ul
                className={
                  gridMode
                    ? 'grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12'
                    : 'grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12'
                }
              >
                {clips.map((clip) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    menuKey={`browse-grid-${clip.id}`}
                    gridMode={gridMode}
                    cards={cards}
                  />
                ))}
              </ul>
            )
          ) : emptyCategoryGrid ? (
            <p className="text-text-muted">
              {query
                ? 'No categories match this search.'
                : 'No categories with clips yet.'}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {showFavoritesCard ? (
                <CategoryBrowseCard
                  to={`/browse/favorites${browseQuerySuffix}`}
                  name="Favorites"
                  clipCount={favoriteCount}
                  variant="favorites"
                />
              ) : null}
              {filteredCategories.map((category) => (
                <CategoryBrowseCard
                  key={category.id}
                  to={`/browse/categories/${category.id}${browseQuerySuffix}`}
                  name={category.name}
                  clipCount={category.clip_count}
                  thumbnailUrl={category.thumbnail_cropped_url}
                  onEdit={() => setCategoryToEdit(category)}
                />
              ))}
            </ul>
          )}
        </section>
      </SwipeBackShell>
      {categoryToEdit ? (
        <CategoryEditModal
          categoryId={categoryToEdit.id}
          initialName={categoryToEdit.name}
          onClose={() => setCategoryToEdit(null)}
          onSaved={handleCategorySaved}
        />
      ) : null}
      {showGlobalClipSearch ? (
        <ClipCardsModals cards={cards} layoutAreas={cards.layoutAreas} />
      ) : null}
    </>
  );
}
