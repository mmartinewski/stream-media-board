import type { CSSProperties, TransitionEvent } from 'react';
import {
  filterVisibleTodoColumns,
  isTodoItemCompleted,
  resolveTodoMediaUrl,
  resolveTodoThumbnailUrl,
  todoColumnsStyle,
  todoPanelBgMode,
  todoPanelStyle,
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
}: TodoChecklistPanelProps) {
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
                            return (
                              <li
                                key={item.id}
                                className={
                                  'todo-item' +
                                  (isTodoItemCompleted(item.completed) ? ' is-completed' : '')
                                }
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
