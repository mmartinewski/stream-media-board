import { useCallback, useEffect, useRef, useState } from 'react';
import {
  todoAnimationDataAttrs,
  filterVisibleTodoColumns,
  isTodoItemCompleted,
  todoColumnsStyle,
  todoPanelAnchorAttrs,
  todoPanelBgMode,
  todoPanelStyle,
  type TodoListOverlayDto,
} from '../lib/todoOverlay';

interface TodoOverlayLayerProps {
  list: TodoListOverlayDto | null;
  enterList?: TodoListOverlayDto | null;
  phase: 'hidden' | 'entering' | 'visible' | 'exiting';
  onEnterComplete: () => void;
  onExitComplete: () => void;
}

export default function TodoOverlayLayer({
  list,
  enterList = null,
  phase,
  onEnterComplete,
  onExitComplete,
}: TodoOverlayLayerProps) {
  const enterFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitHandledRef = useRef(false);
  const enterHandledRef = useRef(false);
  const [enterReady, setEnterReady] = useState(false);

  useEffect(() => {
    if (phase === 'exiting') {
      exitHandledRef.current = false;
    }
    if (phase === 'entering') {
      enterHandledRef.current = false;
    }
  }, [list?.id, phase]);

  useEffect(() => {
    if (phase !== 'entering') {
      setEnterReady(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEnterReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, [list?.id, phase]);

  useEffect(() => {
    return () => {
      if (enterFallbackRef.current) clearTimeout(enterFallbackRef.current);
      if (exitFallbackRef.current) clearTimeout(exitFallbackRef.current);
    };
  }, []);

  const completeExitOnce = useCallback(() => {
    if (exitHandledRef.current) return;
    exitHandledRef.current = true;
    onExitComplete();
  }, [onExitComplete]);

  const completeEnterOnce = useCallback(() => {
    if (enterHandledRef.current) return;
    enterHandledRef.current = true;
    onEnterComplete();
  }, [onEnterComplete]);

  const handleTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.propertyName !== 'opacity') return;
      if (phase === 'entering' && enterReady) {
        completeEnterOnce();
        return;
      }
      if (phase === 'exiting') {
        completeExitOnce();
      }
    },
    [completeEnterOnce, completeExitOnce, enterReady, phase],
  );

  useEffect(() => {
    if (phase !== 'entering' || !list || !enterReady) return;
    const animList = enterList ?? list;
    if (enterFallbackRef.current) clearTimeout(enterFallbackRef.current);
    enterFallbackRef.current = setTimeout(
      completeEnterOnce,
      animList.animation_duration_ms + 50,
    );
  }, [completeEnterOnce, enterList, enterReady, list, phase]);

  useEffect(() => {
    if (phase !== 'exiting' || !list) return;
    if (exitFallbackRef.current) clearTimeout(exitFallbackRef.current);
    exitFallbackRef.current = setTimeout(
      completeExitOnce,
      list.animation_duration_ms + 50,
    );
  }, [completeExitOnce, list, phase]);

  if (!list || phase === 'hidden') return null;

  const visibleColumns = filterVisibleTodoColumns(list.columns);
  if (visibleColumns.length === 0) return null;

  const enterAnimList = enterList ?? list;
  const panelStyleList = phase === 'entering' ? enterAnimList : list;

  const panelClass =
    'todo-panel ' +
    (phase === 'entering'
      ? 'is-entering' + (enterReady ? ' is-visible' : '')
      : phase === 'visible'
        ? 'is-visible'
        : phase === 'exiting'
          ? 'is-exiting'
          : '');

  const animAttrs =
    phase === 'exiting'
      ? todoAnimationDataAttrs(list.exit_animation)
      : todoAnimationDataAttrs(enterAnimList.enter_animation);

  return (
    <div className="todo-overlay" aria-hidden={phase !== 'visible'}>
      <div className="todo-layer" {...todoPanelAnchorAttrs(list)}>
        <div
          key={list.id}
          className={panelClass}
          style={todoPanelStyle(panelStyleList)}
          data-todo-bg-mode={todoPanelBgMode(list)}
          {...animAttrs}
          onTransitionEnd={handleTransitionEnd}
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
                      {column.groups.map((group) => (
                        <section key={group.id} className="todo-group">
                          <div className="todo-group-header">
                            {group.thumbnail_url ? (
                              <img
                                className="todo-group-thumb"
                                src={group.thumbnail_url}
                                alt=""
                              />
                            ) : null}
                            <h3 className="todo-group-title" title={group.title}>
                              {group.title}
                            </h3>
                          </div>
                          <ul className="todo-items">
                            {group.items.map((item) => (
                              <li
                                key={item.id}
                                className={
                                  'todo-item' +
                                  (isTodoItemCompleted(item.completed) ? ' is-completed' : '')
                                }
                              >
                                {item.thumbnail_url ? (
                                  <img
                                    className="todo-item-thumb"
                                    src={item.thumbnail_url}
                                    alt=""
                                  />
                                ) : null}
                                <span className="todo-item-title">{item.title}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="todo-scroll-spacer" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
