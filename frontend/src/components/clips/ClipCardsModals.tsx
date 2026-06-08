import type { LayoutAreaDto } from '../../lib/api';
import type { useClipCards } from '../../hooks/useClipCards';

type ClipCardsApi = ReturnType<typeof useClipCards>;

interface Props {
  cards: ClipCardsApi;
  layoutAreas: LayoutAreaDto[];
  metadataContextLabel?: string;
}

function isModalSubmitShortcut(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

export default function ClipCardsModals({
  cards,
  layoutAreas,
  metadataContextLabel = 'this view',
}: Props) {
  const {
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
    clipToDelete,
    setClipToDelete,
    confirmDelete,
    deletingId,
  } = cards;

  return (
    <>
      {clipToEditMetadata ? (
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
            onKeyDown={(e) => {
              if (isModalSubmitShortcut(e.nativeEvent)) {
                e.preventDefault();
                void saveMetadata();
              }
            }}
          >
            <h2 id="edit-metadata-title" className="text-lg font-semibold">
              Edit metadata
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Update title, categories, and tags without leaving {metadataContextLabel}.
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

            {metadataError ? (
              <p className="mt-3 text-sm text-red-200">{metadataError}</p>
            ) : null}

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
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {metadataSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {clipToDelete ? (
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
              This action will remove{' '}
              <strong className="text-text">{clipToDelete.title}</strong> and its media files.
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
      ) : null}
    </>
  );
}
