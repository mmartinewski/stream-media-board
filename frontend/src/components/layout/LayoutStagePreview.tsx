import { useEffect, useRef, useState } from 'react';
import {
  computeVideoSlotLayout,
  type LayoutAreaDto,
  type LayoutPreviewSlotVariant,
} from '../../lib/layoutSlot';

export interface LayoutPreviewSlot {
  area: LayoutAreaDto;
  videoW: number;
  videoH: number;
  variant: LayoutPreviewSlotVariant;
  label: string;
}

interface LayoutStagePreviewProps {
  slots: LayoutPreviewSlot[];
  marginGuideArea?: LayoutAreaDto | null;
  className?: string;
}

const SLOT_STYLES: Record<
  LayoutPreviewSlotVariant,
  { border: string; background: string; zIndex: number }
> = {
  'edit-landscape': {
    border: 'border-sky-400',
    background: 'bg-sky-400/35',
    zIndex: 20,
  },
  'edit-portrait': {
    border: 'border-violet-400',
    background: 'bg-violet-400/35',
    zIndex: 21,
  },
  'map-landscape': {
    border: 'border-sky-300/80',
    background: 'bg-sky-300/25',
    zIndex: 10,
  },
  'map-portrait': {
    border: 'border-violet-300/80',
    background: 'bg-violet-300/25',
    zIndex: 11,
  },
};

function MarginGuide({ area }: { area: LayoutAreaDto }) {
  if (area.is_fullscreen === 1) return null;
  return (
    <div
      className="pointer-events-none absolute border border-dashed border-amber-400/70"
      style={{
        top: `${area.margin_top}%`,
        right: `${area.margin_right}%`,
        bottom: `${area.margin_bottom}%`,
        left: `${area.margin_left}%`,
      }}
      aria-hidden
    />
  );
}

function SlotGhost({
  stageW,
  stageH,
  slot,
}: {
  stageW: number;
  stageH: number;
  slot: LayoutPreviewSlot;
}) {
  const { slotStyle } = computeVideoSlotLayout(
    stageW,
    stageH,
    slot.area,
    slot.videoW,
    slot.videoH,
  );
  const theme = SLOT_STYLES[slot.variant];

  return (
    <div
      className={`pointer-events-none absolute box-border border-2 ${theme.border} ${theme.background}`}
      style={{ ...slotStyle, zIndex: theme.zIndex }}
    >
      <span
        className={
          'absolute left-0 top-0 max-w-full -translate-y-full truncate px-0.5 text-[10px] font-medium leading-tight text-white drop-shadow ' +
          (slot.variant.startsWith('map-') ? 'opacity-90' : '')
        }
      >
        {slot.label}
      </span>
    </div>
  );
}

export default function LayoutStagePreview({
  slots,
  marginGuideArea = null,
  className = '',
}: LayoutStagePreviewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const update = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={className}>
      <div className="relative w-full overflow-hidden rounded-lg border border-surface bg-[#0a0e14] shadow-inner aspect-video">
        <div
          ref={stageRef}
          className="absolute inset-0 bg-gradient-to-br from-[#121820] to-[#0a0e14]"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
              backgroundSize: '10% 10%',
            }}
            aria-hidden
          />
          {marginGuideArea ? <MarginGuide area={marginGuideArea} /> : null}
          {size.w > 0 && size.h > 0
            ? slots.map((slot) => (
                <SlotGhost
                  key={`${slot.variant}-${slot.label}-${slot.area.id}`}
                  stageW={size.w}
                  stageH={size.h}
                  slot={slot}
                />
              ))
            : null}
        </div>
        <p className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-white/40">
          16:9 stage preview
        </p>
      </div>
    </div>
  );
}
