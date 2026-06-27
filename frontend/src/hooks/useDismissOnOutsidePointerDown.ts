import { useEffect, useRef } from 'react';

export function useDismissOnOutsidePointerDown(
  active: boolean,
  onDismiss: () => void,
  shouldIgnoreTarget?: (target: Node) => boolean,
) {
  const ignoreTargetRef = useRef(shouldIgnoreTarget);
  ignoreTargetRef.current = shouldIgnoreTarget;

  useEffect(() => {
    if (!active) return;

    const onPointerDown = (event: MouseEvent) => {
      if (ignoreTargetRef.current?.(event.target as Node)) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [active, onDismiss]);
}
