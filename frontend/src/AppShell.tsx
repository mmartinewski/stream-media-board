import { Link, Outlet, useLocation } from 'react-router-dom';
import AppSideMenu from './components/AppSideMenu';
import MediaToolbar from './components/MediaToolbar';
import { BrowseViewProvider } from './contexts/BrowseViewContext';
import { DashboardViewProvider } from './contexts/DashboardViewContext';
import { APP_DISPLAY_NAME } from './lib/appName';
import { APP_SHELL_CONTENT_CLASS } from './lib/appShellLayout';

function parseCategoryId(pathname: string): number | null {
  const match = pathname.match(/^\/browse\/categories\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function AppShellHeader({ compact }: { compact: boolean }) {
  return (
    <div
      className={
        'flex items-center gap-3 ' +
        (compact ? 'py-2 ' : 'py-4 ') +
        APP_SHELL_CONTENT_CLASS
      }
    >
      <AppSideMenu />
      <Link to="/" className="text-lg font-semibold tracking-tight">
        {APP_DISPLAY_NAME}
      </Link>
    </div>
  );
}

export default function AppShell() {
  const { pathname } = useLocation();
  const isDashboard = pathname === '/';
  const isCategoryGrid = pathname === '/browse';
  const isFavorites = pathname === '/browse/favorites';
  const isCategoryFocus = isFavorites || parseCategoryId(pathname) != null;
  const showMediaToolbar = isDashboard || isCategoryGrid || isCategoryFocus;

  return (
    <DashboardViewProvider>
      <BrowseViewProvider>
        <div className="min-h-full bg-bg text-text">
          <div className="sticky top-0 z-50 bg-bg-soft">
            <header className="border-b border-surface/50">
              <AppShellHeader compact={showMediaToolbar} />
            </header>
            {showMediaToolbar ? <MediaToolbar /> : null}
          </div>

          <main className={(showMediaToolbar ? 'py-2 ' : 'py-4 ') + APP_SHELL_CONTENT_CLASS}>
            <Outlet />
          </main>
        </div>
      </BrowseViewProvider>
    </DashboardViewProvider>
  );
}
