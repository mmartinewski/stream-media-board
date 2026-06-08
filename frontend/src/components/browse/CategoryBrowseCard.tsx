import { Link } from 'react-router-dom';

interface Props {
  to: string;
  name: string;
  clipCount: number;
  variant?: 'favorites' | 'default';
  thumbnailUrl?: string | null;
  onEdit?: () => void;
}

export default function CategoryBrowseCard({
  to,
  name,
  clipCount,
  variant = 'default',
  thumbnailUrl,
  onEdit,
}: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <li className="group relative">
      {onEdit ? (
        <button
          type="button"
          aria-label={`Edit ${name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
          className="absolute right-1 top-1 z-10 rounded-md border border-surface/80 bg-bg/90 p-1.5 text-xs opacity-0 shadow-md transition-opacity hover:border-accent group-hover:opacity-100 focus:opacity-100"
        >
          <span aria-hidden="true">✎</span>
        </button>
      ) : null}
      <Link
        to={to}
        className="flex flex-col overflow-hidden rounded-md border border-surface/70 bg-bg-soft transition-colors hover:border-accent"
      >
        <div
          className={
            'relative flex aspect-square items-center justify-center overflow-hidden ' +
            (variant === 'favorites'
              ? 'bg-gradient-to-b from-amber-500/20 to-bg-soft'
              : thumbnailUrl
                ? 'bg-surface-soft'
                : 'bg-surface-soft')
          }
        >
          {thumbnailUrl ? (
            <>
              <img
                src={thumbnailUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
              <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
            </>
          ) : null}
          {variant === 'favorites' ? (
            <span className="relative text-3xl text-yellow-300 sm:text-4xl" aria-hidden="true">
              ★
            </span>
          ) : !thumbnailUrl ? (
            <span
              className="select-none text-3xl font-semibold text-text-muted/50 transition-colors group-hover:text-accent/60 sm:text-4xl"
              aria-hidden="true"
            >
              {initial}
            </span>
          ) : null}
        </div>
        <div className="px-2.5 py-2">
          <p className="line-clamp-2 text-sm font-medium leading-snug sm:text-base">{name}</p>
          <p className="mt-0.5 text-xs text-text-muted sm:text-sm">
            {clipCount === 1 ? '1 clip' : `${clipCount} clips`}
          </p>
        </div>
      </Link>
    </li>
  );
}
