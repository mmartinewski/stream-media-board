import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { ClipDto } from '../../lib/api';
import { formatClipCategories, layoutAreaName } from '../../lib/clipLabels';
import { resolvePlayLayoutAreaId } from '../../lib/clipPlaybackLayout';
import { clipVolumeMax } from '../../lib/volume';
import type { useClipCards } from '../../hooks/useClipCards';
import {
  AudioClipIcon,
  DownloadIcon,
  PlayInAreaList,
  PlayInShortcutIcon,
  VideoClipIcon,
} from './ClipCardIcons';

type ClipCardsApi = ReturnType<typeof useClipCards>;

interface Props {
  clip: ClipDto;
  menuKey: string;
  gridMode: boolean;
  cards: ClipCardsApi;
}

export default function ClipCard({ clip, menuKey, gridMode, cards }: Props) {
  const {
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
  } = cards;

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
              setPlayAtFlyoutKey((current) => (current === menuKey ? null : menuKey));
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
            setEditFlyoutKey((current) => (current === menuKey ? null : menuKey));
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
          <div className="border-t border-surface/50 bg-bg-soft py-1" role="menu" aria-label="Edit options">
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
            setVolumeFlyoutKey((current) => (current === menuKey ? null : menuKey));
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
              htmlFor={`clip-menu-volume-${menuKey}`}
              className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-text-muted"
            >
              <span>Level</span>
              <span>{volumeSavingId === clip.id ? 'Saving…' : clip.volume}</span>
            </label>
            <input
              id={`clip-menu-volume-${menuKey}`}
              type="range"
              min={0}
              max={clipVolumeMax(clip.clip_type)}
              value={Math.min(clip.volume, clipVolumeMax(clip.clip_type))}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleClipVolumeChange(clip, Number(e.target.value))}
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
      <div className="max-h-48 overflow-y-auto py-1" role="menu" aria-label="Layout areas">
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
              aria-expanded={playAtFlyoutKey === menuKey && openMenuKey !== menuKey}
              onClick={(e) => {
                e.stopPropagation();
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
            'absolute inset-0 z-[1] flex items-center justify-center bg-black/10 text-white transition duration-200 hover:bg-black/20 disabled:opacity-60 ' +
            (playPulse?.id === clip.id ? 'bg-white/25' : '')
          }
        >
          <span
            className={
              'relative flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur transition-all duration-300 ' +
              (playPulse?.id === clip.id
                ? 'scale-125 bg-white/90 text-bg ring-2 ring-white/60'
                : 'scale-100')
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
            <p className="truncate text-xs font-medium leading-tight text-white" title={clip.title}>
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
          <p className="truncate text-xs font-medium leading-tight" title={clip.title}>
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
            <p className="mt-0.5 truncate text-[9px] text-text-muted">Play → Audio clip</p>
          ) : null}
        </div>
      ) : null}
      {cardErrors[clip.id] ? (
        <div
          className={
            gridMode
              ? 'absolute inset-x-0 top-0 z-20 border-b border-red-500/30 bg-red-950/90 px-2 py-1 text-[10px] text-red-200'
              : 'absolute inset-x-0 top-0 z-20 border-b border-red-500/30 bg-red-950/90 px-1.5 py-0.5 text-[9px] text-red-200'
          }
        >
          {cardErrors[clip.id]}
        </div>
      ) : null}
    </li>
  );
}
