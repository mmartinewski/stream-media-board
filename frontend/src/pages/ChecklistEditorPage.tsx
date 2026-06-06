import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ChecklistTrashButton from '../components/ChecklistTrashButton';
import ChecklistVisibilityToggle from '../components/ChecklistVisibilityToggle';
import { useTopCenterToast } from '../components/TopCenterToast';
import TodoChecklistPanel from '../components/TodoChecklistPanel';
import TodoThumbnailDropzone from '../components/TodoThumbnailDropzone';
import { api } from '../lib/api';
import {
  readChecklistEditorAutoSave,
  serializeTodoListForm,
  writeChecklistEditorAutoSave,
} from '../lib/checklistEditorPreferences';
import {
  TODO_FONT_SIZE_DEFAULT,
  TODO_FONT_SIZE_LABELS,
  TODO_FONT_SIZES,
  todoFontSizeFromIndex,
  todoFontSizeIndex,
  normalizeTodoFontSize,
} from '../lib/todoFontSize';
import {
  TODO_FONT_SYSTEM_FALLBACK,
  todoFontOptionsForSelect,
  todoFontSelectValue,
  withTodoFontFallback,
} from '../lib/todoFontOptions';
import {
  allowsGroupDrag,
  allowsItemDrag,
  CHECKLIST_GROUP_DRAG,
  CHECKLIST_ITEM_DRAG,
  readDragId,
  setDragId,
} from '../lib/checklistDragDrop';
import {
  startChecklistDragAutoScroll,
  stopChecklistDragAutoScroll,
} from '../lib/checklistDragAutoScroll';
import {
  computeItemSortOrder,
  getInsertIndicatorTop,
  isItemDragNoOp,
  previewChanged,
  resolveInsertIndexFromPointer,
  shouldShiftItemRow,
  sortItemsByOrder,
  type ItemDragPreview,
} from '../lib/checklistItemSort';
import {
  computeGroupSortOrder,
  getGroupInsertIndicatorTop,
  groupPreviewChanged,
  isGroupDragNoOp,
  resolveGroupInsertIndexFromPointer,
  shouldShiftGroupSlot,
  sortGroupsByOrder,
  type GroupDragPreview,
} from '../lib/checklistGroupSort';
import AnchorPicker from '../components/layout/AnchorPicker';
import {
  TODO_ANIMATIONS,
  filterVisibleTodoColumns,
  isTodoOverlayVisible,
  todoAnimationDataAttrs,
  todoAnimationLabel,
  todoPanelAnchorAttrs,
  todoPanelStyle,
  type TodoAnimationId,
  type TodoBackgroundMode,
  type TodoColumnDto,
  type TodoGroupDto,
  type TodoItemDto,
  type TodoListDetailDto,
  type TodoListInput,
} from '../lib/todoOverlay';

type EditorTab = 'display' | 'groups';
type ThemeSection = 'general' | 'background' | 'typography' | 'panel';
type PreviewPhase = 'visible' | 'hidden' | 'entering' | 'exiting';

const THEME_SECTIONS: { id: ThemeSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'background', label: 'Background' },
  { id: 'typography', label: 'Typography' },
  { id: 'panel', label: 'Panel' },
];

const EDITOR_MAIN_TABS: { id: EditorTab; label: string }[] = [
  { id: 'display', label: 'Display' },
  { id: 'groups', label: 'Columns, groups & items' },
];

const AUTO_SAVE_DEBOUNCE_MS = 800;
const PREVIEW_GAMEPLAY_SRC = '/media/gameplay_preview.gif';

