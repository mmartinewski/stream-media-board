import { Link, Outlet, useLocation } from 'react-router-dom';
import AppSideMenu from './components/AppSideMenu';
import DashboardTopBar from './components/DashboardTopBar';
import { DashboardViewProvider } from './contexts/DashboardViewContext';

function shellContentClass(fullWidth: boolean) {
  return fullWidth
    ? 'w-full px-3 sm:px-4'
    : 'mx-auto w-full max-w-6xl px-4';
}

function AppShellHeader({ fullWidth }: { fullWidth: boolean }) {
  return (
    <div
      className={
        'flex items-center justify-between py-4 ' + shellContentClass(fullWidth)
      }
    >
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
            <AppShellHeader fullWidth={isDashboard} />
          </header>
          {isDashboard ? <DashboardTopBar /> : null}
        </div>

        <main className={'py-4 ' + shellContentClass(isDashboard)}>
          <Outlet />
        </main>
      </div>
    </DashboardViewProvider>
  );
}
