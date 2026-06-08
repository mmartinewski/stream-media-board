import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import ClipCard from '../components/clips/ClipCard';
import ClipCardsModals from '../components/clips/ClipCardsModals';
import { useBrowseView } from '../contexts/BrowseViewContext';
import SwipeBackShell from '../components/SwipeBackShell';
import { updateClipVolumeInList, useClipCards } from '../hooks/useClipCards';
import { api, type ClipDto } from '../lib/api';

export default function BrowseCategoryClipsPage() {
  const { pathname } = useLocation();
  const { categoryId: categoryIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const { gridMode } = useBrowseView();

  const isFavorites = pathname === '/browse/favorites';
  const categoryId =
    !isFavorites && categoryIdParam && /^\d+$/.test(categoryIdParam)
      ? Number(categoryIdParam)
      : null;

  const [clips, setClips] = useState<ClipDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadClips = useCallback(async () => {
    if (isFavorites) {
      const res = await api.getClips(search.trim() || undefined);
      const favoritesSection = res.sections.find((section) => section.type === 'favorites');
      return favoritesSection?.clips ?? [];
    }
    if (categoryId == null) return [];
    const res = await api.getCategoryClips(categoryId, search.trim() || undefined);
    return res.clips;
  }, [categoryId, isFavorites, search]);

  const refreshClips = useCallback(async () => {
    const next = await reloadClips();
    setClips(next);
  }, [reloadClips]);

  const cards = useClipCards({
    reloadClips: refreshClips,
    updateClipVolume: (clipId, volume) => updateClipVolumeInList(setClips, clipId, volume),
  });

  useEffect(() => {
    if (!isFavorites && categoryId == null) {
      setError('Invalid category.');
      setLoading(false);
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
  }, [categoryId, isFavorites, reloadClips]);

  const menuKeyPrefix = isFavorites ? 'browse-fav' : `browse-cat-${categoryId}`;

  const swipeBackEnabled =
    !cards.clipToDelete &&
    !cards.clipToEditMetadata &&
    cards.openMenuKey == null &&
    cards.playAtFlyoutKey == null &&
    cards.editFlyoutKey == null &&
    cards.volumeFlyoutKey == null;
  if (!isFavorites && categoryId == null) {
    return <p className="text-sm text-red-200">Invalid category.</p>;
  }

  return (
    <>
      <SwipeBackShell to="/browse" enabled={swipeBackEnabled} hintLabel="Categories">
        <section>
          {error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </p>
        ) : loading ? (
          <p className="text-text-muted">Loading clips...</p>
        ) : clips.length === 0 ? (
          <p className="text-text-muted">
            {search.trim() ? 'No clips match this search.' : 'No clips in this category.'}
          </p>
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
                menuKey={`${menuKeyPrefix}-${clip.id}`}
                gridMode={gridMode}
                cards={cards}
              />
            ))}
          </ul>
        )}
        </section>
      </SwipeBackShell>
      <ClipCardsModals
        cards={cards}
        layoutAreas={cards.layoutAreas}
        metadataContextLabel="this category"
      />
    </>
  );
}
