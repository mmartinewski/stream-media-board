import { Link, Outlet, useLocation } from 'react-router-dom';
import DashboardTopBar from './components/DashboardTopBar';
import {
  DashboardViewProvider,
  GridViewIcon,
  ListViewIcon,
  useDashboardView,
} from './contexts/DashboardViewContext';

function AppShellHeader() {
  const { pathname } = useLocation();
  const isDashboard = pathname === '/';
  const { gridMode, setGridModePersisted } = useDashboardView();

  return (
    <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
      <Link to="/" className="text-lg font-semibold tracking-tight">
        Personal Clip Player
      </Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
        <div className="flex items-center gap-1">
          {isDashboard ? (
            <button
              type="button"
              onClick={() => setGridModePersisted((current) => !current)}
              aria-pressed={gridMode}
              aria-label={gridMode ? 'Switch to standard view' : 'Switch to grid view'}
              title={gridMode ? 'Standard view' : 'Grid view'}
              className={
                'rounded-md border p-1.5 transition-colors ' +
                (gridMode
                  ? 'border-accent bg-accent/15 text-text hover:bg-accent/25'
                  : 'border-surface text-text-muted hover:border-accent hover:text-text')
              }
            >
              {gridMode ? <ListViewIcon /> : <GridViewIcon />}
            </button>
          ) : null}
          <Link to="/" className="hover:text-text">
            Dashboard
          </Link>
        </div>
        <Link to="/settings/layout-areas" className="hover:text-text">
          Layout areas
        </Link>
        <Link
          to="/clips/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-soft"
        >
          New clip
        </Link>
      </nav>
    </div>
  );
}

export default function AppShell() {
  const { pathname } = useLocation();
  const isDashboard = pathname === '/';

  return (
    <DashboardViewProvider>
      <div className="min-h-full bg-bg text-text">
        <div className="sticky top-0 z-50 bg-bg-soft">
          <header className="border-b border-surface/50">
            <AppShellHeader />
          </header>
          {isDashboard ? <DashboardTopBar /> : null}
        </div>

        <main className="mx-auto max-w-6xl p-4">
          <Outlet />
        </main>
      </div>
    </DashboardViewProvider>
  );
}
