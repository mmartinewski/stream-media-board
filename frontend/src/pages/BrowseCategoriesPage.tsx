import { useEffect, useState } from 'react';
import CategoryBrowseCard from '../components/browse/CategoryBrowseCard';
import SwipeBackShell from '../components/SwipeBackShell';
import { api, type CategorySummary } from '../lib/api';

export default function BrowseCategoriesPage() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([api.getCategories(), api.getClips()])
      .then(([categoriesRes, clipsRes]) => {
        if (cancelled) return;
        setCategories(categoriesRes.categories.filter((category) => category.clip_count > 0));
        const favoritesSection = clipsRes.sections.find((section) => section.type === 'favorites');
        setFavoriteCount(favoritesSection?.clips.length ?? 0);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SwipeBackShell to="/" hintLabel="Media Board">
      <section>
        {error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </p>
        ) : loading ? (
          <p className="text-text-muted">Loading categories...</p>
        ) : categories.length === 0 && favoriteCount === 0 ? (
          <p className="text-text-muted">No categories with clips yet.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {favoriteCount > 0 ? (
              <CategoryBrowseCard
                to="/browse/favorites"
                name="Favorites"
                clipCount={favoriteCount}
                variant="favorites"
              />
            ) : null}
            {categories.map((category) => (
              <CategoryBrowseCard
                key={category.id}
                to={`/browse/categories/${category.id}`}
                name={category.name}
                clipCount={category.clip_count}
              />
            ))}
          </ul>
        )}
      </section>
    </SwipeBackShell>
  );
}
