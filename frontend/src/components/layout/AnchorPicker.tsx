import type { AnchorHorizontal, AnchorVertical } from '../../lib/layoutSlot';

const GRID: { vertical: AnchorVertical; horizontal: AnchorHorizontal; title: string }[] = [
  { vertical: 'top', horizontal: 'left', title: 'Top left' },
  { vertical: 'top', horizontal: 'center', title: 'Top center' },
  { vertical: 'top', horizontal: 'right', title: 'Top right' },
  { vertical: 'middle', horizontal: 'left', title: 'Middle left' },
  { vertical: 'middle', horizontal: 'center', title: 'Center' },
  { vertical: 'middle', horizontal: 'right', title: 'Middle right' },
  { vertical: 'bottom', horizontal: 'left', title: 'Bottom left' },
  { vertical: 'bottom', horizontal: 'center', title: 'Bottom center' },
  { vertical: 'bottom', horizontal: 'right', title: 'Bottom right' },
];

interface AnchorPickerProps {
  vertical: AnchorVertical;
  horizontal: AnchorHorizontal;
  onChange: (vertical: AnchorVertical, horizontal: AnchorHorizontal) => void;
  disabled?: boolean;
  label?: string;
  size?: 'default' | 'lg';
  /** When true with size lg, the grid expands to the container width. */
  stretch?: boolean;
}

export default function AnchorPicker({
  vertical,
  horizontal,
  onChange,
  disabled = false,
  label = 'Anchor',
  size = 'default',
  stretch = false,
}: AnchorPickerProps) {
  const large = size === 'lg';

  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <div
        className={
          'grid w-full grid-cols-3 ' +
          (large
            ? stretch
              ? 'gap-2'
              : 'max-w-[18rem] gap-2'
            : 'max-w-[12rem] gap-1')
        }
        role="group"
        aria-label="Anchor position"
      >
        {GRID.map((cell) => {
          const selected =
            cell.vertical === vertical && cell.horizontal === horizontal;
          return (
            <button
              key={`${cell.vertical}-${cell.horizontal}`}
              type="button"
              title={cell.title}
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(cell.vertical, cell.horizontal)}
              className={
                'aspect-square rounded border transition ' +
                (large ? 'text-xs ' : 'text-[10px] ') +
                (selected
                  ? 'border-accent bg-accent/25 text-accent ring-1 ring-accent'
                  : 'border-surface bg-bg hover:border-accent/50 hover:bg-surface-soft') +
                (disabled ? ' cursor-not-allowed opacity-50' : '')
              }
            >
              <span className="sr-only">{cell.title}</span>
              <span
                className={
                  'mx-auto block rounded-full ' +
                  (large ? 'h-2.5 w-2.5 ' : 'h-1.5 w-1.5 ') +
                  (selected ? 'bg-accent' : 'bg-text-muted/60')
                }
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
