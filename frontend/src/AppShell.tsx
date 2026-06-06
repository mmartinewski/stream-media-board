import { Link, Outlet, useLocation } from 'react-router-dom';
import AppSideMenu from './components/AppSideMenu';
import DashboardTopBar from './components/DashboardTopBar';
import { DashboardViewProvider } from './contexts/DashboardViewContext';
import { APP_DISPLAY_NAME } from './lib/appName';
import { APP_SHELL_CONTENT_CLASS } from './lib/appShellLayout';

function AppShellHeader() {
  return (
    <div className={'flex items-center gap-3 py-4 ' + APP_SHELL_CONTENT_CLASS}>
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

  return (
    <DashboardViewProvider>
      <div className="min-h-full bg-bg text-text">
        <div className="sticky top-0 z-50 bg-bg-soft">
          <header className="border-b border-surface/50">
            <AppShellHeader />
          </header>
          {isDashboard ? <DashboardTopBar /> : null}
        </div>

        <main className={'py-4 ' + APP_SHELL_CONTENT_CLASS}>
          <Outlet />
        </main>
      </div>
    </DashboardViewProvider>
  );
}
