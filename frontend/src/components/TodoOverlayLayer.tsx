import { useCallback, useEffect, useRef, useState } from 'react';
import TodoChecklistPanel from './TodoChecklistPanel';
import {
  todoAnimationDataAttrs,
  filterVisibleTodoColumns,
  todoPanelAnchorAttrs,
  todoPanelStyle,
  todoLayerStyle,
  type TodoItemHighlightMode,
  type TodoListOverlayDto,
} from '../lib/todoOverlay';

interface TodoOverlayLayerProps {
  list: TodoListOverlayDto | null;
  enterList?: TodoListOverlayDto | null;
  phase: 'hidden' | 'entering' | 'visible' | 'exiting';
  onEnterComplete: () => void;
  onExitComplete: () => void;
  highlightedItems?: ReadonlyMap<number, TodoItemHighlightMode>;
  onHighlightAnimationEnd?: (itemId: number) => void;
}

export default function TodoOverlayLayer({
  list,
  enterList = null,
  phase,
  onEnterComplete,
  onExitComplete,
  highlightedItems,
  onHighlightAnimationEnd,
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
  const styleList = phase === 'entering' ? enterAnimList : list;

  const phaseClass =
    phase === 'entering'
      ? 'is-entering' + (enterReady ? ' is-visible' : '')
      : phase === 'visible'
        ? 'is-visible'
        : phase === 'exiting'
          ? 'is-exiting'
          : '';

  const animAttrs =
    phase === 'exiting'
      ? todoAnimationDataAttrs(list.exit_animation)
      : todoAnimationDataAttrs(enterAnimList.enter_animation);

  return (
    <div className="todo-overlay" aria-hidden={phase !== 'visible'}>
      <div className="todo-layer" style={todoLayerStyle(list)} {...todoPanelAnchorAttrs(list)}>
        <TodoChecklistPanel
          key={list.id}
          list={list}
          className={phaseClass}
          style={todoPanelStyle(styleList)}
          animAttrs={animAttrs}
          onTransitionEnd={handleTransitionEnd}
          highlightedItems={highlightedItems}
          onHighlightAnimationEnd={onHighlightAnimationEnd}
        />
      </div>
    </div>
  );
}
