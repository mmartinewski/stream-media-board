import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TopCenterToastVariant = 'success' | 'error';

const VARIANT_CLASS: Record<TopCenterToastVariant, string> = {
  error: 'border-red-500/50 bg-red-950/95 text-red-100',
  success: 'border-emerald-500/50 bg-emerald-950/95 text-emerald-100',
};

const TOAST_DISMISS_MS = 3500;

interface TopCenterToastProps {
  message: string;
  variant: TopCenterToastVariant;
  onDismiss: () => void;
}

function TopCenterToast({ message, variant, onDismiss }: TopCenterToastProps) {
  return createPortal(
    <div
      role="alert"
      className={
        'pointer-events-auto fixed left-1/2 top-4 z-[100] w-[min(100%-2rem,28rem)] -translate-x-1/2 rounded-md border p-3 text-sm shadow-lg ' +
        VARIANT_CLASS[variant]
      }
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 text-center">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-80 hover:opacity-100"
          aria-label="Fechar notificação"
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function useTopCenterToast() {
  const [toast, setToast] = useState<{ message: string; variant: TopCenterToastVariant } | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, variant: TopCenterToastVariant) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ message, variant });
      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, TOAST_DISMISS_MS);
    },
    [],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const toastPortal = toast ? (
    <TopCenterToast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
  ) : null;

  return { showToast, dismissToast, toastPortal };
}
