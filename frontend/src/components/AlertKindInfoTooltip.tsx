interface AlertKindInfoTooltipProps {
  description: string;
  tooltipId: string;
}

export default function AlertKindInfoTooltip({ description, tooltipId }: AlertKindInfoTooltipProps) {
  return (
    <span className="group/info relative inline-flex shrink-0">
      <button
        type="button"
        aria-describedby={tooltipId}
        className="flex h-5 w-5 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <InfoIcon />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 hidden w-56 -translate-x-1/2 rounded-md border border-surface bg-bg px-2.5 py-1.5 text-xs font-normal leading-snug text-text-muted shadow-lg group-hover/info:block group-focus-within/info:block"
      >
        {description}
      </span>
    </span>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 9v5.5M10 6.25v.5" />
    </svg>
  );
}
