import type { TodoItemDto } from './todoOverlay';

export type ItemDragPreview = {
  itemId: number;
  sourceGroupId: number;
  targetGroupId: number;
  insertIndex: number;
  indicatorTop: number;
};

export function sortItemsByOrder(items: TodoItemDto[]): TodoItemDto[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

/** Uses layout offsets (ignores CSS transforms) so the gap animation does not flip the target index. */
export function resolveInsertIndexFromPointer(
  clientY: number,
  listElement: HTMLElement,
  sortedItems: TodoItemDto[],
  draggedItemId: number,
): number {
  const without = sortItemsByOrder(sortedItems).filter((item) => item.id !== draggedItemId);
  if (without.length === 0) return 0;

  const listRect = listElement.getBoundingClientRect();
  const pointerInList = clientY - listRect.top + listElement.scrollTop;

  for (let i = 0; i < without.length; i++) {
    const row = listElement.querySelector<HTMLElement>(
      `[data-checklist-item-id="${without[i]!.id}"]`,
    );
    if (!row) continue;
    const rowMid = row.offsetTop + row.offsetHeight / 2;
    if (pointerInList < rowMid) return i;
  }

  return without.length;
}

/** Layout Y position (px) for the drop indicator line inside the list container. */
export function getInsertIndicatorTop(
  listElement: HTMLElement,
  sortedItems: TodoItemDto[],
  draggedItemId: number,
  insertIndex: number,
): number {
  const without = sortItemsByOrder(sortedItems).filter((item) => item.id !== draggedItemId);
  const clamped = Math.max(0, Math.min(insertIndex, without.length));

  if (without.length === 0) return 0;
  if (clamped <= 0) return 0;

  if (clamped >= without.length) {
    const lastRow = listElement.querySelector<HTMLElement>(
      `[data-checklist-item-id="${without[without.length - 1]!.id}"]`,
    );
    if (!lastRow) return 0;
    return lastRow.offsetTop + lastRow.offsetHeight;
  }

  const afterRow = listElement.querySelector<HTMLElement>(
    `[data-checklist-item-id="${without[clamped]!.id}"]`,
  );
  if (!afterRow) return 0;

  const beforeRow = listElement.querySelector<HTMLElement>(
    `[data-checklist-item-id="${without[clamped - 1]!.id}"]`,
  );
  if (!beforeRow) return afterRow.offsetTop;

  return (beforeRow.offsetTop + beforeRow.offsetHeight + afterRow.offsetTop) / 2;
}

export function computeItemSortOrder(items: TodoItemDto[], insertIndex: number): number {
  const sorted = sortItemsByOrder(items);
  if (sorted.length === 0) return 10;
  if (insertIndex <= 0) return sorted[0]!.sort_order - 10;
  if (insertIndex >= sorted.length) return sorted[sorted.length - 1]!.sort_order + 10;
  const before = sorted[insertIndex - 1]!;
  const after = sorted[insertIndex]!;
  const mid = Math.floor((before.sort_order + after.sort_order) / 2);
  return mid === before.sort_order ? before.sort_order + 5 : mid;
}

export function shouldShiftItemRow(
  preview: ItemDragPreview | null,
  groupId: number,
  itemId: number,
  sortedItems: TodoItemDto[],
): boolean {
  if (!preview || preview.targetGroupId !== groupId || itemId === preview.itemId) return false;
  const without = sortItemsByOrder(sortedItems).filter((item) => item.id !== preview.itemId);
  const idx = without.findIndex((item) => item.id === itemId);
  return idx >= preview.insertIndex;
}

export function isItemDragNoOp(preview: ItemDragPreview, sortedItems: TodoItemDto[]): boolean {
  if (preview.sourceGroupId !== preview.targetGroupId) return false;
  const sorted = sortItemsByOrder(sortedItems);
  const fromIndex = sorted.findIndex((item) => item.id === preview.itemId);
  if (fromIndex < 0) return false;
  const without = sorted.filter((item) => item.id !== preview.itemId);
  const clamped = Math.max(0, Math.min(preview.insertIndex, without.length));
  const next = [...without];
  next.splice(clamped, 0, sorted[fromIndex]!);
  return next.every((item, index) => item.id === sorted[index]!.id);
}

export function previewChanged(
  prev: ItemDragPreview | null,
  next: ItemDragPreview,
): boolean {
  if (!prev) return true;
  return (
    prev.itemId !== next.itemId ||
    prev.sourceGroupId !== next.sourceGroupId ||
    prev.targetGroupId !== next.targetGroupId ||
    prev.insertIndex !== next.insertIndex
  );
}
