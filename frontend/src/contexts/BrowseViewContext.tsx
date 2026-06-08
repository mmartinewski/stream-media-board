import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readBrowseGridMode, writeBrowseGridMode } from '../lib/browsePreferences';

interface BrowseViewContextValue {
  gridMode: boolean;
  setGridModePersisted: (update: boolean | ((current: boolean) => boolean)) => void;
}

const BrowseViewContext = createContext<BrowseViewContextValue | null>(null);

export function BrowseViewProvider({ children }: { children: ReactNode }) {
  const [gridMode, setGridMode] = useState(() => readBrowseGridMode());

  const setGridModePersisted = useCallback(
    (update: boolean | ((current: boolean) => boolean)) => {
      setGridMode((current) => {
        const next = typeof update === 'function' ? update(current) : update;
        writeBrowseGridMode(next);
        return next;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ gridMode, setGridModePersisted }),
    [gridMode, setGridModePersisted],
  );

  return <BrowseViewContext.Provider value={value}>{children}</BrowseViewContext.Provider>;
}

export function useBrowseView(): BrowseViewContextValue {
  const value = useContext(BrowseViewContext);
  if (!value) {
    throw new Error('useBrowseView must be used within BrowseViewProvider');
  }
  return value;
}
