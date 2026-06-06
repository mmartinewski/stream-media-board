type ChecklistTrashButtonProps = {
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
};

export default function ChecklistTrashButton({
  label,
  onClick,
  className = '',
  disabled = false,
}: ChecklistTrashButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={
        'checklist-trash-btn rounded border border-transparent p-1 text-red-400 ' +
        'hover:border-red-400/40 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40 ' +
        'disabled:hover:border-transparent disabled:hover:bg-transparent ' +
        className
      }
    >
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
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  );
}
