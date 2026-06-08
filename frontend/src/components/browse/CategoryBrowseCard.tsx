import { Link } from 'react-router-dom';

interface Props {
  to: string;
  name: string;
  clipCount: number;
  variant?: 'favorites' | 'default';
}

export default function CategoryBrowseCard({
  to,
  name,
  clipCount,
  variant = 'default',
}: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <li>
      <Link
        to={to}
        className="group flex flex-col overflow-hidden rounded-md border border-surface/70 bg-bg-soft transition-colors hover:border-accent"
      >
        <div
          className={
            'flex aspect-square items-center justify-center ' +
            (variant === 'favorites'
              ? 'bg-gradient-to-b from-amber-500/20 to-bg-soft'
              : 'bg-surface-soft')
          }
        >
          {variant === 'favorites' ? (
            <span className="text-3xl text-yellow-300 sm:text-4xl" aria-hidden="true">
              ★
            </span>
          ) : (
            <span
              className="select-none text-3xl font-semibold text-text-muted/50 transition-colors group-hover:text-accent/60 sm:text-4xl"
              aria-hidden="true"
            >
              {initial}
            </span>
          )}
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
