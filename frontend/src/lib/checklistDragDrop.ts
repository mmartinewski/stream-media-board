export const CHECKLIST_GROUP_DRAG = 'application/x-checklist-group-id';
export const CHECKLIST_ITEM_DRAG = 'application/x-checklist-item-id';

export function readDragId(dataTransfer: DataTransfer, mime: string): number | null {
  const raw = dataTransfer.getData(mime);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function setDragId(dataTransfer: DataTransfer, mime: string, id: number): void {
  dataTransfer.setData(mime, String(id));
  dataTransfer.effectAllowed = 'move';
}

export function allowsGroupDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(CHECKLIST_GROUP_DRAG);
}

export function allowsItemDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(CHECKLIST_ITEM_DRAG);
}
