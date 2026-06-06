const EDGE_THRESHOLD_PX = 72;
const MAX_SCROLL_SPEED = 18;

let active = false;
let rafId = 0;
let pointerY = 0;
let pointerX = 0;

function scrollSpeed(distanceFromEdge: number): number {
  const t = Math.max(0, Math.min(1, 1 - distanceFromEdge / EDGE_THRESHOLD_PX));
  return Math.max(1, Math.round(MAX_SCROLL_SPEED * t * t));
}

function scrollVerticalInRect(clientY: number, top: number, bottom: number, scrollBy: (delta: number) => void): void {
  const distFromTop = clientY - top;
  const distFromBottom = bottom - clientY;
  if (distFromTop < EDGE_THRESHOLD_PX) {
    scrollBy(-scrollSpeed(distFromTop));
  } else if (distFromBottom < EDGE_THRESHOLD_PX) {
    scrollBy(scrollSpeed(distFromBottom));
  }
}

function scrollHorizontalInRect(clientX: number, left: number, right: number, scrollBy: (delta: number) => void): void {
  const distFromLeft = clientX - left;
  const distFromRight = right - clientX;
  if (distFromLeft < EDGE_THRESHOLD_PX) {
    scrollBy(-scrollSpeed(distFromLeft));
  } else if (distFromRight < EDGE_THRESHOLD_PX) {
    scrollBy(scrollSpeed(distFromRight));
  }
}

function isVerticallyScrollable(element: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(element);
  return (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1;
}

function isHorizontallyScrollable(element: HTMLElement): boolean {
  const { overflowX } = getComputedStyle(element);
  return (overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1;
}

function scrollScrollableAncestors(clientY: number, clientX: number): void {
  let element = document.elementFromPoint(clientX, clientY);
  while (element) {
    if (!(element instanceof HTMLElement)) {
      element = element.parentElement;
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (isVerticallyScrollable(element)) {
      scrollVerticalInRect(clientY, rect.top, rect.bottom, (delta) => {
        element!.scrollTop += delta;
      });
    }
    if (isHorizontallyScrollable(element)) {
      scrollHorizontalInRect(clientX, rect.left, rect.right, (delta) => {
        element!.scrollLeft += delta;
      });
    }
    element = element.parentElement;
  }
}

function applyAutoScroll(): void {
  scrollVerticalInRect(pointerY, 0, window.innerHeight, (delta) => {
    window.scrollBy(0, delta);
  });
  scrollHorizontalInRect(pointerX, 0, window.innerWidth, (delta) => {
    window.scrollBy(delta, 0);
  });
  scrollScrollableAncestors(pointerY, pointerX);
}

function onDocumentDragOver(event: DragEvent): void {
  pointerY = event.clientY;
  pointerX = event.clientX;
}

function tick(): void {
  if (!active) return;
  applyAutoScroll();
  rafId = requestAnimationFrame(tick);
}

export function startChecklistDragAutoScroll(): void {
  if (active) return;
  active = true;
  document.addEventListener('dragover', onDocumentDragOver);
  rafId = requestAnimationFrame(tick);
}

export function stopChecklistDragAutoScroll(): void {
  if (!active) return;
  active = false;
  document.removeEventListener('dragover', onDocumentDragOver);
  cancelAnimationFrame(rafId);
}
