import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

const SWIPE_COMMIT_PX = 56;
const SWIPE_MAX_VERTICAL_PX = 96;
const SWIPE_MAX_DRAG_RATIO = 0.42;
const SWIPE_ACTIVATE_PX = 10;

function isBlockingOverlay(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest('[role="dialog"], input, textarea, select, [role="slider"]');
}

interface Props {
  to: string;
  enabled?: boolean;
  hintLabel?: string;
  children: ReactNode;
}

export default function SwipeBackShell({
  to,
  enabled = true,
  hintLabel = 'Categories',
  children,
}: Props) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const navigateRef = useRef(navigate);
  const toRef = useRef(to);
  const enabledRef = useRef(enabled);

  navigateRef.current = navigate;
  toRef.current = to;
  enabledRef.current = enabled;

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let tracking = false;
    let horizontal = false;
    let dragOffset = 0;
    let commitTimer: number | null = null;

    const maxDrag = () => window.innerWidth * SWIPE_MAX_DRAG_RATIO;

    const clearCommitTimer = () => {
      if (commitTimer) {
        clearTimeout(commitTimer);
        commitTimer = null;
      }
    };

    const resetTracking = () => {
      start = null;
      tracking = false;
      horizontal = false;
      dragOffset = 0;
    };

    const applyDrag = (offset: number) => {
      const panel = panelRef.current;
      const peek = peekRef.current;
      if (!panel || !peek) return;

      const max = maxDrag();
      const eased = offset > max ? max + (offset - max) * 0.15 : offset;
      dragOffset = eased;

      panel.style.transition = 'none';
      panel.style.transform = `translateX(${eased}px)`;
      panel.style.boxShadow =
        eased > 0 ? '-10px 0 28px rgba(0, 0, 0, 0.22)' : 'none';

      peek.style.transition = 'none';
      peek.style.opacity = String(Math.min(1, eased / max));
    };

    const snapBack = () => {
      const panel = panelRef.current;
      const peek = peekRef.current;
      if (!panel || !peek) return;

      panel.style.transition = 'transform 180ms ease-out, box-shadow 180ms ease-out';
      panel.style.transform = 'translateX(0)';
      panel.style.boxShadow = 'none';
      peek.style.transition = 'opacity 180ms ease-out';
      peek.style.opacity = '0';

      window.setTimeout(() => {
        if (!panelRef.current || !peekRef.current) return;
        panelRef.current.style.transition = '';
        peekRef.current.style.transition = '';
      }, 200);
    };

    const finishCommit = () => {
      const panel = panelRef.current;
      const peek = peekRef.current;
      if (!panel || !peek) {
        navigateRef.current(toRef.current);
        return;
      }

      const width = window.innerWidth;
      panel.style.transition = 'transform 220ms ease-out, box-shadow 220ms ease-out';
      panel.style.transform = `translateX(${width}px)`;
      panel.style.boxShadow = 'none';
      peek.style.transition = 'opacity 220ms ease-out';
      peek.style.opacity = '1';

      clearCommitTimer();
      commitTimer = window.setTimeout(() => {
        commitTimer = null;
        navigateRef.current(toRef.current);
      }, 230);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!enabledRef.current || event.touches.length !== 1) return;
      if (isBlockingOverlay(event.target)) return;
      const touch = event.touches[0];
      if (!touch) return;

      clearCommitTimer();
      start = { x: touch.clientX, y: touch.clientY };
      tracking = true;
      horizontal = false;
      dragOffset = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || !start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!horizontal) {
        if (absDx < SWIPE_ACTIVATE_PX && absDy < SWIPE_ACTIVATE_PX) return;
        if (absDy > absDx) {
          resetTracking();
          return;
        }
        if (dx < 0) return;
        horizontal = true;
      }

      if (absDy > SWIPE_MAX_VERTICAL_PX && absDy > absDx) {
        snapBack();
        resetTracking();
        return;
      }

      if (dx <= 0) {
        applyDrag(0);
        return;
      }

      applyDrag(dx);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!tracking || !start || event.changedTouches.length !== 1) {
        resetTracking();
        return;
      }

      const end = event.changedTouches[0];
      if (!end) {
        resetTracking();
        return;
      }

      const dx = end.clientX - start.x;
      const dy = end.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const offset = dragOffset;
      const wasHorizontal = horizontal;

      resetTracking();

      if (!enabledRef.current || !wasHorizontal) return;
      if (absDy > SWIPE_MAX_VERTICAL_PX && absDy > absDx) {
        snapBack();
        return;
      }

      if (dx < SWIPE_COMMIT_PX || offset < SWIPE_COMMIT_PX * 0.75) {
        snapBack();
        return;
      }

      event.preventDefault();
      finishCommit();
    };

    const onTouchCancel = () => {
      snapBack();
      resetTracking();
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
    document.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });

    return () => {
      clearCommitTimer();
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchCancel, true);
    };
  }, []);

  return (
    <div className="relative overflow-hidden">
      <div
        ref={peekRef}
        className="pointer-events-none absolute inset-y-0 left-0 z-0 flex w-24 items-center justify-center border-r border-surface/50 bg-surface-soft"
        aria-hidden="true"
        style={{ opacity: 0 }}
      >
        <span className="flex flex-col items-center gap-1 px-2 text-center text-xs font-medium text-text-muted">
          <span className="text-lg leading-none" aria-hidden="true">
            ←
          </span>
          {hintLabel}
        </span>
      </div>
      <div ref={panelRef} className="relative z-10 bg-bg will-change-transform">
        {children}
      </div>
    </div>
  );
}
