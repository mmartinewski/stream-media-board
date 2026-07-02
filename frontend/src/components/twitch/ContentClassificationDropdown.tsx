import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { TwitchContentClassificationLabel } from '../../lib/api';

type ContentClassificationDropdownProps = {
  labels: TwitchContentClassificationLabel[];
  selected: string[];
  lockedIds?: string[];
  onToggle: (labelId: string) => void;
  maxSelected?: number;
};

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className ?? 'h-3.5 w-3.5 shrink-0'}
    >
      <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm1 0h6V5a3 3 0 0 0-6 0v2Z" />
    </svg>
  );
}

export default function ContentClassificationDropdown({
  labels,
  selected,
  lockedIds = [],
  onToggle,
  maxSelected = 6,
}: ContentClassificationDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const lockedSet = new Set(lockedIds);

  const lockedLabels = labels.filter((label) => lockedSet.has(label.id));
  const optionalSelectedLabels = labels.filter(
    (label) => selected.includes(label.id) && !lockedSet.has(label.id),
  );
  const displayCount = lockedLabels.length + optionalSelectedLabels.length;

  const triggerLabel =
    displayCount === 0
      ? 'Selecionar classificações'
      : displayCount === 1
        ? (lockedLabels[0]?.name ?? optionalSelectedLabels[0]?.name ?? '1 classificação selecionada')
        : `${displayCount} classificações selecionadas`;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className="relative text-sm">
      <span className="text-text-muted">Classificação de conteúdo</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((value) => !value)}
        className={
          'form-select mt-1 flex w-full items-center justify-between rounded-md border border-surface bg-bg px-3 py-2 pr-9 text-left ' +
          (displayCount === 0 ? 'text-text-muted' : 'text-text')
        }
      >
        <span className="truncate">{triggerLabel}</span>
      </button>

      {displayCount > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {lockedLabels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted"
              title="Classificação obrigatória para esta categoria (não pode ser removida)"
            >
              <LockIcon />
              {label.name}
            </span>
          ))}
          {optionalSelectedLabels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs"
            >
              {label.name}
              <button
                type="button"
                onClick={() => onToggle(label.id)}
                className="text-text-muted hover:text-text"
                aria-label={`Remover ${label.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-surface bg-bg shadow-xl"
        >
          <p className="border-b border-surface/60 px-3 py-2 text-xs text-text-muted">
            Até {maxSelected} classificações opcionais por preset ({optionalSelectedLabels.length}/
            {maxSelected}). Alguns jogos (ex.: Stellar Blade) impõem classificações com cadeado que
            não podem ser removidas.
          </p>
          <ul className="divide-y divide-surface/40">
            {labels.map((label) => {
              const locked = lockedSet.has(label.id);
              const checked = locked || selected.includes(label.id);
              return (
                <li key={label.id}>
                  <label
                    className={
                      'flex items-start gap-3 px-3 py-3 ' +
                      (locked ? 'cursor-default opacity-90' : 'cursor-pointer hover:bg-surface-soft')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => {
                        if (!locked) onToggle(label.id);
                      }}
                      className="mt-1 shrink-0 disabled:opacity-70"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-medium leading-snug">
                        {label.name}
                        {locked ? (
                          <LockIcon className="h-3.5 w-3.5 text-text-muted" />
                        ) : null}
                      </span>
                      {label.description ? (
                        <span className="mt-1 block text-xs leading-relaxed text-text-muted">
                          {label.description}
                        </span>
                      ) : null}
                      {locked ? (
                        <span className="mt-1 block text-xs text-text-muted">
                          Obrigatória para a categoria selecionada.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
