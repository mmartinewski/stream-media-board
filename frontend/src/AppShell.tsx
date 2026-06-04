import { Link, Outlet, useLocation } from 'react-router-dom';
import AppSideMenu from './components/AppSideMenu';
import DashboardTopBar from './components/DashboardTopBar';
import { DashboardViewProvider } from './contexts/DashboardViewContext';

function AppShellHeader() {
  return (
    <div className="flex w-full items-center justify-between px-3 py-4 sm:px-4">
      <Link to="/" className="text-lg font-semibold tracking-tight">
        Personal Clip Player
      </Link>
      <AppSideMenu />
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

        <main className="w-full px-3 py-4 sm:px-4">
          <Outlet />
        </main>
      </div>
    </DashboardViewProvider>
  );
}
