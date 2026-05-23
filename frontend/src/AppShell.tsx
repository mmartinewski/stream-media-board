import { Link, Outlet } from 'react-router-dom';

export default function AppShell() {
  return (
    <div className="min-h-full bg-bg text-text">
      <header className="border-b border-surface/50 bg-bg-soft">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Personal Clip Player
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
            <Link to="/" className="hover:text-text">
              Dashboard
            </Link>
            <Link
              to="/clips/new"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-soft"
            >
              New clip
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
