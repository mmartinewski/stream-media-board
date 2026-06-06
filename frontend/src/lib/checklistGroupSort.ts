import type { TodoGroupDto } from './todoOverlay';

export type GroupDragPreview = {
  groupId: number;
  sourceColumnId: number;
  targetColumnId: number;
  insertIndex: number;
  indicatorTop: number;
  shiftPx: number;
};

export function sortGroupsByOrder(groups: TodoGroupDto[]): TodoGroupDto[] {
  return [...groups].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

export function resolveGroupInsertIndexFromPointer(
  clientY: number,
  listElement: HTMLElement,
  sortedGroups: TodoGroupDto[],
  draggedGroupId: number,
): number {
  const without = sortGroupsByOrder(sortedGroups).filter((group) => group.id !== draggedGroupId);
  if (without.length === 0) return 0;

  const listRect = listElement.getBoundingClientRect();
  const pointerInList = clientY - listRect.top + listElement.scrollTop;

  for (let i = 0; i < without.length; i++) {
    const row = listElement.querySelector<HTMLElement>(
      `[data-checklist-group-id="${without[i]!.id}"]`,
    );
    if (!row) continue;
    const rowMid = row.offsetTop + row.offsetHeight / 2;
    if (pointerInList < rowMid) return i;
  }

  return without.length;
}

export function getGroupInsertIndicatorTop(
  listElement: HTMLElement,
  sortedGroups: TodoGroupDto[],
  draggedGroupId: number,
  insertIndex: number,
): number {
  const without = sortGroupsByOrder(sortedGroups).filter((group) => group.id !== draggedGroupId);
  const clamped = Math.max(0, Math.min(insertIndex, without.length));

  if (without.length === 0) return 0;
  if (clamped <= 0) return 0;

  if (clamped >= without.length) {
    const lastRow = listElement.querySelector<HTMLElement>(
      `[data-checklist-group-id="${without[without.length - 1]!.id}"]`,
    );
    if (!lastRow) return 0;
    return lastRow.offsetTop + lastRow.offsetHeight;
  }

  const afterRow = listElement.querySelector<HTMLElement>(
    `[data-checklist-group-id="${without[clamped]!.id}"]`,
  );
  if (!afterRow) return 0;

  const beforeRow = listElement.querySelector<HTMLElement>(
    `[data-checklist-group-id="${without[clamped - 1]!.id}"]`,
  );
  if (!beforeRow) return afterRow.offsetTop;

  return (beforeRow.offsetTop + beforeRow.offsetHeight + afterRow.offsetTop) / 2;
}

export function computeGroupSortOrder(groups: TodoGroupDto[], insertIndex: number): number {
  const sorted = sortGroupsByOrder(groups);
  if (sorted.length === 0) return 10;
  if (insertIndex <= 0) return sorted[0]!.sort_order - 10;
  if (insertIndex >= sorted.length) return sorted[sorted.length - 1]!.sort_order + 10;
  const before = sorted[insertIndex - 1]!;
  const after = sorted[insertIndex]!;
  const mid = Math.floor((before.sort_order + after.sort_order) / 2);
  return mid === before.sort_order ? before.sort_order + 5 : mid;
}

export function shouldShiftGroupSlot(
  preview: GroupDragPreview | null,
  columnId: number,
  groupId: number,
  sortedGroups: TodoGroupDto[],
): boolean {
  if (!preview || preview.targetColumnId !== columnId || groupId === preview.groupId) return false;
  const without = sortGroupsByOrder(sortedGroups).filter((group) => group.id !== preview.groupId);
  const idx = without.findIndex((group) => group.id === groupId);
  return idx >= preview.insertIndex;
}

export function isGroupDragNoOp(preview: GroupDragPreview, sortedGroups: TodoGroupDto[]): boolean {
  if (preview.sourceColumnId !== preview.targetColumnId) return false;
  const sorted = sortGroupsByOrder(sortedGroups);
  const fromIndex = sorted.findIndex((group) => group.id === preview.groupId);
  if (fromIndex < 0) return false;
  const without = sorted.filter((group) => group.id !== preview.groupId);
  const clamped = Math.max(0, Math.min(preview.insertIndex, without.length));
  const next = [...without];
  next.splice(clamped, 0, sorted[fromIndex]!);
  return next.every((group, index) => group.id === sorted[index]!.id);
}

export function groupPreviewChanged(
  prev: GroupDragPreview | null,
  next: GroupDragPreview,
): boolean {
  if (!prev) return true;
  return (
    prev.groupId !== next.groupId ||
    prev.sourceColumnId !== next.sourceColumnId ||
    prev.targetColumnId !== next.targetColumnId ||
    prev.insertIndex !== next.insertIndex
  );
}
