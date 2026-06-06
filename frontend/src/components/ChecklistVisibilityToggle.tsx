type ChecklistVisibilityToggleProps = {
  visible: boolean;
  label: string;
  onToggle: () => void;
  className?: string;
  disabled?: boolean;
};

export default function ChecklistVisibilityToggle({
  visible,
  label,
  onToggle,
  className = '',
  disabled = false,
}: ChecklistVisibilityToggleProps) {
  const actionLabel = visible ? `Hide in overlay: ${label}` : `Show in overlay: ${label}`;

  return (
    <button
      type="button"
      title={actionLabel}
      aria-label={actionLabel}
      aria-pressed={visible}
      disabled={disabled}
      onClick={onToggle}
      className={
        'checklist-visibility-btn rounded border border-transparent p-1 ' +
        (visible
          ? 'text-text hover:border-accent/50 hover:bg-accent/10 hover:text-accent'
          : 'text-text-muted hover:border-surface hover:bg-surface-soft/60') +
        ' disabled:cursor-not-allowed disabled:opacity-40 ' +
        className
      }
    >
      {visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
    </button>
  );
}

function EyeOpenIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M6.12 6.12A18.49 18.49 0 0 0 2 12s4 7 10 7c1.04 0 2.03-.16 2.95-.45" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
