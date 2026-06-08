import type { CSSProperties } from 'react';

const GRID_POPOVER_MARGIN = 8;
const GRID_POPOVER_GAP = 4;
const GRID_POPOVER_ESTIMATED_WIDTH = 176;
const GRID_POPOVER_ESTIMATED_HEIGHT = 280;

export function computeGridPopoverStyle(
  anchor: DOMRect,
  menu?: { width: number; height: number },
): CSSProperties {
  const margin = GRID_POPOVER_MARGIN;
  const gap = GRID_POPOVER_GAP;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const menuWidth = Math.min(
    menu?.width ?? GRID_POPOVER_ESTIMATED_WIDTH,
    viewportW - margin * 2,
  );
  const menuHeight = menu?.height ?? GRID_POPOVER_ESTIMATED_HEIGHT;
  const maxHeight = viewportH - margin * 2;

  const spaceBelow = viewportH - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  let openBelow = spaceBelow >= menuHeight || spaceBelow >= spaceAbove;

  let top = openBelow ? anchor.bottom + gap : anchor.top - gap - menuHeight;
  if (openBelow && top + menuHeight > viewportH - margin) {
    const aboveTop = anchor.top - gap - menuHeight;
    if (aboveTop >= margin) {
      openBelow = false;
      top = aboveTop;
    } else {
      top = Math.max(margin, viewportH - margin - Math.min(menuHeight, maxHeight));
    }
  }
  if (!openBelow && top < margin) {
    top = margin;
  }

  let left = anchor.right - menuWidth;
  left = Math.max(margin, Math.min(left, viewportW - margin - menuWidth));

  const style: CSSProperties = {
    position: 'fixed',
    top,
    left,
  };

  const availableBelow = viewportH - margin - top;
  if (menuHeight > availableBelow) {
    style.maxHeight = Math.max(120, availableBelow);
    style.overflowY = 'auto';
  }

  return style;
}
