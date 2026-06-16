import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, TransitionEvent } from 'react';
import {
  filterVisibleTodoColumns,
  isTodoItemCompleted,
  resolveTodoMediaUrl,
  resolveTodoThumbnailUrl,
  TODO_ITEM_HIGHLIGHT_MS,
  todoColumnsStyle,
  todoPanelBgMode,
  todoPanelStyle,
  type TodoItemHighlightMode,
  type TodoListOverlayDto,
} from '../lib/todoOverlay';

export type TodoChecklistThumbnailCacheBust = {
  groups?: Record<number, number>;
  items?: Record<number, number>;
};

export interface TodoChecklistPanelProps {
  list: TodoListOverlayDto;
  className?: string;
  style?: CSSProperties;
  preview?: boolean;
  thumbnailCacheBust?: TodoChecklistThumbnailCacheBust;
  animAttrs?: Record<string, string>;
  onTransitionEnd?: (event: TransitionEvent<HTMLDivElement>) => void;
  highlightedItems?: ReadonlyMap<number, TodoItemHighlightMode>;
  onHighlightAnimationEnd?: (itemId: number) => void;
}

function showItemAsCompleted(
  completed: boolean,
  highlightMode: TodoItemHighlightMode | undefined,
  pastHighlightMidpoint: boolean,
): boolean {
  if (highlightMode === 'check') return pastHighlightMidpoint;
  if (highlightMode === 'uncheck') return !pastHighlightMidpoint;
  return isTodoItemCompleted(completed);
}

function resolveThumb(
  url: string | null,
  entityId: number,
  cacheBustMap?: Record<number, number>,
): string | null {
  if (!url) return null;
  if (cacheBustMap) {
    return resolveTodoThumbnailUrl(url, cacheBustMap[entityId]);
  }
  return resolveTodoMediaUrl(url);
}

export default function TodoChecklistPanel({
  list,
  className = '',
  style,
  preview = false,
  thumbnailCacheBust,
  animAttrs,
  onTransitionEnd,
  highlightedItems,
  onHighlightAnimationEnd,
}: TodoChecklistPanelProps) {
  const [pastMidpointIds, setPastMidpointIds] = useState<Set<number>>(() => new Set());
  const midpointTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = midpointTimersRef.current;
    const activeIds = new Set(highlightedItems?.keys() ?? []);

    for (const [itemId, timer] of timers) {
      if (!activeIds.has(itemId)) {
        clearTimeout(timer);
        timers.delete(itemId);
      }
    }

    setPastMidpointIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const itemId of prev) {
        if (!activeIds.has(itemId)) {
          next.delete(itemId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    if (!highlightedItems) return;

    const midpointDelay = TODO_ITEM_HIGHLIGHT_MS / 2;
    for (const itemId of highlightedItems.keys()) {
      if (timers.has(itemId)) continue;
      const timer = setTimeout(() => {
        timers.delete(itemId);
        setPastMidpointIds((prev) => {
          const next = new Set(prev);
          next.add(itemId);
          return next;
        });
      }, midpointDelay);
      timers.set(itemId, timer);
    }
  }, [highlightedItems]);

  useEffect(() => {
    const timers = midpointTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const handleHighlightAnimationEnd = (itemId: number) => {
    const timer = midpointTimersRef.current.get(itemId);
    if (timer) {
      clearTimeout(timer);
      midpointTimersRef.current.delete(itemId);
    }
    setPastMidpointIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    onHighlightAnimationEnd?.(itemId);
  };

  const visibleColumns = filterVisibleTodoColumns(list.columns);
  if (visibleColumns.length === 0) return null;

  const panelStyle = style ?? todoPanelStyle(list, preview ? { preview: true } : undefined);
  const panelClass = ['todo-panel', className].filter(Boolean).join(' ');

  return (
    <div
      className={panelClass}
      style={panelStyle}
      data-todo-bg-mode={todoPanelBgMode(list)}
      {...animAttrs}
      onTransitionEnd={onTransitionEnd}
    >
      <div className="todo-bg" aria-hidden="true" />
      <div className="todo-content">
        <h2 className="todo-title">{list.title}</h2>
        <div className="todo-scroll">
          <div className="todo-scroll-spacer" aria-hidden="true" />
          <div className="todo-scroll-body">
            <div className="todo-columns" style={todoColumnsStyle(visibleColumns.length)}>
              {visibleColumns.map((column) => (
                <div key={column.id} className="todo-column">
                  {column.groups.map((group) => {
                    const groupThumbSrc = resolveThumb(
                      group.thumbnail_url,
                      group.id,
                      thumbnailCacheBust?.groups,
                    );
                    return (
                      <section key={group.id} className="todo-group">
                        <div className="todo-group-header">
                          {groupThumbSrc ? (
                            <img className="todo-group-thumb" src={groupThumbSrc} alt="" />
                          ) : null}
                          <h3 className="todo-group-title" title={group.title}>
                            {group.title}
                          </h3>
                        </div>
                        <ul className="todo-items">
                          {group.items.map((item) => {
                            const itemThumbSrc = resolveThumb(
                              item.thumbnail_url,
                              item.id,
                              thumbnailCacheBust?.items,
                            );
                            const highlightMode = highlightedItems?.get(item.id);
                            const pastMidpoint = pastMidpointIds.has(item.id);
                            const showCompleted = showItemAsCompleted(
                              item.completed,
                              highlightMode,
                              pastMidpoint,
                            );
                            return (
                              <li
                                key={item.id}
                                className={
                                  'todo-item' +
                                  (showCompleted ? ' is-completed' : '') +
                                  (highlightMode === 'check'
                                    ? ' is-highlighted-check'
                                    : highlightMode === 'uncheck'
                                      ? ' is-highlighted-uncheck'
                                      : '')
                                }
                                onAnimationEnd={(event) => {
                                  if (
                                    event.animationName !== 'todo-item-shine' &&
                                    event.animationName !== 'todo-item-shine-reverse'
                                  ) {
                                    return;
                                  }
                                  if (!highlightedItems?.has(item.id)) return;
                                  handleHighlightAnimationEnd(item.id);
                                }}
                              >
                                {itemThumbSrc ? (
                                  <img className="todo-item-thumb" src={itemThumbSrc} alt="" />
                                ) : null}
                                <span className="todo-item-title">{item.title}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="todo-scroll-spacer" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