function sortByOrder<T extends { sort_order: number; id: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

function appendGroupToColumn(
  columns: TodoColumnDto[],
  columnId: number,
  group: TodoGroupDto,
): TodoColumnDto[] {
  return columns.map((column) =>
    column.id === columnId ? { ...column, groups: [...column.groups, group] } : column,
  );
}

function replaceGroupInColumns(
  columns: TodoColumnDto[],
  groupId: number,
  group: TodoGroupDto,
): TodoColumnDto[] {
  return columns.map((column) => ({
    ...column,
    groups: column.groups.map((entry) => (entry.id === groupId ? group : entry)),
  }));
}

function updateGroupInColumns(
  columns: TodoColumnDto[],
  groupId: number,
  updater: (group: TodoGroupDto) => TodoGroupDto,
): TodoColumnDto[] {
  return columns.map((column) => ({
    ...column,
    groups: column.groups.map((group) => (group.id === groupId ? updater(group) : group)),
  }));
}

function removeGroupFromColumns(columns: TodoColumnDto[], groupId: number): TodoColumnDto[] {
  return columns.map((column) => ({
    ...column,
    groups: column.groups.filter((group) => group.id !== groupId),
  }));
}

function findGroupInColumns(
  columns: TodoColumnDto[],
  groupId: number,
): TodoGroupDto | undefined {
  for (const column of columns) {
    const group = column.groups.find((entry) => entry.id === groupId);
    if (group) return group;
  }
  return undefined;
}

function findColumnByGroupId(
  columns: TodoColumnDto[],
  groupId: number,
): TodoColumnDto | undefined {
  return columns.find((column) => column.groups.some((group) => group.id === groupId));
}

function findGroupByItemId(
  columns: TodoColumnDto[],
  itemId: number,
): TodoGroupDto | undefined {
  for (const column of columns) {
    for (const group of column.groups) {
      if (group.items.some((item) => item.id === itemId)) return group;
    }
  }
  return undefined;
}

function DragHandle({
  label,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      aria-label={label}
      title={label}
      className="checklist-drag-handle rounded border border-surface px-1 py-0.5 text-xs text-text-muted hover:border-accent hover:text-accent"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      ⠿
    </button>
  );
}

const DEFAULT_LIST: TodoListInput = {
  name: '',
  title: '',
  font_family: TODO_FONT_SYSTEM_FALLBACK,
  font_size: TODO_FONT_SIZE_DEFAULT,
  color_title: '#ffffff',
  color_group: '#e2e8f0',
  color_item: '#f8fafc',
  enter_animation: 'fade',
  exit_animation: 'fade',
  animation_duration_ms: 400,
  panel_width_percent: 80,
  panel_max_height_percent: 90,
  panel_anchor_vertical: 'top',
  panel_anchor_horizontal: 'left',
  background_opacity_percent: 45,
  background_mode: 'image',
  background_color: '#000000',
};

export default function ChecklistEditorPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const listId = mode === 'edit' ? Number(idParam) : null;

  const [tab, setTab] = useState<EditorTab>('display');
  const [themeSection, setThemeSection] = useState<ThemeSection>('general');
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>('visible');
  const [previewEnterReady, setPreviewEnterReady] = useState(true);
  const [form, setForm] = useState<TodoListInput>(DEFAULT_LIST);
  const [columns, setColumns] = useState<TodoColumnDto[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [backgroundCacheBust, setBackgroundCacheBust] = useState(0);
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [backgroundLabel, setBackgroundLabel] = useState<string | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(readChecklistEditorAutoSave);
  const savedFormSnapshotRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const formRef = useRef(form);
  formRef.current = form;
  const [newGroupTitles, setNewGroupTitles] = useState<Record<number, string>>({});
  const [newItemTitles, setNewItemTitles] = useState<Record<number, string>>({});
  const [itemThumbCacheBust, setItemThumbCacheBust] = useState<Record<number, number>>({});
  const [groupThumbCacheBust, setGroupThumbCacheBust] = useState<Record<number, number>>({});
  const [dragOverColumnId, setDragOverColumnId] = useState<number | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null);
  const [itemDragPreview, setItemDragPreview] = useState<ItemDragPreview | null>(null);
  const [groupDragPreview, setGroupDragPreview] = useState<GroupDragPreview | null>(null);
  const itemDragPreviewRef = useRef<ItemDragPreview | null>(null);
  const groupDragPreviewRef = useRef<GroupDragPreview | null>(null);
  const itemDragSourceGroupRef = useRef<number | null>(null);
  const groupDragSourceColumnRef = useRef<number | null>(null);
  const itemDropHandledRef = useRef(false);
  const groupDropHandledRef = useRef(false);
  const { showToast, toastPortal } = useTopCenterToast();

  const setItemDragPreviewState = useCallback((preview: ItemDragPreview | null) => {
    itemDragPreviewRef.current = preview;
    setItemDragPreview(preview);
  }, []);

  const setGroupDragPreviewState = useCallback((preview: GroupDragPreview | null) => {
    groupDragPreviewRef.current = preview;
    setGroupDragPreview(preview);
  }, []);

  const clearDragOver = useCallback(() => {
    setDragOverColumnId(null);
    setDragOverGroupId(null);
    setItemDragPreviewState(null);
    setGroupDragPreviewState(null);
    itemDragSourceGroupRef.current = null;
    groupDragSourceColumnRef.current = null;
  }, [setGroupDragPreviewState, setItemDragPreviewState]);

  const previewItemDrop = useCallback(
    (
      targetGroupId: number,
      insertIndex: number,
      sortedItems: TodoItemDto[],
      listElement: HTMLElement,
      draggedItemId?: number | null,
    ) => {
      const itemId = draggedItemId ?? itemDragPreviewRef.current?.itemId;
      if (itemId == null) return;
      const sourceGroupId =
        itemDragSourceGroupRef.current ??
        itemDragPreviewRef.current?.sourceGroupId ??
        findGroupByItemId(columns, itemId)?.id;
      if (sourceGroupId == null) return;
      const indicatorTop = getInsertIndicatorTop(listElement, sortedItems, itemId, insertIndex);
      const next: ItemDragPreview = {
        itemId,
        sourceGroupId,
        targetGroupId,
        insertIndex,
        indicatorTop,
      };
      if (!previewChanged(itemDragPreviewRef.current, next)) return;
      setItemDragPreviewState(next);
      setDragOverGroupId(targetGroupId);
    },
    [columns, setItemDragPreviewState],
  );

  const previewGroupDrop = useCallback(
    (
      targetColumnId: number,
      insertIndex: number,
      sortedGroups: TodoGroupDto[],
      listElement: HTMLElement,
      draggedGroupId?: number | null,
    ) => {
      const groupId = draggedGroupId ?? groupDragPreviewRef.current?.groupId;
      if (groupId == null) return;
      const sourceColumnId =
        groupDragSourceColumnRef.current ??
        groupDragPreviewRef.current?.sourceColumnId ??
        findColumnByGroupId(columns, groupId)?.id;
      if (sourceColumnId == null) return;
      const indicatorTop = getGroupInsertIndicatorTop(
        listElement,
        sortedGroups,
        groupId,
        insertIndex,
      );
      const shiftPx = groupDragPreviewRef.current?.shiftPx ?? 160;
      const next: GroupDragPreview = {
        groupId,
        sourceColumnId,
        targetColumnId,
        insertIndex,
        indicatorTop,
        shiftPx,
      };
      if (!groupPreviewChanged(groupDragPreviewRef.current, next)) return;
      setGroupDragPreviewState(next);
    },
    [columns, setGroupDragPreviewState],
  );

  const showError = useCallback(
    (err: unknown) => {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    },
    [showToast],
  );

  const applyListDetail = useCallback((list: TodoListDetailDto) => {
    const nextForm: TodoListInput = {
      name: list.name,
      title: list.title,
      sort_order: list.sort_order,
      font_family: list.theme.font_family,
      font_size: normalizeTodoFontSize(list.theme.font_size),
      color_title: list.theme.color_title,
      color_group: list.theme.color_group,
      color_item: list.theme.color_item,
      enter_animation: list.enter_animation,
      exit_animation: list.exit_animation,
      animation_duration_ms: list.animation_duration_ms,
      panel_width_percent: list.panel_width_percent,
      panel_max_height_percent: list.panel_max_height_percent,
      panel_anchor_vertical: list.panel_anchor_vertical ?? 'top',
      panel_anchor_horizontal: list.panel_anchor_horizontal ?? 'left',
      background_opacity_percent: list.background_opacity_percent,
      background_mode: list.theme.background_mode ?? 'image',
      background_color: list.theme.background_color ?? '#000000',
    };
    setForm(nextForm);
    savedFormSnapshotRef.current = serializeTodoListForm(nextForm);
    setColumns(list.columns);
    setBackgroundUrl(list.theme.background_url);
  }, []);

  const previewList = useMemo((): TodoListDetailDto | null => {
    if (!form.title.trim()) return null;
    const bg = backgroundUrl
      ? `${backgroundUrl}${backgroundUrl.includes('?') ? '&' : '?'}t=${backgroundCacheBust}`
      : null;
    return {
      id: listId ?? 0,
      name: form.name?.trim() || form.title,
      title: form.title,
      sort_order: form.sort_order ?? 0,
      theme: {
        background_url: bg,
        background_mode: (form.background_mode ?? 'image') as TodoBackgroundMode,
        background_color: form.background_color ?? '#000000',
        font_family: withTodoFontFallback(form.font_family ?? DEFAULT_LIST.font_family),
        font_size: normalizeTodoFontSize(form.font_size ?? DEFAULT_LIST.font_size),
        color_title: form.color_title ?? DEFAULT_LIST.color_title!,
        color_group: form.color_group ?? DEFAULT_LIST.color_group!,
        color_item: form.color_item ?? DEFAULT_LIST.color_item!,
      },
      enter_animation: (form.enter_animation ?? 'fade') as TodoAnimationId,
      exit_animation: (form.exit_animation ?? 'fade') as TodoAnimationId,
      animation_duration_ms: form.animation_duration_ms ?? 400,
      panel_width_percent: form.panel_width_percent ?? 80,
      panel_max_height_percent: form.panel_max_height_percent ?? 90,
      panel_anchor_vertical: form.panel_anchor_vertical ?? 'top',
      panel_anchor_horizontal: form.panel_anchor_horizontal ?? 'left',
      background_opacity_percent: form.background_opacity_percent ?? 45,
      columns: filterVisibleTodoColumns(columns),
    };
  }, [backgroundCacheBust, backgroundUrl, columns, form, listId]);

  const reload = useCallback(async () => {
    if (listId == null || !Number.isInteger(listId)) return;
    const [listRes, indexRes] = await Promise.all([
      api.getTodoList(listId),
      api.getTodoLists(),
    ]);
    applyListDetail(listRes);
    setActiveId(indexRes.active_todo_list_id);
  }, [applyListDetail, listId]);

  useEffect(() => {
    return () => stopChecklistDragAutoScroll();
  }, []);

  useEffect(() => {
    if (mode === 'create') {
      navigate('/checklists', { replace: true });
      return;
    }
    void reload().catch(showError);
  }, [mode, navigate, reload, showError]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (previewPhase !== 'entering') {
      setPreviewEnterReady(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPreviewEnterReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, [previewPhase]);

  useEffect(() => {
    if (previewPhase !== 'exiting') return;
    const ms = (form.animation_duration_ms ?? 400) + 50;
    const t = setTimeout(() => setPreviewPhase('hidden'), ms);
    return () => clearTimeout(t);
  }, [previewPhase, form.animation_duration_ms]);

  useEffect(() => {
    if (previewPhase !== 'entering' || !previewEnterReady) return;
    const ms = (form.animation_duration_ms ?? 400) + 50;
    const t = setTimeout(() => setPreviewPhase('visible'), ms);
    return () => clearTimeout(t);
  }, [previewPhase, previewEnterReady, form.animation_duration_ms]);

  const togglePreviewVisibility = useCallback(() => {
    setPreviewPhase((current) => {
      if (current === 'visible') return 'exiting';
      if (current === 'hidden') return 'entering';
      return current;
    });
  }, []);

  const handlePreviewTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.propertyName !== 'opacity') return;
      setPreviewPhase((current) => {
        if (current === 'exiting') return 'hidden';
        if (current === 'entering') return 'visible';
        return current;
      });
    },
    [],
  );

  useEffect(() => {
    if (!autoSaveEnabled || listId == null || savedFormSnapshotRef.current == null) {
      return;
    }

    const serialized = serializeTodoListForm(form);
    if (serialized === savedFormSnapshotRef.current) {
      return;
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void (async () => {
        const currentForm = formRef.current;
        const snapshotAtSave = serializeTodoListForm(currentForm);
        if (snapshotAtSave === savedFormSnapshotRef.current) return;
        if (!currentForm.name?.trim() || !currentForm.title.trim()) return;
        if (autoSaveInFlightRef.current) return;

        autoSaveInFlightRef.current = true;
        try {
          await api.updateTodoList(listId, currentForm);
          if (serializeTodoListForm(formRef.current) === snapshotAtSave) {
            savedFormSnapshotRef.current = snapshotAtSave;
          }
        } catch (err: unknown) {
          showError(err);
        } finally {
          autoSaveInFlightRef.current = false;
        }
      })();
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [autoSaveEnabled, form, listId, showError]);

  const saveList = async (options?: {
    quiet?: boolean;
    skipBusyState?: boolean;
    skipApply?: boolean;
  }): Promise<boolean> => {
    if (listId == null) return false;
    if (!form.name?.trim()) {
      showToast('Enter a name before saving.', 'error');
      return false;
    }
    if (!form.title.trim()) {
      showToast('Enter a panel title before saving.', 'error');
      return false;
    }
    if (!options?.skipBusyState) setSaving(true);
    try {
      const updated = await api.updateTodoList(listId, form);
      if (!options?.skipApply) applyListDetail(updated);
      else savedFormSnapshotRef.current = serializeTodoListForm(form);
      if (!options?.quiet) showToast('Changes saved.', 'success');
      return true;
    } catch (err: unknown) {
      showError(err);
      return false;
    } finally {
      if (!options?.skipBusyState) setSaving(false);
    }
  };

  const handleShow = async () => {
    if (listId == null || activeId === listId) return;
    const saved = await saveList({ quiet: true, skipBusyState: true, skipApply: true });
    if (!saved) return;
    try {
      await api.showTodoList(listId);
      setActiveId(listId);
    } catch (err: unknown) {
      showError(err);
    }
  };

  const handleHide = async () => {
    await api.hideTodoList();
    setActiveId(null);
  };

  const addColumn = async () => {
    if (listId == null) return;
    const column = await api.createTodoColumn(listId);
    setColumns((prev) => [...prev, column]);
  };

  const removeColumn = async (columnId: number) => {
    if (listId == null) return;
    if (!window.confirm('Remove this column and all groups inside it?')) return;
    await api.deleteTodoColumn(listId, columnId);
    setColumns((prev) => prev.filter((column) => column.id !== columnId));
  };

  const toggleColumnVisible = async (columnId: number) => {
    if (listId == null) return;
    const column = columns.find((entry) => entry.id === columnId);
    if (!column) return;
    try {
      const updated = await api.updateTodoColumn(listId, columnId, {
        visible: !isTodoOverlayVisible(column.visible),
      });
      setColumns((prev) => prev.map((entry) => (entry.id === columnId ? updated : entry)));
    } catch (err: unknown) {
      showError(err);
    }
  };

  const toggleGroupVisible = async (groupId: number) => {
    if (listId == null) return;
    const group = findGroupInColumns(columns, groupId);
    if (!group) return;
    try {
      const updated = await api.updateTodoGroup(listId, groupId, {
        visible: !isTodoOverlayVisible(group.visible),
      });
      setColumns((prev) => replaceGroupInColumns(prev, groupId, updated));
    } catch (err: unknown) {
      showError(err);
    }
  };

  const moveColumn = async (columnId: number, direction: 'up' | 'down') => {
    if (listId == null) return;
    const sorted = sortByOrder(columns);
    const index = sorted.findIndex((column) => column.id === columnId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return;
    const current = sorted[index]!;
    const neighbor = sorted[targetIndex]!;
    await Promise.all([
      api.updateTodoColumn(listId, current.id, { sort_order: neighbor.sort_order }),
      api.updateTodoColumn(listId, neighbor.id, { sort_order: current.sort_order }),
    ]);
    await reload();
  };

  const addGroup = async (columnId: number) => {
    if (listId == null) return;
    const title = (newGroupTitles[columnId] ?? '').trim();
    if (!title) return;
    const group = await api.createTodoGroup(listId, { title, column_id: columnId });
    setColumns((prev) => appendGroupToColumn(prev, columnId, group));
    setNewGroupTitles((prev) => ({ ...prev, [columnId]: '' }));
  };

  const removeGroup = async (groupId: number) => {
    if (listId == null) return;
    await api.deleteTodoGroup(listId, groupId);
    setColumns((prev) => removeGroupFromColumns(prev, groupId));
  };

  const setGroupTitleLocal = (groupId: number, title: string) => {
    setColumns((prev) =>
      updateGroupInColumns(prev, groupId, (group) => ({ ...group, title })),
    );
  };

  const saveGroupTitle = async (groupId: number, draftTitle: string) => {
    if (listId == null) return;
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      showToast('Enter a title for the group.', 'error');
      await reload();
      return;
    }
    try {
      const updated = await api.updateTodoGroup(listId, groupId, { title: trimmed });
      setColumns((prev) => replaceGroupInColumns(prev, groupId, updated));
    } catch (err: unknown) {
      showError(err);
      await reload();
    }
  };

  const addItem = async (groupId: number) => {
    if (listId == null) return;
    const title = (newItemTitles[groupId] ?? '').trim();
    if (!title) return;
    const item = await api.createTodoItem(listId, groupId, { title });
    setColumns((prev) =>
      updateGroupInColumns(prev, groupId, (group) => ({
        ...group,
        items: [...group.items, item],
      })),
    );
    setNewItemTitles((prev) => ({ ...prev, [groupId]: '' }));
  };

  const toggleItem = async (groupId: number, itemId: number, completed: boolean) => {
    if (listId == null) return;
    const item = await api.updateTodoItem(listId, itemId, { completed: !completed });
    setColumns((prev) =>
      updateGroupInColumns(prev, groupId, (group) => ({
        ...group,
        items: group.items.map((entry) => (entry.id === itemId ? item : entry)),
      })),
    );
  };

  const setItemTitleLocal = (groupId: number, itemId: number, title: string) => {
    setColumns((prev) =>
      updateGroupInColumns(prev, groupId, (group) => ({
        ...group,
        items: group.items.map((entry) => (entry.id === itemId ? { ...entry, title } : entry)),
      })),
    );
  };

  const saveItemTitle = async (groupId: number, itemId: number, draftTitle: string) => {
    if (listId == null) return;
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      showToast('Enter a title for the item.', 'error');
      await reload();
      return;
    }
    try {
      const updated = await api.updateTodoItem(listId, itemId, { title: trimmed });
      setColumns((prev) =>
        updateGroupInColumns(prev, groupId, (group) => ({
          ...group,
          items: group.items.map((entry) => (entry.id === itemId ? updated : entry)),
        })),
      );
    } catch (err: unknown) {
      showError(err);
      await reload();
    }
  };

  const removeItem = async (groupId: number, itemId: number) => {
    if (listId == null) return;
    await api.deleteTodoItem(listId, itemId);
    setColumns((prev) =>
      updateGroupInColumns(prev, groupId, (group) => ({
        ...group,
        items: group.items.filter((entry) => entry.id !== itemId),
      })),
    );
  };

  const uploadBackground = async (file: File) => {
    if (listId == null) return;
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      showToast('Background image must be at most 2 MB.', 'error');
      return;
    }
    setBackgroundUploading(true);
    setBackgroundLabel(file.name);
    try {
      const list = await api.uploadTodoBackground(listId, file);
      applyListDetail(list);
      setBackgroundCacheBust(Date.now());
      showToast('Background updated.', 'success');
    } catch (err: unknown) {
      setBackgroundLabel(null);
      showError(err);
    } finally {
      setBackgroundUploading(false);
    }
  };

  const clearBackground = async () => {
    if (listId == null) return;
    try {
      const list = await api.deleteTodoBackground(listId);
      applyListDetail(list);
      setBackgroundLabel(null);
      setBackgroundCacheBust(Date.now());
      showToast('Background removed.', 'success');
    } catch (err: unknown) {
      showError(err);
    }
  };

  const uploadGroupThumb = async (groupId: number, file: File) => {
    if (listId == null) return;
    const group = await api.uploadTodoGroupThumbnail(listId, groupId, file);
    setGroupThumbCacheBust((prev) => ({ ...prev, [groupId]: Date.now() }));
    setColumns((prev) => replaceGroupInColumns(prev, groupId, group));
  };

  const removeGroupThumb = async (groupId: number) => {
    if (listId == null) return;
    const group = await api.deleteTodoGroupThumbnail(listId, groupId);
    setGroupThumbCacheBust((prev) => {
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
    setColumns((prev) => replaceGroupInColumns(prev, groupId, group));
  };

  const uploadItemThumb = async (groupId: number, itemId: number, file: File) => {
    if (listId == null) return;
    const item = await api.uploadTodoItemThumbnail(listId, itemId, file);
    setItemThumbCacheBust((prev) => ({ ...prev, [itemId]: Date.now() }));
    setColumns((prev) =>
      updateGroupInColumns(prev, groupId, (group) => ({
        ...group,
        items: group.items.map((entry) => (entry.id === itemId ? item : entry)),
      })),
    );
  };

  const removeItemThumb = async (groupId: number, itemId: number) => {
    if (listId == null) return;
    const item = await api.deleteTodoItemThumbnail(listId, itemId);
    setItemThumbCacheBust((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setColumns((prev) =>
      updateGroupInColumns(prev, groupId, (group) => ({
        ...group,
        items: group.items.map((entry) => (entry.id === itemId ? item : entry)),
      })),
    );
  };

  const moveGroupToPosition = async (
    groupId: number,
    sourceColumnId: number,
    targetColumnId: number,
    insertIndex: number,
  ) => {
    if (listId == null) return;
    const targetColumn = columns.find((column) => column.id === targetColumnId);
    if (!targetColumn) return;
    const targetGroups = sortGroupsByOrder(targetColumn.groups).filter(
      (group) => group.id !== groupId,
    );
    const clampedIndex = Math.max(0, Math.min(insertIndex, targetGroups.length));
    const preview: GroupDragPreview = {
      groupId,
      sourceColumnId,
      targetColumnId,
      insertIndex: clampedIndex,
      indicatorTop: 0,
      shiftPx: 0,
    };
    if (isGroupDragNoOp(preview, targetColumn.groups)) return;

    const sortOrder = computeGroupSortOrder(targetGroups, clampedIndex);
    try {
      const body: { sort_order: number; column_id?: number } = { sort_order: sortOrder };
      if (sourceColumnId !== targetColumnId) body.column_id = targetColumnId;
      const updated = await api.updateTodoGroup(listId, groupId, body);
      setColumns((prev) => {
        const withoutGroup = prev.map((column) =>
          column.id === sourceColumnId
            ? { ...column, groups: column.groups.filter((group) => group.id !== groupId) }
            : column,
        );
        return withoutGroup.map((column) => {
          if (column.id !== targetColumnId) return column;
          const sorted = sortGroupsByOrder(column.groups);
          const next = [...sorted];
          next.splice(clampedIndex, 0, updated);
          return { ...column, groups: next };
        });
      });
    } catch (err: unknown) {
      showError(err);
      await reload();
    }
  };

  const handleGroupDrop = (
    event: React.DragEvent<HTMLElement>,
    columnId: number,
    sortedGroups: TodoGroupDto[],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    groupDropHandledRef.current = true;
    const groupId = readDragId(event.dataTransfer, CHECKLIST_GROUP_DRAG);
    if (groupId == null) {
      clearDragOver();
      return;
    }
    const sourceColumnId =
      groupDragSourceColumnRef.current ??
      groupDragPreviewRef.current?.sourceColumnId ??
      findColumnByGroupId(columns, groupId)?.id;
    if (sourceColumnId == null) {
      clearDragOver();
      return;
    }
    const listElement = event.currentTarget.classList.contains('checklist-groups-list')
      ? event.currentTarget
      : event.currentTarget.querySelector('.checklist-groups-list');
    const insertIndex =
      listElement instanceof HTMLElement
        ? resolveGroupInsertIndexFromPointer(
            event.clientY,
            listElement,
            sortedGroups,
            groupId,
          )
        : (groupDragPreviewRef.current?.insertIndex ?? sortedGroups.length);
    clearDragOver();
    void moveGroupToPosition(groupId, sourceColumnId, columnId, insertIndex).catch((err) =>
      showError(String(err)),
    );
  };

  const finishGroupDrag = () => {
    stopChecklistDragAutoScroll();
    if (!groupDropHandledRef.current) clearDragOver();
    groupDropHandledRef.current = false;
  };

  const moveItemToPosition = async (
    itemId: number,
    sourceGroupId: number,
    targetGroupId: number,
    insertIndex: number,
  ) => {
    if (listId == null) return;
    const targetGroup = findGroupInColumns(columns, targetGroupId);
    if (!targetGroup) return;
    const targetItems = sortItemsByOrder(targetGroup.items).filter((item) => item.id !== itemId);
    const clampedIndex = Math.max(0, Math.min(insertIndex, targetItems.length));
    const preview: ItemDragPreview = {
      itemId,
      sourceGroupId,
      targetGroupId,
      insertIndex: clampedIndex,
      indicatorTop: 0,
    };
    if (isItemDragNoOp(preview, targetGroup.items)) return;

    const sortOrder = computeItemSortOrder(targetItems, clampedIndex);
    try {
      const body: { sort_order: number; group_id?: number } = { sort_order: sortOrder };
      if (sourceGroupId !== targetGroupId) body.group_id = targetGroupId;
      const updated = await api.updateTodoItem(listId, itemId, body);
      setColumns((prev) => {
        const withoutItem = prev.map((column) => ({
          ...column,
          groups: column.groups.map((group) =>
            group.id === sourceGroupId
              ? { ...group, items: group.items.filter((item) => item.id !== itemId) }
              : group,
          ),
        }));
        return withoutItem.map((column) => ({
          ...column,
          groups: column.groups.map((group) => {
            if (group.id !== targetGroupId) return group;
            const sorted = sortItemsByOrder(group.items);
            const next = [...sorted];
            next.splice(clampedIndex, 0, updated);
            return { ...group, items: next };
          }),
        }));
      });
    } catch (err: unknown) {
      showError(err);
      await reload();
    }
  };

  const handleItemDrop = (
    event: React.DragEvent<HTMLElement>,
    groupId: number,
    sortedItems: TodoItemDto[],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    itemDropHandledRef.current = true;
    const itemId = readDragId(event.dataTransfer, CHECKLIST_ITEM_DRAG);
    if (itemId == null) {
      clearDragOver();
      return;
    }
    const sourceGroupId =
      itemDragSourceGroupRef.current ??
      itemDragPreviewRef.current?.sourceGroupId ??
      findGroupByItemId(columns, itemId)?.id;
    if (sourceGroupId == null) {
      clearDragOver();
      return;
    }
    const listElement = event.currentTarget.classList.contains('checklist-items-list')
      ? event.currentTarget
      : event.currentTarget.querySelector('.checklist-items-list');
    const insertIndex =
      listElement instanceof HTMLElement
        ? resolveInsertIndexFromPointer(event.clientY, listElement, sortedItems, itemId)
        : (itemDragPreviewRef.current?.insertIndex ?? sortedItems.length);
    clearDragOver();
    void moveItemToPosition(itemId, sourceGroupId, groupId, insertIndex).catch((err) =>
      showError(String(err)),
    );
  };

  const finishItemDrag = () => {
    stopChecklistDragAutoScroll();
    if (!itemDropHandledRef.current) clearDragOver();
    itemDropHandledRef.current = false;
  };

  if (mode === 'create' || listId == null) {
    return null;
  }

  const onAir = activeId === listId;

  const handleAutoSaveToggle = (enabled: boolean) => {
    setAutoSaveEnabled(enabled);
    writeChecklistEditorAutoSave(enabled);
    if (!enabled && autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  };

  return (
    <>
      {toastPortal}
      <div className="w-full max-w-6xl pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/checklists" className="text-sm text-text-muted hover:text-accent">
            ← Checklists
          </Link>
          <h1 className="text-xl font-semibold">{form.name?.trim() || 'Checklist'}</h1>
          {onAir ? (
            <span className="text-xs font-medium uppercase tracking-wide text-accent">on air</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => handleAutoSaveToggle(e.target.checked)}
            />
            Auto-save
          </label>
          <button
            type="button"
            disabled={onAir}
            onClick={() => void handleShow()}
            className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Show on overlay
          </button>
          <button
            type="button"
            disabled={!onAir}
            onClick={() => void handleHide()}
            className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            Hide
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveList()}
            className="min-w-[5.5rem] rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <nav aria-label="Editor sections" className="mb-4 border-b border-surface">
        <div className="flex flex-wrap gap-1" role="tablist">
          {EDITOR_MAIN_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={
                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ' +
                (tab === id
                  ? 'border-accent text-text'
                  : 'border-transparent text-text-muted hover:border-surface hover:text-text')
              }
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'display' ? (
        <section
          aria-label="Display settings"
          className="overflow-hidden rounded-lg border border-surface bg-surface-soft/20"
        >
          <div className="border-b border-surface bg-surface-soft/50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Display settings
            </p>
            <div
              className="mt-2 flex flex-wrap gap-1 rounded-md border border-surface bg-bg/40 p-1"
              role="tablist"
              aria-label="Display sections"
            >
              {THEME_SECTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={themeSection === id}
                  onClick={() => setThemeSection(id)}
                  className={
                    'rounded px-3 py-1.5 text-sm transition-colors ' +
                    (themeSection === id
                      ? 'bg-accent text-bg shadow-sm'
                      : 'text-text-muted hover:bg-surface-soft/80 hover:text-text')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 md:p-5">
            {themeSection === 'general' ? (
              <div className="grid max-w-xl gap-4">
                <label className="block text-sm">
                  <span className="mb-1 block text-text-muted">Name</span>
                  <input
                    className="w-full rounded-md border border-surface bg-bg px-3 py-2"
                    value={form.name ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    Shown in the checklist list. Not displayed on the overlay.
                  </p>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-text-muted">Panel title</span>
                  <input
                    className="w-full rounded-md border border-surface bg-bg px-3 py-2"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    Shown at the top of the overlay panel.
                  </p>
                </label>
              </div>
            ) : null}

            {themeSection === 'background' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <fieldset className="block text-sm md:col-span-2">
                  <legend className="mb-2 font-medium text-text">Background</legend>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['image', 'Image'],
                        ['color', 'Solid color'],
                      ] as const
                    ).map(([mode, label]) => (
                      <label
                        key={mode}
                        className={
                          'cursor-pointer rounded-md border px-3 py-1.5 text-sm ' +
                          ((form.background_mode ?? 'image') === mode
                            ? 'border-accent bg-accent/15 text-accent'
                            : 'border-surface hover:border-accent/60')
                        }
                      >
                        <input
                          type="radio"
                          name="background_mode"
                          value={mode}
                          checked={(form.background_mode ?? 'image') === mode}
                          onChange={() =>
                            setForm((f) => ({ ...f, background_mode: mode as TodoBackgroundMode }))
                          }
                          className="sr-only"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {(form.background_mode ?? 'image') === 'color' ? (
                  <label className="block text-sm">
                    <span className="mb-1 block text-text-muted">Background color</span>
                    <input
                      type="color"
                      className="h-10 w-full max-w-xs rounded-md border border-surface bg-bg"
                      value={
                        (form.background_color ?? '#000000').startsWith('#')
                          ? form.background_color ?? '#000000'
                          : '#000000'
                      }
                      onChange={(e) =>
                        setForm((f) => ({ ...f, background_color: e.target.value }))
                      }
                    />
                  </label>
                ) : (
                  <div className="block text-sm md:col-span-2">
                    <span className="mb-1 block font-medium text-text">Background image</span>
                    <p className="mb-3 text-xs text-text-muted">
                      Max 2 MB · uploads when you choose a file (Save is not required).
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={backgroundInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          void uploadBackground(file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={backgroundUploading}
                        onClick={() => backgroundInputRef.current?.click()}
                        className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
                      >
                        {backgroundUploading ? 'Uploading…' : 'Choose image'}
                      </button>
                      {backgroundUrl ? (
                        <button
                          type="button"
                          disabled={backgroundUploading}
                          onClick={() => void clearBackground()}
                          className="text-sm text-red-300 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      {backgroundUploading
                        ? `Uploading ${backgroundLabel}…`
                        : backgroundUrl
                          ? `Background set${backgroundLabel ? `: ${backgroundLabel}` : ''}`
                          : 'No background image.'}
                    </p>
                  </div>
                )}

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-text-muted">
                    Background transparency ({100 - (form.background_opacity_percent ?? 45)}%
                    transparent)
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={100 - (form.background_opacity_percent ?? 45)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        background_opacity_percent: 100 - Number(e.target.value),
                      }))
                    }
                    className="w-full max-w-xl"
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    0% = fully visible background · 100% = invisible background
                  </p>
                </label>
              </div>
            ) : null}

            {themeSection === 'typography' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-text-muted">Font family</span>
                  <select
                    className="w-full max-w-xl rounded-md border border-surface bg-bg px-3 py-2"
                    style={{ fontFamily: withTodoFontFallback(form.font_family) }}
                    value={todoFontSelectValue(form.font_family)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, font_family: e.target.value }))
                    }
                  >
                    {todoFontOptionsForSelect(form.font_family).map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option
                            key={option.id}
                            value={option.value}
                            style={{ fontFamily: option.value }}
                          >
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-muted">
                    Bundled fonts ship with the app (works offline in OBS). System fonts depend on
                    your OS. All options include a system fallback.
                  </p>
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-text-muted">
                    Font size ({TODO_FONT_SIZE_LABELS[normalizeTodoFontSize(form.font_size)]})
                  </span>
                  <input
                    type="range"
                    className="w-full max-w-xl"
                    min={0}
                    max={TODO_FONT_SIZES.length - 1}
                    step={1}
                    value={todoFontSizeIndex(form.font_size)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        font_size: todoFontSizeFromIndex(Number(e.target.value)),
                      }))
                    }
                  />
                  <div className="mt-1 flex w-full max-w-xl justify-between text-xs text-text-muted">
                    {TODO_FONT_SIZES.map((size) => (
                      <span key={size}>{TODO_FONT_SIZE_LABELS[size]}</span>
                    ))}
                  </div>
                </label>
                {(
                  [
                    ['color_title', 'Title color'],
                    ['color_group', 'Group color'],
                    ['color_item', 'Item color'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="mb-1 block text-text-muted">{label}</span>
                    <input
                      type="color"
                      className="h-10 w-full max-w-xs rounded-md border border-surface bg-bg"
                      value={
                        (form[key] ?? DEFAULT_LIST[key]!).startsWith('#')
                          ? (form[key] ?? DEFAULT_LIST[key]!)
                          : '#ffffff'
                      }
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            ) : null}

            {themeSection === 'panel' ? (
              <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3 md:gap-8">
                <AnchorPicker
                  size="lg"
                  stretch
                  label="Anchoring"
                  vertical={form.panel_anchor_vertical ?? 'top'}
                  horizontal={form.panel_anchor_horizontal ?? 'left'}
                  onChange={(panel_anchor_vertical, panel_anchor_horizontal) =>
                    setForm((f) => ({ ...f, panel_anchor_vertical, panel_anchor_horizontal }))
                  }
                />
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                    Dimensions
                  </p>
                  <div className="flex flex-col gap-4">
                    <label className="block text-sm">
                      <span className="mb-1 block text-text-muted">
                        Panel width ({form.panel_width_percent ?? 80}%)
                      </span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        value={form.panel_width_percent ?? 80}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, panel_width_percent: Number(e.target.value) }))
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-text-muted">
                        Max height ({form.panel_max_height_percent ?? 90}%)
                      </span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        value={form.panel_max_height_percent ?? 90}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            panel_max_height_percent: Number(e.target.value),
                          }))
                        }
                        className="w-full"
                      />
                    </label>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                    Animations
                  </p>
                  <div className="flex flex-col gap-4">
                    <label className="block text-sm">
                      <span className="mb-1 block text-text-muted">Enter animation</span>
                      <select
                        className="w-full rounded-md border border-surface bg-bg px-3 py-2"
                        value={form.enter_animation ?? 'fade'}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            enter_animation: e.target.value as TodoAnimationId,
                          }))
                        }
                      >
                        {TODO_ANIMATIONS.map((anim) => (
                          <option key={anim} value={anim}>
                            {todoAnimationLabel(anim)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-text-muted">Exit animation</span>
                      <select
                        className="w-full rounded-md border border-surface bg-bg px-3 py-2"
                        value={form.exit_animation ?? 'fade'}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            exit_animation: e.target.value as TodoAnimationId,
                          }))
                        }
                      >
                        {TODO_ANIMATIONS.map((anim) => (
                          <option key={anim} value={anim}>
                            {todoAnimationLabel(anim)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-text-muted">
                        Duration ({form.animation_duration_ms ?? 400} ms)
                      </span>
                      <input
                        type="range"
                        min={100}
                        max={2000}
                        step={50}
                        value={form.animation_duration_ms ?? 400}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, animation_duration_ms: Number(e.target.value) }))
                        }
                        className="w-full"
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === 'groups' ? (
        <section
          aria-label="Columns, groups and items"
          className="overflow-hidden rounded-lg border border-surface bg-surface-soft/20"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface bg-surface-soft/50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Columns, groups &amp; items
            </p>
            <button
              type="button"
              onClick={() => void addColumn().catch((err) => showError(String(err)))}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-bg"
            >
              Add column
            </button>
          </div>
          <div className="space-y-4 p-4 md:p-5">
          <p className="text-sm text-text-muted">
            Use ⠿ next to Group to reorder groups or move them between columns. Use ⠿ on items to
            reorder or move between groups.
          </p>
          <div
            className={
              'flex flex-wrap justify-center gap-4' +
              (itemDragPreview ? ' checklist-item-drag-active' : '') +
              (groupDragPreview ? ' checklist-group-drag-active' : '')
            }
          >
            {columns.map((column, columnIndex) => {
              const sortedColumnGroups = sortGroupsByOrder(column.groups);
              const isColumnDropTarget = groupDragPreview?.targetColumnId === column.id;

              const handleGroupListDragOver = (event: React.DragEvent<HTMLUListElement>) => {
                if (!allowsGroupDrag(event.dataTransfer)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const draggedId = groupDragPreviewRef.current?.groupId;
                if (draggedId == null) return;
                const insertIndex = resolveGroupInsertIndexFromPointer(
                  event.clientY,
                  event.currentTarget,
                  sortedColumnGroups,
                  draggedId,
                );
                previewGroupDrop(
                  column.id,
                  insertIndex,
                  sortedColumnGroups,
                  event.currentTarget,
                  draggedId,
                );
              };

              const handleColumnGroupsPanelDragOver = (event: React.DragEvent<HTMLDivElement>) => {
                if (!allowsGroupDrag(event.dataTransfer)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const draggedId = groupDragPreviewRef.current?.groupId;
                if (draggedId == null) return;
                const listElement = event.currentTarget.querySelector('.checklist-groups-list');
                if (!(listElement instanceof HTMLElement)) return;
                const insertIndex = resolveGroupInsertIndexFromPointer(
                  event.clientY,
                  listElement,
                  sortedColumnGroups,
                  draggedId,
                );
                previewGroupDrop(
                  column.id,
                  insertIndex,
                  sortedColumnGroups,
                  listElement,
                  draggedId,
                );
              };

              return (
              <div
                key={column.id}
                className={
                  'min-w-[18rem] max-w-md flex-1 rounded-lg border border-surface p-3 ' +
                  (!isTodoOverlayVisible(column.visible) ? 'checklist-overlay-hidden' : '')
                }
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-surface pb-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    Column {columnIndex + 1}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <ChecklistVisibilityToggle
                      visible={isTodoOverlayVisible(column.visible)}
                      label={`Column ${columnIndex + 1}`}
                      onToggle={() => void toggleColumnVisible(column.id)}
                    />
                    <button
                      type="button"
                      title="Move column left"
                      disabled={columnIndex === 0}
                      onClick={() =>
                        void moveColumn(column.id, 'up').catch((err) => showError(String(err)))
                      }
                      className="rounded border border-surface px-2 py-0.5 text-xs hover:border-accent disabled:opacity-40"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      title="Move column right"
                      disabled={columnIndex === columns.length - 1}
                      onClick={() =>
                        void moveColumn(column.id, 'down').catch((err) => showError(String(err)))
                      }
                      className="rounded border border-surface px-2 py-0.5 text-xs hover:border-accent disabled:opacity-40"
                    >
                      →
                    </button>
                    <ChecklistTrashButton
                      label="Remove column"
                      disabled={columns.length <= 1}
                      onClick={() =>
                        void removeColumn(column.id).catch((err) => showError(String(err)))
                      }
                    />
                  </div>
                </div>
                <div
                  className={
                    'checklist-column-groups-panel' +
                    (isColumnDropTarget ? ' is-column-drop-target' : '')
                  }
                  onDragOver={handleColumnGroupsPanelDragOver}
                  onDrop={(event) => handleGroupDrop(event, column.id, sortedColumnGroups)}
                >
                  <ul
                    className="checklist-groups-list"
                    style={
                      isColumnDropTarget && groupDragPreview
                        ? ({
                            '--checklist-group-shift': `${groupDragPreview.shiftPx}px`,
                          } as React.CSSProperties)
                        : undefined
                    }
                    onDragOver={handleGroupListDragOver}
                    onDrop={(event) => handleGroupDrop(event, column.id, sortedColumnGroups)}
                  >
                    {groupDragPreview?.targetColumnId === column.id ? (
                      <li
                        className="checklist-insert-indicator"
                        aria-hidden="true"
                        style={{ top: `${groupDragPreview.indicatorTop}px` }}
                      />
                    ) : null}
                  {sortedColumnGroups.map((group) => {
                    const sortedGroupItems = sortItemsByOrder(group.items);
                    const isItemDropTarget = itemDragPreview?.targetGroupId === group.id;
                    const isGroupDragging = groupDragPreview?.groupId === group.id;
                    const isGroupShifted = shouldShiftGroupSlot(
                      groupDragPreview,
                      column.id,
                      group.id,
                      sortedColumnGroups,
                    );

                    const handleItemListDragOver = (event: React.DragEvent<HTMLUListElement>) => {
                      if (!allowsItemDrag(event.dataTransfer)) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = 'move';
                      const draggedId = itemDragPreviewRef.current?.itemId;
                      if (draggedId == null) return;
                      const insertIndex = resolveInsertIndexFromPointer(
                        event.clientY,
                        event.currentTarget,
                        sortedGroupItems,
                        draggedId,
                      );
                      previewItemDrop(
                        group.id,
                        insertIndex,
                        sortedGroupItems,
                        event.currentTarget,
                        draggedId,
                      );
                    };

                    const handleItemPanelDragOver = (event: React.DragEvent<HTMLDivElement>) => {
                      if (!allowsItemDrag(event.dataTransfer)) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = 'move';
                      const draggedId = itemDragPreviewRef.current?.itemId;
                      if (draggedId == null) return;
                      const listElement = event.currentTarget.querySelector('.checklist-items-list');
                      if (!(listElement instanceof HTMLElement)) return;
                      const insertIndex = resolveInsertIndexFromPointer(
                        event.clientY,
                        listElement,
                        sortedGroupItems,
                        draggedId,
                      );
                      previewItemDrop(
                        group.id,
                        insertIndex,
                        sortedGroupItems,
                        listElement,
                        draggedId,
                      );
                    };

                    return (
                    <li
                      key={group.id}
                      data-checklist-group-id={group.id}
                      className={
                        'checklist-group-slot ' +
                        (isGroupDragging ? 'is-dragging ' : '') +
                        (isGroupShifted ? 'is-drop-shifted' : '')
                      }
                    >
                    <div className={
                        'checklist-group-card' +
                        (!isTodoOverlayVisible(group.visible) ? ' checklist-overlay-hidden' : '')
                      }>
                      <div className="checklist-group-heading">
                        <span className="checklist-group-label">Group</span>
                        <ChecklistVisibilityToggle
                          visible={isTodoOverlayVisible(group.visible)}
                          label={group.title || 'Group'}
                          onToggle={() => void toggleGroupVisible(group.id)}
                        />
                        <DragHandle
                          label="Drag group to reorder or move to another column"
                          onDragStart={(event) => {
                            startChecklistDragAutoScroll();
                            groupDropHandledRef.current = false;
                            setDragId(event.dataTransfer, CHECKLIST_GROUP_DRAG, group.id);
                            groupDragSourceColumnRef.current = column.id;
                            const fromIndex = sortedColumnGroups.findIndex(
                              (entry) => entry.id === group.id,
                            );
                            const slot = event.currentTarget.closest('[data-checklist-group-id]');
                            const shiftPx =
                              slot instanceof HTMLElement ? slot.offsetHeight + 12 : 160;
                            const listElement = event.currentTarget.closest('.checklist-groups-list');
                            const indicatorTop =
                              listElement instanceof HTMLElement
                                ? getGroupInsertIndicatorTop(
                                    listElement,
                                    sortedColumnGroups,
                                    group.id,
                                    fromIndex,
                                  )
                                : 0;
                            setGroupDragPreviewState({
                              groupId: group.id,
                              sourceColumnId: column.id,
                              targetColumnId: column.id,
                              insertIndex: fromIndex,
                              indicatorTop,
                              shiftPx,
                            });
                            event.stopPropagation();
                          }}
                          onDragEnd={finishGroupDrag}
                        />
                      </div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <TodoThumbnailDropzone
                            thumbnailUrl={group.thumbnail_url}
                            cacheBust={groupThumbCacheBust[group.id] ?? 0}
                            ariaLabel="Group thumbnail"
                            onUpload={(file) => uploadGroupThumb(group.id, file)}
                            onRemove={() => removeGroupThumb(group.id)}
                            onError={(message) => showToast(message, 'error')}
                          />
                          <input
                            className="min-w-[10rem] flex-1 rounded-md border border-surface/80 bg-bg/60 px-2 py-1 text-base font-semibold"
                            value={group.title}
                            onChange={(e) => setGroupTitleLocal(group.id, e.target.value)}
                            onBlur={(e) => void saveGroupTitle(group.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                          />
                        </div>
                        <ChecklistTrashButton
                          label="Remove group"
                          onClick={() =>
                            void removeGroup(group.id).catch((err) => showError(String(err)))
                          }
                        />
                      </div>
                      <div
                        className={
                          'checklist-items-panel' +
                          (isItemDropTarget ? ' is-item-drop-target' : '')
                        }
                        onDragOver={handleItemPanelDragOver}
                        onDrop={(event) => handleItemDrop(event, group.id, sortedGroupItems)}
                      >
                        <span className="checklist-items-label">Items</span>
                        <ul
                          className="checklist-items-list"
                          onDragOver={handleItemListDragOver}
                          onDrop={(event) => handleItemDrop(event, group.id, sortedGroupItems)}
                        >
                        {itemDragPreview?.targetGroupId === group.id ? (
                          <li
                            className="checklist-insert-indicator"
                            aria-hidden="true"
                            style={{ top: `${itemDragPreview.indicatorTop}px` }}
                          />
                        ) : null}
                        {sortedGroupItems.map((item) => {
                          const isDragging = itemDragPreview?.itemId === item.id;
                          const isShifted = shouldShiftItemRow(
                            itemDragPreview,
                            group.id,
                            item.id,
                            sortedGroupItems,
                          );
                          return (
                          <li
                            key={item.id}
                            data-checklist-item-id={item.id}
                            className={
                              'checklist-item-row flex flex-wrap items-center gap-2 text-sm ' +
                              (isDragging ? 'is-dragging ' : '') +
                              (isShifted ? 'is-drop-shifted' : '')
                            }
                          >
                            <DragHandle
                              label="Drag item to reorder or move to another group"
                              onDragStart={(event) => {
                                startChecklistDragAutoScroll();
                                itemDropHandledRef.current = false;
                                setDragId(event.dataTransfer, CHECKLIST_ITEM_DRAG, item.id);
                                itemDragSourceGroupRef.current = group.id;
                                const fromIndex = sortedGroupItems.findIndex(
                                  (entry) => entry.id === item.id,
                                );
                                const listElement = event.currentTarget.closest('.checklist-items-list');
                                const indicatorTop =
                                  listElement instanceof HTMLElement
                                    ? getInsertIndicatorTop(
                                        listElement,
                                        sortedGroupItems,
                                        item.id,
                                        fromIndex,
                                      )
                                    : 0;
                                setItemDragPreviewState({
                                  itemId: item.id,
                                  sourceGroupId: group.id,
                                  targetGroupId: group.id,
                                  insertIndex: fromIndex,
                                  indicatorTop,
                                });
                                setDragOverGroupId(group.id);
                                event.stopPropagation();
                              }}
                              onDragEnd={finishItemDrag}
                            />
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() =>
                                void toggleItem(group.id, item.id, item.completed).catch((err) =>
                                  showError(String(err)),
                                )
                              }
                            />
                            <TodoThumbnailDropzone
                              thumbnailUrl={item.thumbnail_url}
                              cacheBust={itemThumbCacheBust[item.id] ?? 0}
                              ariaLabel="Item thumbnail"
                              onUpload={(file) => uploadItemThumb(group.id, item.id, file)}
                              onRemove={() => removeItemThumb(group.id, item.id)}
                              onError={(message) => showToast(message, 'error')}
                            />
                            <input
                              className={
                                'min-w-[10rem] flex-1 rounded-md border border-surface/60 bg-bg/40 px-2 py-1 text-sm ' +
                                (item.completed ? 'line-through opacity-70' : '')
                              }
                              value={item.title}
                              onChange={(e) => setItemTitleLocal(group.id, item.id, e.target.value)}
                              onBlur={(e) => void saveItemTitle(group.id, item.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                              }}
                            />
                            <ChecklistTrashButton
                              label="Remove item"
                              className="ml-auto"
                              onClick={() =>
                                void removeItem(group.id, item.id).catch((err) =>
                                  showError(String(err)),
                                )
                              }
                            />
                          </li>
                          );
                        })}
                        </ul>
                        <div className="flex gap-2">
                        <input
                          className="flex-1 rounded-md border border-surface/60 bg-bg/40 px-2 py-1 text-sm"
                          placeholder="New item"
                          value={newItemTitles[group.id] ?? ''}
                          onChange={(e) =>
                            setNewItemTitles((prev) => ({ ...prev, [group.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            void addItem(group.id).catch((err) => showError(String(err)));
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void addItem(group.id).catch((err) => showError(String(err)))}
                          className="rounded-md border border-surface px-3 py-1 text-sm hover:border-accent"
                        >
                          Add item
                        </button>
                        </div>
                      </div>
                    </div>
                    </li>
                    );
                  })}
                  </ul>
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded-md border border-surface bg-bg px-2 py-1 text-sm"
                    placeholder="New group"
                    value={newGroupTitles[column.id] ?? ''}
                    onChange={(e) =>
                      setNewGroupTitles((prev) => ({ ...prev, [column.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => void addGroup(column.id).catch((err) => showError(String(err)))}
                    className="rounded-md border border-surface px-3 py-1 text-sm hover:border-accent"
                  >
                    Add group
                  </button>
                </div>
              </div>
              );
            })}
          </div>
          </div>
        </section>
      ) : null}

      <section
        aria-label="Preview"
        className="mt-6 overflow-hidden rounded-lg border border-surface bg-surface-soft/20"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface bg-surface-soft/50 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Preview</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Simulates the overlay over looping gameplay.
            </p>
          </div>
          {previewList ? (
            <button
              type="button"
              disabled={previewPhase === 'entering' || previewPhase === 'exiting'}
              onClick={togglePreviewVisibility}
              className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {previewPhase === 'visible' || previewPhase === 'entering'
                ? 'Hide checklist'
                : 'Show checklist'}
            </button>
          ) : null}
        </div>
        <div className="p-4 md:p-5">
        {previewList ? (
          <div className="todo-preview-panel" {...todoPanelAnchorAttrs(previewList)}>
            <img
              className="todo-preview-gameplay"
              src={PREVIEW_GAMEPLAY_SRC}
              alt=""
              draggable={false}
              aria-hidden="true"
            />
            {previewPhase !== 'hidden' ? (
              <TodoChecklistPanel
                list={previewList}
                preview
                className={
                  previewPhase === 'entering'
                    ? 'is-entering' + (previewEnterReady ? ' is-visible' : '')
                    : previewPhase === 'visible'
                      ? 'is-visible'
                      : 'is-exiting'
                }
                style={todoPanelStyle(previewList, { preview: true })}
                animAttrs={
                  previewPhase === 'exiting'
                    ? todoAnimationDataAttrs(previewList.exit_animation)
                    : todoAnimationDataAttrs(previewList.enter_animation)
                }
                onTransitionEnd={handlePreviewTransitionEnd}
                thumbnailCacheBust={{
                  groups: groupThumbCacheBust,
                  items: itemThumbCacheBust,
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-surface px-4 py-12 text-center text-sm text-text-muted">
            Enter a panel title to see the preview.
          </div>
        )}
        </div>
      </section>

      </div>
    </>
  );
}
