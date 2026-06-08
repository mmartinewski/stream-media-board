import type { ClipDto, LayoutAreaDto, LayoutSettingsResponse } from '../../lib/api';
import { resolvePlayLayoutAreaId } from '../../lib/clipPlaybackLayout';

export function VideoClipIcon({ className = 'h-4 w-4' }: { className?: string }) {
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

export function AudioClipIcon({ className = 'h-4 w-4' }: { className?: string }) {
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

export function PlayInShortcutIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="currentColor">
      <path d="M7.5 5.5v9l7-4.5-7-4.5Z" />
    </svg>
  );
}

export function DownloadIcon() {
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

export function PlayInAreaList({
  clip,
  areas,
  settings,
  playingId,
  onSelect,
  itemClassName = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50',
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
