import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  readDashboardGridMode,
  writeDashboardGridMode,
} from '../lib/dashboardPreferences';

interface DashboardViewContextValue {
  gridMode: boolean;
  setGridModePersisted: (update: boolean | ((current: boolean) => boolean)) => void;
}

const DashboardViewContext = createContext<DashboardViewContextValue | null>(null);

export function DashboardViewProvider({ children }: { children: ReactNode }) {
  const [gridMode, setGridMode] = useState(() => readDashboardGridMode());

  const setGridModePersisted = useCallback(
    (update: boolean | ((current: boolean) => boolean)) => {
      setGridMode((current) => {
        const next = typeof update === 'function' ? update(current) : update;
        writeDashboardGridMode(next);
        return next;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ gridMode, setGridModePersisted }),
    [gridMode, setGridModePersisted],
  );

  return (
    <DashboardViewContext.Provider value={value}>{children}</DashboardViewContext.Provider>
  );
}

export function useDashboardView(): DashboardViewContextValue {
  const value = useContext(DashboardViewContext);
  if (!value) {
    throw new Error('useDashboardView must be used within DashboardViewProvider');
  }
  return value;
}

export function GridViewIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="currentColor"
    >
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  );
}

export function ListViewIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
    >
      <path d="M4 6h12M4 10h12M4 14h8" />
    </svg>
  );
}
